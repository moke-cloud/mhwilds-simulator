/**
 * MHWilds Simulator - Main Application
 */
const App = (() => {
  // State
  const state = {
    selectedWeapon: null,
    selectedArmors: { head: null, chest: null, arms: null, waist: null, legs: null },
    equippedDecos: [], // [{slotOwner, slotIndex, decoration}]
    charm: null,
    activeWeaponType: null,
    activeArmorPart: 'head',
    conditions: {}
  };

  // DOM cache
  const $ = id => document.getElementById(id);

  // === Init ===
  async function init() {
    try {
      await DataLoader.loadAll();
      $('loadStatus').textContent = `${DataLoader.getWeapons().length}武器 / ${DataLoader.getArmors().length}防具`;

      renderWeaponTabs();
      renderArmorList();
      populateCharmSelects();
      bindEvents();
      recalculate();
    } catch (e) {
      $('loadStatus').textContent = 'データ読み込みエラー';
      console.error(e);
    }
  }

  // === Weapon ===
  function renderWeaponTabs() {
    const tabs = $('weaponTypeTabs');
    tabs.innerHTML = '';
    for (const type of DataLoader.getWeaponTypes()) {
      const btn = document.createElement('button');
      btn.className = 'tab' + (state.activeWeaponType === type ? ' active' : '');
      btn.textContent = type;
      btn.onclick = () => { state.activeWeaponType = type; renderWeaponTabs(); renderWeaponList(); };
      tabs.appendChild(btn);
    }
    renderWeaponList();
  }

  function renderWeaponList() {
    const list = $('weaponList');
    const query = ($('weaponSearch').value || '').toLowerCase();
    let weapons = state.activeWeaponType
      ? DataLoader.filterWeapons(state.activeWeaponType)
      : DataLoader.getWeapons();

    if (query) weapons = weapons.filter(w => w.name.toLowerCase().includes(query));

    list.innerHTML = '';
    for (const w of weapons) {
      const div = document.createElement('div');
      div.className = 'item' + (state.selectedWeapon?.id === w.id ? ' selected' : '');
      div.innerHTML = `
        <div class="item-name">
          ${w.name}
          <span class="sub">${w.weaponType} | R${w.rarity}</span>
        </div>
        <div class="item-stats">
          <span class="atk">${w.attack}</span>
          ${w.affinity ? `<span class="aff"> ${w.affinity > 0 ? '+' : ''}${w.affinity}%</span>` : ''}
          ${w.element ? `<br><span class="text-${elemClass(w.element.type)}">${w.element.type}${w.element.value}</span>` : ''}
        </div>`;
      div.onclick = () => selectWeapon(w);
      list.appendChild(div);
    }
  }

  function selectWeapon(w) {
    state.selectedWeapon = w;
    $('selectedWeaponName').textContent = w.name;
    renderWeaponList();
    recalculate();
  }

  // === Armor ===
  function renderArmorList() {
    const list = $('armorList');
    const part = state.activeArmorPart;
    const query = ($('armorSearch').value || '').toLowerCase();

    let armors = DataLoader.filterArmors(part);
    if (query) {
      armors = armors.filter(a =>
        a.name.toLowerCase().includes(query) ||
        a.setName.toLowerCase().includes(query) ||
        a.skills.some(s => s.name.toLowerCase().includes(query))
      );
    }

    list.innerHTML = '';
    const selected = state.selectedArmors[part];

    // 「なし」オプション
    const none = document.createElement('div');
    none.className = 'item' + (!selected ? ' selected' : '');
    none.innerHTML = `<div class="item-name" style="color:var(--text-muted)">装備なし</div>`;
    none.onclick = () => { state.selectedArmors[part] = null; renderArmorList(); recalculate(); };
    list.appendChild(none);

    for (const a of armors) {
      const div = document.createElement('div');
      div.className = 'item' + (selected?.id === a.id ? ' selected' : '');
      div.innerHTML = `
        <div class="item-name">
          ${a.name}
          <span class="sub">${a.setName}</span>
          <div class="skill-badges">
            ${a.skills.map(s => `<span class="skill-badge">${s.name} Lv${s.level}</span>`).join('')}
          </div>
        </div>
        <div class="item-stats">
          <span>防${a.defense.base}</span>
          <br><span class="slots-text">${renderSlotsText(a.slots)}</span>
        </div>`;
      div.onclick = () => { state.selectedArmors[part] = a; renderArmorList(); recalculate(); };
      list.appendChild(div);
    }
  }

  // === Charm ===
  function populateCharmSelects() {
    const skills = DataLoader.getSkillDefs();
    for (const sel of [$('charmSkill1'), $('charmSkill2')]) {
      sel.innerHTML = '<option value="">なし</option>';
      for (const s of skills) {
        sel.innerHTML += `<option value="${s.name}">${s.name}</option>`;
      }
    }
  }

  function updateCharmLevelOptions(skillSelectId, lvSelectId) {
    const skillName = $(skillSelectId).value;
    const lvSel = $(lvSelectId);
    lvSel.innerHTML = '<option value="0">-</option>';
    if (!skillName) return;
    const def = DataLoader.findSkillDef(skillName);
    if (!def) return;
    for (let i = 1; i <= def.maxLevel; i++) {
      lvSel.innerHTML += `<option value="${i}">Lv${i}</option>`;
    }
  }

  function readCharm() {
    const s1 = $('charmSkill1').value;
    const l1 = parseInt($('charmSkill1Lv').value) || 0;
    const s2 = $('charmSkill2').value;
    const l2 = parseInt($('charmSkill2Lv').value) || 0;
    const slots = [
      parseInt($('charmSlot1').value) || 0,
      parseInt($('charmSlot2').value) || 0,
      parseInt($('charmSlot3').value) || 0
    ];

    const skills = [];
    if (s1 && l1 > 0) skills.push({ name: s1, level: l1 });
    if (s2 && l2 > 0) skills.push({ name: s2, level: l2 });

    if (skills.length === 0 && slots.every(s => s === 0)) {
      state.charm = null;
    } else {
      state.charm = { skills, slots };
    }
    recalculate();
  }

  // === Recalculate ===
  function recalculate() {
    const armors = Object.values(state.selectedArmors).filter(Boolean);
    const result = MHCalc.calcAll({
      weapon: state.selectedWeapon,
      armors,
      decorations: state.equippedDecos.map(d => d.decoration).filter(Boolean),
      charm: state.charm,
      skillDefs: DataLoader.getSkillDefs(),
      conditions: state.conditions,
      useMaxDefense: false
    });

    // 攻撃力・会心率
    $('statAttack').textContent = result.finalAttack || '-';
    const affText = result.finalAffinity !== 0 ? `${result.finalAffinity > 0 ? '+' : ''}${result.finalAffinity}%` : '0%';
    $('statAffinity').textContent = affText;
    $('statAffinity').className = 'stat-value' + (result.finalAffinity > 0 ? ' positive' : result.finalAffinity < 0 ? ' negative' : '');

    // 防御力
    $('statDefense').textContent = result.totalDefense || '-';

    // 属性
    if (result.element) {
      $('statElement').innerHTML = `<span class="text-${elemClass(result.element.type)}">${result.element.type} ${result.element.value}</span>`;
    } else {
      $('statElement').textContent = '-';
    }

    // 斬れ味ゲージ
    renderSharpness(result.sharpness, state.selectedWeapon);

    // 期待値レンジ
    const r = result.effectiveRange;
    $('rangeMin').textContent = r.min || '-';
    $('rangeExpected').textContent = r.expected || '-';
    $('rangeMax').textContent = r.max || '-';
    if (r.max > 0) {
      const pct = Math.min(100, (r.expected / r.max) * 100);
      $('rangeFill').style.width = pct + '%';
    }

    // 耐性
    const res = result.resistance;
    setRes('resFire', res.fire);
    setRes('resWater', res.water);
    setRes('resThunder', res.thunder);
    setRes('resIce', res.ice);
    setRes('resDragon', res.dragon);

    // 条件付きスキルトグル
    renderConditionToggles(result.skillLevels);

    // スキル一覧
    renderSkillList(result.skillLevels);

    // モバイルステータス
    $('mAtk').textContent = result.finalAttack || '-';
    $('mAff').textContent = affText;
    $('mExp').textContent = r.expected || '-';
    $('mDef').textContent = result.totalDefense || '-';
  }

  function renderSharpness(sharp, weapon) {
    const gauge = $('sharpnessGauge');
    if (!weapon || !weapon.sharpness) {
      gauge.innerHTML = '<div style="width:100%;background:var(--text-muted);height:100%;border-radius:4px;opacity:0.3"></div>';
      return;
    }
    const colors = ['var(--sharp-red)', 'var(--sharp-orange)', 'var(--sharp-yellow)', 'var(--sharp-green)', 'var(--sharp-blue)', 'var(--sharp-white)', 'var(--sharp-purple)'];
    const total = weapon.sharpness.reduce((a, b) => a + b, 0) || 1;
    gauge.innerHTML = weapon.sharpness.map((v, i) =>
      v > 0 ? `<div class="seg" style="width:${(v/total)*100}%;background:${colors[i]}"></div>` : ''
    ).join('');
  }

  function renderConditionToggles(skillLevels) {
    const container = $('condToggles');
    container.innerHTML = '';
    for (const def of DataLoader.getSkillDefs()) {
      if (!def.conditional || !skillLevels[def.name]) continue;
      const label = document.createElement('label');
      label.className = 'cond-toggle';
      const checked = state.conditions[def.condition] ? 'checked' : '';
      label.innerHTML = `<input type="checkbox" ${checked}><span>${def.condition}</span>`;
      label.querySelector('input').onchange = (e) => {
        state.conditions[def.condition] = e.target.checked;
        recalculate();
      };
      container.appendChild(label);
    }
  }

  function renderSkillList(skillLevels) {
    const list = $('skillList');
    const entries = Object.entries(skillLevels).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;padding:8px">スキルなし</p>';
      return;
    }

    list.innerHTML = '';
    for (const [name, level] of entries) {
      const def = DataLoader.findSkillDef(name);
      const maxLv = def ? def.maxLevel : 7;
      const pct = Math.min(100, (level / maxLv) * 100);
      const maxed = level >= maxLv;

      const row = document.createElement('div');
      row.className = 'skill-row';
      row.innerHTML = `
        <span class="skill-name">${name}</span>
        <span class="skill-level">Lv${level}/${maxLv}</span>
        <div class="skill-bar"><div class="fill${maxed ? ' maxed' : ''}" style="width:${pct}%"></div></div>`;
      list.appendChild(row);
    }
  }

  // === Helpers ===
  function setRes(id, val) {
    const el = $(id);
    el.textContent = val > 0 ? `+${val}` : val;
    el.parentElement.className = 'res-item' + (val > 0 ? ' positive' : val < 0 ? ' negative' : '');
  }

  function elemClass(type) {
    return { '火': 'fire', '水': 'water', '雷': 'thunder', '氷': 'ice', '龍': 'dragon' }[type] || '';
  }

  function renderSlotsText(slots) {
    if (!slots) return '';
    return slots.filter(s => s > 0).map(s => `[${'●'.repeat(s)}]`).join('') || '-';
  }

  // === Event Binding ===
  function bindEvents() {
    // Weapon search
    $('weaponSearch').addEventListener('input', debounce(renderWeaponList, 200));

    // Armor part tabs
    for (const btn of $('armorPartTabs').querySelectorAll('.tab')) {
      btn.addEventListener('click', () => {
        state.activeArmorPart = btn.dataset.part;
        $('armorPartTabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        $('armorSearch').value = '';
        renderArmorList();
      });
    }

    // Armor search
    $('armorSearch').addEventListener('input', debounce(renderArmorList, 200));

    // Clear armors
    $('clearArmorsBtn').addEventListener('click', () => {
      state.selectedArmors = { head: null, chest: null, arms: null, waist: null, legs: null };
      state.equippedDecos = [];
      renderArmorList();
      recalculate();
    });

    // Charm
    $('charmSkill1').addEventListener('change', () => { updateCharmLevelOptions('charmSkill1', 'charmSkill1Lv'); readCharm(); });
    $('charmSkill2').addEventListener('change', () => { updateCharmLevelOptions('charmSkill2', 'charmSkill2Lv'); readCharm(); });
    $('charmSkill1Lv').addEventListener('change', readCharm);
    $('charmSkill2Lv').addEventListener('change', readCharm);
    $('charmSlot1').addEventListener('change', readCharm);
    $('charmSlot2').addEventListener('change', readCharm);
    $('charmSlot3').addEventListener('change', readCharm);

    // Deco modal close
    $('decoModalClose').addEventListener('click', () => $('decoModal').classList.remove('open'));
    $('decoModal').addEventListener('click', (e) => {
      if (e.target === $('decoModal')) $('decoModal').classList.remove('open');
    });
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // === Start ===
  document.addEventListener('DOMContentLoaded', init);

  return { state, recalculate };
})();
