/* 編輯器共用：狀態、DOM 小工具、表單欄位、ID 改名（同步更新所有引用）、自動暫存 */
(function () {
  'use strict';
  const C = SRPG.campaign;
  const WORK_KEY = 'srpg_editor_work';

  const ED = window.ED = {
    c: null,              // 編輯中的劇本
    tab: 'meta',
    sel: {},              // 各分頁目前選中的 id
    tabs: {},             // 各分頁 render 函式
  };

  /* ---------- DOM ---------- */
  // h('div.cls', {attrs/on*}, ...children)
  ED.h = function (tag, attrs, ...kids) {
    const [t, ...cls] = tag.split('.');
    const el = document.createElement(t || 'div');
    if (cls.length) el.className = cls.join(' ');
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  };
  const h = ED.h;

  ED.toast = (m, ms) => SRPG.UI.toast(m, ms);
  ED.status = (m) => { document.getElementById('status').textContent = m; };

  /* ---------- 表單欄位（直接綁定到物件屬性） ---------- */
  // 會觸發重繪的欄位改用 change 事件（避免打字時失去焦點）
  const ev = (opts) => (opts && opts.rerender ? 'onchange' : 'oninput');
  ED.text = (obj, key, opts) => h('input', Object.assign({ type: 'text', value: obj[key] == null ? '' : obj[key], [ev(opts)]: (e) => { if (e.target.value === '' && opts && opts.optional) delete obj[key]; else obj[key] = e.target.value; ED.dirty(opts && opts.rerender); } }, opts && opts.attrs));
  ED.area = (obj, key, rows) => h('textarea', { rows: rows || 2, value: obj[key] || '', oninput: (e) => { obj[key] = e.target.value; ED.dirty(); } });
  ED.num = (obj, key, opts) => h('input', Object.assign({ type: 'number', value: obj[key] == null ? '' : obj[key], [ev(opts)]: (e) => { const v = e.target.value; if (v === '') delete obj[key]; else obj[key] = Number(v); ED.dirty(opts && opts.rerender); } }, opts && opts.attrs));
  ED.check = (obj, key, label) => h('label', {}, h('input', { type: 'checkbox', checked: !!obj[key], onchange: (e) => { if (e.target.checked) obj[key] = true; else delete obj[key]; ED.dirty(); } }), ' ' + (label || ''));
  ED.color = (obj, key) => h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(obj[key] || '') ? obj[key] : '#888888', oninput: (e) => { obj[key] = e.target.value; ED.dirty(); } });
  // 下拉選單：choices = [[value,label]...] 或 物件 key 清單
  ED.select = (obj, key, choices, opts) => {
    opts = opts || {};
    const s = h('select', { onchange: (e) => { const v = e.target.value; if (v === '' && opts.optional) delete obj[key]; else obj[key] = opts.number ? Number(v) : v; ED.dirty(opts.rerender); if (opts.onchange) opts.onchange(v); } });
    if (opts.optional) s.append(h('option', { value: '' }, opts.optionalLabel || '（無）'));
    for (const ch of choices) { const [v, l] = Array.isArray(ch) ? ch : [ch, ch]; s.append(h('option', { value: v, selected: String(obj[key]) === String(v) }, l)); }
    return s;
  };
  ED.keys = (group) => Object.keys(ED.c[group] || {});
  ED.named = (group) => ED.keys(group).map((k) => [k, `${k}${ED.c[group][k].name ? '（' + ED.c[group][k].name + '）' : ''}`]);
  ED.formRow = (label, ...input) => [h('label', {}, label), h('div.row', {}, ...input)];

  /* ---------- 資料清單側欄 ---------- */
  ED.listPanel = function (group, opts) {
    opts = opts || {};
    const wrap = h('div');
    const list = h('div.list');
    const ids = Object.keys(ED.c[group]);
    for (const id of ids) {
      const it = ED.c[group][id];
      list.append(h('button', { className: ED.sel[group] === id ? 'on' : '', onclick: () => { ED.sel[group] = id; ED.render(); } },
        h('span', {}, it && it.name ? it.name : id), h('small', {}, id)));
    }
    wrap.append(list, h('div.row', {},
      h('button', { onclick: () => {
        const id = ED.newId(group, opts.prefix || group.slice(0, -1));
        ED.c[group][id] = opts.make ? opts.make(id) : { name: id };
        ED.sel[group] = id; ED.dirty(true);
      } }, '＋ 新增'),
      h('button', { disabled: !ED.sel[group], onclick: () => {
        const id = ED.sel[group];
        if (!id) return;
        const copy = ED.newId(group, id + '_copy');
        ED.c[group][copy] = SRPG.util.clone(ED.c[group][id]);
        ED.sel[group] = copy; ED.dirty(true);
      } }, '⧉ 複製'),
      h('button.danger', { disabled: !ED.sel[group], onclick: () => {
        const id = ED.sel[group];
        if (!id || !confirm(`刪除 ${id}？（引用它的地方需要自行修正）`)) return;
        delete ED.c[group][id]; ED.sel[group] = Object.keys(ED.c[group])[0]; ED.dirty(true);
      } }, '🗑 刪除')));
    return wrap;
  };

  ED.newId = function (group, base) {
    base = String(base).replace(/[^\w]/g, '_') || 'item';
    let id = base, n = 1;
    while (ED.c[group][id]) id = base + '_' + (++n);
    return id;
  };

  // 改 ID 並更新所有引用
  ED.idField = function (group) {
    const old = ED.sel[group];
    return h('input', { type: 'text', value: old, onchange: (e) => {
      const nid = e.target.value.trim().replace(/[^\w]/g, '_');
      if (!nid || nid === old) return;
      if (ED.c[group][nid]) { ED.toast('ID 已存在'); e.target.value = old; return; }
      ED.renameRef(group, old, nid);
      ED.sel[group] = nid; ED.dirty(true);
    } });
  };

  ED.renameRef = function (group, a, b) {
    const c = ED.c;
    const obj = c[group];
    const ordered = {};
    for (const k of Object.keys(obj)) ordered[k === a ? b : k] = obj[k];
    c[group] = ordered;
    const swap = (o, k) => { if (o && o[k] === a) o[k] = b; };
    const eachScriptCmd = (fn) => { for (const s of Object.values(c.scripts)) for (const cmd of s) fn(cmd); };
    const eachChapter = (fn) => { for (const ch of Object.values(c.chapters)) fn(ch); };
    switch (group) {
      case 'units':
        eachChapter((ch) => {
          (ch.units || []).forEach((p) => swap(p, 'unit'));
          (ch.events || []).forEach((ev) => { swap(ev, 'unit'); swap(ev, 'a'); swap(ev, 'b'); });
          swap(ch.defeat, 'unit');
        });
        eachScriptCmd((cmd) => { swap(cmd, 'who'); swap(cmd, 'unit'); (cmd.units || []).forEach((p) => swap(p, 'unit')); });
        break;
      case 'classes': for (const u of Object.values(c.units)) swap(u, 'class'); break;
      case 'weapons':
        for (const u of Object.values(c.units)) u.weapons = (u.weapons || []).map((w) => (w === a ? b : w));
        eachScriptCmd((cmd) => swap(cmd, 'weapon'));
        break;
      case 'sprites': for (const g of ['classes', 'units', 'terrains']) for (const x of Object.values(c[g])) swap(x, 'sprite'); break;
      case 'portraits': for (const u of Object.values(c.units)) swap(u, 'portrait'); eachScriptCmd((cmd) => swap(cmd, 'portrait')); break;
      case 'scripts': eachChapter((ch) => (ch.events || []).forEach((ev) => swap(ev, 'script'))); break;
      case 'chapters':
        swap(c.meta, 'start');
        eachChapter((ch) => { ch.next = [].concat(ch.next || []).map((n) => (n === a ? b : (n && n.chapter === a ? Object.assign(n, { chapter: b }) : n))); });
        break;
      case 'terrains': break; // 地形以字元繪製，key 改名需同步 legend
    }
    SRPG.sprites.tag(c);
  };

  /* ---------- 存取 ---------- */
  let saveT = null;
  ED.dirty = function (rerender) {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try { localStorage.setItem(WORK_KEY, JSON.stringify(ED.c)); ED.status(`${ED.c.meta.title} · 已自動暫存 ${new Date().toLocaleTimeString()}`); }
      catch (e) { ED.status('⚠ 自動暫存失敗（容量不足？請匯出 JSON）'); }
    }, 400);
    if (rerender) ED.render();
  };

  ED.load = function (raw, label) {
    ED.c = C.normalize(raw);
    SRPG.sprites.tag(ED.c);
    ED.sel = {};
    ED.status(`${ED.c.meta.title} · ${label || ''}`);
    ED.dirty(true);
  };

  ED.loadWork = function () {
    try { const s = localStorage.getItem(WORK_KEY); if (s) { ED.load(JSON.parse(s), '已還原上次的編輯'); return true; } } catch (e) { /* 忽略 */ }
    return false;
  };

  ED.download = function (name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };

  ED.readFile = function (input, asDataURL) {
    return new Promise((resolve, reject) => {
      input.onchange = () => {
        const f = input.files[0]; input.value = '';
        if (!f) return;
        const r = new FileReader();
        r.onload = () => resolve({ name: f.name, data: r.result });
        r.onerror = reject;
        if (asDataURL) r.readAsDataURL(f); else r.readAsText(f);
      };
      input.click();
    });
  };

  ED.loadImage = (src) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });

  /* ---------- 對話框 ---------- */
  ED.modal = function (title, body, buttons) {
    const m = document.getElementById('modal');
    const b = document.getElementById('modalBody');
    b.innerHTML = '';
    b.append(h('h2', {}, title), body, h('div.row', { style: { justifyContent: 'flex-end', marginTop: '10px' } },
      ...(buttons || []).map((bt) => h('button', { className: bt.primary ? 'primary' : '', onclick: () => { if (bt.onclick() !== false) ED.closeModal(); } }, bt.label)),
      h('button', { onclick: ED.closeModal }, '關閉')));
    m.classList.add('show');
  };
  ED.closeModal = () => document.getElementById('modal').classList.remove('show');
})();
