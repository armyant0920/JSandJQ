/* DOM UI：對話框、選項、浮動選單、橫幅、戰鬥預測、資訊卡、升級視窗
   所有互動都回傳 Promise，方便 game.js 以 async/await 串接流程。
   鍵盤：UI.onKey(e) 回傳 true 表示 UI 已處理 */
(function (root) {
  'use strict';
  const SRPG = root.SRPG = root.SRPG || {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let keyHandler = null; // 目前攔截鍵盤的 UI 元件
  const UI = { sleep, esc };

  UI.onKey = function (e) { return keyHandler ? keyHandler(e) !== false : false; };
  UI.busy = () => !!keyHandler;

  /* ---------- 對話 ---------- */
  UI.say = function (step, campaign) {
    const dlg = $('dialog');
    const pc = dlg.querySelector('.portrait');
    const pctx = pc.getContext('2d');
    const textEl = dlg.querySelector('.text');
    dlg.querySelector('.name').textContent = step.name || '';
    dlg.querySelector('.name').style.display = step.name ? '' : 'none';
    dlg.className = 'show' + (step.side === 'right' ? ' right' : '') + (step.side === 'center' ? ' center' : '');
    const hasPortrait = step.side !== 'center' && (step.who || step.name);
    if (!hasPortrait) dlg.classList.add('noportrait');
    else {
      pctx.clearRect(0, 0, pc.width, pc.height);
      const sp = step.portrait && campaign.portraits[step.portrait];
      const unitDef = step.who && campaign.units[step.who];
      let drawn = false;
      if (sp) drawn = SRPG.sprites.draw(pctx, sp, 0, 'player', 0, 0, pc.width, pc.height);
      if (!drawn && unitDef) {
        // 沒有頭像就用放大的行走圖
        pctx.fillStyle = '#1a2036'; pctx.fillRect(0, 0, pc.width, pc.height);
        const s = SRPG.renderer.spriteFor(campaign, { id: step.who });
        drawn = s && SRPG.sprites.draw(pctx, s, 0, 'player', 8, 8, pc.width - 16, pc.height - 16);
      }
      if (!drawn) SRPG.sprites.fallbackPortrait(pctx, step.name, 'player', 0, 0, pc.width);
    }
    const full = step.text || '';
    let i = 0, done = false, timer = null;
    textEl.textContent = '';
    return new Promise((resolve) => {
      const finishTyping = () => { done = true; clearInterval(timer); textEl.textContent = full; };
      timer = setInterval(() => { i += 1; textEl.textContent = full.slice(0, i); if (i >= full.length) finishTyping(); }, 28);
      const advance = () => {
        if (!done) { finishTyping(); return; }
        dlg.onclick = null; keyHandler = null;
        resolve();
      };
      dlg.onclick = advance;
      keyHandler = (e) => { if (['Enter', ' ', 'z', 'Z'].includes(e.key)) { advance(); } return true; };
    });
  };

  UI.hideDialog = function () { $('dialog').className = ''; };

  UI.choice = function (step) {
    const box = $('choices');
    box.innerHTML = (step.prompt ? `<div class="prompt">${esc(step.prompt)}</div>` : '') +
      step.options.map((o, i) => `<button class="btn" data-i="${i}">${i + 1}. ${esc(o)}</button>`).join('');
    box.className = 'show';
    return new Promise((resolve) => {
      const btns = [...box.querySelectorAll('button')];
      let f = 0;
      const focus = () => btns.forEach((b, i) => b.classList.toggle('focus', i === f));
      focus();
      const pick = (i) => { box.className = ''; keyHandler = null; resolve(i); };
      btns.forEach((b) => (b.onclick = (e) => { e.stopPropagation(); pick(+b.dataset.i); }));
      keyHandler = (e) => {
        if (e.key === 'ArrowDown') { f = (f + 1) % btns.length; focus(); }
        else if (e.key === 'ArrowUp') { f = (f - 1 + btns.length) % btns.length; focus(); }
        else if (['Enter', 'z', 'Z', ' '].includes(e.key)) pick(f);
        else if (/^[1-9]$/.test(e.key) && +e.key <= btns.length) pick(+e.key - 1);
        return true;
      };
    });
  };

  /* ---------- 浮動選單：items=[{id,name,disabled?}]，回傳 id 或 null ---------- */
  UI.menu = function (items, px, py) {
    const layer = $('menuLayer');
    layer.innerHTML = '';
    const m = document.createElement('div');
    m.className = 'menu';
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = it.name; b.disabled = !!it.disabled; b.dataset.i = i;
      m.appendChild(b);
    });
    layer.appendChild(m);
    const app = $('app').getBoundingClientRect();
    const mw = 140, mh = items.length * 36 + 12;
    m.style.left = Math.max(4, Math.min(app.width - mw - 4, px)) + 'px';
    m.style.top = Math.max(44, Math.min(app.height - mh - 4, py)) + 'px';
    return new Promise((resolve) => {
      const btns = [...m.querySelectorAll('button')];
      let f = btns.findIndex((b) => !b.disabled);
      const focus = () => btns.forEach((b, i) => b.classList.toggle('focus', i === f));
      focus();
      const done = (v) => { layer.innerHTML = ''; keyHandler = null; document.removeEventListener('mousedown', outside, true); resolve(v); };
      const outside = (e) => { if (!m.contains(e.target)) { e.stopPropagation(); e.preventDefault(); done(null); } };
      setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
      btns.forEach((b, i) => (b.onclick = () => done(items[i].id)));
      keyHandler = (e) => {
        const step = (d) => { do { f = (f + d + btns.length) % btns.length; } while (btns[f].disabled); focus(); };
        if (e.key === 'ArrowDown') step(1);
        else if (e.key === 'ArrowUp') step(-1);
        else if (['Enter', 'z', 'Z', ' '].includes(e.key)) { if (f >= 0) done(items[f].id); }
        else if (['Escape', 'x', 'X'].includes(e.key)) done(null);
        return true;
      };
    });
  };
  UI.closeMenu = () => { $('menuLayer').innerHTML = ''; keyHandler = null; };

  /* ---------- 橫幅 ---------- */
  UI.banner = async function (text, sub, color, ms) {
    const b = $('banner');
    b.innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : '');
    b.style.color = color || '#fff';
    b.classList.add('show');
    await sleep(ms || 1100);
    b.classList.remove('show');
    await sleep(250);
  };

  UI.toast = function (msg, ms) {
    const t = $('toast');
    t.textContent = msg; t.className = 'show';
    clearTimeout(UI._toastT);
    UI._toastT = setTimeout(() => (t.className = ''), ms || 1800);
  };

  /* ---------- 資訊卡 ---------- */
  function statsHtml(u, ups) {
    const N = SRPG.campaign.STAT_NAMES;
    return '<div class="stats">' + SRPG.campaign.STAT_KEYS.filter((k) => k !== 'hp').map((k) =>
      `<span class="${ups && ups[k] ? 'up' : ''}"><b>${N[k]}</b>${u.stats[k]}${ups && ups[k] ? '+' + ups[k] : ''}</span>`).join('') + '</div>';
  }

  UI.unitCard = function (u, b) {
    const el = $('unitCard');
    if (!u) { el.hidden = true; return; }
    const w = SRPG.rules.weaponOf(b, u);
    const ratio = Math.max(0, u.hp / u.stats.hp) * 100;
    el.hidden = false;
    el.innerHTML = `<h3 class="team-${u.team}">${esc(u.name)}${u.boss ? ' ★' : ''}</h3>
      <div class="row"><span>${esc(u.className)} Lv${u.level}</span><span>EXP ${u.exp}</span></div>
      <div class="row"><span>HP ${u.hp}/${u.stats.hp}</span><span>移動 ${u.move}</span></div>
      <div class="hpbar"><i style="width:${ratio}%"></i></div>
      <div>武器：${w ? esc(w.name || w.id) + ` (威${w.mt || 0} 命${w.hit || 0} 射${(w.range || [1, 1]).join('-')})` : '—'}</div>
      ${statsHtml(u)}`;
  };

  UI.terrainCard = function (t) {
    const el = $('terrainCard');
    if (!t) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<div class="row"><b>${esc(t.name)}</b><span>防+${t.def || 0} 迴避+${t.avo || 0}${t.heal ? ' 回復' + t.heal + '%' : ''}</span></div>`;
  };

  /* ---------- 戰鬥預測：回傳 true(攻擊)/false(取消) ---------- */
  UI.forecast = function (fc, att, def) {
    const el = $('forecast');
    const side = (s) => s ? { dmg: s.dmg + (s.count > 1 ? ' <span class="x2">×2</span>' : ''), hit: s.hit, crit: s.crit, wpn: esc(s.weapon), tri: s.tri } : { dmg: '—', hit: '—', crit: '—', wpn: '無法反擊', tri: 0 };
    const a = side(fc.att), d = side(fc.def);
    const arrow = (t) => (t > 0 ? ' <span style="color:#5ae07a">▲</span>' : t < 0 ? ' <span style="color:#ff6464">▼</span>' : '');
    el.hidden = false;
    el.innerHTML = `<table>
      <tr><th></th><th class="team-${att.team}">${esc(att.name)}</th><th class="team-${def.team}">${esc(def.name)}</th></tr>
      <tr><th>武器</th><td>${a.wpn}${arrow(a.tri)}</td><td>${d.wpn}${arrow(d.tri)}</td></tr>
      <tr><th>HP</th><td>${att.hp}</td><td>${def.hp}</td></tr>
      <tr><th>傷害</th><td>${a.dmg}</td><td>${d.dmg}</td></tr>
      <tr><th>命中</th><td>${a.hit}</td><td>${d.hit}</td></tr>
      <tr><th>必殺</th><td>${a.crit}</td><td>${d.crit}</td></tr></table>
      <div class="actions"><button class="btn" data-v="0">取消</button><button class="btn primary" data-v="1">攻擊！</button></div>`;
    return new Promise((resolve) => {
      const done = (v) => { el.hidden = true; keyHandler = null; resolve(v); };
      el.querySelectorAll('button').forEach((b) => (b.onclick = () => done(b.dataset.v === '1')));
      UI._forecastDone = done;
      keyHandler = (e) => {
        if (['Enter', 'z', 'Z', ' '].includes(e.key)) done(true);
        else if (['Escape', 'x', 'X'].includes(e.key)) done(false);
        return true;
      };
    });
  };

  UI.levelUp = function (u, gains) {
    const el = $('levelup');
    el.innerHTML = `<h3>LEVEL UP！</h3><div class="row"><b class="team-${u.team}">${esc(u.name)}</b><span>Lv ${u.level}</span></div>
      <div class="row"><span>HP ${u.stats.hp}${gains.hp ? ' <b style="color:var(--accent)">+' + gains.hp + '</b>' : ''}</span></div>${statsHtml(u, gains)}`;
    el.className = 'card show';
    return new Promise((resolve) => {
      const done = () => { el.className = 'card'; el.onclick = null; keyHandler = null; resolve(); };
      el.onclick = done;
      const t = setTimeout(done, 2500);
      keyHandler = (e) => { if (['Enter', 'z', 'Z', ' ', 'Escape'].includes(e.key)) { clearTimeout(t); done(); } return true; };
    });
  };

  UI.screen = function (id, show) { $(id).classList.toggle('show', show !== false); };

  SRPG.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
