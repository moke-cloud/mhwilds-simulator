/**
 * MHWilds Data Loader
 * JSONデータの非同期読み込みと検索
 */
const DataLoader = (() => {
  let weapons = [];
  let armors = [];
  let decorations = [];
  let skillDefs = [];
  let weaponTypes = [];
  let armorParts = {};

  async function loadAll() {
    const [wData, aData, dData, sData] = await Promise.all([
      fetch('data/weapons.json').then(r => r.json()),
      fetch('data/armors.json').then(r => r.json()),
      fetch('data/decorations.json').then(r => r.json()),
      fetch('data/skills.json').then(r => r.json())
    ]);

    weapons = wData.weapons || [];
    weaponTypes = wData.weaponTypes || [];
    armors = aData.armors || [];
    armorParts = aData.partNames || {};
    decorations = dData.decorations || [];
    skillDefs = sData.skills || [];
  }

  function getWeapons() { return weapons; }
  function getWeaponTypes() { return weaponTypes; }
  function getArmors() { return armors; }
  function getDecorations() { return decorations; }
  function getSkillDefs() { return skillDefs; }
  function getPartNames() { return armorParts; }

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

  function searchArmors(query) {
    if (!query) return armors;
    const q = query.toLowerCase();
    return armors.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.setName.toLowerCase().includes(q) ||
      a.skills.some(s => s.name.toLowerCase().includes(q))
    );
  }

  return {
    loadAll, getWeapons, getWeaponTypes, getArmors, getDecorations,
    getSkillDefs, getPartNames, filterWeapons, filterArmors,
    filterDecorations, findSkillDef, searchArmors
  };
})();
