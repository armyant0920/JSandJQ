/* 地圖章節分頁：地形筆刷、單位擺放、勝敗條件、事件、章節分歧 */
(function () {
  'use strict';
  const { h } = ED;
  const C = SRPG.campaign;
  const RD = SRPG.renderer;
  const TS = RD.TS;

  const tool = { mode: 'paint', terrain: 'plain', unit: null, team: 'enemy', ai: 'aggressive', selIdx: -1, zoom: 0.75 };
  const TEAMS = [['player', '我方'], ['enemy', '敵方'], ['ally', '友軍']];
  const AIS = [['aggressive', '主動進攻'], ['guard', '範圍內才行動'], ['hold', '原地不動']];
  const EVENT_TYPES = [['start', '章節開始'], ['turn', '回合開始'], ['death', '單位陣亡'], ['talk', '交談'], ['visit', '拜訪地點'], ['victory', '勝利時']];
  const VICTORY = [['rout', '殲滅敵軍'], ['boss', '擊破敵將（★）'], ['survive', '存活 N 回合'], ['seize', '主角壓制地點']];
  const DEFEAT = [['lordDies', '主角陣亡'], ['unitDies', '指定角色陣亡'], ['turnLimit', '超過回合限制']];

  function newChapter() {
    const rows = [];
    for (let y = 0; y < 10; y++) rows.push('.'.repeat(14));
    return { name: '新章節', map: { rows }, units: [], victory: { type: 'rout' }, defeat: { type: 'lordDies' }, events: [], next: [] };
  }

  function charFor(ch, tkey) {
    for (const [k, v] of Object.entries(ch.map.legend || {})) if (v === tkey) return k;
    return (ED.c.terrains[tkey] || {}).char || '.';
  }

  function setTile(ch, x, y, tkey) {
    const rows = ch.map.rows;
    if (y < 0 || y >= rows.length || x < 0 || x >= rows[y].length) return false;
    const c = charFor(ch, tkey);
    if (rows[y][x] === c) return false;
    rows[y] = rows[y].slice(0, x) + c + rows[y].slice(x + 1);
    return true;
  }

  function resize(ch, w, hgt) {
    const rows = ch.map.rows;
    const out = [];
    for (let y = 0; y < hgt; y++) {
      const r = rows[y] || '';
      out.push((r + '.'.repeat(w)).slice(0, w));
    }
    ch.map.rows = out;
    ch.units = (ch.units || []).filter((p) => p.x < w && p.y < hgt);
  }

  function drawMap(cv, ch) {
    let map;
    try { map = C.parseMap(ED.c, ch.map); } catch (e) { return e.message; }
    cv.width = map.w * TS; cv.height = map.h * TS;
    cv.style.width = Math.round(cv.width * tool.zoom) + 'px';
    const ctx = cv.getContext('2d');
    RD.drawMap(ctx, ED.c, map, 0);
    (ch.units || []).forEach((p, i) => {
      const def = ED.c.units[p.unit] || {};
      const fake = { uid: i, id: p.unit, name: def.name || p.unit, team: p.team || 'enemy', boss: p.boss };
      RD.drawUnit(ctx, ED.c, fake, p.x * TS, p.y * TS, 0, { still: true, hp: false });
      if (i === tool.selIdx) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3; ctx.strokeRect(p.x * TS + 2, p.y * TS + 2, TS - 4, TS - 4); }
    });
    const v = ch.victory || {};
    if (v.type === 'seize') { ctx.strokeStyle = '#ffd24a'; ctx.setLineDash([6, 4]); ctx.lineWidth = 3; ctx.strokeRect(v.x * TS + 4, v.y * TS + 4, TS - 8, TS - 8); ctx.setLineDash([]); }
    for (const p of ch.deploySlots || []) { ctx.strokeStyle = '#5a8cff'; ctx.lineWidth = 3; ctx.setLineDash([4, 4]); ctx.strokeRect(p.x * TS + 6, p.y * TS + 6, TS - 12, TS - 12); ctx.setLineDash([]); }
    for (const ev of ch.events || []) if (ev.on === 'visit') { ctx.fillStyle = '#ffd24a'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('V', ev.x * TS + 36, ev.y * TS + 14); }
    return null;
  }

  ED.tabs.chapters = function () {
    const id = ED.sel.chapters = ED.sel.chapters && ED.c.chapters[ED.sel.chapters] ? ED.sel.chapters : Object.keys(ED.c.chapters)[0];
    const left = ED.listPanel('chapters', { prefix: 'ch', make: newChapter });
    if (!id) return h('div.split', {}, left, h('p.hint', {}, '尚無章節，按「＋ 新增」'));
    const ch = ED.c.chapters[id];
    ch.units = ch.units || []; ch.events = ch.events || [];
    if (!tool.unit || !ED.c.units[tool.unit]) tool.unit = Object.keys(ED.c.units)[0];

    const cv = h('canvas', { id: 'mapCanvas' });
    const err = drawMap(cv, ch);
    const redraw = () => drawMap(cv, ch);
    const tileOf = (e) => { const r = cv.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / r.width * cv.width / TS), y: Math.floor((e.clientY - r.top) / r.height * cv.height / TS) }; };
    let painting = false;
    const placementAt = (x, y) => ch.units.findIndex((p) => p.x === x && p.y === y);
    cv.addEventListener('pointerdown', (e) => {
      const t = tileOf(e);
      if (e.button === 2) return;
      if (tool.mode === 'paint') { painting = true; if (setTile(ch, t.x, t.y, tool.terrain)) { redraw(); ED.dirty(); } }
      else if (tool.mode === 'unit') {
        const i = placementAt(t.x, t.y);
        if (i >= 0) tool.selIdx = i;
        else if (tool.unit) {
          const p = { unit: tool.unit, team: tool.team, x: t.x, y: t.y };
          if (tool.team !== 'player') p.ai = tool.ai;
          ch.units.push(p); tool.selIdx = ch.units.length - 1;
        }
        ED.dirty(true);
      } else if (tool.mode === 'seize') { ch.victory = { type: 'seize', x: t.x, y: t.y }; ED.dirty(true); }
      else if (tool.mode === 'slot') {
        ch.deploySlots = ch.deploySlots || [];
        const i = ch.deploySlots.findIndex((p) => p.x === t.x && p.y === t.y);
        if (i >= 0) ch.deploySlots.splice(i, 1); else ch.deploySlots.push({ x: t.x, y: t.y });
        if (!ch.deploySlots.length) delete ch.deploySlots;
        ED.dirty(true);
      }
      else if (tool.mode === 'visit') {
        const sid = ED.newId('scripts', id + '_visit');
        ED.c.scripts[sid] = [{ cmd: 'say', name: '村民', text: '歡迎光臨！' }];
        ch.events.push({ on: 'visit', x: t.x, y: t.y, script: sid });
        ED.dirty(true);
      }
    });
    cv.addEventListener('pointermove', (e) => { if (painting && tool.mode === 'paint') { const t = tileOf(e); if (setTile(ch, t.x, t.y, tool.terrain)) { redraw(); ED.dirty(); } } });
    window.addEventListener('pointerup', () => { painting = false; }, { once: true });
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const t = tileOf(e);
      const i = placementAt(t.x, t.y);
      if (i >= 0) { ch.units.splice(i, 1); tool.selIdx = -1; ED.dirty(true); }
    });

    const modeBtn = (m, label) => h('button', { className: tool.mode === m ? 'on' : '', onclick: () => { tool.mode = m; ED.render(); } }, label);
    const map = ch.map;
    const W = Math.max(...map.rows.map((r) => r.length)), H = map.rows.length;
    const size = { w: W, h: H };

    const toolbar = h('div', {},
      h('div.row', {}, modeBtn('paint', '🖌 地形'), modeBtn('unit', '🧍 單位'), modeBtn('seize', '🏁 壓制點'), modeBtn('visit', '🏠 拜訪點'), modeBtn('slot', '🔷 出擊位置'),
        h('span.hint', {}, '右鍵：刪除單位'),
        h('span', { style: { flex: 1 } }),
        '縮放', h('input', { type: 'range', min: 0.3, max: 1.5, step: 0.05, value: tool.zoom, oninput: (e) => { tool.zoom = +e.target.value; cv.style.width = Math.round(cv.width * tool.zoom) + 'px'; } }),
        '寬', h('input', { type: 'number', value: W, min: 4, max: 60, onchange: (e) => { size.w = +e.target.value; } }),
        '高', h('input', { type: 'number', value: H, min: 4, max: 60, onchange: (e) => { size.h = +e.target.value; } }),
        h('button', { onclick: () => { resize(ch, size.w, size.h); ED.dirty(true); } }, '套用尺寸')),
      tool.mode === 'paint' ? h('div.tpal', {}, ...Object.entries(ED.c.terrains).map(([k, t]) =>
        h('button', { className: tool.terrain === k ? 'on' : '', onclick: () => { tool.terrain = k; ED.render(); } }, h('i', { style: { background: t.color } }), `${t.name}`, h('code', {}, t.char))),
      h('button', { onclick: () => { if (!confirm('整張地圖填滿目前地形？')) return; ch.map.rows = ch.map.rows.map((r) => charFor(ch, tool.terrain).repeat(r.length)); ED.dirty(true); } }, '🪣 全部填滿')) : null,
      tool.mode === 'unit' ? h('div.row', {}, '單位', ED.select(tool, 'unit', ED.named('units')), '陣營', ED.select(tool, 'team', TEAMS), 'AI', ED.select(tool, 'ai', AIS),
        h('span.hint', {}, '點空格放置、點單位選取')) : null,
      tool.mode === 'seize' ? h('p.hint', {}, '點地圖設定壓制地點（勝利條件會改為「壓制」）') : null,
      tool.mode === 'visit' ? h('p.hint', {}, '點地圖新增「拜訪」事件（會自動建立一段劇本）') : null,
      tool.mode === 'slot' ? h('p.hint', {}, '點地圖新增/移除額外出擊位置（藍色虛線框）。出擊準備畫面中，名冊裡的其他角色會放在這些位置。') : null);

    // 單位清單
    const unitTable = h('table.tbl', {}, h('tr', {}, ...['#', '單位', '陣營', 'X', 'Y', 'AI', '★敵將/必出', 'Lv', '出場條件', ''].map((t) => h('th', {}, t))),
      ...ch.units.map((p, i) => h('tr', { style: { background: i === tool.selIdx ? '#2a3450' : '' }, onclick: () => { if (tool.selIdx !== i) { tool.selIdx = i; redraw(); } } },
        h('td', {}, i + 1),
        h('td', {}, ED.select(p, 'unit', ED.named('units'), { rerender: true })),
        h('td', {}, ED.select(p, 'team', TEAMS, { rerender: true })),
        h('td', {}, ED.num(p, 'x', { rerender: true, attrs: { style: 'width:48px' } })),
        h('td', {}, ED.num(p, 'y', { rerender: true, attrs: { style: 'width:48px' } })),
        h('td', {}, p.team === 'player' ? '—' : ED.select(p, 'ai', AIS)),
        h('td', {}, p.team === 'player' ? ED.check(p, 'forced', '必出') : ED.check(p, 'boss')),
        h('td', {}, ED.num(p, 'level', { attrs: { style: 'width:48px', placeholder: '預設' } })),
        h('td', {}, ED.text(p, 'if', { optional: true, attrs: { style: 'width:90px', placeholder: '旗標', list: 'flagList' } })),
        h('td', {}, h('button.danger', { onclick: () => { ch.units.splice(i, 1); tool.selIdx = -1; ED.dirty(true); } }, '✕')))));

    return h('div.split3', {}, left,
      h('div', {}, h('h2', {}, `地圖：${ch.name || id}（${W}×${H}）`), toolbar, err ? h('p.err', {}, err) : null, cv,
        h('h2', {}, '出場單位'), unitTable),
      chapterSettings(id, ch));
  };

  function chapterSettings(id, ch) {
    const v = ch.victory = ch.victory || { type: 'rout' };
    const d = ch.defeat = ch.defeat || { type: 'lordDies' };
    const vParams = v.type === 'survive' ? ['回合數', ED.num(v, 'turns')] : v.type === 'seize' ? ['座標', ED.num(v, 'x'), ED.num(v, 'y')] : [];
    const dParams = d.type === 'unitDies' ? [ED.select(d, 'unit', ED.named('units'))] : d.type === 'turnLimit' ? ['回合', ED.num(d, 'turns')] : [];

    const evRows = ch.events.map((ev, i) => {
      const t = ev.on || 'start';
      let params = [];
      if (t === 'turn') params = ['第', ED.num(ev, 'turn'), '回合', ED.select(ev, 'phase', [['player', '我方'], ['enemy', '敵方'], ['ally', '友軍']])];
      if (t === 'death') params = [ED.select(ev, 'unit', ED.named('units'))];
      if (t === 'talk') params = [ED.select(ev, 'a', ED.named('units')), '↔', ED.select(ev, 'b', ED.named('units'))];
      if (t === 'visit') params = ['x', ED.num(ev, 'x'), 'y', ED.num(ev, 'y')];
      return h('div.card', {},
        h('div.row', {}, ED.select(ev, 'on', EVENT_TYPES, { rerender: true }), ...params,
          h('button.danger', { style: { marginLeft: 'auto' }, onclick: () => { ch.events.splice(i, 1); ED.dirty(true); } }, '✕')),
        h('div.row', {}, '劇本', ED.select(ev, 'script', ED.keys('scripts'), { optional: true }),
          h('button', { title: '編輯此劇本', disabled: !ev.script, onclick: () => { ED.sel.scripts = ev.script; ED.tab = 'scripts'; ED.render(); } }, '✎'),
          h('button', { title: '建立新劇本', onclick: () => { const sid = ED.newId('scripts', `${id}_${t}`); ED.c.scripts[sid] = [{ cmd: 'say', who: Object.keys(ED.c.units)[0], text: '……' }]; ev.script = sid; ED.dirty(true); } }, '＋新劇本')),
        h('div.row', {}, '條件旗標', ED.text(ev, 'if', { optional: true, attrs: { placeholder: '空白＝無條件，!flag 表示否定', style: 'width:150px' } }),
          h('label', {}, h('input', { type: 'checkbox', checked: ev.once === false, onchange: (e) => { if (e.target.checked) ev.once = false; else delete ev.once; ED.dirty(); } }), ' 可重複觸發')));
    });

    ch.next = [].concat(ch.next || []).map((n) => (typeof n === 'string' ? { chapter: n } : n));
    const nextRows = ch.next.map((n, i) => h('div.row', {},
      i === ch.next.length - 1 && !n.if ? '否則' : '若旗標', ED.text(n, 'if', { optional: true, attrs: { placeholder: '（無條件）', style: 'width:110px' } }),
      '→', ED.select(n, 'chapter', ED.named('chapters')),
      h('button', { disabled: i === 0, onclick: () => { [ch.next[i - 1], ch.next[i]] = [ch.next[i], ch.next[i - 1]]; ED.dirty(true); } }, '↑'),
      h('button.danger', { onclick: () => { ch.next.splice(i, 1); ED.dirty(true); } }, '✕')));

    return h('div', {},
      h('h2', {}, '章節設定'),
      h('div.form', { style: { gridTemplateColumns: '70px 1fr' } },
        ...ED.formRow('ID', ED.idField('chapters')),
        ...ED.formRow('名稱', ED.text(ch, 'name')),
        ...ED.formRow('勝利', ED.select(v, 'type', VICTORY, { rerender: true }), ...vParams),
        ...ED.formRow('敗北', ED.select(d, 'type', DEFEAT, { rerender: true }), ...dParams),
        ...ED.formRow('霧戰', ED.check(ch, 'fog', '只看得到我方視野內的敵人')),
        ...ED.formRow('出擊準備', ED.check(ch, 'prep', '戰前可選人、整備、購物'))),
      ch.prep ? h('div', {}, h('h3', {}, '商店商品'), h('div.chips', {}, ...ED.keys('items').concat(ED.keys('weapons')).map((id) => {
        const d = ED.c.items[id] || ED.c.weapons[id];
        const on = (ch.shop || []).includes(id);
        return h('span.chip', { className: 'chip' + (on ? ' on' : ''), onclick: () => { ch.shop = on ? ch.shop.filter((x) => x !== id) : (ch.shop || []).concat(id); if (!ch.shop.length) delete ch.shop; ED.dirty(true); } },
          d.icon != null ? h('span', { style: SRPG.sprites.iconStyle(d.icon, 18) }) : null, d.name || id);
      }))) : null,
      h('h2', {}, '事件'),
      ...evRows,
      h('button', { onclick: () => { ch.events.push({ on: 'start' }); ED.dirty(true); } }, '＋ 新增事件'),
      h('h2', {}, '下一章（由上往下第一個符合的條件）'),
      ...nextRows,
      h('button', { onclick: () => { ch.next.push({ chapter: Object.keys(ED.c.chapters)[0] }); ED.dirty(true); } }, '＋ 新增分歧'),
      h('p.hint', {}, '沒有任何下一章＝遊戲結局。旗標由劇本中的「選項」或「設定旗標」指令設定。'));
  }

  ED.mapTool = tool;
})();
