/**
 * MHWilds Damage Calculator v3
 * skill_modifiers.json ベースの計算エンジン
 * 属性期待値・条件付き倍率対応
 */
const MHCalc = (() => {
  const SHARPNESS_COLORS = ['赤', '橙', '黄', '緑', '青', '白', '紫'];
  const SHARPNESS_PHYS = [0.50, 0.75, 1.00, 1.05, 1.20, 1.32, 1.39];
  const SHARPNESS_ELEM = [0.25, 0.50, 0.75, 1.00, 1.0625, 1.15, 1.25];
  const DEFAULT_CRIT_MULT = 1.25;
  const NEGATIVE_CRIT_MULT = 0.75;

  let modifiers = {}; // skill_modifiers.json の modifiers オブジェクト

  /** skill_modifiers.json を読み込む */
  async function loadModifiers() {
    const res = await fetch('data/skill_modifiers.json?v=15');
    const data = await res.json();
    modifiers = data.modifiers || {};
  }

  function getModifiers() { return modifiers; }

  /** スキル名+レベルからmodifierを取得 */
  function getSkillMod(skillName, level) {
    const def = modifiers[skillName];
    if (!def || !def.levels) return null;
    return def.levels.find(l => l.level === level) || def.levels[def.levels.length - 1] || null;
  }

  /** スキルが条件付きかどうか */
  function isConditional(skillName) {
    return modifiers[skillName]?.conditional || false;
  }

  function getConditionLabel(skillName) {
    return modifiers[skillName]?.condition_label || skillName;
  }

  /** スキルポイント集計 */
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

  function clampSkillLevels(totals, skillDefs) {
    const defMap = {};
    for (const def of skillDefs) defMap[def.name] = def.maxLevel;
    const clamped = {};
    for (const [name, level] of Object.entries(totals)) {
      clamped[name] = Math.min(level, defMap[name] || 7);
    }
    return clamped;
  }

  /** 最終攻撃力 */
  function calcFinalAttack(weaponAttack, skillLevels, conditions = {}) {
    let flat = 0;
    let mult = 1.0;

    for (const [name, level] of Object.entries(skillLevels)) {
      const mod = getSkillMod(name, level);
      if (!mod) continue;
      if (mod.attack_flat) flat += mod.attack_flat;
      if (mod.attack_mult) mult *= mod.attack_mult;
      // 条件付き
      if (conditions[name]) {
        if (mod.attack_flat_cond) flat += mod.attack_flat_cond;
        if (mod.attack_mult_cond) mult *= mod.attack_mult_cond;
      }
    }

    return Math.floor((weaponAttack + flat) * mult);
  }

  /** 最終会心率 */
  function calcAffinity(baseAffinity, skillLevels, conditions = {}) {
    let total = baseAffinity;
    for (const [name, level] of Object.entries(skillLevels)) {
      const mod = getSkillMod(name, level);
      if (!mod) continue;
      if (mod.affinity) total += mod.affinity;
      if (mod.affinity_cond && conditions[name]) total += mod.affinity_cond;
    }
    return Math.max(-100, Math.min(100, total));
  }

  /** 会心倍率 */
  function getCritMultiplier(skillLevels) {
    const lv = skillLevels['超会心'];
    if (!lv) return DEFAULT_CRIT_MULT;
    const mod = getSkillMod('超会心', lv);
    return mod?.crit_mult || DEFAULT_CRIT_MULT;
  }

  /** 期待値 */
  function calcExpectedValue(attack, affinity, critMult) {
    const rate = affinity / 100;
    if (rate >= 0) return attack * (1 + rate * (critMult - 1));
    return attack * (1 + Math.abs(rate) * (NEGATIVE_CRIT_MULT - 1));
  }

  /** レンジ */
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

  /** 斬れ味 */
  function calcSharpness(sharpnessGauge, sharpnessMax, handicraftLevel = 0) {
    if (!sharpnessGauge) {
      return { colorIndex: -1, colorName: '-', physical: 1.0, elemental: 1.0 };
    }

    let gauge = [...sharpnessGauge];

    // 匠スキルでsharpnessMaxに近づける
    if (handicraftLevel > 0 && sharpnessMax) {
      const mod = getSkillMod('匠', handicraftLevel);
      if (mod && mod.sharpness_add) {
        let remaining = mod.sharpness_add;
        for (let i = 0; i < gauge.length && remaining > 0; i++) {
          const maxVal = sharpnessMax[i] || 0;
          const add = Math.min(remaining, maxVal - gauge[i]);
          if (add > 0) {
            gauge[i] += add;
            remaining -= add;
          }
        }
      }
    }

    let topColor = 0;
    for (let i = gauge.length - 1; i >= 0; i--) {
      if (gauge[i] > 0) { topColor = i; break; }
    }

    return {
      colorIndex: topColor,
      colorName: SHARPNESS_COLORS[topColor],
      physical: SHARPNESS_PHYS[topColor],
      elemental: SHARPNESS_ELEM[topColor],
      gauge
    };
  }

  /** 属性値 */
  function calcElement(element, skillLevels, conditions = {}) {
    if (!element || !element.type || !element.value) return null;

    let flat = 0;
    let mult = 1.0;
    const elemSkillName = element.type + '属性攻撃強化';

    for (const [name, level] of Object.entries(skillLevels)) {
      if (name === elemSkillName) {
        const mod = getSkillMod(name, level);
        if (!mod) continue;
        if (mod.element_flat) flat += mod.element_flat;
        if (mod.element_mult) mult = mod.element_mult;
      }
      // 災禍転福の条件付き属性加算
      if (name === '災禍転福' && conditions[name]) {
        const mod = getSkillMod(name, level);
        if (mod && mod.element_flat_cond) flat += mod.element_flat_cond;
      }
    }

    return { type: element.type, value: Math.floor((element.value + flat) * mult) };
  }

  /** 防御力 */
  function calcTotalDefense(armors, skillLevels, useMax = false) {
    let base = 0;
    for (const a of armors) {
      if (!a || !a.defense) continue;
      base += useMax ? (a.defense.max || a.defense.base) : a.defense.base;
    }

    let flat = 0, mult = 1.0;
    const lv = skillLevels['防御'];
    if (lv) {
      const mod = getSkillMod('防御', lv);
      if (mod) {
        flat = mod.defense_flat || 0;
        mult = mod.defense_mult || 1.0;
      }
    }

    return Math.floor((base + flat) * mult);
  }

  /** 耐性 */
  function calcResistance(armors, skillLevels = {}) {
    const res = { fire: 0, water: 0, thunder: 0, ice: 0, dragon: 0 };
    for (const a of armors) {
      if (!a || !a.resistance) continue;
      for (const k of Object.keys(res)) res[k] += a.resistance[k] || 0;
    }
    const lv = skillLevels['防御'];
    if (lv) {
      const mod = getSkillMod('防御', lv);
      if (mod?.all_res) {
        for (const k of Object.keys(res)) res[k] += mod.all_res;
      }
    }
    return res;
  }

  /** 全計算 */
  function calcAll(params) {
    const {
      weapon, armors = [], decorations = [], charm = null,
      skillDefs = [], conditions = {}, useMaxDefense = false
    } = params;

    const sources = [...armors];
    if (charm) sources.push(charm);
    const rawSkills = aggregateSkills(sources, decorations);
    const skillLevels = clampSkillLevels(rawSkills, skillDefs);

    const weaponAttack = weapon?.attack || 0;
    const baseAffinity = weapon?.affinity || 0;

    const finalAttack = calcFinalAttack(weaponAttack, skillLevels, conditions);
    const finalAffinity = calcAffinity(baseAffinity, skillLevels, conditions);
    const critMult = getCritMultiplier(skillLevels);
    const range = calcAttackRange(finalAttack, finalAffinity, critMult);

    const handicraftLv = skillLevels['匠'] || 0;
    const sharpness = weapon
      ? calcSharpness(weapon.sharpness, weapon.sharpnessMax, handicraftLv)
      : { colorIndex: -1, colorName: '-', physical: 1.0, elemental: 1.0 };

    const element = weapon ? calcElement(weapon.element, skillLevels, conditions) : null;
    const totalDefense = calcTotalDefense(armors, skillLevels, useMaxDefense);
    const resistance = calcResistance(armors, skillLevels);

    const effectiveRange = {
      min: Math.floor(range.min * sharpness.physical),
      expected: Math.round(range.expected * sharpness.physical * 10) / 10,
      max: Math.floor(range.max * sharpness.physical)
    };

    // 属性期待値（斬れ味属性補正込み）
    const elementEffective = element
      ? { type: element.type, value: Math.floor(element.value * sharpness.elemental) }
      : null;

    return {
      weaponAttack, baseAffinity,
      finalAttack, finalAffinity, critMultiplier: critMult,
      range, effectiveRange, sharpness, element, elementEffective,
      totalDefense, resistance, skillLevels, rawSkills
    };
  }

  /**
   * 1ヒット実ダメージ計算
   * @param {Object} params
   * @param {number} params.attack - 最終攻撃力
   * @param {number} params.affinity - 最終会心率
   * @param {number} params.critMult - 会心倍率
   * @param {Object} params.sharpness - 斬れ味 {physical, elemental}
   * @param {Object|null} params.element - 属性 {type, value}
   * @param {Object} params.attack_data - モーション値 {mv, eleMul?, rawType?, rawMul?, ignoreSharpness?, ignoreHzv?}
   * @param {Object} params.hitzone - 肉質 {slash, blunt, pierce, fire, water, thunder, ice, dragon}
   * @param {string} params.weaponDamageType - 武器のダメージタイプ (slash/blunt/pierce)
   */
  function calcHitDamage(params) {
    const { attack, affinity, critMult, sharpness, element, attack_data, hitzone, weaponDamageType } = params;
    const mv = attack_data.mv / 100;
    const rawMul = attack_data.rawMul || 1.0;

    // 物理ダメージタイプ判定（攻撃ごとのrawTypeオーバーライド）
    let dmgType = weaponDamageType || 'slash';
    if (attack_data.rawType) {
      const rt = attack_data.rawType.toLowerCase();
      if (rt === 'blunt') dmgType = 'blunt';
      else if (rt === 'shot') dmgType = 'pierce';
    }

    // 肉質値
    const hzvPhys = attack_data.ignoreHzv ? 100 : (hitzone[dmgType] || 0);
    const sharpPhys = attack_data.ignoreSharpness ? 1.0 : sharpness.physical;

    // 物理ダメージ = 攻撃力 × MV × 斬れ味(物理) × 肉質(物理)/100 × rawMul
    const physBase = attack * mv * sharpPhys * (hzvPhys / 100) * rawMul;

    // 会心期待値
    const rate = affinity / 100;
    let physExpected, physCrit, physNormal;
    if (rate >= 0) {
      physNormal = physBase;
      physCrit = physBase * critMult;
      physExpected = physBase * (1 + rate * (critMult - 1));
    } else {
      physNormal = physBase;
      physCrit = physBase * NEGATIVE_CRIT_MULT;
      physExpected = physBase * (1 + Math.abs(rate) * (NEGATIVE_CRIT_MULT - 1));
    }

    // 属性ダメージ
    let elemNormal = 0, elemExpected = 0;
    if (element && element.value > 0) {
      const elemType = element.type;
      const elemKey = { '火': 'fire', '水': 'water', '雷': 'thunder', '氷': 'ice', '龍': 'dragon' }[elemType] || '';
      const hzvElem = hitzone[elemKey] || 0;
      const eleMul = attack_data.eleMul ?? 1.0;
      const sharpElem = attack_data.ignoreSharpness ? 1.0 : sharpness.elemental;

      elemNormal = element.value * sharpElem * (hzvElem / 100) * eleMul;
      elemExpected = elemNormal; // 属性には会心が基本乗らない
    }

    return {
      physical: {
        normal: Math.floor(physNormal),
        expected: Math.round(physExpected * 10) / 10,
        crit: Math.floor(physCrit || physNormal)
      },
      elemental: Math.floor(elemNormal),
      total: {
        normal: Math.floor(physNormal) + Math.floor(elemNormal),
        expected: Math.round((physExpected + elemExpected) * 10) / 10,
        crit: Math.floor(physCrit || physNormal) + Math.floor(elemNormal)
      }
    };
  }

  return {
    loadModifiers, getModifiers, getSkillMod, isConditional, getConditionLabel,
    aggregateSkills, clampSkillLevels,
    calcFinalAttack, calcAffinity, getCritMultiplier,
    calcExpectedValue, calcAttackRange, calcSharpness,
    calcElement, calcTotalDefense, calcResistance, calcAll,
    calcHitDamage,
    SHARPNESS_COLORS, SHARPNESS_PHYS, SHARPNESS_ELEM,
    DEFAULT_CRIT_MULT, NEGATIVE_CRIT_MULT
  };
})();

if (typeof module !== 'undefined') module.exports = MHCalc;
