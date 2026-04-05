/**
 * MHWilds Simulator - Main Application v2
 * 護石3スキル、セットスキル、護石プリセット対応
 */
const App = (() => {
  const state = {
    selectedWeapon: null,
    selectedArmors: { head: null, chest: null, arms: null, waist: null, legs: null },
    // 装飾品: {owner: "weapon"|"head"|"chest"|..., slotIndex: 0-2, decoration: {...}}
    equippedDecos: [],
    charm: null,
    activeWeaponType: null,
    activeArmorPart: 'head',
    conditions: {},
    // 装飾品モーダル用
    decoModalTarget: null // {owner, slotIndex, slotSize, kind}
  };

  const $ = id => document.getElementById(id);

  async function init() {
    try {
      await DataLoader.loadAll();
      const w = DataLoader.getWeapons().length;
      const a = DataLoader.getArmors().length;
      const d = DataLoader.getDecorations().length;
      $('loadStatus').textContent = `${w}武器 / ${a}防具 / ${d}装飾品`;

      renderWeaponTabs();
      renderArmorList();
      renderDecoSlots();
      populateCharmSelects();
      populateCharmPresets();
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
    let weapons = DataLoader.searchWeapons(query, state.activeWeaponType);

    list.innerHTML = '';
    for (const w of weapons) {
      const div = document.createElement('div');
      div.className = 'item' + (state.selectedWeapon?.id === w.id ? ' selected' : '');

      const slotsHtml = renderSlotsText(w.slots);
      div.innerHTML = `
        <div class="item-name">
          ${w.name}
          <span class="sub">R${w.rarity} ${slotsHtml ? '| ' + slotsHtml : ''}</span>
        </div>
        <div class="item-stats">
          <span class="atk">${w.attack}</span>
          ${w.affinity ? `<span class="aff"> ${w.affinity > 0 ? '+' : ''}${w.affinity}%</span>` : ''}
          ${w.element ? `<br><span class="text-${elemClass(w.element.type)}">${w.element.type}${w.element.value}</span>` : ''}
        </div>`;
      div.onclick = () => { state.selectedWeapon = w; clearDecos('weapon'); $('selectedWeaponName').textContent = w.name; renderWeaponList(); renderDecoSlots(); recalculate(); };
      list.appendChild(div);
    }
    if (weapons.length === 0) {
      list.innerHTML = '<div style="padding:16px;color:var(--text-muted);text-align:center">該当する武器がありません</div>';
    }
  }

  // === Armor ===
  function renderArmorList() {
    const list = $('armorList');
    const part = state.activeArmorPart;
    const query = ($('armorSearch').value || '').toLowerCase();
    let armors = DataLoader.searchArmors(query, part);

    // Sort by rarity descending
    armors.sort((a, b) => b.rarity - a.rarity);

    list.innerHTML = '';
    const selected = state.selectedArmors[part];

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
          <span class="sub">${a.setName || ''} | R${a.rarity}</span>
          <div class="skill-badges">
            ${a.skills.map(s => `<span class="skill-badge">${s.name} Lv${s.level}</span>`).join('')}
          </div>
        </div>
        <div class="item-stats">
          <span>防${a.defense.base}</span>
          <br><span style="font-size:0.65rem">${renderSlotsText(a.slots)}</span>
        </div>`;
      div.onclick = () => { state.selectedArmors[part] = a; clearDecos(part); renderArmorList(); renderDecoSlots(); recalculate(); };
      list.appendChild(div);
    }
  }

  // === Decoration Slots (装飾品スロット) ===
  function clearDecos(owner) {
    state.equippedDecos = state.equippedDecos.filter(d => d.owner !== owner);
  }

  function getEquippedDeco(owner, slotIndex) {
    return state.equippedDecos.find(d => d.owner === owner && d.slotIndex === slotIndex);
  }

  function setDeco(owner, slotIndex, decoration) {
    state.equippedDecos = state.equippedDecos.filter(d => !(d.owner === owner && d.slotIndex === slotIndex));
    if (decoration) {
      state.equippedDecos.push({ owner, slotIndex, decoration });
    }
    renderDecoSlots();
    recalculate();
  }

  function renderDecoSlots() {
    // Weapon slots
    const wContainer = $('weaponSlotContainer');
    const wSection = $('weaponDecoSlots');
    if (state.selectedWeapon && state.selectedWeapon.slots && state.selectedWeapon.slots.length > 0) {
      wSection.style.display = '';
      wContainer.innerHTML = '';
      state.selectedWeapon.slots.forEach((size, i) => {
        if (size > 0) wContainer.appendChild(createDecoSlotBtn('weapon', i, size, 'weapon'));
      });
    } else {
      wSection.style.display = 'none';
    }

    // Armor slots
    const aContainer = $('armorSlotContainer');
    const aSection = $('armorDecoSlots');
    const parts = ['head', 'chest', 'arms', 'waist', 'legs'];
    const partLabels = { head: '頭', chest: '胴', arms: '腕', waist: '腰', legs: '脚' };
    let hasSlots = false;
    aContainer.innerHTML = '';

    for (const part of parts) {
      const armor = state.selectedArmors[part];
      if (!armor || !armor.slots || armor.slots.length === 0) continue;
      const filledSlots = armor.slots.filter(s => s > 0);
      if (filledSlots.length === 0) continue;

      hasSlots = true;
      const row = document.createElement('div');
      row.className = 'deco-slot-row';
      row.innerHTML = `<span class="equip-label">${partLabels[part]}: ${armor.name}</span>`;
      armor.slots.forEach((size, i) => {
        if (size > 0) row.appendChild(createDecoSlotBtn(part, i, size, 'armor'));
      });
      aContainer.appendChild(row);
    }
    aSection.style.display = hasSlots ? '' : 'none';
  }

  function createDecoSlotBtn(owner, slotIndex, slotSize, kind) {
    const equipped = getEquippedDeco(owner, slotIndex);
    const btn = document.createElement('button');
    btn.className = 'deco-slot-btn' + (equipped ? ' filled' : '');
    if (equipped) {
      btn.innerHTML = `<span class="size-dot"></span>${equipped.decoration.name}`;
      // Add remove button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'deco-remove';
      removeBtn.textContent = '✕';
      removeBtn.onclick = (e) => { e.stopPropagation(); setDeco(owner, slotIndex, null); };
      btn.appendChild(removeBtn);
    } else {
      btn.innerHTML = `<span class="size-dot"></span>[${slotSize}] 空き`;
    }
    btn.onclick = () => openDecoModal(owner, slotIndex, slotSize, kind);
    return btn;
  }

  function openDecoModal(owner, slotIndex, slotSize, kind) {
    state.decoModalTarget = { owner, slotIndex, slotSize, kind };
    const decos = DataLoader.getDecorations().filter(d => d.slotSize <= slotSize && d.kind === kind);
    const list = $('decoList');
    list.innerHTML = '';

    // 「なし」オプション
    const none = document.createElement('div');
    none.className = 'item';
    none.innerHTML = '<div class="item-name" style="color:var(--text-muted)">装飾品を外す</div>';
    none.onclick = () => { setDeco(owner, slotIndex, null); $('decoModal').classList.remove('open'); };
    list.appendChild(none);

    for (const d of decos) {
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `
        <div class="item-name">
          ${d.name}
          <div class="skill-badges">${d.skills.map(s => `<span class="skill-badge">${s.name} Lv${s.level}</span>`).join('')}</div>
        </div>
        <div class="item-stats"><span>[${d.slotSize}]</span></div>`;
      div.onclick = () => { setDeco(owner, slotIndex, d); $('decoModal').classList.remove('open'); };
      list.appendChild(div);
    }

    $('decoModal').classList.add('open');
  }

  // === Charm (護石) ===
  function populateCharmSelects() {
    const skills = DataLoader.getSkillDefs();
    for (const selId of ['charmSkill1', 'charmSkill2', 'charmSkill3']) {
      const sel = $(selId);
      sel.innerHTML = '<option value="">なし</option>';
      for (const s of skills) {
        sel.innerHTML += `<option value="${s.name}">${s.name}</option>`;
      }
    }
  }

  function populateCharmPresets() {
    const sel = $('charmPreset');
    sel.innerHTML = '<option value="">プリセットから選択...</option>';
    const charms = DataLoader.getCharms();
    for (const c of charms) {
      const skillText = c.skills.map(s => `${s.name}Lv${s.level}`).join(' / ');
      const slotText = c.slots && c.slots.length > 0 ? ` [${c.slots.join('-')}]` : '';
      sel.innerHTML += `<option value="${c.id}">${c.name} (${skillText}${slotText})</option>`;
    }
  }

  function applyCharmPreset(charmId) {
    const charm = DataLoader.getCharms().find(c => c.id === charmId);
    if (!charm) return;

    // Fill in skill selects
    const skillSelects = ['charmSkill1', 'charmSkill2', 'charmSkill3'];
    const lvSelects = ['charmSkill1Lv', 'charmSkill2Lv', 'charmSkill3Lv'];

    for (let i = 0; i < 3; i++) {
      if (charm.skills[i]) {
        $(skillSelects[i]).value = charm.skills[i].name;
        updateCharmLevelOptions(skillSelects[i], lvSelects[i]);
        $(lvSelects[i]).value = charm.skills[i].level;
      } else {
        $(skillSelects[i]).value = '';
        $(lvSelects[i]).innerHTML = '<option value="0">-</option>';
      }
    }

    // Fill in slots
    const slotSelects = ['charmSlot1', 'charmSlot2', 'charmSlot3'];
    for (let i = 0; i < 3; i++) {
      $(slotSelects[i]).value = charm.slots && charm.slots[i] ? charm.slots[i] : '0';
    }

    readCharm();
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
    const skills = [];
    for (const [sId, lId] of [['charmSkill1','charmSkill1Lv'], ['charmSkill2','charmSkill2Lv'], ['charmSkill3','charmSkill3Lv']]) {
      const name = $(sId).value;
      const lv = parseInt($(lId).value) || 0;
      if (name && lv > 0) skills.push({ name, level: lv });
    }

    const slots = [
      parseInt($('charmSlot1').value) || 0,
      parseInt($('charmSlot2').value) || 0,
      parseInt($('charmSlot3').value) || 0
    ];

    state.charm = (skills.length > 0 || slots.some(s => s > 0))
      ? { skills, slots }
      : null;
    recalculate();
  }

  // === Set Skills (シリーズスキル) ===
  function calcSetSkills(armors) {
    // Count pieces per set
    const setCounts = {};
    for (const a of armors) {
      if (!a || !a.setId) continue;
      setCounts[a.setId] = (setCounts[a.setId] || 0) + 1;
    }

    const activeSetSkills = [];
    for (const [setId, count] of Object.entries(setCounts)) {
      const setDef = DataLoader.findArmorSet(parseInt(setId));
      if (!setDef || !setDef.bonuses) continue;

      for (const bonus of setDef.bonuses) {
        activeSetSkills.push({
          setName: setDef.name,
          skill: bonus.skill,
          description: bonus.description,
          required: bonus.pieces,
          current: count,
          active: count >= bonus.pieces
        });
      }
    }
    return activeSetSkills;
  }

  function renderSetSkills(setSkills) {
    const list = $('setSkillList');
    if (setSkills.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;padding:8px">-</p>';
      return;
    }

    list.innerHTML = '';
    for (const ss of setSkills) {
      const row = document.createElement('div');
      row.className = 'skill-row';
      row.style.opacity = ss.active ? '1' : '0.4';
      row.innerHTML = `
        <span class="skill-name">${ss.setName}</span>
        <span class="skill-level" style="color:${ss.active ? 'var(--green)' : 'var(--text-muted)'}">${ss.current}/${ss.required}</span>
        <span style="font-size:0.7rem;color:var(--text-secondary);flex:2">${ss.skill || ''}</span>`;
      list.appendChild(row);
    }
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

    // Stats
    $('statAttack').textContent = result.finalAttack || '-';
    const affText = result.finalAffinity !== undefined ? `${result.finalAffinity > 0 ? '+' : ''}${result.finalAffinity}%` : '0%';
    $('statAffinity').textContent = affText;
    $('statAffinity').className = 'stat-value' + (result.finalAffinity > 0 ? ' positive' : result.finalAffinity < 0 ? ' negative' : '');
    $('statDefense').textContent = result.totalDefense || '-';

    if (result.element) {
      $('statElement').innerHTML = `<span class="text-${elemClass(result.element.type)}">${result.element.type} ${result.element.value}</span>`;
    } else {
      $('statElement').textContent = '-';
    }

    renderSharpness(state.selectedWeapon);

    const r = result.effectiveRange;
    $('rangeMin').textContent = r.min || '-';
    $('rangeExpected').textContent = r.expected || '-';
    $('rangeMax').textContent = r.max || '-';
    if (r.max > 0) {
      $('rangeFill').style.width = Math.min(100, (r.expected / r.max) * 100) + '%';
    }

    setRes('resFire', result.resistance.fire);
    setRes('resWater', result.resistance.water);
    setRes('resThunder', result.resistance.thunder);
    setRes('resIce', result.resistance.ice);
    setRes('resDragon', result.resistance.dragon);

    renderConditionToggles(result.skillLevels);
    renderSkillList(result.skillLevels);
    renderSetSkills(calcSetSkills(armors));

    // Mobile
    $('mAtk').textContent = result.finalAttack || '-';
    $('mAff').textContent = affText;
    $('mExp').textContent = r.expected || '-';
    $('mDef').textContent = result.totalDefense || '-';
  }

  function renderSharpness(weapon) {
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
      if (!def.conditional && !def.effects?.some(e => e.name)) continue;
      if (!skillLevels[def.name]) continue;

      // Check if skill has conditional effects in its description
      const desc = def.effects?.map(e => e.description).join(' ') || '';
      const isConditional = /怒り|体力|弱点|肉質|部位/.test(desc) || def.conditional;
      if (!isConditional) continue;

      const condKey = def.condition || def.name;
      const label = document.createElement('label');
      label.className = 'cond-toggle';
      const checked = state.conditions[condKey] ? 'checked' : '';
      label.innerHTML = `<input type="checkbox" ${checked}><span>${condKey}（${def.name} Lv${skillLevels[def.name]}）</span>`;
      label.querySelector('input').onchange = (e) => {
        state.conditions[condKey] = e.target.checked;
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
    if (!slots || !Array.isArray(slots)) return '';
    const filled = slots.filter(s => s > 0);
    if (filled.length === 0) return '-';
    return filled.map(s => `[${s}]`).join('');
  }

  // === Events ===
  function bindEvents() {
    $('weaponSearch').addEventListener('input', debounce(renderWeaponList, 200));
    $('armorSearch').addEventListener('input', debounce(renderArmorList, 200));

    for (const btn of $('armorPartTabs').querySelectorAll('.tab')) {
      btn.addEventListener('click', () => {
        state.activeArmorPart = btn.dataset.part;
        $('armorPartTabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        $('armorSearch').value = '';
        renderArmorList();
      });
    }

    $('clearArmorsBtn').addEventListener('click', () => {
      state.selectedArmors = { head: null, chest: null, arms: null, waist: null, legs: null };
      state.equippedDecos = state.equippedDecos.filter(d => d.owner === 'weapon');
      renderArmorList();
      renderDecoSlots();
      recalculate();
    });

    // Charm skill selects
    for (const [sId, lId] of [['charmSkill1','charmSkill1Lv'], ['charmSkill2','charmSkill2Lv'], ['charmSkill3','charmSkill3Lv']]) {
      $(sId).addEventListener('change', () => { updateCharmLevelOptions(sId, lId); readCharm(); });
      $(lId).addEventListener('change', readCharm);
    }
    $('charmSlot1').addEventListener('change', readCharm);
    $('charmSlot2').addEventListener('change', readCharm);
    $('charmSlot3').addEventListener('change', readCharm);

    // Charm preset
    $('charmPreset').addEventListener('change', (e) => {
      if (e.target.value) applyCharmPreset(e.target.value);
    });

    // Deco modal
    $('decoModalClose').addEventListener('click', () => $('decoModal').classList.remove('open'));
    $('decoModal').addEventListener('click', (e) => {
      if (e.target === $('decoModal')) $('decoModal').classList.remove('open');
    });
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  document.addEventListener('DOMContentLoaded', init);
  return { state, recalculate };
})();
