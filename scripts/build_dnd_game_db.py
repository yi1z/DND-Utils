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
  game_db/玩家手册2024/classes.json
  game_db/玩家手册2024/subclasses.json
  game_db/玩家手册2024/feats.json
  game_db/玩家手册2024/races.json
  game_db/玩家手册2024/backgrounds.json
  game_db/玩家手册2024/equipment_topics.json
  game_db/玩家手册2024/equipment_items.json
  game_db/玩家手册2024/index.json
"""

from __future__ import annotations

import argparse
import html
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
        m = re.match(r"^(?P<zh>.+?)\s+(?P<en>[A-Za-z][A-Za-z0-9\s'&\-/]+)$", heading)
        if m:
            return normalize_space(m.group("zh")), normalize_space(m.group("en"))
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


def build_classes_db(pages_root: Path) -> dict:
    classes_root = pages_root / "角色职业"
    items: list[dict] = []
    for class_dir in sorted([p for p in classes_root.iterdir() if p.is_dir()], key=lambda p: p.name):
        class_file = class_dir / f"{class_dir.name}.json"
        if not class_file.exists():
            continue
        page = read_json(class_file)
        items.append(
            {
                "id": slugify(class_dir.name),
                "name_zh": class_dir.name,
                "name_en": parse_name_pair(page.get("headings", [""])[0])[1] if page.get("headings") else "",
                "source_file": page.get("source_file", ""),
                "summary": page.get("paragraphs", [])[0] if page.get("paragraphs") else "",
                "text": page.get("text", ""),
            }
        )
    return {"dataset": "classes", "count": len(items), "items": items}


def build_subclasses_db(pages_root: Path) -> dict:
    classes_root = pages_root / "角色职业"
    skip_names = {"超魔法选项", "魔能祈唤选项"}
    items: list[dict] = []

    for class_dir in sorted([p for p in classes_root.iterdir() if p.is_dir()], key=lambda p: p.name):
        class_name = class_dir.name
        for file_path in sorted(class_dir.glob("*.json"), key=lambda p: p.name):
            stem = file_path.stem
            if stem == class_name:
                continue
            if stem.endswith("法术列表"):
                continue
            if stem in skip_names:
                continue
            page = read_json(file_path)
            heading = page.get("headings", [""])[0] if page.get("headings") else ""
            _, name_en = parse_name_pair(heading)
            items.append(
                {
                    "id": slugify(f"{class_name}-{stem}"),
                    "class_name_zh": class_name,
                    "name_zh": stem,
                    "name_en": name_en,
                    "source_file": page.get("source_file", ""),
                    "summary": page.get("paragraphs", [])[0] if page.get("paragraphs") else "",
                    "text": page.get("text", ""),
                }
            )

    return {"dataset": "subclasses", "count": len(items), "items": items}


def parse_feats_from_text(text: str) -> list[dict]:
    text = normalize_space(text)
    pattern = re.compile(
        r"(?P<name_zh>[\u4e00-\u9fffA-Za-z·' \-]+?)\s+"
        r"(?P<name_en>[A-Za-z][A-Za-z0-9' \-]+)\s+"
        r"(?P<category>起源专长|通用专长|战斗风格专长|传奇恩惠专长)"
        r"(?:（先决：(?P<prereq>[^）]+)）)?"
    )
    markers = list(pattern.finditer(text))
    items: list[dict] = []
    for i, m in enumerate(markers):
        start = m.end()
        end = markers[i + 1].start() if i + 1 < len(markers) else len(text)
        body = normalize_space(text[start:end])
        items.append(
            {
                "name_zh": normalize_space(m.group("name_zh")),
                "name_en": normalize_space(m.group("name_en")),
                "category": normalize_space(m.group("category")),
                "prerequisite": normalize_space(m.group("prereq") or ""),
                "description": body,
            }
        )
    return items


def build_feats_db(pages_root: Path) -> dict:
    feats_root = pages_root / "专长"
    items: list[dict] = []
    for file_path in sorted(feats_root.glob("*.json"), key=lambda p: p.name):
        if file_path.stem == "专长概述":
            continue
        page = read_json(file_path)
        parsed = parse_feats_from_text(page.get("text", ""))
        for feat in parsed:
            feat["id"] = slugify(feat["name_zh"])
            feat["source_file"] = page.get("source_file", "")
            items.append(feat)
    # Deduplicate by zh name when overlap exists.
    unique = {}
    for feat in items:
        unique[feat["name_zh"]] = feat
    deduped = sorted(unique.values(), key=lambda x: x["name_zh"])
    return {"dataset": "feats", "count": len(deduped), "items": deduped}


def build_races_db(pages_root: Path) -> dict:
    races_root = pages_root / "角色起源" / "种族"
    items: list[dict] = []
    for file_path in sorted(races_root.glob("*.json"), key=lambda p: p.name):
        page = read_json(file_path)
        heading = page.get("headings", [""])[0] if page.get("headings") else ""
        name_zh, name_en = parse_name_pair(heading)
        text = page.get("text", "")

        trait_type = ""
        trait_size = ""
        trait_speed = ""
        m = re.search(r"生物类型：([^ ]+)\s+体型：([^ ]+)\s+速度：([^ ]+)", text)
        if m:
            trait_type = normalize_space(m.group(1))
            trait_size = normalize_space(m.group(2))
            trait_speed = normalize_space(m.group(3))

        items.append(
            {
                "id": slugify(name_zh or file_path.stem),
                "name_zh": name_zh or file_path.stem,
                "name_en": name_en,
                "creature_type": trait_type,
                "size": trait_size,
                "speed": trait_speed,
                "source_file": page.get("source_file", ""),
                "summary": page.get("paragraphs", [])[0] if page.get("paragraphs") else "",
                "text": text,
            }
        )
    return {"dataset": "races", "count": len(items), "items": items}


def build_backgrounds_db(pages_root: Path) -> dict:
    bg_root = pages_root / "角色起源" / "背景"
    items: list[dict] = []
    for file_path in sorted(bg_root.glob("*.json"), key=lambda p: p.name):
        page = read_json(file_path)
        heading = page.get("headings", [""])[0] if page.get("headings") else ""
        name_zh, name_en = parse_name_pair(heading)
        text = page.get("text", "")
        first = page.get("paragraphs", [""])[0] if page.get("paragraphs") else ""

        ability = ""
        feat = ""
        skill = ""
        tool = ""
        equipment = ""
        m = re.search(
            r"属性值：(?P<ability>.*?)\s+专长：(?P<feat>.*?)\s+技能熟练：(?P<skill>.*?)\s+"
            r"工具熟练：(?P<tool>.*?)\s+装备：(?P<equipment>.*)$",
            first,
        )
        if m:
            ability = normalize_space(m.group("ability"))
            feat = normalize_space(m.group("feat"))
            skill = normalize_space(m.group("skill"))
            tool = normalize_space(m.group("tool"))
            equipment = normalize_space(m.group("equipment"))

        items.append(
            {
                "id": slugify(name_zh or file_path.stem),
                "name_zh": name_zh or file_path.stem,
                "name_en": name_en,
                "ability_scores": ability,
                "feat": feat,
                "skill_proficiencies": skill,
                "tool_proficiencies": tool,
                "starting_equipment": equipment,
                "source_file": page.get("source_file", ""),
                "description": page.get("paragraphs", ["", ""])[1] if len(page.get("paragraphs", [])) > 1 else "",
                "text": text,
            }
        )
    return {"dataset": "backgrounds", "count": len(items), "items": items}


def parse_equipment_entries(paragraphs: list[str]) -> list[dict]:
    entry_pattern = re.compile(
        r"^(?P<name_zh>.*?)\s+"
        r"(?P<name_en>[A-Za-z][A-Za-z0-9 ,'\-()/]+)\s+"
        r"\((?P<price>[^)]+)\)\s*(?P<desc>.*)$"
    )
    entries: list[dict] = []
    for paragraph in paragraphs:
        para = normalize_space(paragraph)
        if not para:
            continue
        m = entry_pattern.match(para)
        if not m:
            continue
        entries.append(
            {
                "name_zh": normalize_space(m.group("name_zh")),
                "name_en": normalize_space(m.group("name_en")),
                "price_text": normalize_space(m.group("price")),
                "description": normalize_space(m.group("desc")),
            }
        )
    return entries


def html_to_text(fragment: str) -> str:
    fragment = re.sub(r"(?i)<br\s*/?>", "\n", fragment or "")
    fragment = re.sub(r"(?is)<[^>]+>", "", fragment)
    fragment = html.unescape(fragment)
    lines = [normalize_space(line) for line in fragment.splitlines()]
    lines = [line for line in lines if line]
    return "\n".join(lines)


def split_zh_en_title(value: str) -> tuple[str, str]:
    value = normalize_space(value)
    m = re.match(r"^(?P<zh>[\u4e00-\u9fff0-9（）()·、/《》—\-]+)\s*(?P<en>[A-Za-z][A-Za-z0-9 ,'\-()/]+)$", value)
    if m:
        return normalize_space(m.group("zh")), normalize_space(m.group("en"))
    return value, ""


def parse_html_tables(raw_html: str) -> list[list[list[str]]]:
    tables: list[list[list[str]]] = []
    for table in re.findall(r"(?is)<table[^>]*>(.*?)</table>", raw_html):
        rows: list[list[str]] = []
        for tr in re.findall(r"(?is)<tr[^>]*>(.*?)</tr>", table):
            cells = [html_to_text(td) for td in re.findall(r"(?is)<td[^>]*>(.*?)</td>", tr)]
            if cells:
                rows.append(cells)
        if rows:
            tables.append(rows)
    return tables


def parse_static_weapons_entries(raw_html: str) -> list[dict]:
    entries: list[dict] = []
    current_category = ""
    tables = parse_html_tables(raw_html)
    if not tables:
        return entries
    for row in tables[0]:
        if len(row) == 1:
            current_category = normalize_space(row[0])
            continue
        if len(row) != 6:
            continue
        if row[0] == "名称":
            continue
        name_zh, name_en = split_zh_en_title(row[0])
        entries.append(
            {
                "name_zh": name_zh,
                "name_en": name_en,
                "price_text": normalize_space(row[5]),
                "description": normalize_space(
                    f"分类：{current_category}；伤害：{row[1]}；词条：{row[2]}；精通：{row[3]}；重量：{row[4]}"
                ),
            }
        )
    return entries


def parse_static_services_entries(raw_html: str) -> list[dict]:
    entries: list[dict] = []
    # Lifestyle entries (乞食/流浪/...)
    for title_html, desc_html in re.findall(
        r"(?is)<p>\s*<strong><font[^>]*>(.*?)</font>.*?</strong>\s*(.*?)</p>",
        raw_html,
    ):
        title = html_to_text(title_html)
        desc = html_to_text(desc_html)
        m = re.match(
            r"^(?P<zh>[\u4e00-\u9fff]+)\s*(?P<en>[A-Za-z][A-Za-z ]+)\s*[（(](?P<price>[^)）]+)[)）]$",
            title,
        )
        if m:
            entries.append(
                {
                    "name_zh": normalize_space(m.group("zh")),
                    "name_en": normalize_space(m.group("en")),
                    "price_text": normalize_space(m.group("price")),
                    "description": desc,
                }
            )

    tables = parse_html_tables(raw_html)
    if len(tables) < 4:
        return entries

    # Food, drink, lodging
    section = ""
    for row in tables[0]:
        if len(row) == 1:
            section = normalize_space(row[0]).lstrip("○")
            continue
        if len(row) != 2 or row[0] == "物品":
            continue
        base_name = normalize_space(row[0]).lstrip("○")
        name_zh, name_en = split_zh_en_title(base_name)
        if section and section not in {"饮食与住宿"}:
            name_zh = f"{section}-{name_zh}"
            if name_en:
                name_en = f"{section}-{name_en}"
        entries.append(
            {
                "name_zh": name_zh,
                "name_en": name_en,
                "price_text": normalize_space(row[1]),
                "description": "服务价格表条目",
            }
        )

    # Travel + Hirelings
    for table in (tables[1], tables[2]):
        for row in table:
            if len(row) != 2 or row[0] == "服务":
                continue
            name_zh, name_en = split_zh_en_title(normalize_space(row[0]))
            entries.append(
                {
                    "name_zh": name_zh,
                    "name_en": name_en,
                    "price_text": normalize_space(row[1]),
                    "description": "服务价格表条目",
                }
            )

    # Spellcasting services
    for row in tables[3]:
        if len(row) != 3 or row[0] == "法术环阶":
            continue
        spell_level = normalize_space(row[0])
        entries.append(
            {
                "name_zh": f"施法服务（{spell_level}）",
                "name_en": f"Spellcasting Service ({spell_level})",
                "price_text": normalize_space(row[2]),
                "description": f"可购地点：{normalize_space(row[1])}",
            }
        )

    return entries


def parse_static_property_like_entries(raw_html: str) -> list[dict]:
    entries: list[dict] = []
    for para in re.findall(r"(?is)<p[^>]*>(.*?)</p>", raw_html):
        text = html_to_text(para)
        if not text:
            continue
        lines = [normalize_space(line) for line in text.split("\n") if normalize_space(line)]
        if not lines:
            continue

        zh = ""
        en = ""
        desc_lines: list[str] = []

        same_line = re.match(r"^(?P<zh>[\u4e00-\u9fff]+)\s+(?P<en>[A-Za-z][A-Za-z \-]+)$", lines[0])
        if same_line:
            zh = same_line.group("zh")
            en = same_line.group("en")
            desc_lines = lines[1:]
        elif len(lines) >= 2 and re.match(r"^[\u4e00-\u9fff]+$", lines[0]) and re.match(r"^[A-Za-z][A-Za-z \-]+$", lines[1]):
            zh = lines[0]
            en = lines[1]
            desc_lines = lines[2:]
        else:
            continue

        desc = normalize_space(" ".join(desc_lines))
        entries.append(
            {
                "name_zh": zh,
                "name_en": en,
                "price_text": "",
                "description": desc,
            }
        )

    # 临时武器 is in a div in 词条.htm
    for block in re.findall(r"(?is)<div[^>]*>(.*?)</div>", raw_html):
        text = html_to_text(block)
        combined = normalize_space(text.replace("\n", " "))
        if not combined:
            continue
        m = re.match(r"^(?P<zh>[\u4e00-\u9fff]+)\s*(?P<en>Improvised\s*Weapons)\s*(?P<desc>.*)$", combined)
        if not m:
            continue
        desc = normalize_space(m.group("desc"))
        entries.append(
            {
                "name_zh": m.group("zh"),
                "name_en": m.group("en"),
                "price_text": "",
                "description": desc,
            }
        )
    return entries


def parse_static_magic_items_entries(raw_html: str) -> list[dict]:
    entries: list[dict] = []
    # Overview from H2 + first paragraph.
    h2_match = re.search(r"(?is)<h2[^>]*>(.*?)</h2>\s*<p[^>]*>(.*?)</p>", raw_html)
    if h2_match:
        title = normalize_space(html_to_text(h2_match.group(1)).replace("\n", " "))
        overview = normalize_space(html_to_text(h2_match.group(2)))
        name_zh, name_en = split_zh_en_title(title)
        if name_zh and overview:
            entries.append(
                {
                    "name_zh": name_zh,
                    "name_en": name_en,
                    "price_text": "",
                    "description": overview,
                }
            )

    for heading, body in re.findall(r"(?is)<h3[^>]*>(.*?)</h3>\s*(.*?)(?=<h3|</body>)", raw_html):
        title = html_to_text(heading).replace("\n", " ")
        name_zh, name_en = split_zh_en_title(normalize_space(title))
        description = normalize_space(html_to_text(body))
        if name_zh:
            entries.append(
                {
                    "name_zh": name_zh,
                    "name_en": name_en,
                    "price_text": "",
                    "description": description,
                }
            )

    # Include emphasized sub-sections inside paragraphs.
    for para in re.findall(r"(?is)<p[^>]*>(.*?)</p>", raw_html):
        if "<strong>" not in para.lower():
            continue
        m = re.search(r"(?is)<strong>.*?<font[^>]*color\s*=\s*#800000[^>]*>(.*?)</font>.*?</strong>(.*)", para)
        if not m:
            continue
        title = normalize_space(html_to_text(m.group(1)).replace("\n", " "))
        desc = normalize_space(html_to_text(m.group(2)))
        if not title:
            continue
        name_zh, name_en = split_zh_en_title(title)
        if not name_zh:
            continue
        entries.append(
            {
                "name_zh": name_zh,
                "name_en": name_en,
                "price_text": "",
                "description": desc,
            }
        )

    deduped: list[dict] = []
    seen: set[str] = set()
    for entry in entries:
        key = normalize_space(entry.get("name_zh", ""))
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(entry)
    return deduped


def parse_static_equipment_topic(topic_name_zh: str, raw_html: str) -> list[dict]:
    if topic_name_zh == "武器":
        return parse_static_weapons_entries(raw_html)
    if topic_name_zh == "服务":
        return parse_static_services_entries(raw_html)
    if topic_name_zh in {"词条", "精通词条"}:
        return parse_static_property_like_entries(raw_html)
    if topic_name_zh == "魔法物品":
        return parse_static_magic_items_entries(raw_html)
    return []


def get_equipment_topic_overrides(topic_name_zh: str, static_html_root: Optional[Path] = None) -> list[dict]:
    if static_html_root:
        static_path = static_html_root / f"{topic_name_zh}.htm"
        if static_path.exists():
            try:
                raw_html = static_path.read_text(encoding="utf-8")
                static_entries = parse_static_equipment_topic(topic_name_zh, raw_html)
                if static_entries:
                    return static_entries
            except UnicodeDecodeError:
                raw_html = static_path.read_text(encoding="gbk")
                static_entries = parse_static_equipment_topic(topic_name_zh, raw_html)
                if static_entries:
                    return static_entries

    overrides: dict[str, list[dict]] = {
        "服务": [
            {"name_zh": "乞食", "name_en": "Wretched", "price_text": "无开支", "description": "仅依靠运气和施舍生存，经常露宿街头并遭受自然危险。"},
            {"name_zh": "流浪", "name_en": "Squalid", "price_text": "每日1 SP", "description": "以最低限度购置必需品，可能陷入不健康状态并招来犯罪分子。"},
            {"name_zh": "穷困", "name_en": "Poor", "price_text": "每日2 SP", "description": "节约地为自己购置必需品。"},
            {"name_zh": "俭朴", "name_en": "Modest", "price_text": "每日1 GP", "description": "提供平均水平的生活。"},
            {"name_zh": "舒适", "name_en": "Comfortable", "price_text": "每日2 GP", "description": "较为宽松地购置必需品，并可偶尔享乐。"},
            {"name_zh": "富裕", "name_en": "Wealthy", "price_text": "每日4 GP", "description": "习惯优越生活，或许拥有仆人。"},
            {"name_zh": "奢华", "name_en": "Aristocratic", "price_text": "每日10 GP", "description": "追求最高品质生活，可能引来他人觊觎。"},
            {"name_zh": "麦酒（马克杯）", "name_en": "Ale", "price_text": "4 CP", "description": "饮食与住宿中的常见饮品价格。"},
            {"name_zh": "面包（一块）", "name_en": "Bread", "price_text": "2 CP", "description": "饮食与住宿中的常见食物价格。"},
            {"name_zh": "奶酪（一角）", "name_en": "Cheese", "price_text": "1 SP", "description": "饮食与住宿中的常见食物价格。"},
            {"name_zh": "旅馆住宿（流浪）", "name_en": "Inn Stay (Squalid)", "price_text": "7 CP/日", "description": "旅馆住宿分档价格。"},
            {"name_zh": "旅馆住宿（穷困）", "name_en": "Inn Stay (Poor)", "price_text": "1 SP/日", "description": "旅馆住宿分档价格。"},
            {"name_zh": "旅馆住宿（俭朴）", "name_en": "Inn Stay (Modest)", "price_text": "5 SP/日", "description": "旅馆住宿分档价格。"},
            {"name_zh": "旅馆住宿（舒适）", "name_en": "Inn Stay (Comfortable)", "price_text": "8 SP/日", "description": "旅馆住宿分档价格。"},
            {"name_zh": "旅馆住宿（富裕）", "name_en": "Inn Stay (Wealthy)", "price_text": "2 GP/日", "description": "旅馆住宿分档价格。"},
            {"name_zh": "旅馆住宿（奢华）", "name_en": "Inn Stay (Aristocratic)", "price_text": "4 GP/日", "description": "旅馆住宿分档价格。"},
            {"name_zh": "食膳（流浪）", "name_en": "Meal (Squalid)", "price_text": "1 CP", "description": "食膳分档价格。"},
            {"name_zh": "食膳（穷困）", "name_en": "Meal (Poor)", "price_text": "2 CP", "description": "食膳分档价格。"},
            {"name_zh": "食膳（俭朴）", "name_en": "Meal (Modest)", "price_text": "1 SP", "description": "食膳分档价格。"},
            {"name_zh": "食膳（舒适）", "name_en": "Meal (Comfortable)", "price_text": "2 SP", "description": "食膳分档价格。"},
            {"name_zh": "食膳（富裕）", "name_en": "Meal (Wealthy)", "price_text": "3 SP", "description": "食膳分档价格。"},
            {"name_zh": "食膳（奢华）", "name_en": "Meal (Aristocratic)", "price_text": "6 SP", "description": "食膳分档价格。"},
            {"name_zh": "红酒（普通）", "name_en": "Wine (Common)", "price_text": "2 SP", "description": "普通瓶装红酒。"},
            {"name_zh": "红酒（优质）", "name_en": "Wine (Fine)", "price_text": "10 GP", "description": "优质瓶装红酒。"},
            {"name_zh": "城际旅程", "name_en": "Coach Ride Between Towns", "price_text": "每里3 CP", "description": "城镇之间乘坐车夫服务，不含过路费等额外开支。"},
            {"name_zh": "城内旅程", "name_en": "Coach Ride Within a City", "price_text": "每里1 CP", "description": "城市内乘坐车夫服务。"},
            {"name_zh": "道路或关卡费", "name_en": "Road or Gate Toll", "price_text": "1 CP", "description": "道路或关卡的通行费。"},
            {"name_zh": "船运费", "name_en": "Ship's Passage", "price_text": "每里1 SP", "description": "船运旅程费用。"},
            {"name_zh": "熟练雇工", "name_en": "Skilled Hireling", "price_text": "每日2 GP", "description": "需要特定武器、工具或技能熟练的雇工。"},
            {"name_zh": "新手雇工", "name_en": "Untrained Hireling", "price_text": "每日2 SP", "description": "从事不需要特定熟练工作的雇工。"},
            {"name_zh": "信使", "name_en": "Messenger", "price_text": "每里2 CP", "description": "按里程计费的信使服务。"},
            {"name_zh": "施法服务（戏法）", "name_en": "Spellcasting Service (Cantrip)", "price_text": "30 GP", "description": "可购地点：村庄、城镇或城市。"},
            {"name_zh": "施法服务（一环）", "name_en": "Spellcasting Service (1st Level)", "price_text": "50 GP", "description": "可购地点：村庄、城镇或城市。"},
            {"name_zh": "施法服务（二环）", "name_en": "Spellcasting Service (2nd Level)", "price_text": "200 GP", "description": "可购地点：村庄、城镇或城市。"},
            {"name_zh": "施法服务（三环）", "name_en": "Spellcasting Service (3rd Level)", "price_text": "300 GP", "description": "可购地点：仅城镇或城市。"},
            {"name_zh": "施法服务（四到五环）", "name_en": "Spellcasting Service (4th-5th Level)", "price_text": "2000 GP", "description": "可购地点：仅城镇或城市。"},
            {"name_zh": "施法服务（六到八环）", "name_en": "Spellcasting Service (6th-8th Level)", "price_text": "20000 GP", "description": "可购地点：仅城市。"},
            {"name_zh": "施法服务（九环）", "name_en": "Spellcasting Service (9th Level)", "price_text": "100000 GP", "description": "可购地点：仅城市。"},
        ],
        "武器": [
            {"name_zh": "吹箭筒", "name_en": "Blowgun", "price_text": "10 GP", "description": "军用远程武器；伤害：1穿刺；词条：弹药（射程25/100；吹矢）、装填；精通：侵扰；重量：1磅。"},
            {"name_zh": "手弩", "name_en": "Hand Crossbow", "price_text": "75 GP", "description": "军用远程武器；伤害：1d6穿刺；词条：弹药（射程30/120；弩矢）、轻型、装填；精通：侵扰；重量：3磅。"},
            {"name_zh": "重弩", "name_en": "Heavy Crossbow", "price_text": "50 GP", "description": "军用远程武器；伤害：1d10穿刺；词条：弹药（射程100/400；弩矢）、重型、装填、双手；精通：推离；重量：18磅。"},
            {"name_zh": "长弓", "name_en": "Longbow", "price_text": "50 GP", "description": "军用远程武器；伤害：1d8穿刺；词条：弹药（射程150/600；箭矢）、重型、双手；精通：缓速；重量：2磅。"},
            {"name_zh": "火铳", "name_en": "Musket", "price_text": "500 GP", "description": "军用远程武器；伤害：1d12穿刺；词条：弹药（射程40/120；子弹）、装填、双手；精通：缓速；重量：10磅。"},
            {"name_zh": "手铳", "name_en": "Pistol", "price_text": "250 GP", "description": "军用远程武器；伤害：1d10穿刺；词条：弹药（射程30/90；子弹）、装填；精通：侵扰；重量：3磅。"},
        ],
        "词条": [
            {"name_zh": "弹药", "name_en": "Ammunition", "price_text": "", "description": "远程攻击需要对应弹药；每次攻击消耗1枚，战斗后可回收一半（向下取整）。"},
            {"name_zh": "灵巧", "name_en": "Finesse", "price_text": "", "description": "攻击与伤害可选力量或敏捷调整值，但两者必须使用同一属性。"},
            {"name_zh": "重型", "name_en": "Heavy", "price_text": "", "description": "力量低于13时，重型近战武器攻击检定劣势；敏捷低于13时，重型远程武器攻击检定劣势。"},
            {"name_zh": "轻型", "name_en": "Light", "price_text": "", "description": "攻击动作后可用附赠动作以另一把轻型武器进行一次额外攻击，通常不加属性伤害。"},
            {"name_zh": "装填", "name_en": "Loading", "price_text": "", "description": "使用动作、附赠动作或反应射击时，不论可攻击次数，只能发射一发弹药。"},
            {"name_zh": "射程", "name_en": "Range", "price_text": "", "description": "超过常规射程攻击具有劣势；超出最大射程则无法攻击。"},
            {"name_zh": "触及", "name_en": "Reach", "price_text": "", "description": "用该武器攻击时触及范围+5尺，且影响借机攻击触及。"},
            {"name_zh": "投掷", "name_en": "Thrown", "price_text": "", "description": "可将武器投掷进行远程攻击；拔出该武器可视作本次攻击的一部分。"},
            {"name_zh": "双手", "name_en": "Two-Handed", "price_text": "", "description": "使用该武器攻击时需双手持用。"},
            {"name_zh": "多用", "name_en": "Versatile", "price_text": "", "description": "可单手或双手使用；括号中的伤害值为双手近战时使用。"},
            {"name_zh": "临时武器", "name_en": "Improvised Weapons", "price_text": "", "description": "使用非武器物件或以不寻常方式使用武器时，参见术语汇编中的临时武器规则。"},
        ],
        "精通词条": [
            {"name_zh": "横扫", "name_en": "Cleave", "price_text": "", "description": "近战命中后可对5尺内另一目标追加一次近战攻击；每回合仅一次，追加伤害通常不加属性值。"},
            {"name_zh": "擦掠", "name_en": "Graze", "price_text": "", "description": "攻击失手仍可造成等同属性调整值的武器同类型伤害。"},
            {"name_zh": "迅击", "name_en": "Nick", "price_text": "", "description": "轻型词条给出的额外攻击可并入攻击动作，而非使用附赠动作。"},
            {"name_zh": "推离", "name_en": "Push", "price_text": "", "description": "命中大型或更小目标时，可将其直线推离你至多10尺。"},
            {"name_zh": "削弱", "name_en": "Sap", "price_text": "", "description": "命中目标后至你下回合开始前，其下一次攻击检定具有劣势。"},
            {"name_zh": "缓速", "name_en": "Slow", "price_text": "", "description": "命中并造成伤害后，目标速度-10尺至你下回合开始；多次命中不叠加。"},
            {"name_zh": "失衡", "name_en": "Topple", "price_text": "", "description": "命中后可迫使目标进行体质豁免，失败则倒地。"},
            {"name_zh": "侵扰", "name_en": "Vex", "price_text": "", "description": "命中并造成伤害后，至你下回合结束前你对该目标下一次攻击具有优势。"},
        ],
        "魔法物品": [
            {"name_zh": "魔法物品概述", "name_en": "Magic Items Overview", "price_text": "", "description": "冒险中可能发现魔法物品；其详细清单通常见《城主指南》。"},
            {"name_zh": "鉴定魔法物品", "name_en": "Identifying a Magic Item", "price_text": "", "description": "可通过鉴定术或短休专注接触来识别词条；通常不识别诅咒。"},
            {"name_zh": "同调", "name_en": "Attunement", "price_text": "", "description": "某些魔法物品需同调后才能使用其魔法词条；否则通常仅有非魔法增益。"},
            {"name_zh": "在短休期间建立同调", "name_en": "Attune during a Short Rest", "price_text": "", "description": "短休专注于物品并保持接触，休息未中断则同调成功。"},
            {"name_zh": "最多三件", "name_en": "No More Than Three Items", "price_text": "", "description": "同一生物最多同时同调三件魔法物品，且不能同调多个同名物品。"},
            {"name_zh": "结束同调", "name_en": "Ending Attunement", "price_text": "", "description": "不满足条件、距离过远、死亡或他人同调时结束；也可短休自愿解除。"},
            {"name_zh": "着装和持用物品", "name_en": "Wearing and Wielding Items", "price_text": "", "description": "魔法物品通常需要按正确方式穿戴或持用才能生效。"},
            {"name_zh": "多个同类物品", "name_en": "Multiple Items of the Same Kind", "price_text": "", "description": "通常不能同时着装多个同类魔法物品。"},
            {"name_zh": "成对物品", "name_en": "Paired Items", "price_text": "", "description": "靴子、手套等成对物品通常需两件同时着装才生效。"},
        ],
    }
    return overrides.get(topic_name_zh, [])


def build_equipment_dbs(pages_root: Path) -> tuple[dict, dict]:
    eq_root = pages_root / "装备"
    static_html_root = (
        pages_root.parent.parent.parent / "5echm_web" / "topics" / "玩家手册2024" / "装备"
    )
    topics = []
    all_items = []

    for file_path in sorted(eq_root.glob("*.json"), key=lambda p: p.name):
        page = read_json(file_path)
        parsed_entries = parse_equipment_entries(page.get("paragraphs", []))
        if not parsed_entries:
            parsed_entries = get_equipment_topic_overrides(file_path.stem, static_html_root)
        topic = {
            "id": slugify(file_path.stem),
            "topic_name_zh": file_path.stem,
            "title": page.get("title", ""),
            "source_file": page.get("source_file", ""),
            "entries_count": len(parsed_entries),
            "entries": parsed_entries,
            "text": page.get("text", ""),
        }
        topics.append(topic)

        for entry in parsed_entries:
            all_items.append(
                {
                    "id": slugify(f"{file_path.stem}-{entry['name_zh']}"),
                    "topic_name_zh": file_path.stem,
                    "source_file": page.get("source_file", ""),
                    **entry,
                }
            )

    topics_db = {"dataset": "equipment_topics", "count": len(topics), "items": topics}
    items_db = {"dataset": "equipment_items", "count": len(all_items), "items": all_items}
    return topics_db, items_db


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
    classes_db = build_classes_db(pages_root)
    subclasses_db = build_subclasses_db(pages_root)
    feats_db = build_feats_db(pages_root)
    races_db = build_races_db(pages_root)
    backgrounds_db = build_backgrounds_db(pages_root)
    equipment_topics_db, equipment_items_db = build_equipment_dbs(pages_root)

    write_json(output_dir / "spells.json", spells_db)
    write_json(output_dir / "actions.json", actions_db)
    write_json(output_dir / "conditions.json", conditions_db)
    write_json(output_dir / "damage_types.json", damage_types_db)
    write_json(output_dir / "bonus_actions.json", bonus_actions_db)
    write_json(output_dir / "reactions.json", reactions_db)
    write_json(output_dir / "classes.json", classes_db)
    write_json(output_dir / "subclasses.json", subclasses_db)
    write_json(output_dir / "feats.json", feats_db)
    write_json(output_dir / "races.json", races_db)
    write_json(output_dir / "backgrounds.json", backgrounds_db)
    write_json(output_dir / "equipment_topics.json", equipment_topics_db)
    write_json(output_dir / "equipment_items.json", equipment_items_db)

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
            "classes": "classes.json",
            "subclasses": "subclasses.json",
            "feats": "feats.json",
            "races": "races.json",
            "backgrounds": "backgrounds.json",
            "equipment_topics": "equipment_topics.json",
            "equipment_items": "equipment_items.json",
        },
        "counts": {
            "spells": spells_db["count"],
            "actions": actions_db["count"],
            "conditions": conditions_db["count"],
            "damage_types": damage_types_db["count"],
            "bonus_action_spells": bonus_actions_db["spell_options_count"],
            "reaction_spells": reactions_db["spell_options_count"],
            "classes": classes_db["count"],
            "subclasses": subclasses_db["count"],
            "feats": feats_db["count"],
            "races": races_db["count"],
            "backgrounds": backgrounds_db["count"],
            "equipment_topics": equipment_topics_db["count"],
            "equipment_items": equipment_items_db["count"],
        },
    }
    write_json(output_dir / "index.json", index_payload)

    print(f"Built DB in: {output_dir}")
    print(f"Spells: {spells_db['count']}, Actions: {actions_db['count']}, Conditions: {conditions_db['count']}")
    print(
        "Bonus-action spells: "
        f"{bonus_actions_db['spell_options_count']}, Reaction spells: {reactions_db['spell_options_count']}"
    )
    print(
        "Classes/Subclasses/Feats/Races/Backgrounds: "
        f"{classes_db['count']}/{subclasses_db['count']}/{feats_db['count']}/"
        f"{races_db['count']}/{backgrounds_db['count']}"
    )
    print(
        f"Equipment topics/items: {equipment_topics_db['count']}/{equipment_items_db['count']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
