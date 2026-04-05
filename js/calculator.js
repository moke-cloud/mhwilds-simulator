/**
 * MHWilds Damage Calculator v2
 * skill_modifiers.json ベースの計算エンジン
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
    const res = await fetch('data/skill_modifiers.json?v=7');
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
      if (mod.attack_flat_cond && conditions[name]) flat += mod.attack_flat_cond;
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
  function calcElement(element, skillLevels) {
    if (!element || !element.type || !element.value) return null;

    let flat = 0;
    let mult = 1.0;
    const elemSkillName = element.type + '属性攻撃強化';

    for (const [name, level] of Object.entries(skillLevels)) {
      if (name !== elemSkillName) continue;
      const mod = getSkillMod(name, level);
      if (!mod) continue;
      if (mod.element_flat) flat += mod.element_flat;
      if (mod.element_mult) mult = mod.element_mult;
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

    const element = weapon ? calcElement(weapon.element, skillLevels) : null;
    const totalDefense = calcTotalDefense(armors, skillLevels, useMaxDefense);
    const resistance = calcResistance(armors, skillLevels);

    const effectiveRange = {
      min: Math.floor(range.min * sharpness.physical),
      expected: Math.round(range.expected * sharpness.physical * 10) / 10,
      max: Math.floor(range.max * sharpness.physical)
    };

    return {
      weaponAttack, baseAffinity,
      finalAttack, finalAffinity, critMultiplier: critMult,
      range, effectiveRange, sharpness, element,
      totalDefense, resistance, skillLevels, rawSkills
    };
  }

  return {
    loadModifiers, getModifiers, getSkillMod, isConditional, getConditionLabel,
    aggregateSkills, clampSkillLevels,
    calcFinalAttack, calcAffinity, getCritMultiplier,
    calcExpectedValue, calcAttackRange, calcSharpness,
    calcElement, calcTotalDefense, calcResistance, calcAll,
    SHARPNESS_COLORS, SHARPNESS_PHYS, SHARPNESS_ELEM,
    DEFAULT_CRIT_MULT, NEGATIVE_CRIT_MULT
  };
})();

if (typeof module !== 'undefined') module.exports = MHCalc;
