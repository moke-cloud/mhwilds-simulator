/**
 * MHWilds Data Loader v3
 * APIデータ対応 — 武器/防具/装飾品/スキル/護石/セットスキル/モンスター/モーション値
 */
const DataLoader = (() => {
  let weapons = [];
  let armors = [];
  let decorations = [];
  let skillDefs = [];
  let charms = [];
  let armorSets = [];
  let weaponTypes = [];
  let partNames = {};
  let monsters = [];
  let motionValues = {};

  async function loadAll() {
    const v = 'v=15';
    const [wData, aData, dData, sData, cData, mData, mvData] = await Promise.all([
      fetch('data/weapons.json?' + v).then(r => r.json()),
      fetch('data/armors.json?' + v).then(r => r.json()),
      fetch('data/decorations.json?' + v).then(r => r.json()),
      fetch('data/skills.json?' + v).then(r => r.json()),
      fetch('data/charms.json?' + v).then(r => r.json()),
      fetch('data/monsters.json?' + v).then(r => r.json()),
      fetch('data/motion_values.json?' + v).then(r => r.json())
    ]);
    await MHCalc.loadModifiers();

    weapons = wData.weapons || [];
    weaponTypes = wData.weaponTypes || [];
    armors = aData.armors || [];
    armorSets = aData.armorSets || [];
    partNames = aData.partNames || {};
    decorations = dData.decorations || [];
    skillDefs = sData.skills || [];
    charms = cData.charms || [];
    monsters = mData.monsters || [];
    motionValues = mvData || {};
  }

  function getWeapons() { return weapons; }
  function getWeaponTypes() { return weaponTypes; }
  function getArmors() { return armors; }
  function getArmorSets() { return armorSets; }
  function getDecorations() { return decorations; }
  function getSkillDefs() { return skillDefs; }
  function getCharms() { return charms; }
  function getPartNames() { return partNames; }
  function getMonsters() { return monsters; }
  function getMotionValues() { return motionValues; }

  function getAttacksForWeaponType(weaponType) {
    const mvData = motionValues[weaponType];
    return mvData ? mvData.attacks : [];
  }

  function getDamageTypeForWeaponType(weaponType) {
    const mvData = motionValues[weaponType];
    return mvData ? mvData.damageType : 'slash';
  }

  function filterWeapons(type) {
    if (!type) return weapons;
    return weapons.filter(w => w.weaponType === type);
  }

  function filterArmors(part) {
    if (!part) return armors;
    return armors.filter(a => a.part === part);
  }

  function filterDecorations(maxSlotSize) {
    if (!maxSlotSize) return decorations;
    return decorations.filter(d => d.slotSize <= maxSlotSize);
  }

  function findSkillDef(name) {
    return skillDefs.find(s => s.name === name);
  }

  function findArmorSet(setId) {
    return armorSets.find(s => s.id === setId);
  }

  function searchWeapons(query, type) {
    let result = type ? filterWeapons(type) : weapons;
    if (!query) return result;
    const q = query.toLowerCase();
    return result.filter(w => w.name.toLowerCase().includes(q));
  }

  function searchArmors(query, part) {
    let result = part ? filterArmors(part) : armors;
    if (!query) return result;
    const q = query.toLowerCase();
    return result.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.setName && a.setName.toLowerCase().includes(q)) ||
      a.skills.some(s => s.name.toLowerCase().includes(q))
    );
  }

  return {
    loadAll, getWeapons, getWeaponTypes, getArmors, getArmorSets,
    getDecorations, getSkillDefs, getCharms, getPartNames,
    getMonsters, getMotionValues, getAttacksForWeaponType, getDamageTypeForWeaponType,
    filterWeapons, filterArmors, filterDecorations,
    findSkillDef, findArmorSet, searchWeapons, searchArmors
  };
})();
