#!/usr/bin/env python3
"""
Extract structured data from the static 53chm topic "玩家手册2024".

Outputs:
  - One JSON file per source page (mirrors source directory structure)
  - A global index JSON with page metadata
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import List, Optional
from urllib.parse import unquote


SUPPORTED_EXTENSIONS = {".htm", ".html"}
TOPIC_TOKEN = "玩家手册2024"


def read_text_with_fallback(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "gb18030", "gbk"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def clean_text(value: str) -> str:
    value = unescape(value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def to_posix(path_like: str) -> str:
    return path_like.replace("\\", "/")


def extract_topic_page_path(html: str) -> Optional[str]:
    # Example:
    # parent.location.href = "../../index.htm?page=玩家手册2024/第一章：进行游戏.htm";
    match = re.search(
        r'page=([^";]+)',
        html,
        flags=re.IGNORECASE,
    )
    if not match:
        return None

    candidate = unquote(match.group(1))
    candidate = to_posix(candidate.strip())
    if TOPIC_TOKEN not in candidate:
        return None
    return candidate


@dataclass
class LinkItem:
    text: str
    href: str
    resolved_path: Optional[str]
    anchor: Optional[str]
    is_internal: bool


class BodyParser(HTMLParser):
    def __init__(self, source_file: Path, source_root: Path):
        super().__init__(convert_charrefs=True)
        self.source_file = source_file
        self.source_root = source_root
        self.current_tag: Optional[str] = None
        self.skip_depth = 0
        self.in_body = False

        self.title_text = ""
        self.headings: List[str] = []
        self.paragraphs: List[str] = []
        self.full_text_parts: List[str] = []
        self.links: List[LinkItem] = []

        self._buffer: List[str] = []
        self._active_block_tag: Optional[str] = None
        self._active_href: Optional[str] = None
        self._active_link_text: List[str] = []

    def handle_starttag(self, tag: str, attrs):
        tag = tag.lower()
        self.current_tag = tag
        attrs_dict = dict(attrs)

        if tag == "body":
            self.in_body = True
            return

        if tag in {"script", "style"}:
            self.skip_depth += 1
            return

        if self.skip_depth > 0 or not self.in_body:
            return

        if tag in {"p", "h1", "h2", "h3", "h4", "h5", "h6"}:
            self._active_block_tag = tag
            self._buffer = []

        if tag == "a":
            href = attrs_dict.get("href")
            if href:
                self._active_href = href.strip()
                self._active_link_text = []

        if tag == "br":
            self._push_text("\n")

    def handle_endtag(self, tag: str):
        tag = tag.lower()

        if tag == "body":
            self.in_body = False
            return

        if tag in {"script", "style"} and self.skip_depth > 0:
            self.skip_depth -= 1
            return

        if self.skip_depth > 0 or not self.in_body:
            return

        if tag == self._active_block_tag and tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            text = clean_text("".join(self._buffer))
            if text:
                self.headings.append(text)
                if not self.title_text:
                    self.title_text = text
                self.full_text_parts.append(text)
            self._buffer = []
            self._active_block_tag = None
            return

        if tag == self._active_block_tag and tag == "p":
            text = clean_text("".join(self._buffer))
            if text:
                self.paragraphs.append(text)
                self.full_text_parts.append(text)
            self._buffer = []
            self._active_block_tag = None
            return

        if tag == "a" and self._active_href is not None:
            raw_href = self._active_href
            link_text = clean_text("".join(self._active_link_text))
            href, anchor = split_anchor(raw_href)
            resolved, is_internal = resolve_link(
                self.source_file,
                self.source_root,
                href,
            )
            self.links.append(
                LinkItem(
                    text=link_text,
                    href=raw_href,
                    resolved_path=resolved,
                    anchor=anchor,
                    is_internal=is_internal,
                )
            )
            self._active_href = None
            self._active_link_text = []

    def handle_data(self, data: str):
        if self.skip_depth > 0 or not self.in_body:
            return
        if not data:
            return
        self._push_text(data.strip())
        if self._active_href is not None:
            self._active_link_text.append(data)

    def _push_text(self, value: str):
        if not value:
            return
        self._buffer.append(value)
        if self._active_block_tag is None:
            self.full_text_parts.append(value)


def split_anchor(href: str) -> tuple[str, Optional[str]]:
    if "#" in href:
        before, after = href.split("#", 1)
        return before, after or None
    return href, None


def resolve_link(
    source_file: Path,
    source_root: Path,
    href: str,
) -> tuple[Optional[str], bool]:
    href = href.strip()
    if not href:
        return None, False
    lower = href.lower()
    if lower.startswith(("http://", "https://", "mailto:", "javascript:")):
        return None, False

    decoded = unquote(href)
    decoded = to_posix(decoded)

    if decoded.startswith("#"):
        rel_source = to_posix(str(source_file.relative_to(source_root)))
        return rel_source, TOPIC_TOKEN in rel_source

    if decoded.startswith("/"):
        return decoded, TOPIC_TOKEN in decoded

    candidate = (source_file.parent / decoded).resolve()
    try:
        relative = candidate.relative_to(source_root.resolve())
    except ValueError:
        return str(candidate), False

    rel_str = to_posix(str(relative))
    return rel_str, TOPIC_TOKEN in rel_str


def parse_page(source_file: Path, source_root: Path, topic_root: Path) -> dict:
    html = read_text_with_fallback(source_file)
    parser = BodyParser(source_file=source_file, source_root=source_root)
    parser.feed(html)

    title_match = re.search(r"<title>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    html_title = clean_text(title_match.group(1)) if title_match else ""

    text = clean_text(" ".join(parser.full_text_parts))
    relative_to_topic = to_posix(str(source_file.relative_to(topic_root)))
    relative_to_source = to_posix(str(source_file.relative_to(source_root)))

    page_in_frame = extract_topic_page_path(html)
    if not page_in_frame:
        page_in_frame = to_posix(f"{TOPIC_TOKEN}/{relative_to_topic}")

    deduped_headings = list(dict.fromkeys(parser.headings))

    return {
        "source_file": relative_to_source,
        "topic_relative_path": relative_to_topic,
        "page_path": page_in_frame,
        "title": html_title or parser.title_text,
        "headings": deduped_headings,
        "paragraphs": parser.paragraphs,
        "links": [asdict(link) for link in parser.links],
        "text": text,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract structured JSON from 53chm topic 玩家手册2024"
    )
    parser.add_argument(
        "--source-root",
        default="5echm_web/topics",
        help="Root path that contains topics folders",
    )
    parser.add_argument(
        "--topic-name",
        default=TOPIC_TOKEN,
        help="Topic folder name to crawl",
    )
    parser.add_argument(
        "--output-dir",
        default="extracted_json/玩家手册2024",
        help="Output directory for generated JSON files",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    source_root = Path(args.source_root).resolve()
    topic_root = (source_root / args.topic_name).resolve()
    output_root = Path(args.output_dir).resolve()
    pages_out_root = output_root / "pages"

    if not topic_root.exists():
        raise FileNotFoundError(f"Topic directory not found: {topic_root}")

    pages = sorted(
        p for p in topic_root.rglob("*")
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS
    )

    index_items = []
    for page_file in pages:
        parsed = parse_page(
            source_file=page_file,
            source_root=source_root,
            topic_root=topic_root,
        )

        output_file = pages_out_root / page_file.relative_to(topic_root)
        output_file = output_file.with_suffix(".json")
        output_file.parent.mkdir(parents=True, exist_ok=True)

        output_file.write_text(
            json.dumps(parsed, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        index_items.append(
            {
                "title": parsed["title"],
                "page_path": parsed["page_path"],
                "source_file": parsed["source_file"],
                "topic_relative_path": parsed["topic_relative_path"],
                "json_file": to_posix(str(output_file.relative_to(output_root))),
                "headings_count": len(parsed["headings"]),
                "paragraphs_count": len(parsed["paragraphs"]),
                "links_count": len(parsed["links"]),
            }
        )

    output_root.mkdir(parents=True, exist_ok=True)
    index = {
        "topic": args.topic_name,
        "source_root": to_posix(str(source_root)),
        "topic_root": to_posix(str(topic_root)),
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "page_count": len(index_items),
        "pages": index_items,
    }
    (output_root / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Extracted {len(index_items)} pages")
    print(f"Output directory: {output_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
