"""
monsters.json の未翻訳部位名を日本語化し、重複IDを一意にする
"""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

DATA_PATH = "../data/monsters.json"

# 明示的な部位名翻訳辞書
PART_NAME_MAP: dict[str, str] = {
    # ゾ・シア等: -wear/-hide サフィックス
    "head-wear": "頭(甲殻)",
    "head-hide": "頭(傷つけ)",
    "left-wing-arm-wear": "左翼腕(甲殻)",
    "left-wing-arm-hide": "左翼腕(傷つけ)",
    "right-wing-arm-wear": "右翼腕(甲殻)",
    "right-wing-arm-hide": "右翼腕(傷つけ)",
    # ゴア・マガラ / ゴグマジオス
    "left-wing-legs": "左翼脚",
    "right-wing-legs": "右翼脚",
    "antennae": "触角",
    # 護竜アルシュベルド / アルシュベルド
    "left-wing-blade": "左翼刃",
    "right-wing-blade": "右翼刃",
    # ラバラ・バリナ / タマミツネ / ネルスキュラ
    "left-nail": "左爪",
    "right-nail": "右爪",
    "petal": "花弁",
    "poisonous-thorn": "毒棘",
    "mantle": "外套",
    # チャタカブラ
    "ass": "臀部",
    "tongue": "舌",
    # タマミツネ
    "dorsal-fin": "背ビレ",
    # 護竜アンジャナフ亜種
    "nose": "鼻",
    # シーウー / ヌ・エグドラ
    "left-front-arm": "左前腕",
    "right-front-arm": "右前腕",
    "left-hind-arm": "左後腕",
    "right-hind-arm": "右後腕",
    "left-side-arm": "左側腕",
    "right-side-arm": "右側腕",
    "umbrella": "傘",
    "mouth": "口",
    "tentacle": "触手",
    # ウズ・トゥナ: waterfilm
    "waterfilm-tail": "水膜(尻尾)",
    "waterfilm-left-body": "水膜(左胴)",
    "waterfilm-left-front-leg": "水膜(左前脚)",
    "waterfilm-left-head": "水膜(左頭)",
    "waterfilm-left-tail": "水膜(左尻尾)",
    "waterfilm-right-body": "水膜(右胴)",
    "waterfilm-right-front-leg": "水膜(右前脚)",
    "waterfilm-right-head": "水膜(右頭)",
    "waterfilm-right-tail": "水膜(右尻尾)",
    # ジン・ダハド
    "frozen-bigcore-after": "凍結大核(破壊後)",
    "frozen-bigcore-before": "凍結大核(破壊前)",
    "frozen-core-waist": "凍結核(腰)",
    # オメガ・プラネテス
    "periscope": "潜望鏡",
}


def fix_monster(monster: dict) -> dict:
    """1体分のモンスターの部位名を修正"""
    hide_count = 0
    seen_ids: dict[str, int] = {}

    for part in monster["parts"]:
        part_id = part["id"]
        part_name = part["name"]

        # 辞書にある場合はそのまま翻訳
        if part_name in PART_NAME_MAP:
            part["name"] = PART_NAME_MAP[part_name]
        elif part_id == "hide" and part_name == "hide":
            # 汎用 hide → 傷つけ①②...
            hide_count += 1
            part["name"] = f"傷つけ{_circled(hide_count)}"

        # 重複IDの修正（一意にする）
        if part_id in seen_ids:
            seen_ids[part_id] += 1
            part["id"] = f"{part_id}-{seen_ids[part_id]}"
        else:
            seen_ids[part_id] = 1

    return monster


def _circled(n: int) -> str:
    """1→①, 2→② ..."""
    circles = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮"
    if 1 <= n <= len(circles):
        return circles[n - 1]
    return str(n)


def main():
    import os
    script_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(script_dir, DATA_PATH)

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    for m in data["monsters"]:
        fix_monster(m)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # Report
    print("=== 部位名修正完了 ===")
    for m in data["monsters"]:
        issues = [p for p in m["parts"] if all(ord(c) < 128 for c in p["name"])]
        if issues:
            print(f"  {m['name']}: 未翻訳残り {len(issues)} 件")
            for p in issues:
                print(f"    {p['id']} → {p['name']}")
    print("完了!")


if __name__ == "__main__":
    main()
