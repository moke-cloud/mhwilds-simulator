"""
MHDB Wilds API データ → mhwilds-simulator JSON 変換スクリプト
"""
import json
import os

SRC = os.path.expanduser("~/tmp_mhw")
DST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

WEAPON_KIND_MAP = {
    "great-sword": "大剣", "long-sword": "太刀", "sword-shield": "片手剣",
    "dual-blades": "双剣", "hammer": "ハンマー", "hunting-horn": "狩猟笛",
    "lance": "ランス", "gunlance": "ガンランス", "switch-axe": "スラッシュアックス",
    "charge-blade": "チャージアックス", "insect-glaive": "操虫棍",
    "light-bowgun": "ライトボウガン", "heavy-bowgun": "ヘビィボウガン", "bow": "弓"
}

ARMOR_PART_MAP = {
    "head": "head", "chest": "chest", "arms": "arms", "waist": "waist", "legs": "legs"
}

ELEMENT_MAP = {
    "fire": "火", "water": "水", "thunder": "雷", "ice": "氷", "dragon": "龍",
    "blast": "爆破", "poison": "毒", "sleep": "睡眠", "paralysis": "麻痺"
}


def load(name):
    with open(os.path.join(SRC, f"{name}.json"), encoding="utf-8") as f:
        return json.load(f)


def save(name, data):
    os.makedirs(DST, exist_ok=True)
    with open(os.path.join(DST, f"{name}.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  {name}.json: {len(data.get('weapons', data.get('armors', data.get('skills', data.get('decorations', data.get('charms', data.get('armorSets', [])))))))}件")


def convert_weapons():
    raw = load("weapons")
    weapons = []
    weapon_types = list(WEAPON_KIND_MAP.values())

    for w in raw:
        kind = WEAPON_KIND_MAP.get(w.get("kind", ""), w.get("kind", ""))

        # attack: API uses "damage" field with {raw, display}
        damage = w.get("damage", {})
        if isinstance(damage, dict):
            attack = damage.get("display", damage.get("raw", 0))
        else:
            attack = damage or 0

        # element: API uses "specials" array
        elem = None
        specials = w.get("specials", [])
        if specials and len(specials) > 0:
            sp = specials[0]
            elem_key = sp.get("element", "")
            elem_type = ELEMENT_MAP.get(elem_key, elem_key)
            sp_damage = sp.get("damage", {})
            if isinstance(sp_damage, dict):
                elem_value = sp_damage.get("display", sp_damage.get("raw", 0))
            else:
                elem_value = sp_damage or 0
            if elem_type and elem_value:
                elem = {"type": elem_type, "value": elem_value}

        # sharpness
        sharpness = None
        sharpness_max = None
        if w.get("sharpness"):
            s = w["sharpness"]
            if isinstance(s, dict):
                sharpness = [
                    s.get("red", 0), s.get("orange", 0), s.get("yellow", 0),
                    s.get("green", 0), s.get("blue", 0), s.get("white", 0), s.get("purple", 0)
                ]

        # handicraft field contains sharpness bonuses per level
        # For sharpnessMax, we add handicraft level 5 bonus to base sharpness
        handicraft = w.get("handicraft", [])
        if sharpness and handicraft and len(handicraft) >= 5:
            bonus = handicraft[4]  # Level 5 bonus
            sharpness_max = list(sharpness)
            # Add bonus to the highest non-zero color or next color
            for i in range(len(sharpness_max) - 1, -1, -1):
                if sharpness_max[i] > 0:
                    sharpness_max[i] += bonus
                    break

        # slots: API returns flat array of integers
        slots = w.get("slots", [])
        if isinstance(slots, list):
            slots = [s.get("rank", s) if isinstance(s, dict) else s for s in slots]

        weapons.append({
            "id": f"w_{w['id']}",
            "name": w.get("name", ""),
            "weaponType": kind,
            "rarity": w.get("rarity", 1),
            "attack": attack,
            "affinity": w.get("affinity", 0),
            "element": elem,
            "sharpness": sharpness,
            "sharpnessMax": sharpness_max,
            "slots": slots,
            "defense": w.get("defenseBonus", 0)
        })

    save("weapons", {
        "version": "2.0.0",
        "source": "MHDB Wilds API",
        "weaponTypes": weapon_types,
        "weapons": weapons
    })


def convert_armors():
    raw_armors = load("armor")
    raw_sets = load("sets")

    # Build set map
    set_map = {}
    set_bonus_map = {}  # setId -> bonus skills
    for s in raw_sets:
        set_id = s.get("id")
        set_map[set_id] = s.get("name", "")

        # Extract set bonus skills
        bonus = s.get("bonus", {})
        if bonus:
            ranks = bonus.get("ranks", [])
            if ranks:
                set_bonus_map[set_id] = {
                    "setName": s.get("name", ""),
                    "bonuses": []
                }
                for r in ranks:
                    pieces = r.get("pieces", 0)
                    skill_info = r.get("skill", {})
                    if skill_info:
                        set_bonus_map[set_id]["bonuses"].append({
                            "pieces": pieces,
                            "skill": skill_info.get("name", ""),
                            "description": skill_info.get("description", "")
                        })

    armors = []
    for a in raw_armors:
        armor_set = a.get("armorSet", {})
        set_id = armor_set.get("id") if armor_set else None
        set_name = set_map.get(set_id, armor_set.get("name", "")) if armor_set else ""

        # skills
        skills = []
        for sk in a.get("skills", []):
            skill_info = sk.get("skill", {})
            name = skill_info.get("name", "")
            level = sk.get("level", 1)
            if name:
                skills.append({"name": name, "level": level})

        # slots
        slots = a.get("slots", [])
        if isinstance(slots, list):
            slots = [s.get("rank", s) if isinstance(s, dict) else s for s in slots]

        # resistances
        res = a.get("resistances", {})
        resistance = {
            "fire": res.get("fire", 0),
            "water": res.get("water", 0),
            "thunder": res.get("thunder", 0),
            "ice": res.get("ice", 0),
            "dragon": res.get("dragon", 0)
        }

        # defense
        defense = a.get("defense", {})
        if isinstance(defense, dict):
            def_obj = {"base": defense.get("base", 0), "max": defense.get("max", 0)}
        else:
            def_obj = {"base": defense, "max": defense}

        armors.append({
            "id": f"a_{a['id']}",
            "name": a.get("name", ""),
            "setName": set_name,
            "setId": set_id,
            "part": a.get("kind", ""),
            "rarity": a.get("rarity", 1),
            "rank": a.get("rank", "high"),
            "defense": def_obj,
            "resistance": resistance,
            "skills": skills,
            "slots": slots
        })

    # Armor sets with bonuses
    armor_sets = []
    for set_id, bonus in set_bonus_map.items():
        armor_sets.append({
            "id": set_id,
            "name": bonus["setName"],
            "bonuses": bonus["bonuses"]
        })

    save("armors", {
        "version": "2.0.0",
        "source": "MHDB Wilds API",
        "partNames": {"head": "頭", "chest": "胴", "arms": "腕", "waist": "腰", "legs": "脚"},
        "armors": armors,
        "armorSets": armor_sets
    })


def convert_skills():
    raw = load("skills")
    skills = []

    for s in raw:
        ranks = s.get("ranks", [])
        effects = []
        for r in sorted(ranks, key=lambda x: x.get("level", 0)):
            effects.append({
                "level": r.get("level", 1),
                "description": r.get("description", ""),
                "name": r.get("name", "")
            })

        skills.append({
            "id": f"s_{s['id']}",
            "name": s.get("name", ""),
            "maxLevel": len(effects),
            "description": s.get("description", ""),
            "kind": s.get("kind", ""),
            "effects": effects
        })

    save("skills", {
        "version": "2.0.0",
        "source": "MHDB Wilds API",
        "skills": skills
    })


def convert_decorations():
    raw = load("decos")
    decorations = []

    for d in raw:
        skills = []
        for sk in d.get("skills", []):
            skill_info = sk.get("skill", {})
            name = skill_info.get("name", "")
            level = sk.get("level", 1)
            if name:
                skills.append({"name": name, "level": level})

        slot = d.get("slot", 0)
        if isinstance(slot, dict):
            slot = slot.get("rank", 0)

        decorations.append({
            "id": f"d_{d['id']}",
            "name": d.get("name", ""),
            "slotSize": slot,
            "rarity": d.get("rarity", 1),
            "skills": skills
        })

    save("decorations", {
        "version": "2.0.0",
        "source": "MHDB Wilds API",
        "decorations": decorations
    })


def convert_charms():
    raw = load("charms")
    charms = []

    for c in raw:
        ranks = c.get("ranks", [])
        for r in ranks:
            skills = []
            for sk in r.get("skills", []):
                skill_info = sk.get("skill", {})
                name = skill_info.get("name", "")
                level = sk.get("level", 1)
                if name:
                    skills.append({"name": name, "level": level})

            slots = r.get("slots", [])
            if isinstance(slots, list):
                slots = [s.get("rank", s) if isinstance(s, dict) else s for s in slots]

            charm_name = r.get("name", c.get("name", ""))
            charms.append({
                "id": f"c_{c['id']}_{r.get('level', 1)}",
                "name": charm_name,
                "level": r.get("level", 1),
                "rarity": r.get("rarity", 1),
                "skills": skills,
                "slots": slots
            })

    save("charms", {
        "version": "2.0.0",
        "source": "MHDB Wilds API",
        "charms": charms
    })


if __name__ == "__main__":
    print("MHDB Wilds API → mhwilds-simulator JSON 変換")
    print(f"Source: {SRC}")
    print(f"Dest: {DST}")
    print()
    convert_weapons()
    convert_armors()
    convert_skills()
    convert_decorations()
    convert_charms()
    print("\n完了!")
