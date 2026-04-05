/**
 * MHWilds Damage Calculator
 * 攻撃力・会心率・期待値・属性・防御力の計算エンジン
 */
const MHCalc = (() => {
  // 斬れ味補正テーブル (index: 0=赤, 1=橙, 2=黄, 3=緑, 4=青, 5=白, 6=紫)
  const SHARPNESS_COLORS = ['赤', '橙', '黄', '緑', '青', '白', '紫'];
  const SHARPNESS_PHYS = [0.50, 0.75, 1.00, 1.05, 1.20, 1.32, 1.39];
  const SHARPNESS_ELEM = [0.25, 0.50, 0.75, 1.00, 1.0625, 1.15, 1.25];

  // デフォルト会心倍率
  const DEFAULT_CRIT_MULT = 1.25;
  const NEGATIVE_CRIT_MULT = 0.75;

  /**
   * スキルポイントを集計する
   * @param {Array} sources - [{skills: [{name, level}]}] 防具・護石等の配列
   * @param {Array} decorations - [{skills: [{name, level}]}] 装飾品の配列
   * @returns {Object} {スキル名: 合計レベル}
   */
  function aggregateSkills(sources, decorations = []) {
    const totals = {};

    for (const src of [...sources, ...decorations]) {
      if (!src || !src.skills) continue;
      for (const s of src.skills) {
        totals[s.name] = (totals[s.name] || 0) + s.level;
      }
    }

    return totals;
  }

  /**
   * スキルレベルを最大値でクランプする
   * @param {Object} totals - {スキル名: 合計レベル}
   * @param {Array} skillDefs - skills.jsonのskills配列
   * @returns {Object} {スキル名: クランプ後レベル}
   */
  function clampSkillLevels(totals, skillDefs) {
    const defMap = {};
    for (const def of skillDefs) {
      defMap[def.name] = def.maxLevel;
    }

    const clamped = {};
    for (const [name, level] of Object.entries(totals)) {
      const max = defMap[name] || 7;
      clamped[name] = Math.min(level, max);
    }
    return clamped;
  }

  /**
   * スキル定義から特定レベルの効果を取得
   */
  function getSkillEffect(skillDef, level) {
    if (!skillDef || !skillDef.effects || level <= 0) return null;
    const idx = Math.min(level, skillDef.effects.length) - 1;
    return skillDef.effects[idx];
  }

  /**
   * 最終攻撃力を計算
   * @param {number} weaponAttack - 武器の表示攻撃力
   * @param {Object} skillLevels - {スキル名: レベル}
   * @param {Array} skillDefs - skills.jsonのskills配列
   * @param {Object} conditions - {condition名: boolean} 条件付きスキルのON/OFF
   * @returns {number} 最終攻撃力
   */
  function calcFinalAttack(weaponAttack, skillLevels, skillDefs, conditions = {}) {
    let flatBonus = 0;
    let multiplier = 1.0;

    for (const def of skillDefs) {
      const level = skillLevels[def.name];
      if (!level) continue;

      const eff = getSkillEffect(def, level);
      if (!eff) continue;

      // 無条件の攻撃力加算
      if (eff.attack_flat) flatBonus += eff.attack_flat;
      if (eff.attack_mult && eff.attack_mult !== 1.0) multiplier *= eff.attack_mult;

      // 条件付き攻撃力加算
      if (eff.attack_flat_conditional && conditions[def.condition]) {
        flatBonus += eff.attack_flat_conditional;
      }
    }

    return Math.floor((weaponAttack + flatBonus) * multiplier);
  }

  /**
   * 最終会心率を計算
   * @param {number} baseAffinity - 武器の基礎会心率(%)
   * @param {Object} skillLevels - {スキル名: レベル}
   * @param {Array} skillDefs - skills.jsonのskills配列
   * @param {Object} conditions - 条件付きスキルのON/OFF
   * @returns {number} 最終会心率(%), -100~100にクランプ
   */
  function calcAffinity(baseAffinity, skillLevels, skillDefs, conditions = {}) {
    let total = baseAffinity;

    for (const def of skillDefs) {
      const level = skillLevels[def.name];
      if (!level) continue;

      const eff = getSkillEffect(def, level);
      if (!eff) continue;

      if (eff.affinity) total += eff.affinity;
      if (eff.affinity_conditional && conditions[def.condition]) {
        total += eff.affinity_conditional;
      }
    }

    return Math.max(-100, Math.min(100, total));
  }

  /**
   * 会心倍率を取得（超会心スキル考慮）
   * @param {Object} skillLevels - {スキル名: レベル}
   * @param {Array} skillDefs - skills.jsonのskills配列
   * @returns {number} 会心倍率
   */
  function getCritMultiplier(skillLevels, skillDefs) {
    for (const def of skillDefs) {
      if (def.id !== 'critical_boost') continue;
      const level = skillLevels[def.name];
      if (!level) return DEFAULT_CRIT_MULT;
      const eff = getSkillEffect(def, level);
      return eff && eff.crit_multiplier ? eff.crit_multiplier : DEFAULT_CRIT_MULT;
    }
    return DEFAULT_CRIT_MULT;
  }

  /**
   * 会心期待値を計算
   * @param {number} attack - 最終攻撃力
   * @param {number} affinity - 最終会心率(%)
   * @param {number} critMult - 会心倍率
   * @returns {number} 期待値攻撃力
   */
  function calcExpectedValue(attack, affinity, critMult) {
    const rate = affinity / 100;
    if (rate >= 0) {
      return attack * (1 + rate * (critMult - 1));
    }
    // マイナス会心
    return attack * (1 + Math.abs(rate) * (NEGATIVE_CRIT_MULT - 1));
  }

  /**
   * 攻撃期待値のレンジを計算
   * @returns {{min, expected, max}} 最小・期待値・最大
   */
  function calcAttackRange(attack, affinity, critMult) {
    const expected = calcExpectedValue(attack, affinity, critMult);
    const min = affinity < 0 ? attack * NEGATIVE_CRIT_MULT : attack;
    const max = affinity > 0 ? attack * critMult : attack;

    return {
      min: Math.floor(min),
      expected: Math.round(expected * 10) / 10,
      max: Math.floor(max)
    };
  }

  /**
   * 斬れ味の現在色を判定
   * @param {Array} sharpnessGauge - [赤, 橙, 黄, 緑, 青, 白, 紫] の各ゲージ量
   * @param {number} handicraftAdd - 匠による追加量
   * @returns {{colorIndex, colorName, physical, elemental}}
   */
  function calcSharpness(sharpnessGauge, handicraftAdd = 0) {
    if (!sharpnessGauge || sharpnessGauge.length === 0) {
      return { colorIndex: 3, colorName: '緑', physical: 1.05, elemental: 1.00 };
    }

    // 匠なしゲージを使って最高斬れ味色を特定
    // sharpnessGauge[i]が0より大きい最後のインデックスが最高色
    let topColor = 0;
    for (let i = sharpnessGauge.length - 1; i >= 0; i--) {
      if (sharpnessGauge[i] > 0) {
        topColor = i;
        break;
      }
    }

    // 匠ありの場合はsharpnessMaxを使うべきだが、
    // 簡易版として匠による追加で1段階上がるかチェック
    if (handicraftAdd > 0 && topColor < SHARPNESS_COLORS.length - 1) {
      // 次の色のゲージが存在するかチェック（sharpnessMaxがある場合）
      topColor = Math.min(topColor + 1, SHARPNESS_COLORS.length - 1);
    }

    return {
      colorIndex: topColor,
      colorName: SHARPNESS_COLORS[topColor],
      physical: SHARPNESS_PHYS[topColor],
      elemental: SHARPNESS_ELEM[topColor]
    };
  }

  /**
   * 属性値を計算
   * @param {Object|null} element - {type: "火", value: 240} or null
   * @param {Object} skillLevels
   * @param {Array} skillDefs
   * @returns {Object|null} {type, value} or null
   */
  function calcElement(element, skillLevels, skillDefs) {
    if (!element || !element.type || !element.value) return null;

    const elementTypeMap = {
      '火': 'fire', '水': 'water', '雷': 'thunder', '氷': 'ice', '龍': 'dragon'
    };
    const elemKey = elementTypeMap[element.type];

    let flatBonus = 0;
    let multiplier = 1.0;

    for (const def of skillDefs) {
      if (def.category !== 'element') continue;
      if (def.elementType !== elemKey) continue;

      const level = skillLevels[def.name];
      if (!level) continue;

      const eff = getSkillEffect(def, level);
      if (!eff) continue;

      if (eff.element_flat) flatBonus += eff.element_flat;
      if (eff.element_mult && eff.element_mult !== 1.0) multiplier = eff.element_mult;
    }

    return {
      type: element.type,
      value: Math.floor((element.value + flatBonus) * multiplier)
    };
  }

  /**
   * 防御力合計を計算
   * @param {Array} armors - 防具配列 [{defense: {base, max}}]
   * @param {Object} skillLevels
   * @param {Array} skillDefs
   * @param {boolean} useMax - 最大強化時の防御力を使うか
   * @returns {number}
   */
  function calcTotalDefense(armors, skillLevels, skillDefs, useMax = false) {
    let base = 0;
    for (const armor of armors) {
      if (!armor || !armor.defense) continue;
      base += useMax ? (armor.defense.max || armor.defense.base) : armor.defense.base;
    }

    let flatBonus = 0;
    let multiplier = 1.0;

    for (const def of skillDefs) {
      if (def.id !== 'defense_boost') continue;
      const level = skillLevels[def.name];
      if (!level) continue;

      const eff = getSkillEffect(def, level);
      if (!eff) continue;

      if (eff.defense_flat) flatBonus += eff.defense_flat;
      if (eff.defense_mult && eff.defense_mult !== 1.0) multiplier = eff.defense_mult;
    }

    return Math.floor((base + flatBonus) * multiplier);
  }

  /**
   * 耐性値を計算
   * @param {Array} armors - 防具配列
   * @param {Object} skillLevels
   * @param {Array} skillDefs
   * @returns {{fire, water, thunder, ice, dragon}}
   */
  function calcResistance(armors, skillLevels = {}, skillDefs = []) {
    const res = { fire: 0, water: 0, thunder: 0, ice: 0, dragon: 0 };

    for (const armor of armors) {
      if (!armor || !armor.resistance) continue;
      res.fire += armor.resistance.fire || 0;
      res.water += armor.resistance.water || 0;
      res.thunder += armor.resistance.thunder || 0;
      res.ice += armor.resistance.ice || 0;
      res.dragon += armor.resistance.dragon || 0;
    }

    // 防御スキルの全耐性ボーナス
    for (const def of skillDefs) {
      if (def.id !== 'defense_boost') continue;
      const level = skillLevels[def.name];
      if (!level) continue;
      const eff = getSkillEffect(def, level);
      if (eff && eff.all_res) {
        res.fire += eff.all_res;
        res.water += eff.all_res;
        res.thunder += eff.all_res;
        res.ice += eff.all_res;
        res.dragon += eff.all_res;
      }
    }

    return res;
  }

  /**
   * 全ステータスを一括計算
   */
  function calcAll(params) {
    const {
      weapon, armors = [], decorations = [], charm = null,
      skillDefs = [], conditions = {}, useMaxDefense = false
    } = params;

    // スキル集計
    const sources = [...armors];
    if (charm) sources.push(charm);
    const rawSkills = aggregateSkills(sources, decorations);
    const skillLevels = clampSkillLevels(rawSkills, skillDefs);

    // 攻撃力
    const weaponAttack = weapon ? weapon.attack : 0;
    const finalAttack = calcFinalAttack(weaponAttack, skillLevels, skillDefs, conditions);

    // 会心率
    const baseAffinity = weapon ? (weapon.affinity || 0) : 0;
    const finalAffinity = calcAffinity(baseAffinity, skillLevels, skillDefs, conditions);

    // 会心倍率
    const critMult = getCritMultiplier(skillLevels, skillDefs);

    // 期待値レンジ
    const range = calcAttackRange(finalAttack, finalAffinity, critMult);

    // 斬れ味
    const handicraftLevel = skillLevels['匠'] || 0;
    let handicraftAdd = 0;
    if (handicraftLevel > 0) {
      const hDef = skillDefs.find(d => d.id === 'handicraft');
      if (hDef) {
        const hEff = getSkillEffect(hDef, handicraftLevel);
        if (hEff) handicraftAdd = hEff.sharpness_add || 0;
      }
    }
    const sharpness = weapon
      ? calcSharpness(weapon.sharpness, handicraftAdd)
      : { colorIndex: 3, colorName: '緑', physical: 1.05, elemental: 1.00 };

    // 属性値
    const element = weapon ? calcElement(weapon.element, skillLevels, skillDefs) : null;

    // 防御力
    const totalDefense = calcTotalDefense(armors, skillLevels, skillDefs, useMaxDefense);

    // 耐性
    const resistance = calcResistance(armors, skillLevels, skillDefs);

    // 斬れ味込みの実効攻撃力レンジ
    const effectiveRange = {
      min: Math.floor(range.min * sharpness.physical),
      expected: Math.round(range.expected * sharpness.physical * 10) / 10,
      max: Math.floor(range.max * sharpness.physical)
    };

    return {
      finalAttack,
      finalAffinity,
      critMultiplier: critMult,
      range,
      effectiveRange,
      sharpness,
      element,
      totalDefense,
      resistance,
      skillLevels,
      rawSkills
    };
  }

  // Public API
  return {
    aggregateSkills,
    clampSkillLevels,
    calcFinalAttack,
    calcAffinity,
    getCritMultiplier,
    calcExpectedValue,
    calcAttackRange,
    calcSharpness,
    calcElement,
    calcTotalDefense,
    calcResistance,
    calcAll,
    SHARPNESS_COLORS,
    SHARPNESS_PHYS,
    SHARPNESS_ELEM,
    DEFAULT_CRIT_MULT,
    NEGATIVE_CRIT_MULT
  };
})();

if (typeof module !== 'undefined') module.exports = MHCalc;
