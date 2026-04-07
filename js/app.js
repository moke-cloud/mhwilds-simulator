/**
 * MHWilds Simulator - Main Application v3
 * αβγまたぎセットスキル、グループスキル、属性期待値対応
 */
const App = (() => {
  const state = {
    selectedWeapon: null,
    selectedArmors: { head: null, chest: null, arms: null, waist: null, legs: null },
    equippedDecos: [],
    charm: null,
    activeWeaponType: null,
    activeArmorPart: 'head',
    conditions: {},
    setSkillConditions: {}, // シリーズスキルON/OFF
    groupSkillConditions: {}, // グループスキルON/OFF
    limitBreak: false, // 限界突破
    gogmaSeriesSkill: '', // 巨戟アーティア武器シリーズスキル
    gogmaGroupSkill: '', // 巨戟アーティア武器グループスキル
    sharpnessOverride: null,
    decoModalTarget: null
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
      initDamageCalc();
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
      div.onclick = () => { state.selectedWeapon = w; clearDecos('weapon'); $('selectedWeaponName').textContent = w.name; renderWeaponList(); renderDecoSlots(); renderArtianPanel(); recalculate(); };
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
          <span>防${a.defense[state.limitBreak ? 'max' : 'base']}</span>
          <br><span style="font-size:0.65rem">${renderSlotsText(a.slots)}</span>
        </div>`;
      div.onclick = () => { state.selectedArmors[part] = a; clearDecos(part); renderArmorList(); renderDecoSlots(); recalculate(); };
      list.appendChild(div);
    }
  }

  // === Decoration Slots ===
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

    // Charm slots
    renderCharmDecoSlots();
  }

  function createDecoSlotBtn(owner, slotIndex, slotSize, kind) {
    const equipped = getEquippedDeco(owner, slotIndex);
    const btn = document.createElement('button');
    btn.className = 'deco-slot-btn' + (equipped ? ' filled' : '');
    if (equipped) {
      btn.innerHTML = `<span class="size-dot"></span>${equipped.decoration.name}`;
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

  let decoSortMode = 'name';

  function openDecoModal(owner, slotIndex, slotSize, kind) {
    state.decoModalTarget = { owner, slotIndex, slotSize, kind };
    $('decoSearch').value = '';
    renderDecoModalList();
    $('decoModal').classList.add('open');
    $('decoSearch').focus();
  }

  function renderDecoModalList() {
    const t = state.decoModalTarget;
    if (!t) return;
    const { owner, slotIndex, slotSize, kind } = t;
    const query = ($('decoSearch').value || '').toLowerCase();

    let decos = DataLoader.getDecorations().filter(d => {
      if (d.slotSize > slotSize) return false;
      if (kind === 'both') return true;
      return d.kind === kind;
    });
    if (query) {
      decos = decos.filter(d =>
        d.name.toLowerCase().includes(query) ||
        d.skills.some(s => s.name.toLowerCase().includes(query))
      );
    }

    if (decoSortMode === 'slot') {
      decos.sort((a, b) => b.slotSize - a.slotSize || a.name.localeCompare(b.name, 'ja'));
    } else if (decoSortMode === 'skill') {
      decos.sort((a, b) => (a.skills[0]?.name || '').localeCompare(b.skills[0]?.name || '', 'ja'));
    } else {
      decos.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    }

    const list = $('decoList');
    list.innerHTML = '';

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

    document.querySelectorAll('[data-deco-sort]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.decoSort === decoSortMode);
    });
  }

  // === Charm ===
  const charmSkillPairs = [
    { search: 'charmSearch1', select: 'charmSkill1', lv: 'charmSkill1Lv' },
    { search: 'charmSearch2', select: 'charmSkill2', lv: 'charmSkill2Lv' },
    { search: 'charmSearch3', select: 'charmSkill3', lv: 'charmSkill3Lv' },
  ];

  function getDecoSkillNames() {
    const names = new Set();
    for (const d of DataLoader.getDecorations()) {
      for (const s of d.skills) names.add(s.name);
    }
    return names;
  }

  function populateCharmSelects() {
    const decoSkills = getDecoSkillNames();
    const skills = DataLoader.getSkillDefs()
      .filter(s => decoSkills.has(s.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    for (const pair of charmSkillPairs) {
      const sel = $(pair.select);
      sel.innerHTML = '<option value="">なし</option>';
      for (const s of skills) {
        sel.innerHTML += `<option value="${s.name}">${s.name}</option>`;
      }
      sel.size = 8;

      const searchInput = $(pair.search);
      searchInput.addEventListener('focus', () => {
        filterCharmSkillOptions(pair, searchInput.value);
        sel.classList.add('open');
      });
      searchInput.addEventListener('input', () => {
        filterCharmSkillOptions(pair, searchInput.value);
        sel.classList.add('open');
      });
      searchInput.addEventListener('blur', () => {
        setTimeout(() => sel.classList.remove('open'), 200);
      });

      sel.addEventListener('change', () => {
        searchInput.value = sel.value;
        sel.classList.remove('open');
        updateCharmLevelOptions(pair.select, pair.lv);
        readCharm();
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInput.value = '';
          sel.value = '';
          sel.classList.remove('open');
          updateCharmLevelOptions(pair.select, pair.lv);
          readCharm();
        }
      });
    }
  }

  function filterCharmSkillOptions(pair, query) {
    const sel = $(pair.select);
    const q = (query || '').toLowerCase();
    const decoSkills = getDecoSkillNames();
    const skills = DataLoader.getSkillDefs().filter(s => decoSkills.has(s.name));

    sel.innerHTML = '<option value="">なし</option>';
    for (const s of skills) {
      if (q && !s.name.toLowerCase().includes(q)) continue;
      sel.innerHTML += `<option value="${s.name}">${s.name}</option>`;
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

    const skillSelects = ['charmSkill1', 'charmSkill2', 'charmSkill3'];
    const lvSelects = ['charmSkill1Lv', 'charmSkill2Lv', 'charmSkill3Lv'];
    const searchInputs = ['charmSearch1', 'charmSearch2', 'charmSearch3'];
    for (let i = 0; i < 3; i++) {
      if (charm.skills[i]) {
        $(skillSelects[i]).value = charm.skills[i].name;
        $(searchInputs[i]).value = charm.skills[i].name;
        updateCharmLevelOptions(skillSelects[i], lvSelects[i]);
        $(lvSelects[i]).value = charm.skills[i].level;
      } else {
        $(skillSelects[i]).value = '';
        $(searchInputs[i]).value = '';
        $(lvSelects[i]).innerHTML = '<option value="0">-</option>';
      }
    }

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
    renderCharmDecoSlots();
    recalculate();
  }

  function renderCharmDecoSlots() {
    const container = $('charmSlotContainer');
    const section = $('charmDecoSlots');
    if (!state.charm || !state.charm.slots || state.charm.slots.every(s => s === 0)) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    container.innerHTML = '';

    // 護石装飾品の要約も表示
    const decoNames = [];
    state.charm.slots.forEach((size, i) => {
      if (size > 0) {
        container.appendChild(createDecoSlotBtn('charm', i, size, 'both'));
        const eq = getEquippedDeco('charm', i);
        if (eq) decoNames.push(eq.decoration.name);
      }
    });

    // 装着済み装飾品サマリー
    const summary = $('charmDecoSummary');
    if (summary) {
      if (decoNames.length > 0) {
        summary.textContent = decoNames.join(', ');
        summary.style.display = '';
      } else {
        summary.style.display = 'none';
      }
    }
  }

  // === Set Skills (シリーズスキル) - αβγまたぎ対応 ===
  function stripVariant(name) {
    return name.replace(/[αβγ]$/, '');
  }

  function calcSetSkills(armors) {
    // αβγを除いた基底名でカウント
    const baseCounts = {};
    for (const a of armors) {
      if (!a || !a.setName) continue;
      const base = stripVariant(a.setName);
      baseCounts[base] = (baseCounts[base] || 0) + 1;
    }

    // 各基底名に対応するarmorSetのボーナスを収集（重複排除）
    const activeSetSkills = [];
    const allSets = DataLoader.getArmorSets();
    const processedBonuses = new Set();

    for (const [baseName, count] of Object.entries(baseCounts)) {
      // この基底名に属する全armorSetを検索
      const matchingSets = allSets.filter(s => stripVariant(s.name) === baseName);
      if (matchingSets.length === 0) continue;

      // ユニークなボーナスを収集
      const seenSkills = new Set();
      for (const setDef of matchingSets) {
        if (!setDef.bonuses) continue;
        for (const bonus of setDef.bonuses) {
          if (seenSkills.has(bonus.skill)) continue;
          seenSkills.add(bonus.skill);
          const key = `${baseName}_${bonus.skill}`;
          if (processedBonuses.has(key)) continue;
          processedBonuses.add(key);

          activeSetSkills.push({
            setName: baseName,
            skill: bonus.skill,
            description: bonus.description,
            required: bonus.pieces,
            current: count,
            active: count >= bonus.pieces
          });
        }
      }
    }
    // 巨戟アーティア武器スキル（シリーズ）
    if (state.gogmaSeriesSkill && isGogmaArtian(state.selectedWeapon)) {
      const skill = state.gogmaSeriesSkill;
      // 既存のセットスキルと重複しない場合のみ追加
      if (!activeSetSkills.find(s => s.skill === skill)) {
        const allSets = DataLoader.getArmorSets();
        for (const setDef of allSets) {
          if (!setDef.bonuses) continue;
          const bonus = setDef.bonuses.find(b => b.skill === skill);
          if (bonus) {
            activeSetSkills.push({
              setName: '巨戟武器',
              skill: bonus.skill,
              description: bonus.description,
              required: 0,
              current: 1,
              active: true,
              fromWeapon: true
            });
            break;
          }
        }
      }
    }

    return activeSetSkills;
  }

  // === Group Skills (グループスキル) - αβγまたぎ対応 ===
  function calcGroupSkills(armors) {
    const baseCounts = {};
    for (const a of armors) {
      if (!a || !a.setName) continue;
      const base = stripVariant(a.setName);
      baseCounts[base] = (baseCounts[base] || 0) + 1;
    }

    const activeGroupSkills = [];
    const allSets = DataLoader.getArmorSets();
    const processed = new Set();

    for (const [baseName, count] of Object.entries(baseCounts)) {
      const matchingSets = allSets.filter(s => stripVariant(s.name) === baseName);
      for (const setDef of matchingSets) {
        if (!setDef.groupBonus) continue;
        const gb = setDef.groupBonus;
        const key = `${baseName}_${gb.skill}`;
        if (processed.has(key)) continue;
        processed.add(key);

        activeGroupSkills.push({
          setName: baseName,
          skill: gb.skill,
          effectName: gb.effectName,
          description: gb.description,
          required: gb.pieces,
          current: count,
          active: count >= gb.pieces
        });
      }
    }
    // 巨戟アーティア武器スキル（グループ）
    if (state.gogmaGroupSkill && isGogmaArtian(state.selectedWeapon)) {
      const skill = state.gogmaGroupSkill;
      if (!activeGroupSkills.find(s => s.skill === skill)) {
        const allSets = DataLoader.getArmorSets();
        for (const setDef of allSets) {
          if (!setDef.groupBonus) continue;
          const gb = setDef.groupBonus;
          if (gb.skill === skill) {
            activeGroupSkills.push({
              setName: '巨戟武器',
              skill: gb.skill,
              effectName: gb.effectName,
              description: gb.description,
              required: 0,
              current: 1,
              active: true,
              fromWeapon: true
            });
            break;
          }
        }
      }
    }

    return activeGroupSkills;
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
      row.style.flexWrap = 'wrap';

      const toggleId = `setToggle_${ss.setName}_${ss.skill}`;
      const isOn = state.setSkillConditions[toggleId] !== false; // default ON

      const setLabel = ss.fromWeapon ? `${ss.setName} <span style="font-size:0.6rem;color:var(--accent)">⚔</span>` : ss.setName;
      const countLabel = ss.fromWeapon ? '武器' : `${ss.current}/${ss.required}`;
      row.style.opacity = ss.active && isOn ? '1' : '0.4';

      row.innerHTML = `
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;flex:1;min-width:0">
          ${ss.active ? `<input type="checkbox" ${isOn ? 'checked' : ''} data-set-toggle="${toggleId}" style="accent-color:var(--accent)">` : ''}
          <span class="skill-name" style="flex:1">${setLabel}</span>
        </label>
        <span class="skill-level" style="color:${ss.active ? 'var(--green)' : 'var(--text-muted)'}">${countLabel}</span>
        <span style="font-size:0.7rem;color:var(--text-secondary);flex-basis:100%;padding-left:20px">${ss.skill || ''}</span>
        ${ss.description ? `<span style="font-size:0.65rem;color:var(--text-muted);flex-basis:100%;padding-left:20px">${ss.description}</span>` : ''}`;

      // トグルイベント
      const checkbox = row.querySelector(`[data-set-toggle="${toggleId}"]`);
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          state.setSkillConditions[toggleId] = e.target.checked;
          recalculate();
        });
      }

      list.appendChild(row);
    }
  }

  function renderGroupSkills(groupSkills) {
    const list = $('groupSkillList');
    if (groupSkills.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;padding:8px">-</p>';
      return;
    }

    list.innerHTML = '';
    for (const gs of groupSkills) {
      const row = document.createElement('div');
      row.className = 'skill-row';
      row.style.flexWrap = 'wrap';

      const toggleId = `groupToggle_${gs.setName}_${gs.skill}`;
      const isOn = state.groupSkillConditions[toggleId] !== false; // default ON
      row.style.opacity = gs.active && isOn ? '1' : '0.4';

      row.innerHTML = `
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;flex:1;min-width:0">
          ${gs.active ? `<input type="checkbox" ${isOn ? 'checked' : ''} data-group-toggle="${toggleId}" style="accent-color:var(--accent)">` : ''}
          <span class="skill-name" style="flex:1">${gs.skill}</span>
        </label>
        <span class="skill-level" style="color:${gs.active ? 'var(--green)' : 'var(--text-muted)'}">${gs.current}/${gs.required}</span>
        <span style="font-size:0.7rem;color:var(--text-secondary);flex-basis:100%;padding-left:20px">${gs.effectName || ''}</span>
        ${gs.description ? `<span style="font-size:0.65rem;color:var(--text-muted);flex-basis:100%;padding-left:20px">${gs.description}</span>` : ''}`;

      const checkbox = row.querySelector(`[data-group-toggle="${toggleId}"]`);
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          state.groupSkillConditions[toggleId] = e.target.checked;
          recalculate();
        });
      }

      list.appendChild(row);
    }
  }

  // === Recalculate ===
  function recalculate() {
    const armors = Object.values(state.selectedArmors).filter(Boolean);

    // アーティアボーナス適用
    let weaponForCalc = state.selectedWeapon;
    const artian = getArtianBonuses();
    if (artian && weaponForCalc) {
      weaponForCalc = { ...weaponForCalc };
      weaponForCalc.attack = Math.floor((weaponForCalc.attack + artian.atkFlat) * artian.atkMult);
      weaponForCalc.affinity = (weaponForCalc.affinity || 0) + artian.affFlat;
      if (artian.elemType && artian.elemAdd > 0) {
        weaponForCalc.element = { type: artian.elemType, value: artian.elemAdd };
      }
      // 激化タイプの斬れ味オーバーライド
      if (artian.sharpOverride && weaponForCalc.sharpness) {
        weaponForCalc.sharpness = [...artian.sharpOverride];
      }
      if (artian.sharpAdd > 0 && weaponForCalc.sharpness) {
        const s = [...weaponForCalc.sharpness];
        s[5] = (s[5] || 0) + artian.sharpAdd;
        weaponForCalc.sharpness = s;
      }
    }

    const result = MHCalc.calcAll({
      weapon: weaponForCalc,
      armors,
      decorations: state.equippedDecos.map(d => d.decoration).filter(Boolean),
      charm: state.charm,
      skillDefs: DataLoader.getSkillDefs(),
      conditions: state.conditions,
      useMaxDefense: state.limitBreak
    });

    // 斬れ味オーバーライド
    if (state.sharpnessOverride !== null && result.sharpness.colorIndex >= 0) {
      const idx = state.sharpnessOverride;
      result.sharpness.colorIndex = idx;
      result.sharpness.colorName = MHCalc.SHARPNESS_COLORS[idx];
      result.sharpness.physical = MHCalc.SHARPNESS_PHYS[idx];
      result.sharpness.elemental = MHCalc.SHARPNESS_ELEM[idx];
      result.effectiveRange = {
        min: Math.floor(result.range.min * result.sharpness.physical),
        expected: Math.round(result.range.expected * result.sharpness.physical * 10) / 10,
        max: Math.floor(result.range.max * result.sharpness.physical)
      };
      // 属性も再計算
      if (result.element) {
        result.elementEffective = {
          type: result.element.type,
          value: Math.floor(result.element.value * result.sharpness.elemental)
        };
      }
    }

    // 基礎ステータス
    $('statBaseAttack').textContent = result.weaponAttack || '-';
    $('statBaseAffinity').textContent = result.baseAffinity ? `${result.baseAffinity > 0 ? '+' : ''}${result.baseAffinity}%` : '0%';
    $('statBaseElement').textContent = state.selectedWeapon?.element
      ? `${state.selectedWeapon.element.type} ${state.selectedWeapon.element.value}`
      : '-';

    const defKey = state.limitBreak ? 'max' : 'base';
    const baseDefTotal = armors.reduce((sum, a) => sum + (a?.defense?.[defKey] || 0), 0);
    $('statBaseDefense').textContent = baseDefTotal || '-';

    // 最終ステータス
    $('statAttack').textContent = result.finalAttack || '-';
    const atkDiff = result.finalAttack - result.weaponAttack;
    if (atkDiff > 0) $('statAttack').innerHTML = `${result.finalAttack} <span style="font-size:0.7rem;color:var(--green)">(+${atkDiff})</span>`;

    const affText = `${result.finalAffinity > 0 ? '+' : ''}${result.finalAffinity}%`;
    $('statAffinity').textContent = affText;
    $('statAffinity').className = 'stat-value' + (result.finalAffinity > 0 ? ' positive' : result.finalAffinity < 0 ? ' negative' : '');

    $('statDefense').textContent = result.totalDefense || '-';
    const defDiff = result.totalDefense - baseDefTotal;
    if (defDiff > 0) $('statDefense').innerHTML = `${result.totalDefense} <span style="font-size:0.7rem;color:var(--green)">(+${defDiff})</span>`;

    if (result.element) {
      const elemDiff = state.selectedWeapon?.element ? result.element.value - state.selectedWeapon.element.value : 0;
      $('statElement').innerHTML = `<span class="text-${elemClass(result.element.type)}">${result.element.type} ${result.element.value}</span>${elemDiff > 0 ? `<span style="font-size:0.7rem;color:var(--green)"> (+${elemDiff})</span>` : ''}`;
    } else {
      $('statElement').textContent = '-';
    }

    $('statCritMult').textContent = `x${result.critMultiplier.toFixed(2)}`;
    $('statSharpMod').textContent = result.sharpness.colorIndex >= 0
      ? `${result.sharpness.colorName} x${result.sharpness.physical.toFixed(2)}`
      : '-';

    renderSharpness(result.sharpness);
    renderSharpnessCompare(result);

    // DPS Panel - 物理
    const r = result.effectiveRange;
    const aff = result.finalAffinity;

    $('dpsExpected').textContent = r.expected || '-';
    $('dpsLow').textContent = r.min || '-';
    $('dpsHigh').textContent = r.max || '-';

    if (aff >= 0) {
      $('dpsLowLabel').textContent = '通常ヒット';
      $('dpsHighLabel').textContent = '会心ヒット';
      $('dpsHigh').className = 'dps-range-value dps-crit';
      $('dpsLow').className = 'dps-range-value';
    } else {
      $('dpsLowLabel').textContent = 'マイナス会心';
      $('dpsHighLabel').textContent = '通常ヒット';
      $('dpsLow').className = 'dps-range-value';
      $('dpsLow').style.color = 'var(--red)';
      $('dpsHigh').className = 'dps-range-value';
    }

    if (r.max > 0) {
      const lowPct = (r.min / r.max) * 100;
      const expPct = (r.expected / r.max) * 100;
      $('dpsBarLow').style.width = lowPct + '%';
      $('dpsBarExpected').style.left = `calc(${expPct}% - 1.5px)`;
    }

    const affAbs = Math.abs(aff);
    $('dpsDetail').textContent = aff >= 0
      ? `会心率 ${aff}% → ${affAbs}%の確率で${r.max}、${100-affAbs}%で${r.min}`
      : `会心率 ${aff}% → ${affAbs}%の確率で${r.min}（0.75倍）、${100-affAbs}%で${r.max}`;
    $('dpsNote').textContent = `会心率${aff}% × 会心倍率${result.critMultiplier.toFixed(2)} × 斬れ味${result.sharpness.physical.toFixed(2)}`;

    // 属性期待値表示
    const elemPanel = $('elemPanel');
    if (result.elementEffective && result.elementEffective.value > 0) {
      elemPanel.style.display = '';
      const ee = result.elementEffective;
      const baseElem = state.selectedWeapon?.element?.value || 0;
      const finalElem = result.element?.value || 0;
      $('elemExpected').innerHTML = `<span class="text-${elemClass(ee.type)}">${ee.type} ${ee.value}</span>`;
      $('elemDetail').textContent = `基礎${baseElem} → スキル後${finalElem} × 斬れ味${result.sharpness.elemental.toFixed(2)} = ${ee.value}`;
    } else {
      elemPanel.style.display = 'none';
    }

    setRes('resFire', result.resistance.fire);
    setRes('resWater', result.resistance.water);
    setRes('resThunder', result.resistance.thunder);
    setRes('resIce', result.resistance.ice);
    setRes('resDragon', result.resistance.dragon);

    renderConditionToggles(result.skillLevels);
    renderSkillList(result.skillLevels);

    const setSkills = calcSetSkills(armors);
    const groupSkills = calcGroupSkills(armors);
    renderSetSkills(setSkills);
    renderGroupSkills(groupSkills);

    // Damage calculator
    lastCalcResult = result;
    updateDmgAttacks();
    calcDamage();

    // Mobile
    $('mAtk').textContent = result.finalAttack || '-';
    $('mAff').textContent = affText;
    $('mExp').textContent = r.expected || '-';
    $('mDef').textContent = result.totalDefense || '-';
  }

  function renderSharpness(sharpResult) {
    const gauge = $('sharpnessGauge');
    if (!sharpResult || !sharpResult.gauge) {
      gauge.innerHTML = '<div style="width:100%;background:var(--text-muted);height:100%;border-radius:4px;opacity:0.3"></div>';
      return;
    }
    const colors = ['var(--sharp-red)', 'var(--sharp-orange)', 'var(--sharp-yellow)', 'var(--sharp-green)', 'var(--sharp-blue)', 'var(--sharp-white)', 'var(--sharp-purple)'];
    const g = sharpResult.gauge;
    const total = g.reduce((a, b) => a + b, 0) || 1;
    gauge.innerHTML = g.map((v, i) =>
      v > 0 ? `<div class="seg" style="width:${(v/total)*100}%;background:${colors[i]}"></div>` : ''
    ).join('');
  }

  function renderSharpnessCompare(result) {
    const tabs = $('sharpnessTabs');
    const compare = $('sharpnessCompare');

    if (!state.selectedWeapon || !state.selectedWeapon.sharpness) {
      tabs.innerHTML = '';
      compare.innerHTML = '';
      return;
    }

    const gauge = result.sharpness.gauge || state.selectedWeapon.sharpness;
    const colorNames = MHCalc.SHARPNESS_COLORS;
    const colorCSS = ['var(--sharp-red)', 'var(--sharp-orange)', 'var(--sharp-yellow)', 'var(--sharp-green)', 'var(--sharp-blue)', 'var(--sharp-white)', 'var(--sharp-purple)'];
    const availableColors = [];
    for (let i = 0; i < gauge.length; i++) {
      if (gauge[i] > 0) availableColors.push(i);
    }

    const activeIdx = state.sharpnessOverride !== null ? state.sharpnessOverride : result.sharpness.colorIndex;
    tabs.innerHTML = '<button class="tab' + (state.sharpnessOverride === null ? ' active' : '') + '" data-sharp="-1" style="font-size:0.65rem;padding:3px 6px">自動</button>';
    for (const i of availableColors) {
      const isActive = state.sharpnessOverride === i;
      tabs.innerHTML += `<button class="tab${isActive ? ' active' : ''}" data-sharp="${i}" style="font-size:0.65rem;padding:3px 6px"><span class="sharp-color-dot" style="background:${colorCSS[i]}"></span>${colorNames[i]}</button>`;
    }

    tabs.querySelectorAll('.tab').forEach(btn => {
      btn.onclick = () => {
        const val = parseInt(btn.dataset.sharp);
        state.sharpnessOverride = val === -1 ? null : val;
        recalculate();
      };
    });

    let html = '<table class="sharp-compare"><thead><tr><th>斬れ味</th><th>物理補正</th><th>属性補正</th><th>通常ヒット</th><th>期待値</th><th>会心ヒット</th></tr></thead><tbody>';
    for (const i of availableColors) {
      const phys = MHCalc.SHARPNESS_PHYS[i];
      const elem = MHCalc.SHARPNESS_ELEM[i];
      const min = Math.floor(result.range.min * phys);
      const exp = Math.round(result.range.expected * phys * 10) / 10;
      const max = Math.floor(result.range.max * phys);
      const isActive = i === activeIdx;
      html += `<tr class="${isActive ? 'active' : ''}">
        <td style="text-align:left"><span class="sharp-color-dot" style="background:${colorCSS[i]}"></span>${colorNames[i]}</td>
        <td>x${phys.toFixed(2)}</td>
        <td>x${elem.toFixed(2)}</td>
        <td>${min}</td>
        <td>${exp}</td>
        <td>${max}</td>
      </tr>`;
    }
    html += '</tbody></table>';
    compare.innerHTML = html;
  }

  function renderConditionToggles(skillLevels) {
    const container = $('condToggles');
    container.innerHTML = '';
    let hasToggles = false;

    for (const [name, level] of Object.entries(skillLevels)) {
      if (!MHCalc.isConditional(name)) continue;

      hasToggles = true;
      const condLabel = MHCalc.getConditionLabel(name);
      const label = document.createElement('label');
      label.className = 'cond-toggle';
      const checked = state.conditions[name] ? 'checked' : '';
      label.innerHTML = `<input type="checkbox" ${checked}><span>${name} Lv${level}（${condLabel}）</span>`;
      label.querySelector('input').onchange = (e) => {
        state.conditions[name] = e.target.checked;
        recalculate();
      };
      container.appendChild(label);
    }

    if (!hasToggles) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:0.75rem;padding:4px 0">条件付きスキルなし</p>';
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

      let effectDesc = '';
      if (def && def.effects) {
        const eff = def.effects.find(e => e.level === level);
        if (eff && eff.description) effectDesc = eff.description;
      }

      const row = document.createElement('div');
      row.className = 'skill-row';
      row.style.flexWrap = 'wrap';
      row.innerHTML = `
        <span class="skill-name">${name}</span>
        <span class="skill-level">Lv${level}/${maxLv}</span>
        <div class="skill-bar"><div class="fill${maxed ? ' maxed' : ''}" style="width:${pct}%"></div></div>
        ${effectDesc ? `<div style="width:100%;font-size:0.7rem;color:var(--text-secondary);margin-top:2px;padding-left:4px">${effectDesc}</div>` : ''}`;
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

    for (const pair of charmSkillPairs) {
      $(pair.lv).addEventListener('change', readCharm);
    }
    $('charmSlot1').addEventListener('change', readCharm);
    $('charmSlot2').addEventListener('change', readCharm);
    $('charmSlot3').addEventListener('change', readCharm);

    $('charmPreset').addEventListener('change', (e) => {
      if (e.target.value) applyCharmPreset(e.target.value);
    });

    $('decoModalClose').addEventListener('click', () => $('decoModal').classList.remove('open'));
    $('decoModal').addEventListener('click', (e) => {
      if (e.target === $('decoModal')) $('decoModal').classList.remove('open');
    });
    $('decoSearch').addEventListener('input', debounce(renderDecoModalList, 200));
    document.querySelectorAll('[data-deco-sort]').forEach(btn => {
      btn.addEventListener('click', () => {
        decoSortMode = btn.dataset.decoSort;
        renderDecoModalList();
      });
    });

    // Save/Load
    $('btnSaveSet').addEventListener('click', () => {
      $('saveSetName').value = '';
      $('saveModal').classList.add('open');
      $('saveSetName').focus();
    });
    $('saveModal').addEventListener('click', (e) => {
      if (e.target === $('saveModal')) $('saveModal').classList.remove('open');
    });
    $('btnDoSave').addEventListener('click', saveCurrentSet);
    $('saveSetName').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveCurrentSet(); });

    $('btnLoadSet').addEventListener('click', () => { renderSavedSets(); $('loadModal').classList.add('open'); });
    $('loadModal').addEventListener('click', (e) => {
      if (e.target === $('loadModal')) $('loadModal').classList.remove('open');
    });

    $('btnExport').addEventListener('click', exportSets);
    $('btnImport').addEventListener('change', importSets);

    $('limitBreakToggle').addEventListener('change', (e) => {
      state.limitBreak = e.target.checked;
      renderArmorList();
      recalculate();
    });
  }

  // === Save/Load System ===
  const STORAGE_KEY = 'mhwilds_saved_sets';

  function getSavedSets() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  }

  function writeSavedSets(sets) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sets));
  }

  function serializeState() {
    return {
      weapon: state.selectedWeapon ? state.selectedWeapon.id : null,
      armors: {
        head: state.selectedArmors.head?.id || null,
        chest: state.selectedArmors.chest?.id || null,
        arms: state.selectedArmors.arms?.id || null,
        waist: state.selectedArmors.waist?.id || null,
        legs: state.selectedArmors.legs?.id || null,
      },
      decos: state.equippedDecos.map(d => ({
        owner: d.owner, slotIndex: d.slotIndex, decoId: d.decoration.id
      })),
      charm: state.charm,
      conditions: { ...state.conditions }
    };
  }

  function deserializeState(data) {
    if (data.weapon) {
      state.selectedWeapon = DataLoader.getWeapons().find(w => w.id === data.weapon) || null;
      if (state.selectedWeapon) {
        state.activeWeaponType = state.selectedWeapon.weaponType;
        $('selectedWeaponName').textContent = state.selectedWeapon.name;
      }
    } else {
      state.selectedWeapon = null;
    }

    for (const part of ['head', 'chest', 'arms', 'waist', 'legs']) {
      const id = data.armors?.[part];
      state.selectedArmors[part] = id ? DataLoader.getArmors().find(a => a.id === id) || null : null;
    }

    state.equippedDecos = [];
    if (data.decos) {
      for (const d of data.decos) {
        const deco = DataLoader.getDecorations().find(dec => dec.id === d.decoId);
        if (deco) state.equippedDecos.push({ owner: d.owner, slotIndex: d.slotIndex, decoration: deco });
      }
    }

    state.charm = data.charm || null;
    if (state.charm) {
      const skillSelects = ['charmSkill1', 'charmSkill2', 'charmSkill3'];
      const lvSelects = ['charmSkill1Lv', 'charmSkill2Lv', 'charmSkill3Lv'];
      const searchInputs = ['charmSearch1', 'charmSearch2', 'charmSearch3'];
      for (let i = 0; i < 3; i++) {
        if (state.charm.skills?.[i]) {
          $(skillSelects[i]).value = state.charm.skills[i].name;
          $(searchInputs[i]).value = state.charm.skills[i].name;
          updateCharmLevelOptions(skillSelects[i], lvSelects[i]);
          $(lvSelects[i]).value = state.charm.skills[i].level;
        } else {
          $(skillSelects[i]).value = '';
          $(searchInputs[i]).value = '';
          $(lvSelects[i]).innerHTML = '<option value="0">-</option>';
        }
      }
      const slotSels = ['charmSlot1', 'charmSlot2', 'charmSlot3'];
      for (let i = 0; i < 3; i++) {
        $(slotSels[i]).value = state.charm.slots?.[i] || '0';
      }
    }

    state.conditions = data.conditions || {};

    renderWeaponTabs();
    renderArmorList();
    renderDecoSlots();
    recalculate();
  }

  function saveCurrentSet() {
    const name = ($('saveSetName').value || '').trim();
    if (!name) { $('saveSetName').focus(); return; }

    const sets = getSavedSets();
    const wName = state.selectedWeapon?.name || '-';
    const armorNames = ['head','chest','arms','waist','legs'].map(p => state.selectedArmors[p]?.name || '-');

    sets.push({
      name,
      savedAt: new Date().toISOString(),
      summary: { weapon: wName, armors: armorNames },
      data: serializeState()
    });

    writeSavedSets(sets);
    $('saveModal').classList.remove('open');

    $('loadStatus').textContent = `「${name}」を保存しました`;
    setTimeout(() => {
      const w = DataLoader.getWeapons().length;
      $('loadStatus').textContent = `${w}武器 / ${DataLoader.getArmors().length}防具`;
    }, 2000);
  }

  function renderSavedSets() {
    const sets = getSavedSets();
    const list = $('savedSetList');
    list.innerHTML = '';

    if (sets.length === 0) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">保存されたセットはありません</div>';
      return;
    }

    sets.forEach((set, idx) => {
      const div = document.createElement('div');
      div.className = 'item';
      const date = new Date(set.savedAt).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
      div.innerHTML = `
        <div class="item-name" style="flex:1">
          <strong>${set.name}</strong>
          <span class="sub">${set.summary?.weapon || '-'} | ${date}</span>
        </div>
        <div style="display:flex;gap:4px">
          <button class="deco-slot-btn" data-action="load" data-idx="${idx}">読込</button>
          <button class="deco-remove" data-action="delete" data-idx="${idx}" title="削除">✕</button>
        </div>`;
      list.appendChild(div);
    });

    list.onclick = (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      if (btn.dataset.action === 'load') {
        deserializeState(sets[idx].data);
        $('loadModal').classList.remove('open');
        $('loadStatus').textContent = `「${sets[idx].name}」を読み込みました`;
        setTimeout(() => {
          $('loadStatus').textContent = `${DataLoader.getWeapons().length}武器 / ${DataLoader.getArmors().length}防具`;
        }, 2000);
      } else if (btn.dataset.action === 'delete') {
        if (confirm(`「${sets[idx].name}」を削除しますか？`)) {
          sets.splice(idx, 1);
          writeSavedSets(sets);
          renderSavedSets();
        }
      }
    };
  }

  function exportSets() {
    const sets = getSavedSets();
    if (sets.length === 0) { alert('保存されたセットがありません'); return; }
    const blob = new Blob([JSON.stringify(sets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mhwilds_sets_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importSets(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!Array.isArray(imported)) throw new Error('invalid format');
        const existing = getSavedSets();
        const merged = [...existing, ...imported];
        writeSavedSets(merged);
        renderSavedSets();
        alert(`${imported.length}件のセットをインポートしました`);
      } catch (err) {
        alert('ファイル形式が正しくありません');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // === Artian Weapon Bonuses ===
  const ARTIAN_ELEM_UPGRADE = {
    '大剣':           [80, 90, 110],
    'ハンマー':       [50, 60, 90],
    '狩猟笛':         [50, 60, 90],
    'ランス':         [50, 60, 90],
    'ガンランス':     [50, 60, 90],
    'チャージアックス': [50, 60, 90],
    '太刀':           [50, 60, 90],
    '片手剣':         [30, 50, 80],
    'スラッシュアックス': [30, 50, 80],
    '操虫棍':         [30, 50, 80],
    '弓':             [30, 40, 60],
    '双剣':           [20, 30, 50],
    'ライトボウガン':  [0, 0, 0],
    'ヘビィボウガン':  [0, 0, 0]
  };

  function isArtianWeapon(weapon) {
    return weapon && (weapon.name.includes('アーティア') || weapon.artian === 'gogma');
  }

  function isGogmaArtian(weapon) {
    return weapon && weapon.artian === 'gogma';
  }

  function renderArtianPanel() {
    const panel = $('artianPanel');
    if (!isArtianWeapon(state.selectedWeapon)) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';

    // Show/hide intensification row for Gogma
    const intensifyRow = $('artianIntensifyRow');
    intensifyRow.style.display = isGogmaArtian(state.selectedWeapon) ? '' : 'none';
    const intensifySel = $('artianIntensify');
    if (!intensifySel._bound) {
      intensifySel.addEventListener('change', recalculate);
      intensifySel._bound = true;
    }

    // Render 5 restore slots (refresh on weapon type change)
    const container = $('artianRestoreSlots');
    const wt = state.selectedWeapon.weaponType;
    if (container.children.length === 0 || container.dataset.wt !== wt) {
      container.dataset.wt = wt;
      container.innerHTML = '';
      const elemVals = ARTIAN_ELEM_UPGRADE[wt] || [30, 50, 80];
      for (let i = 0; i < 5; i++) {
        const sel = document.createElement('select');
        sel.className = 'artian-sel';
        sel.id = `artianRestore${i}`;
        sel.innerHTML = `
          <option value="">なし</option>
          <option value="atk1">攻撃力+5</option>
          <option value="atk2">攻撃力+6</option>
          <option value="atk3">攻撃力+9</option>
          <option value="atkEX">攻撃力+12</option>
          <option value="aff1">会心率+5%</option>
          <option value="aff2">会心率+6%</option>
          <option value="aff3">会心率+8%</option>
          <option value="affEX">会心率+10%</option>
          <option value="sharp1">斬れ味+30</option>
          <option value="sharpEX">斬れ味+50</option>
          <option value="elem1">属性+${elemVals[0]}</option>
          <option value="elem2">属性+${elemVals[1]}</option>
          <option value="elemEX">属性+${elemVals[2]}</option>
        `;
        sel.addEventListener('change', recalculate);
        container.appendChild(sel);
      }
    }

    // Bind change events for prod selects and elem
    for (const id of ['artianProd1', 'artianProd2', 'artianProd3', 'artianElem']) {
      const el = $(id);
      if (!el._bound) {
        el.addEventListener('change', recalculate);
        el._bound = true;
      }
    }

    // 巨戟アーティア武器スキル選択
    const weaponSkillRow = $('artianWeaponSkillRow');
    if (isGogmaArtian(state.selectedWeapon)) {
      weaponSkillRow.style.display = '';
      const seriesSel = $('artianSeriesSkill');
      const groupSel = $('artianGroupSkill');

      if (!seriesSel._populated) {
        const allSets = DataLoader.getArmorSets();
        // シリーズスキル一覧（ユニーク）
        const seriesSkills = new Map();
        const groupSkills = new Map();
        for (const setDef of allSets) {
          if (setDef.bonuses) {
            for (const b of setDef.bonuses) {
              if (!seriesSkills.has(b.skill)) seriesSkills.set(b.skill, b.description || '');
            }
          }
          if (setDef.groupBonus) {
            const gb = setDef.groupBonus;
            if (!groupSkills.has(gb.skill)) groupSkills.set(gb.skill, gb.effectName || '');
          }
        }

        seriesSel.innerHTML = '<option value="">シリーズスキルなし</option>';
        for (const [skill, desc] of [...seriesSkills.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ja'))) {
          seriesSel.innerHTML += `<option value="${skill}">${skill}</option>`;
        }

        groupSel.innerHTML = '<option value="">グループスキルなし</option>';
        for (const [skill, effect] of [...groupSkills.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ja'))) {
          groupSel.innerHTML += `<option value="${skill}">${skill}（${effect}）</option>`;
        }

        seriesSel._populated = true;
      }

      // 保存された値を復元
      seriesSel.value = state.gogmaSeriesSkill;
      groupSel.value = state.gogmaGroupSkill;

      if (!seriesSel._bound) {
        seriesSel.addEventListener('change', () => {
          state.gogmaSeriesSkill = seriesSel.value;
          recalculate();
        });
        groupSel.addEventListener('change', () => {
          state.gogmaGroupSkill = groupSel.value;
          recalculate();
        });
        seriesSel._bound = true;
      }
    } else {
      weaponSkillRow.style.display = 'none';
    }
  }

  // 激化タイプ属性補正値（武器種別）
  const INTENSIFY_ELEM = {
    atk:  { '大剣': 0, '太刀': 0, '片手剣': 0, '双剣': 0, 'ハンマー': 0, '狩猟笛': 0, 'ランス': 0, 'ガンランス': 0, 'スラッシュアックス': 0, 'チャージアックス': 0, '操虫棍': 0, '弓': 0 },
    aff:  { '大剣': -10, '太刀': -20, '片手剣': -20, '双剣': -20, 'ハンマー': -10, '狩猟笛': 20, 'ランス': -20, 'ガンランス': 30, 'スラッシュアックス': -20, 'チャージアックス': -20, '操虫棍': -20, '弓': -20 },
    elem: { '大剣': 50, '太刀': 50, '片手剣': 40, '双剣': 30, 'ハンマー': 40, '狩猟笛': 80, 'ランス': 50, 'ガンランス': 80, 'スラッシュアックス': 40, 'チャージアックス': 50, '操虫棍': 40, '弓': 30 }
  };

  function getArtianBonuses() {
    if (!isArtianWeapon(state.selectedWeapon)) return null;
    const wt = state.selectedWeapon.weaponType;
    const elemVals = ARTIAN_ELEM_UPGRADE[wt] || [30, 50, 80];

    let atkMult = 1.0, affFlat = 0, atkFlat = 0, sharpAdd = 0, elemAdd = 0;
    let sharpOverride = null;

    // Production bonuses
    for (const id of ['artianProd1', 'artianProd2', 'artianProd3']) {
      const v = $(id)?.value;
      if (v === 'atk') atkMult *= 1.03;
      else if (v === 'aff') affFlat += 5;
    }

    // Restoration bonuses
    for (let i = 0; i < 5; i++) {
      const v = $(`artianRestore${i}`)?.value || '';
      if (v === 'atk1') atkFlat += 5;
      else if (v === 'atk2') atkFlat += 6;
      else if (v === 'atk3') atkFlat += 9;
      else if (v === 'atkEX') atkFlat += 12;
      else if (v === 'aff1') affFlat += 5;
      else if (v === 'aff2') affFlat += 6;
      else if (v === 'aff3') affFlat += 8;
      else if (v === 'affEX') affFlat += 10;
      else if (v === 'sharp1') sharpAdd += 30;
      else if (v === 'sharpEX') sharpAdd += 50;
      else if (v === 'elem1') elemAdd += elemVals[0];
      else if (v === 'elem2') elemAdd += elemVals[1];
      else if (v === 'elemEX') elemAdd += elemVals[2];
    }

    const elemType = $('artianElem')?.value || '';

    // 激化タイプ（巨戟のみ）
    const intensify = $('artianIntensify')?.value || '';
    if (intensify === 'atk') {
      atkFlat += 10;
      affFlat -= 15;
    } else if (intensify === 'aff') {
      atkFlat -= 10;
      affFlat += 10;
      // 会心激化は斬れ味が異なる
      sharpOverride = [140, 40, 40, 50, 70, 10, 0];
      elemAdd += INTENSIFY_ELEM.aff[wt] || 0;
    } else if (intensify === 'elem') {
      affFlat -= 5;
      elemAdd += INTENSIFY_ELEM.elem[wt] || 0;
    }

    return { atkMult, atkFlat, affFlat, sharpAdd, elemAdd, elemType, sharpOverride };
  }

  // === Damage Calculator ===
  let lastCalcResult = null;

  function initDamageCalc() {
    // Populate monster select
    const monsterSel = $('dmgMonster');
    const monsters = DataLoader.getMonsters();
    for (const m of monsters) {
      monsterSel.innerHTML += `<option value="${m.id}">${m.name}</option>`;
    }

    monsterSel.addEventListener('change', () => {
      updateDmgParts();
      calcDamage();
    });
    $('dmgPart').addEventListener('change', () => calcDamage());
    $('dmgAttack').addEventListener('change', () => calcDamage());
  }

  function updateDmgParts() {
    const partSel = $('dmgPart');
    partSel.innerHTML = '<option value="">部位...</option>';
    const monsterId = parseInt($('dmgMonster').value);
    if (!monsterId) return;
    const monster = DataLoader.getMonsters().find(m => m.id === monsterId);
    if (!monster) return;
    for (const p of monster.parts) {
      partSel.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    }
    // Auto-select first part
    if (monster.parts.length > 0) {
      partSel.value = monster.parts[0].id;
    }
  }

  function updateDmgAttacks() {
    const attackSel = $('dmgAttack');
    const prevVal = attackSel.value;
    attackSel.innerHTML = '<option value="">攻撃を選択...</option>';
    if (!state.selectedWeapon) return;
    const weaponType = state.selectedWeapon.weaponType;
    const attacks = DataLoader.getAttacksForWeaponType(weaponType);
    for (let i = 0; i < attacks.length; i++) {
      const a = attacks[i];
      attackSel.innerHTML += `<option value="${i}">${a.name} (MV${a.mv})</option>`;
    }
    // Restore selection if same weapon type
    if (prevVal && attackSel.querySelector(`option[value="${prevVal}"]`)) {
      attackSel.value = prevVal;
    }
  }

  function calcDamage() {
    const resultDiv = $('dmgResult');
    const hzvTable = $('dmgHzvTable');

    if (!lastCalcResult || !state.selectedWeapon) {
      resultDiv.style.display = 'none';
      hzvTable.innerHTML = '';
      return;
    }

    const monsterId = parseInt($('dmgMonster').value);
    const partId = $('dmgPart').value;
    const attackIdx = $('dmgAttack').value;
    const monster = monsterId ? DataLoader.getMonsters().find(m => m.id === monsterId) : null;

    // Render hitzone table if monster selected
    if (monster) {
      const weaponType = state.selectedWeapon.weaponType;
      const dmgType = DataLoader.getDamageTypeForWeaponType(weaponType);
      const dmgLabel = { slash: '斬', blunt: '打', pierce: '弾' }[dmgType] || '斬';

      let html = '<table class="sharp-compare"><thead><tr><th>部位</th><th>' + dmgLabel + '</th><th>火</th><th>水</th><th>雷</th><th>氷</th><th>龍</th></tr></thead><tbody>';
      for (const p of monster.parts) {
        const isActive = p.id === partId;
        html += `<tr class="${isActive ? 'active' : ''}" style="cursor:pointer" data-part-id="${p.id}">
          <td style="text-align:left">${p.name}</td>
          <td>${p[dmgType]}%</td>
          <td>${p.fire}%</td><td>${p.water}%</td><td>${p.thunder}%</td><td>${p.ice}%</td><td>${p.dragon}%</td>
        </tr>`;
      }
      html += '</tbody></table>';
      hzvTable.innerHTML = html;

      // Click on row to select part
      hzvTable.querySelectorAll('tr[data-part-id]').forEach(row => {
        row.onclick = () => {
          $('dmgPart').value = row.dataset.partId;
          calcDamage();
        };
      });
    } else {
      hzvTable.innerHTML = '';
    }

    // Calculate hit damage if all selected
    if (!monster || !partId || attackIdx === '') {
      resultDiv.style.display = 'none';
      return;
    }

    const part = monster.parts.find(p => p.id === partId);
    if (!part) { resultDiv.style.display = 'none'; return; }

    const weaponType = state.selectedWeapon.weaponType;
    const attacks = DataLoader.getAttacksForWeaponType(weaponType);
    const attackData = attacks[parseInt(attackIdx)];
    if (!attackData) { resultDiv.style.display = 'none'; return; }

    const r = lastCalcResult;
    const armors = Object.values(state.selectedArmors).filter(Boolean);
    const activeSetSkillsList = calcSetSkills(armors);

    // トグルで無効化されたセットスキルを除外
    const filteredSetSkills = activeSetSkillsList.filter(s => {
      if (!s.active) return false;
      const toggleId = `setToggle_${s.setName}_${s.skill}`;
      return state.setSkillConditions[toggleId] !== false;
    });

    const dmg = MHCalc.calcHitDamage({
      attack: r.finalAttack,
      affinity: r.finalAffinity,
      critMult: r.critMultiplier,
      sharpness: r.sharpness,
      element: r.element,
      attack_data: attackData,
      hitzone: part,
      weaponDamageType: DataLoader.getDamageTypeForWeaponType(weaponType),
      activeSetSkills: filteredSetSkills,
      skillLevels: r.skillLevels,
      conditions: state.conditions,
      weaponType: weaponType
    });

    resultDiv.style.display = '';
    $('dmgNormal').textContent = dmg.total.normal;
    $('dmgExpected').textContent = dmg.total.expected;
    $('dmgCrit').textContent = dmg.total.crit;

    const elemText = dmg.elemental > 0 ? ` + 属性${dmg.elemental}` : '';
    let breakdownText =
      `物理: ${dmg.physical.normal}(通常) / ${dmg.physical.expected}(期待) / ${dmg.physical.crit}(会心)${elemText}` +
      ` | MV${attackData.mv} × 肉質${part[DataLoader.getDamageTypeForWeaponType(weaponType)]}%`;

    // 追撃ダメージ表示
    const fuDiv = $('dmgFollowUps');
    if (dmg.followUps && dmg.followUps.length > 0) {
      fuDiv.style.display = '';
      let fuHtml = '';
      for (const fu of dmg.followUps) {
        const typeLabel = { proc: '確率発動', mv: 'MV型', fixed: '固定', accumulate: '蓄積爆発' }[fu.type] || '';
        const cdText = fu.cooldown ? `CT${fu.cooldown}秒` : '';
        const condText = fu.condition ? `（${fu.condition}）` : '';
        const noteText = fu.note ? `<span style="font-size:0.6rem;color:var(--text-muted)"> ${fu.note}</span>` : '';
        fuHtml += `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:0.75rem">${fu.name}${condText}</span>
          <span style="font-weight:700;color:var(--accent)">${fu.damage > 0 ? fu.damage : '-'}</span>
        </div>
        <div style="font-size:0.6rem;color:var(--text-muted)">${typeLabel} ${cdText}${noteText}</div>`;
      }
      fuDiv.innerHTML = fuHtml;
    } else {
      fuDiv.style.display = 'none';
    }

    $('dmgBreakdown').textContent = breakdownText;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  document.addEventListener('DOMContentLoaded', init);
  return { state, recalculate };
})();
