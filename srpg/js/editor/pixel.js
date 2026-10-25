/* 精靈圖分頁：ASCII 像素編輯器（單位/地形圖塊/頭像）、匯入 PNG（縮放+去背+減色）、RPG Maker 行走圖
   ASCII 格式讓 AI 能直接讀寫，是「AI 協助繪圖」的核心 */
(function () {
  'use strict';
  const { h } = ED;
  const SP = SRPG.sprites;
  const CHARS = 'abcdefghijklmnopqrsuvwxyzABCDEFGHIJKLMNOPQRSUVWXYZ0123456789@$%&*+=?!<>^~:;'.split('');
  const TEAM_KEYS = [['team', '隊伍色'], ['teamDark', '隊伍色(暗)'], ['teamLight', '隊伍色(亮)']];

  const st = { group: 'sprites', frame: 0, tool: 'pen', color: null, onion: true, previewTeam: 'player', tol: 40, importSize: 0 };

  function current() {
    const g = ED.c[st.group];
    let id = ED.sel[st.group];
    if (!id || !g[id]) id = ED.sel[st.group] = Object.keys(g)[0];
    return id ? { id, sp: g[id] } : null;
  }

  function blank(w, hh) { const rows = []; for (let y = 0; y < hh; y++) rows.push('.'.repeat(w)); return rows; }

  function newSprite() {
    const portrait = st.group === 'portraits';
    const w = portrait ? 32 : 16;
    return { name: '', w, h: w, palette: { o: '#1c1c28', s: '#f2c79a', T: 'team', t: 'teamDark' }, frames: [blank(w, w)] };
  }

  function setPx(sp, f, x, y, ch) {
    const rows = sp.frames[f];
    if (!rows || y < 0 || y >= sp.h || x < 0 || x >= sp.w) return false;
    const r = (rows[y] || '').padEnd(sp.w, '.');
    if (r[x] === ch) return false;
    rows[y] = r.slice(0, x) + ch + r.slice(x + 1);
    return true;
  }
  const getPx = (sp, f, x, y) => ((sp.frames[f] || [])[y] || '')[x] || '.';

  function flood(sp, f, x, y, ch) {
    const target = getPx(sp, f, x, y);
    if (target === ch) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= sp.w || cy >= sp.h || getPx(sp, f, cx, cy) !== target) continue;
      setPx(sp, f, cx, cy, ch);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  function resizeSprite(sp, w, hh) {
    sp.frames = sp.frames.map((rows) => { const out = []; for (let y = 0; y < hh; y++) out.push(((rows[y] || '') + '.'.repeat(w)).slice(0, w)); return out; });
    sp.w = w; sp.h = hh;
  }

  /* ---------- 色彩工具 ---------- */
  const hex2rgb = (hx) => { const n = parseInt(hx.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  const cdist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

  function freeChar(pal) { return CHARS.find((c) => !(c in pal)); }

  // 由 RGBA 像素陣列轉成 ASCII（重用/新增 palette，最多 maxColors 色）
  function pixelsToGrid(sp, data, w, hh, maxColors) {
    const pal = sp.palette;
    const fixed = Object.entries(pal).filter(([, c]) => /^#/.test(c)).map(([k, c]) => [k, hex2rgb(c)]);
    // 先統計顏色，粗量化（每通道 16 階）
    const counts = new Map();
    for (let i = 0; i < w * hh; i++) {
      if (data[i * 4 + 3] < 128) continue;
      const q = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]].map((v) => Math.min(255, Math.round(v / 17) * 17));
      const k = q.join(',');
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    // 依出現次數挑代表色
    const reps = [];
    for (const [k] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      const c = k.split(',').map(Number);
      if (fixed.some(([, f]) => cdist(f, c) < 30) || reps.some((r) => cdist(r, c) < 40)) continue;
      if (reps.length + fixed.length >= maxColors) break;
      reps.push(c);
    }
    for (const c of reps) { const ch = freeChar(pal); if (!ch) break; pal[ch] = rgb2hex(...c); fixed.push([ch, c]); }
    const rows = [];
    for (let y = 0; y < hh; y++) {
      let r = '';
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i + 3] < 128) { r += '.'; continue; }
        const c = [data[i], data[i + 1], data[i + 2]];
        let best = '.', bd = Infinity;
        for (const [k, f] of fixed) { const d = cdist(f, c); if (d < bd) { bd = d; best = k; } }
        r += best;
      }
      rows.push(r);
    }
    return rows;
  }

  // 邊角洪水填充去背（參考 HOMEGUARD 編輯器）
  function removeBackground(data, w, hh, tol) {
    const seen = new Uint8Array(w * hh);
    const stack = [];
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, hh - 1], [w - 1, hh - 1]]) stack.push([x, y, (y * w + x) * 4]);
    while (stack.length) {
      const [x, y, ref] = stack.pop();
      if (x < 0 || y < 0 || x >= w || y >= hh) continue;
      const idx = y * w + x;
      if (seen[idx]) continue;
      const i = idx * 4;
      if (Math.abs(data[i] - data[ref]) + Math.abs(data[i + 1] - data[ref + 1]) + Math.abs(data[i + 2] - data[ref + 2]) > tol && data[i + 3] > 0) continue;
      seen[idx] = 1; data[i + 3] = 0;
      stack.push([x + 1, y, ref], [x - 1, y, ref], [x, y + 1, ref], [x, y - 1, ref]);
    }
  }

  async function importPng(sp) {
    const f = await ED.readFile(document.getElementById('fileImg'), true);
    const img = await ED.loadImage(f.data);
    const w = sp.w, hh = sp.h;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = hh;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = img.width > w * 2; // 大圖縮小時平滑，小圖用最近鄰
    const k = Math.min(w / img.width, hh / img.height);
    const dw = Math.max(1, Math.round(img.width * k)), dh = Math.max(1, Math.round(img.height * k));
    ctx.drawImage(img, Math.floor((w - dw) / 2), hh - dh, dw, dh);
    const id = ctx.getImageData(0, 0, w, hh);
    if (st.tol > 0) removeBackground(id.data, w, hh, st.tol);
    sp.frames[st.frame] = pixelsToGrid(sp, id.data, w, hh, 40);
    SP.invalidate(sp); ED.dirty(true);
    ED.toast('已匯入到第 ' + (st.frame + 1) + ' 格（' + Object.keys(sp.palette).length + ' 色）');
  }

  async function importSheet() {
    const f = await ED.readFile(document.getElementById('fileImg'), true);
    const img = await ED.loadImage(f.data);
    const sid = ED.newId(st.group, f.name.replace(/\.\w+$/, ''));
    ED.c[st.group][sid] = { name: f.name, image: f.data, sheet: 'rpgmaker', index: 0, frameW: Math.floor(img.width / 12), frameH: Math.floor(img.height / 8) };
    SP.tag(ED.c);
    ED.sel[st.group] = sid; ED.dirty(true);
    ED.toast('已加入圖片精靈（RPG Maker 3×4 規格），可在右側選角色編號');
  }

  /* ---------- 畫面 ---------- */
  ED.tabs.sprites = function () {
    const groupBtn = (g, l) => h('button', { className: st.group === g ? 'on' : '', onclick: () => { st.group = g; st.frame = 0; ED.render(); } }, l);
    const left = h('div', {}, h('div.row', {}, groupBtn('sprites', '單位/圖塊'), groupBtn('portraits', '頭像')),
      ED.listPanel(st.group, { prefix: st.group === 'portraits' ? 'face' : 'sprite', make: newSprite }),
      h('div.row', {}, h('button', { onclick: importSheet, title: '匯入整張圖片當精靈（例如 RPG Maker 行走圖）' }, '🖼 匯入圖片精靈')),
      h('h3', {}, '內建角色圖（assets/characters.png）'),
      h('div.row', {}, ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const cv = h('canvas.px', { width: 36, height: 36, title: '加入角色 ' + i, style: { cursor: 'pointer' }, onclick: () => {
          const sid = ED.newId('sprites', 'chara_' + i);
          ED.c.sprites[sid] = { name: '角色 ' + i, image: 'assets/characters.png', sheet: 'rpgmaker', index: i, frameW: 36, frameH: 36 };
          SP.tag(ED.c); st.group = 'sprites'; ED.sel.sprites = sid; ED.dirty(true);
        } });
        const sp = { image: 'assets/characters.png', sheet: 'rpgmaker', index: i, frameW: 36, frameH: 36 };
        const paint = () => SP.draw(cv.getContext('2d'), sp, 1, 'player', 0, 0, 36, 36, 0);
        if (!paint()) setTimeout(paint, 200);
        return cv;
      })));
    const cur = current();
    if (!cur) return h('div.split', {}, left, h('p.hint', {}, '尚無資料，按「＋ 新增」'));
    const { id, sp } = cur;
    if (sp.image) return h('div.split', {}, left, imageSpritePanel(id, sp));
    sp.palette = sp.palette || {}; sp.frames = sp.frames && sp.frames.length ? sp.frames : [blank(sp.w || 16, sp.h || 16)];
    sp.w = sp.w || sp.frames[0][0].length; sp.h = sp.h || sp.frames[0].length;
    if (st.frame >= sp.frames.length) st.frame = 0;
    if (!st.color || !(st.color in sp.palette)) st.color = Object.keys(sp.palette)[0] || null;

    const cell = Math.max(6, Math.floor(448 / Math.max(sp.w, sp.h)));
    const cv = h('canvas.px', { width: sp.w * cell, height: sp.h * cell, style: { cursor: 'crosshair', touchAction: 'none' } });
    const prev = h('canvas.px', { width: 96, height: 96 });
    const draw = () => {
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (st.onion && st.frame > 0) { ctx.globalAlpha = 0.25; ctx.drawImage(SP.gridToCanvas(sp, sp.frames[st.frame - 1], st.previewTeam), 0, 0, cv.width, cv.height); ctx.globalAlpha = 1; }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(SP.gridToCanvas(sp, sp.frames[st.frame], st.previewTeam), 0, 0, cv.width, cv.height);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      for (let x = 0; x <= sp.w; x++) { ctx.beginPath(); ctx.moveTo(x * cell + 0.5, 0); ctx.lineTo(x * cell + 0.5, cv.height); ctx.stroke(); }
      for (let y = 0; y <= sp.h; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell + 0.5); ctx.lineTo(cv.width, y * cell + 0.5); ctx.stroke(); }
    };
    draw();
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / r.width * sp.w), y: Math.floor((e.clientY - r.top) / r.height * sp.h) }; };
    let down = false;
    const apply = (e, first) => {
      const p = pos(e);
      const erase = st.tool === 'eraser' || e.buttons === 2;
      if (st.tool === 'picker' && first) { st.color = getPx(sp, st.frame, p.x, p.y); if (st.color === '.') st.color = null; st.tool = 'pen'; ED.render(); return; }
      if (st.tool === 'fill' && first) { flood(sp, st.frame, p.x, p.y, erase ? '.' : (st.color || '.')); }
      else if (st.tool === 'pen' || st.tool === 'eraser') { if (!setPx(sp, st.frame, p.x, p.y, erase ? '.' : (st.color || '.'))) return; }
      else return;
      SP.invalidate(sp); draw(); ED.dirty();
    };
    cv.addEventListener('pointerdown', (e) => { down = true; cv.setPointerCapture(e.pointerId); apply(e, true); });
    cv.addEventListener('pointermove', (e) => { if (down) apply(e, false); });
    cv.addEventListener('pointerup', () => { down = false; refreshFrames(); });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    // 預覽動畫
    let pf = 0;
    const tick = () => {
      if (!prev.isConnected) return;
      const ctx = prev.getContext('2d'); ctx.clearRect(0, 0, 96, 96);
      SP.draw(ctx, sp, pf, st.previewTeam, 0, 0, 96, 96);
      pf = (pf + 1) % sp.frames.length;
      setTimeout(tick, 1000 / (sp.fps || 3));
    };
    setTimeout(tick, 0);

    const framesEl = h('div.frames');
    function refreshFrames() {
      framesEl.innerHTML = '';
      sp.frames.forEach((fr, i) => {
        const pz = poseOf(sp, i);
        const c = h('canvas.px.f', { width: 40, height: 40, className: 'px f' + (i === st.frame ? ' on' : ''), title: '影格 ' + (i + 1) + '（' + { idle: '待機', attack: '攻擊', hurt: '受擊' }[pz] + '）', style: pz === 'idle' ? '' : `outline:2px solid ${pz === 'attack' ? '#ff9a3a' : '#ff5a8a'}`, onclick: () => { st.frame = i; ED.render(); } });
        c.getContext('2d').imageSmoothingEnabled = false;
        c.getContext('2d').drawImage(SP.gridToCanvas(sp, fr, st.previewTeam), 0, 0, 40, 40);
        framesEl.append(c);
      });
    }
    refreshFrames();

    const toolBtn = (t, l) => h('button', { className: st.tool === t ? 'on' : '', onclick: () => { st.tool = t; ED.render(); } }, l);
    const size = { w: sp.w, h: sp.h };

    // 調色盤
    const palEl = h('div.pal', {}, h('div.sw', { className: 'sw' + (!st.color ? ' on' : ''), onclick: () => { st.color = null; ED.render(); } }, h('b', { style: { background: 'repeating-conic-gradient(#555 0% 25%,#222 0% 50%) 50%/8px 8px' } }), h('code', {}, '.'), '透明'),
      ...Object.entries(sp.palette).map(([ch, col]) => {
        const real = SP.TEAM_COLORS[st.previewTeam][col] || col;
        return h('div.sw', { className: 'sw' + (st.color === ch ? ' on' : ''), onclick: () => { st.color = ch; ED.render(); }, ondblclick: () => editColor(sp, ch) },
          h('b', { style: { background: real } }), h('code', {}, ch), h('small', {}, SP.TEAM_COLORS.player[col] ? '隊伍' : ''));
      }));

    return h('div.split3', {}, left,
      h('div', {},
        h('h2', {}, `${st.group === 'portraits' ? '頭像' : '精靈'}：${id}`),
        h('div.row', {}, toolBtn('pen', '✏ 畫筆'), toolBtn('eraser', '🧽 橡皮'), toolBtn('fill', '🪣 填滿'), toolBtn('picker', '💧 滴管'),
          h('label', {}, h('input', { type: 'checkbox', checked: st.onion, onchange: (e) => { st.onion = e.target.checked; ED.render(); } }), ' 洋蔥皮'),
          h('span.hint', {}, '右鍵＝擦除')),
        cv,
        h('h3', {}, '影格'), framesEl,
        h('div.row', {}, `第 ${st.frame + 1} 格的動作：`,
          ...[['idle', '待機'], ['attack', '攻擊'], ['hurt', '受擊']].map(([k, l]) => h('button', { className: poseOf(sp, st.frame) === k ? 'on' : '', onclick: () => { setPose(sp, st.frame, k); ED.dirty(true); } }, l)),
          h('span.hint', {}, '地圖上循環播放「待機」影格；戰鬥演出衝向對方時用「攻擊」、被打中時用「受擊」')),
        h('div.row', {},
          h('button', { onclick: () => { sp.frames.push(blank(sp.w, sp.h)); st.frame = sp.frames.length - 1; SP.invalidate(sp); ED.dirty(true); } }, '＋ 空白影格'),
          h('button', { onclick: () => { sp.frames.splice(st.frame + 1, 0, sp.frames[st.frame].slice()); shiftPoses(sp, st.frame + 1, 1); st.frame++; SP.invalidate(sp); ED.dirty(true); } }, '⧉ 複製影格'),
          h('button', { onclick: () => { sp.frames[st.frame] = sp.frames[st.frame].map((r) => r.split('').reverse().join('')); SP.invalidate(sp); ED.dirty(true); } }, '⇋ 左右翻轉'),
          h('button', { onclick: () => { const r = sp.frames[st.frame]; r.unshift(r.pop()); SP.invalidate(sp); ED.dirty(true); } }, '↓ 下移 1px'),
          h('button.danger', { disabled: sp.frames.length < 2, onclick: () => { sp.frames.splice(st.frame, 1); shiftPoses(sp, st.frame, -1); st.frame = Math.max(0, st.frame - 1); SP.invalidate(sp); ED.dirty(true); } }, '🗑 刪除影格'))),
      h('div', {},
        h('h2', {}, '預覽'), prev,
        h('div.row', {}, '隊伍色', ED.select(st, 'previewTeam', [['player', '我方'], ['enemy', '敵方'], ['ally', '友軍']], { rerender: true })),
        h('div.form', { style: { gridTemplateColumns: '60px 1fr' } },
          ...ED.formRow('ID', ED.idField(st.group)),
          ...ED.formRow('名稱', ED.text(sp, 'name')),
          ...ED.formRow('說明', ED.area(sp, 'desc', 2)),
          ...ED.formRow('FPS', ED.num(sp, 'fps', { attrs: { placeholder: '3' } })),
          ...ED.formRow('尺寸', h('input', { type: 'number', value: sp.w, onchange: (e) => (size.w = +e.target.value) }), '×', h('input', { type: 'number', value: sp.h, onchange: (e) => (size.h = +e.target.value) }),
            h('button', { onclick: () => { resizeSprite(sp, size.w, size.h); SP.invalidate(sp); ED.dirty(true); } }, '套用'))),
        h('p.hint', {}, '「說明」會一起放進 AI 協作包，寫下想要的外觀，AI 會依此作畫。'),
        h('h2', {}, '調色盤'), palEl,
        h('div.row', {}, h('button', { onclick: () => { const ch = freeChar(sp.palette); if (!ch) return ED.toast('字元用完了'); sp.palette[ch] = '#ffffff'; st.color = ch; SP.invalidate(sp); ED.dirty(true); editColor(sp, ch); } }, '＋ 顏色'),
          h('button', { disabled: !st.color, onclick: () => editColor(sp, st.color) }, '✎ 編輯選取色')),
        h('p.hint', {}, '雙擊色塊可編輯。「隊伍色」會依我方/敵方/友軍自動換色。'),
        h('h2', {}, '匯入圖片到目前影格'),
        h('div.row', {}, '去背容差', h('input', { type: 'range', min: 0, max: 150, value: st.tol, oninput: (e) => (st.tol = +e.target.value) })),
        h('button', { onclick: () => importPng(sp).catch((e) => ED.toast('匯入失敗：' + e.message)) }, '📥 匯入 PNG/JPG'),
        h('p.hint', {}, '會縮放到目前尺寸、以四角顏色去背、自動減色加入調色盤。')));
  };

  /* 動作標記：sp.poses = { attack:[i], hurt:[i] }（idle 為其餘影格） */
  function poseOf(sp, i) {
    const P = sp.poses || {};
    if ((P.attack || []).includes(i)) return 'attack';
    if ((P.hurt || []).includes(i)) return 'hurt';
    return 'idle';
  }
  function setPose(sp, i, pose) {
    const P = sp.poses = sp.poses || {};
    for (const k of ['attack', 'hurt']) { P[k] = (P[k] || []).filter((x) => x !== i); if (!P[k].length) delete P[k]; }
    delete P.idle;
    if (pose !== 'idle') (P[pose] = P[pose] || []).push(i);
    if (!Object.keys(P).length) delete sp.poses;
  }
  // 插入/刪除影格時同步調整動作標記
  function shiftPoses(sp, at, d) {
    if (!sp.poses) return;
    for (const k of Object.keys(sp.poses)) {
      sp.poses[k] = sp.poses[k].filter((i) => !(d < 0 && i === at)).map((i) => (i >= at ? i + d : i));
      if (!sp.poses[k].length) delete sp.poses[k];
    }
  }

  function editColor(sp, ch) {
    const val = sp.palette[ch];
    const isTeam = !!SP.TEAM_COLORS.player[val];
    const state = { ch, mode: isTeam ? val : 'custom', color: isTeam ? '#ffffff' : val };
    const body = h('div.form', {},
      ...ED.formRow('字元', h('input', { type: 'text', maxLength: 1, value: ch, style: { width: '40px' }, oninput: (e) => (state.ch = e.target.value) })),
      ...ED.formRow('類型', ED.select(state, 'mode', [['custom', '固定顏色']].concat(TEAM_KEYS))),
      ...ED.formRow('顏色', ED.color(state, 'color')));
    ED.modal('編輯顏色', body, [
      { label: '刪除此色', onclick: () => { delete sp.palette[ch]; sp.frames = sp.frames.map((r) => r.map((row) => row.split(ch).join('.'))); SP.invalidate(sp); ED.dirty(true); } },
      { label: '確定', primary: true, onclick: () => {
        const nc = state.ch;
        if (!nc || nc === '.' || (nc !== ch && nc in sp.palette)) { ED.toast('字元無效或已使用'); return false; }
        delete sp.palette[ch];
        sp.palette[nc] = state.mode === 'custom' ? state.color : state.mode;
        if (nc !== ch) sp.frames = sp.frames.map((r) => r.map((row) => row.split(ch).join(nc)));
        st.color = nc; SP.invalidate(sp); ED.dirty(true);
      } },
    ]);
  }

  function imageSpritePanel(id, sp) {
    const prev = h('canvas.px', { width: 128, height: 128 });
    const big = h('canvas.px', { width: 1, height: 1, style: { maxWidth: '100%' } });
    const paint = () => {
      const ctx = prev.getContext('2d'); ctx.clearRect(0, 0, 128, 128);
      SP.draw(ctx, sp, 1, 'player', 0, 0, 128, 128, 0);
      const rec = SP.loadImage(sp.image);
      if (rec.ready) { big.width = rec.img.width; big.height = rec.img.height; big.getContext('2d').drawImage(rec.img, 0, 0); }
    };
    SP.onload = paint; setTimeout(paint, 50);
    return h('div', {},
      h('h2', {}, '圖片精靈：' + id), h('div.row', {}, prev),
      h('div.form', {},
        ...ED.formRow('ID', ED.idField(st.group)),
        ...ED.formRow('名稱', ED.text(sp, 'name')),
        ...ED.formRow('格式', ED.select(sp, 'sheet', [['rpgmaker', 'RPG Maker 行走圖（3×4 動作、8 角色）'], ['', '單張 / 自訂格']], { rerender: true })),
        ...ED.formRow('角色編號', ED.num(sp, 'index', { rerender: true, attrs: { min: 0, max: 7 } }), h('span.hint', {}, '0~3 上排、4~7 下排')),
        ...ED.formRow('格寬/格高', ED.num(sp, 'frameW', { rerender: true }), ED.num(sp, 'frameH', { rerender: true }))),
      h('p.hint', {}, '⚠ 圖片會以 dataURL 存入劇本檔，檔案會變大。若要讓 AI 修改，建議改用「新增」的 ASCII 精靈並用「匯入 PNG」轉換。'),
      h('p.hint', {}, '⚠ 請確認素材授權（例如本專案 images/role.png 來源不明，僅適合本機測試）。'),
      big);
  }

  ED.pixel = { pixelsToGrid, removeBackground, state: st };
})();
