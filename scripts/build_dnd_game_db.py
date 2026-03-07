#!/usr/bin/env python3
"""
Build gameplay-oriented JSON database files from extracted PHB 2024 data.

Input:
  extracted_json/玩家手册2024/pages/*.json

Outputs:
  game_db/玩家手册2024/spells.json
  game_db/玩家手册2024/actions.json
  game_db/玩家手册2024/bonus_actions.json
  game_db/玩家手册2024/reactions.json
  game_db/玩家手册2024/conditions.json
  game_db/玩家手册2024/damage_types.json
  game_db/玩家手册2024/index.json
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def slugify(value: str) -> str:
    value = normalize_space(value)
    value = re.sub(r"[^\w\u4e00-\u9fff]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-").lower()
    return value


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_name_pair(heading: str) -> tuple[str, str]:
    heading = normalize_space(heading)
    if "｜" in heading:
        zh, en = heading.split("｜", 1)
    elif "|" in heading:
        zh, en = heading.split("|", 1)
    else:
        return heading, ""
    return normalize_space(zh), normalize_space(en)


def split_sections_by_headings(text: str, headings: Iterable[str]) -> list[tuple[str, str]]:
    text = normalize_space(text)
    heading_list = [normalize_space(h) for h in headings if normalize_space(h)]
    positions: list[tuple[str, int]] = []
    cursor = 0

    for heading in heading_list:
        idx = text.find(heading, cursor)
        if idx == -1:
            continue
        positions.append((heading, idx))
        cursor = idx + len(heading)

    sections: list[tuple[str, str]] = []
    for i, (heading, start) in enumerate(positions):
        body_start = start + len(heading)
        body_end = len(text) if i + 1 >= len(positions) else positions[i + 1][1]
        sections.append((heading, normalize_space(text[body_start:body_end])))
    return sections


LEVEL_MAP = {
    "零": 0,
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
}


def parse_spell_level(prefix: str) -> tuple[Optional[int], str]:
    prefix = normalize_space(prefix)
    level_match = re.search(r"([零一二三四五六七八九])环", prefix)
    if level_match:
        level_cn = level_match.group(1)
        level = LEVEL_MAP.get(level_cn)
        school = normalize_space(prefix.replace(level_match.group(0), ""))
        return level, school
    if "戏法" in prefix:
        school = normalize_space(prefix.replace("戏法", ""))
        return 0, school
    return None, prefix


def parse_spell_block(heading: str, block_text: str, source_file: str) -> dict:
    name_zh, name_en = parse_name_pair(heading)
    text = normalize_space(block_text)

    # Typical format:
    # 一环 防护（职业） 施法时间：... 施法距离：... 法术成分：... 持续时间：... 描述...
    pattern = re.compile(
        r"^(?P<prefix>.*?)施法时间：(?P<casting>.*?)施法距离：(?P<distance>.*?)"
        r"法术成分：(?P<components>.*?)持续时间：(?P<duration>.*)$"
    )
    match = pattern.search(text)

    classes: list[str] = []
    level: Optional[int] = None
    school = ""
    casting_time = ""
    distance = ""
    components = ""
    duration = ""
    description = text
    upcast = ""

    if match:
        prefix = normalize_space(match.group("prefix"))
        class_match = re.search(r"（([^）]+)）", prefix)
        if class_match:
            classes = [normalize_space(x) for x in class_match.group(1).split("、") if normalize_space(x)]
            prefix = normalize_space(prefix.replace(class_match.group(0), ""))

        level, school = parse_spell_level(prefix)
        casting_time = normalize_space(match.group("casting"))
        distance = normalize_space(match.group("distance"))
        components = normalize_space(match.group("components"))
        duration_and_desc = normalize_space(match.group("duration"))
        duration, description = split_duration_and_description(duration_and_desc)

        upcast_mark = re.search(r"(升环施法[。:：]?)", description)
        if upcast_mark:
            idx = upcast_mark.start()
            upcast = normalize_space(description[idx:])
            description = normalize_space(description[:idx])

    action_type = "other"
    if re.search(r"^\d*附赠动作", casting_time) or "附赠动作" in casting_time[:12]:
        action_type = "bonus_action"
    elif re.search(r"^\d*反应", casting_time) or "反应" in casting_time[:12]:
        action_type = "reaction"
    elif "动作" in casting_time:
        action_type = "action"

    spell_id = slugify(f"{level if level is not None else 'x'}-{name_zh}")
    return {
        "id": spell_id,
        "name_zh": name_zh,
        "name_en": name_en,
        "level": level,
        "school": school,
        "classes": classes,
        "casting_time": casting_time,
        "distance": distance,
        "components": components,
        "duration": duration,
        "action_type": action_type,
        "description": description,
        "upcast": upcast,
        "source_file": source_file,
    }


def split_duration_and_description(value: str) -> tuple[str, str]:
    value = normalize_space(value)
    if not value:
        return "", ""

    # Prefer splitting before common sentence starters used in spell descriptions.
    markers = [" 你", " 指定", " 在", " 当", " 直到", " 若", " 每当", " 受术", " 目标"]
    cut_points = [value.find(m) for m in markers if value.find(m) > 0]
    if cut_points:
        idx = min(cut_points)
        return normalize_space(value[:idx]), normalize_space(value[idx:])

    # Fallback for data with no explicit sentence starter.
    return value, value


def build_spells_db(pages_root: Path) -> dict:
    spell_dir = pages_root / "法术详述"
    spell_files = sorted(spell_dir.glob("*.json"))
    spells: list[dict] = []

    for file_path in spell_files:
        page = read_json(file_path)
        headings = page.get("headings", [])
        text = page.get("text", "")
        sections = split_sections_by_headings(text, headings)
        for heading, body in sections:
            if not heading:
                continue
            if "｜" not in heading and "|" not in heading:
                continue
            spells.append(parse_spell_block(heading, body, page.get("source_file", "")))

    spells.sort(key=lambda s: ((s.get("level") if s.get("level") is not None else 99), s.get("name_zh", "")))
    return {
        "dataset": "spells",
        "count": len(spells),
        "items": spells,
    }


def split_term_heading(heading: str) -> tuple[str, str]:
    # Examples:
    # 攻击 Attack【动作】
    # 目盲 Blinded【状态】
    heading = normalize_space(heading)
    heading = re.sub(r"【[^】]+】", "", heading).strip()
    m = re.match(r"^(?P<zh>[\u4e00-\u9fffA-Za-z0-9·\-\s]+?)\s+(?P<en>[A-Za-z][A-Za-z0-9\s'_-]*)$", heading)
    if m:
        return normalize_space(m.group("zh")), normalize_space(m.group("en"))
    return heading, ""


def build_actions_db(pages_root: Path) -> dict:
    glossary_actions_file = pages_root / "术语汇编" / "动作.json"
    page = read_json(glossary_actions_file)

    headings = page.get("headings", [])
    text = page.get("text", "")
    sections = split_sections_by_headings(text, headings)

    action_items = []
    for heading, body in sections:
        if "【动作】" not in heading:
            continue
        name_zh, name_en = split_term_heading(heading)
        action_items.append(
            {
                "id": slugify(name_zh),
                "name_zh": name_zh,
                "name_en": name_en,
                "description": body,
                "source_file": page.get("source_file", ""),
            }
        )

    return {
        "dataset": "actions",
        "count": len(action_items),
        "items": action_items,
    }


def build_conditions_db(pages_root: Path) -> dict:
    file_path = pages_root / "术语汇编" / "状态.json"
    page = read_json(file_path)
    sections = split_sections_by_headings(page.get("text", ""), page.get("headings", []))

    items = []
    for heading, body in sections:
        if "【状态】" not in heading:
            continue
        zh, en = split_term_heading(heading)
        items.append(
            {
                "id": slugify(zh),
                "name_zh": zh,
                "name_en": en,
                "effects": body,
                "source_file": page.get("source_file", ""),
            }
        )

    return {"dataset": "conditions", "count": len(items), "items": items}


def parse_damage_types_from_term(text: str) -> list[dict]:
    text = normalize_space(text)
    # Keep only the dense "类型例子..." section if present.
    marker = "类型例子"
    if marker in text:
        text = text[text.find(marker) + len(marker):]

    ordered = [
        ("强酸", "Acid"),
        ("钝击", "Bludgeoning"),
        ("寒冷", "Cold"),
        ("火焰", "Fire"),
        ("力场", "Force"),
        ("闪电", "Lightning"),
        ("暗蚀", "Necrotic"),
        ("穿刺", "Piercing"),
        ("毒素", "Poison"),
        ("心灵", "Psychic"),
        ("光耀", "Radiant"),
        ("挥砍", "Slashing"),
        ("雷鸣", "Thunder"),
    ]

    markers = []
    cursor = 0
    for zh, en in ordered:
        token = f"{zh}{en}"
        idx = text.find(token, cursor)
        if idx == -1:
            idx = text.find(zh, cursor)
        if idx == -1:
            continue
        markers.append((zh, en, idx))
        cursor = idx + len(zh)

    results = []
    for i, (zh, en, idx) in enumerate(markers):
        token_len = len(zh + en) if text[idx: idx + len(zh + en)] == zh + en else len(zh)
        start = idx + token_len
        end = len(text) if i + 1 >= len(markers) else markers[i + 1][2]
        example = normalize_space(text[start:end]).strip("，。;；")
        results.append(
            {
                "id": slugify(zh),
                "name_zh": zh,
                "name_en": en,
                "examples": example,
            }
        )
    return results


def build_damage_types_db(pages_root: Path) -> dict:
    terms_page = read_json(pages_root / "术语汇编" / "其他术语.json")
    sections = split_sections_by_headings(terms_page.get("text", ""), terms_page.get("headings", []))
    target = ""
    for heading, body in sections:
        if heading.startswith("伤害类型"):
            target = body
            break
    items = parse_damage_types_from_term(target)
    return {
        "dataset": "damage_types",
        "count": len(items),
        "items": items,
        "source_file": terms_page.get("source_file", ""),
    }


def build_bonus_actions_db(pages_root: Path, spells: list[dict]) -> dict:
    page = read_json(pages_root / "进行游戏" / "附赠动作.json")
    spell_items = [
        {
            "spell_id": s["id"],
            "name_zh": s["name_zh"],
            "level": s["level"],
            "casting_time": s["casting_time"],
        }
        for s in spells
        if s.get("action_type") == "bonus_action"
    ]
    spell_items.sort(key=lambda s: ((s["level"] if s["level"] is not None else 99), s["name_zh"]))

    return {
        "dataset": "bonus_actions",
        "rule_text": page.get("text", ""),
        "spell_options_count": len(spell_items),
        "spell_options": spell_items,
        "source_file": page.get("source_file", ""),
    }


def build_reactions_db(pages_root: Path, spells: list[dict]) -> dict:
    page = read_json(pages_root / "进行游戏" / "反应.json")
    spell_items = [
        {
            "spell_id": s["id"],
            "name_zh": s["name_zh"],
            "level": s["level"],
            "casting_time": s["casting_time"],
        }
        for s in spells
        if s.get("action_type") == "reaction"
    ]
    spell_items.sort(key=lambda s: ((s["level"] if s["level"] is not None else 99), s["name_zh"]))

    return {
        "dataset": "reactions",
        "rule_text": page.get("text", ""),
        "spell_options_count": len(spell_items),
        "spell_options": spell_items,
        "source_file": page.get("source_file", ""),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build DND gameplay DB JSON from extracted PHB 2024 pages")
    parser.add_argument(
        "--input-pages",
        default="extracted_json/玩家手册2024/pages",
        help="Directory containing per-page extracted JSON files",
    )
    parser.add_argument(
        "--output-dir",
        default="game_db/玩家手册2024",
        help="Output directory for gameplay database JSON files",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    pages_root = Path(args.input_pages).resolve()
    output_dir = Path(args.output_dir).resolve()

    if not pages_root.exists():
        raise FileNotFoundError(f"Input pages directory not found: {pages_root}")

    spells_db = build_spells_db(pages_root)
    spells = spells_db["items"]

    actions_db = build_actions_db(pages_root)
    conditions_db = build_conditions_db(pages_root)
    damage_types_db = build_damage_types_db(pages_root)
    bonus_actions_db = build_bonus_actions_db(pages_root, spells)
    reactions_db = build_reactions_db(pages_root, spells)

    write_json(output_dir / "spells.json", spells_db)
    write_json(output_dir / "actions.json", actions_db)
    write_json(output_dir / "conditions.json", conditions_db)
    write_json(output_dir / "damage_types.json", damage_types_db)
    write_json(output_dir / "bonus_actions.json", bonus_actions_db)
    write_json(output_dir / "reactions.json", reactions_db)

    index_payload = {
        "dataset": "phb2024_game_db",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "output_dir": str(output_dir).replace("\\", "/"),
        "files": {
            "spells": "spells.json",
            "actions": "actions.json",
            "conditions": "conditions.json",
            "damage_types": "damage_types.json",
            "bonus_actions": "bonus_actions.json",
            "reactions": "reactions.json",
        },
        "counts": {
            "spells": spells_db["count"],
            "actions": actions_db["count"],
            "conditions": conditions_db["count"],
            "damage_types": damage_types_db["count"],
            "bonus_action_spells": bonus_actions_db["spell_options_count"],
            "reaction_spells": reactions_db["spell_options_count"],
        },
    }
    write_json(output_dir / "index.json", index_payload)

    print(f"Built DB in: {output_dir}")
    print(f"Spells: {spells_db['count']}, Actions: {actions_db['count']}, Conditions: {conditions_db['count']}")
    print(
        "Bonus-action spells: "
        f"{bonus_actions_db['spell_options_count']}, Reaction spells: {reactions_db['spell_options_count']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
