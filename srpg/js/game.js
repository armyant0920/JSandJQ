/* 遊戲控制器：流程（標題 → 章節 → 回合 → 結算 → 下一章）、輸入、動畫、存讀檔 */
(function () {
  'use strict';
  const { campaign: C, rules: R, battle: B, ai: AI, script: S, save: SV, util: U, renderer: RD, sprites: SP, UI } = SRPG;
  const $ = (id) => document.getElementById(id);
  const TS = RD.TS;
  const CUSTOM_KEY = 'srpg_campaign_custom';
  const PLAYTEST_KEY = 'srpg_campaign_playtest';

  const canvas = $('map');
  const ctx = canvas.getContext('2d');
  const store = SV.createStore();

  const G = {
    campaign: null, source: 'demo', chapter: null, roster: {}, flags: {}, battle: null,
    chapterStart: null,           // 章節開始時的名冊/旗標（重來用）
    mode: 'title',                // title | idle | move | action | target | busy
    sel: null, reach: null, threat: null, path: null, targets: null,
    view: null,                   // 檢視中的敵方範圍
    dangerAll: false,
    cursor: { x: 0, y: 0 }, fx: [], anim: null, hidden: new Set(),
  };
  window.SRPG_GAME = G; // 方便除錯/測試

  /* ================= 劇本載入 ================= */
  function readJSONStorage(key) {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }

  function useCampaign(raw, source) {
    const c = C.normalize(raw);
    const errs = C.validate(c);
    if (errs.length) console.warn('劇本檢查：', errs);
    SP.tag(c);
    G.campaign = c; G.source = source;
    $('campaignDesc').textContent = `${c.meta.title}${c.meta.author ? '　／ ' + c.meta.author : ''}${c.meta.desc ? '　— ' + c.meta.desc : ''}`;
    return errs;
  }

  function loadCampaignBySource(src) {
    if (src === 'custom') {
      const raw = readJSONStorage(CUSTOM_KEY);
      if (!raw) { UI.toast('本機沒有編輯器劇本，改用示範劇本'); return useCampaign(window.SRPG_DEFAULT_CAMPAIGN, 'demo'); }
      return useCampaign(raw, 'custom');
    }
    return useCampaign(window.SRPG_DEFAULT_CAMPAIGN, 'demo');
  }

  /* ================= 畫面 ================= */
  function resizeCanvas() {
    const b = G.battle;
    if (!b) return;
    canvas.width = b.map.w * TS; canvas.height = b.map.h * TS;
  }

  function unitPixel(u) {
    if (G.anim && G.anim.uid === u.uid) return G.anim.pos;
    return { x: u.x * TS, y: u.y * TS };
  }

  function render(now) {
    requestAnimationFrame(render);
    const b = G.battle;
    if (!b) return;
    RD.drawMap(ctx, G.campaign, b.map, now);
    if (G.dangerAll && G.dangerTiles) RD.tint(ctx, G.dangerTiles, 'rgba(255,60,60,0.22)');
    if (G.view) { RD.tint(ctx, G.view.move, 'rgba(200,80,255,0.30)'); RD.tint(ctx, G.view.atk, 'rgba(255,60,60,0.30)'); }
    if (G.mode === 'move' && G.threat) {
      RD.tint(ctx, G.threat.move, 'rgba(70,130,255,0.40)');
      RD.tint(ctx, G.threat.atk, 'rgba(255,70,70,0.32)');
      RD.drawPath(ctx, G.path);
    }
    if (G.mode === 'target' && G.targets) RD.tint(ctx, G.targets.map((u) => u.x + ',' + u.y), 'rgba(255,70,70,0.45)');
    // 目標壓制點
    const v = b.chapter.victory || {};
    if (v.type === 'seize') { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3; ctx.strokeRect(v.x * TS + 3, v.y * TS + 3, TS - 6, TS - 6); }
    const units = b.units.filter((u) => u.hp > 0 && !G.hidden.has(u.uid)).sort((a, c) => a.y - c.y);
    for (const u of units) {
      const p = unitPixel(u);
      RD.drawUnit(ctx, G.campaign, u, p.x, p.y, now, { gray: u.acted && u.team === b.phase });
    }
    // 死亡淡出
    for (const d of G.fx.filter((f) => f.dying)) {
      const age = (now - d.t0) / 600;
      if (age > 1) continue;
      ctx.globalAlpha = 1 - age;
      RD.drawUnit(ctx, G.campaign, d.unit, d.unit.x * TS, d.unit.y * TS, now, { still: true, hp: false });
      ctx.globalAlpha = 1;
    }
    if (['idle', 'move', 'target'].includes(G.mode)) RD.drawCursor(ctx, G.cursor.x, G.cursor.y, now, G.mode === 'target' ? '#ff6464' : '#fff');
    RD.drawFx(ctx, G.fx.filter((f) => f.text), now);
    G.fx = G.fx.filter((f) => now - f.t0 < 1000 || !f.t0);
  }
  requestAnimationFrame(render);

  function fx(x, y, text, color) { G.fx.push({ x, y, text, color, t0: performance.now() }); }

  function updateHud() {
    const b = G.battle;
    if (!b) return;
    $('chapterName').textContent = b.chapter.name || b.chapterId;
    $('turnInfo').textContent = `第 ${b.turn} 回合 · ${B.PHASE_NAMES[b.phase]}`;
    $('turnInfo').className = 'pill team-' + b.phase;
    $('objective').textContent = '勝利：' + B.objectiveText(b.chapter);
    const myTurn = b.phase === 'player' && b.status === 'playing' && G.mode === 'idle';
    $('btnEnd').disabled = !myTurn;
    $('btnDanger').classList.toggle('primary', G.dangerAll);
    G.dangerTiles = null;
    if (G.dangerAll) {
      const all = new Set();
      for (const e of B.living(b, 'enemy')) { const t = R.threatTiles(b, e); for (const k of t.move) all.add(k); for (const k of t.atk) all.add(k); }
      G.dangerTiles = all;
    }
    updateCards();
  }

  function updateCards() {
    const b = G.battle;
    if (!b) return;
    const u = R.unitAt(b, G.cursor.x, G.cursor.y);
    UI.unitCard(u || (G.sel && B.byUid(b, G.sel)), b);
    UI.terrainCard(R.terrainAt(b, G.cursor.x, G.cursor.y));
  }

  /* ================= 動畫 ================= */
  function animateMove(u, path) {
    if (!path || path.length < 2) return Promise.resolve();
    return new Promise((resolve) => {
      const per = 70; const t0 = performance.now();
      G.anim = { uid: u.uid, pos: { x: path[0].x * TS, y: path[0].y * TS } };
      const step = (now) => {
        const f = Math.max(0, (now - t0) / per);
        const i = Math.min(path.length - 1, Math.floor(f));
        const a = path[i], c = path[Math.min(path.length - 1, i + 1)], k = Math.min(1, f - i);
        G.anim.pos = { x: (a.x + (c.x - a.x) * k) * TS, y: (a.y + (c.y - a.y) * k) * TS };
        if (f >= path.length - 1) { G.anim = null; resolve(); } else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  function lunge(u, target) {
    return new Promise((resolve) => {
      const dx = Math.sign(target.x - u.x), dy = Math.sign(target.y - u.y);
      const t0 = performance.now();
      G.anim = { uid: u.uid, pos: { x: u.x * TS, y: u.y * TS } };
      const step = (now) => {
        const f = Math.max(0, (now - t0) / 260);
        const k = Math.sin(Math.min(1, f) * Math.PI) * 12;
        G.anim.pos = { x: u.x * TS + dx * k, y: u.y * TS + dy * k };
        if (f >= 1) { G.anim = null; resolve(); } else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* ================= 劇本 / 事件 ================= */
  async function runScript(id) {
    const b = G.battle;
    const runner = S.createRunner(G.campaign, id, {
      flags: G.flags,
      spawn: (list) => {
        if (!b) return;
        const added = B.spawn(b, list);
        for (const u of added) { u.acted = b.phase !== u.team ? u.acted : true; fx(u.x, u.y, '增援', '#ff9a9a'); }
      },
      recruit: (id2) => { const u = b && B.recruit(b, id2); if (u) fx(u.x, u.y, '加入我方！', '#8fb4ff'); },
      give: (uid, wid) => {
        const u = b && B.give(b, uid, wid);
        if (u) fx(u.x, u.y, '獲得 ' + ((G.campaign.weapons[wid] || {}).name || wid), '#ffd24a');
        else if (G.roster[uid]) (G.roster[uid].weapons = G.roster[uid].weapons || []).push(wid);
      },
    });
    for (;;) {
      const step = runner.next();
      if (step.type === 'end') break;
      if (step.type === 'say') await UI.say(step, G.campaign);
      else if (step.type === 'choice') { UI.hideDialog(); runner.choose(await UI.choice(step)); }
    }
    UI.hideDialog();
  }

  async function drainQueue() {
    const b = G.battle;
    while (b && b.queue.length) {
      await runScript(b.queue.shift());
      B.checkOutcome(b);
      updateHud();
    }
  }

  /* ================= 章節流程 ================= */
  async function startChapter(id, restoreBattle) {
    hideScreens();
    G.chapter = id;
    if (restoreBattle) {
      G.battle = B.restore(G.campaign, restoreBattle);
    } else {
      G.chapterStart = { roster: U.clone(G.roster), flags: U.clone(G.flags) };
      G.battle = B.createBattle(G.campaign, id, { roster: G.roster, flags: G.flags });
    }
    G.battle.flags = G.flags;
    resetSelection();
    resizeCanvas();
    const lord = G.battle.units.find((u) => u.team === 'player');
    if (lord) G.cursor = { x: lord.x, y: lord.y };
    G.mode = 'busy';
    updateHud();
    if (!restoreBattle) {
      await UI.banner(G.battle.chapter.name || id, '勝利條件：' + B.objectiveText(G.battle.chapter), '#ffd24a', 1600);
      B.fire(G.battle, 'start');
      await drainQueue();
      B.startPhase(G.battle, 'player');
      await UI.banner(B.PHASE_NAMES.player, '第 1 回合', '#8fb4ff');
      await drainQueue();
    }
    await afterAction();
  }

  // 每個行動後的共通檢查：事件、勝敗、回合自動結束
  async function afterAction() {
    const b = G.battle;
    await drainQueue();
    if (b.status === 'victory') return chapterClear();
    if (b.status === 'defeat') return gameOver();
    if (b.phase === 'player') {
      if (B.phaseDone(b)) return endPlayerPhase();
      G.mode = 'idle';
      updateHud();
    }
  }

  async function endPlayerPhase() {
    resetSelection();
    G.mode = 'busy';
    updateHud();
    const b = G.battle;
    for (;;) {
      B.endPhase(b);
      updateHud();
      const color = { player: '#8fb4ff', enemy: '#ff9a9a', ally: '#8ee6a8' }[b.phase];
      await UI.banner(B.PHASE_NAMES[b.phase], '第 ' + b.turn + ' 回合', color);
      await drainQueue();
      if (b.status !== 'playing') break;
      if (b.phase === 'player') break;
      await runAIPhase();
      if (b.status !== 'playing') break;
    }
    await afterAction();
  }

  async function runAIPhase() {
    const b = G.battle;
    const order = B.living(b, b.phase).sort((a, c) => a.uid - c.uid);
    for (const u of order) {
      if (u.hp <= 0 || u.acted || b.status !== 'playing') continue;
      const plan = AI.plan(b, u);
      G.cursor = { x: u.x, y: u.y };
      if (plan.x !== u.x || plan.y !== u.y) {
        const path = B.moveUnit(b, u, plan.x, plan.y);
        if (path) await animateMove(u, path);
      }
      const t = plan.target && B.byUid(b, plan.target);
      if (t && t.hp > 0) await doAttack(u, t);
      else B.wait(b, u);
      updateHud();
      await drainQueue();
      if (b.status !== 'playing') return;
      await UI.sleep(120);
    }
  }

  async function doAttack(u, t) {
    const b = G.battle;
    const before = { [u.uid]: u.hp, [t.uid]: t.hp };
    const res = B.attack(b, u, t);
    const finals = { [u.uid]: u.hp, [t.uid]: t.hp };
    u.hp = before[u.uid]; t.hp = before[t.uid];
    for (const s of res.combat.strikes) {
      const by = B.byUid(b, s.by), tg = B.byUid(b, s.target);
      await lunge(by, tg);
      tg.hp = s.hpAfter;
      if (!s.hit) fx(tg.x, tg.y, 'MISS', '#cfd6e0');
      else fx(tg.x, tg.y, (s.crit ? '必殺！' : '') + '-' + s.dmg, s.crit ? '#ffd24a' : '#ff6464');
      updateCards();
      await UI.sleep(380);
    }
    u.hp = finals[u.uid]; t.hp = finals[t.uid];
    for (const d of res.deaths) {
      G.fx.push({ dying: true, unit: d, t0: performance.now() });
      fx(d.x, d.y, '擊破', '#ffffff');
    }
    if (res.deaths.length) await UI.sleep(500);
    for (const [uid, e] of Object.entries(res.exp)) {
      const pu = B.byUid(b, +uid);
      if (pu && pu.hp > 0) fx(pu.x, pu.y - 0.4, '+' + e + ' EXP', '#8fb4ff');
    }
    for (const [uid, ups] of Object.entries(res.levelUps)) for (const g of ups) await UI.levelUp(B.byUid(b, +uid), g);
    updateHud();
  }

  async function chapterClear() {
    const b = G.battle;
    G.mode = 'busy';
    await UI.banner('勝利！', b.chapter.name, '#ffd24a', 1400);
    B.commitRoster(b, G.roster);
    const next = C.resolveNext(b.chapter, G.flags);
    G.battle = null;
    G.chapter = next;
    if (!next) return showEnding();
    showSaveScreen('章節完成！要存檔嗎？', true, () => startChapter(next));
  }

  function gameOver() {
    G.mode = 'busy';
    const el = $('endScreen');
    el.innerHTML = `<h1 style="color:#ff6464">GAME OVER</h1><p>${UI.esc(G.battle.chapter.name || '')}</p>
      <div class="col"><button class="btn primary" id="btnRetry">重新挑戰本章</button><button class="btn" id="btnToTitle">回到標題</button></div>`;
    UI.screen('endScreen');
    $('btnRetry').onclick = () => {
      G.roster = U.clone(G.chapterStart.roster); G.flags = U.clone(G.chapterStart.flags);
      startChapter(G.chapter);
    };
    $('btnToTitle').onclick = showTitle;
  }

  function showEnding() {
    const el = $('endScreen');
    const alive = Object.entries(G.roster).filter(([, r]) => !r.dead).map(([id, r]) => `${(G.campaign.units[id] || {}).name || id} Lv${r.level}`);
    el.innerHTML = `<h1>THE END</h1><h2>${UI.esc(G.campaign.meta.title)}</h2>
      <p>生還的夥伴：${UI.esc(alive.join('、') || '—')}</p>
      <div class="col"><button class="btn" id="btnEndSave">存檔（通關紀錄）</button><button class="btn primary" id="btnToTitle">回到標題</button></div>`;
    UI.screen('endScreen');
    $('btnEndSave').onclick = () => showSaveScreen('通關存檔', true, showEnding);
    $('btnToTitle').onclick = showTitle;
  }

  /* ================= 存讀檔 ================= */
  function currentSave(label) {
    return Object.assign(SV.makeSave({
      campaignTitle: G.campaign.meta.title, chapter: G.chapter, roster: G.roster, flags: G.flags,
      battle: G.battle && G.battle.status === 'playing' ? G.battle : null, label,
    }), { source: G.source, chapterStart: G.chapterStart });
  }

  function slotLabel(s) {
    if (!s) return '— 空 —';
    const ch = s.chapter && G.campaign.chapters[s.chapter];
    return `${s.campaign} · ${ch ? ch.name : (s.chapter || '通關')}${s.battle ? ' (戰鬥中 第' + s.battle.turn + '回合)' : ''}`;
  }

  // mode：write=true 存檔 / false 讀檔
  function showSaveScreen(title, write, after) {
    const el = $('slotScreen');
    const slots = store.list();
    el.innerHTML = `<h2>${UI.esc(title)}</h2><div class="col" style="min-width:min(520px,90vw)">` +
      slots.map((s, i) => `<div class="slot card"><span>欄位 ${i + 1}：${UI.esc(slotLabel(s))}<br><small>${s ? new Date(s.time).toLocaleString() : ''}</small></span>
        <span><button class="btn ${write ? 'primary' : ''}" data-act="${write ? 'w' : 'r'}" data-i="${i}" ${!write && !s ? 'disabled' : ''}>${write ? '存到這裡' : '讀取'}</button>
        ${s ? `<button class="btn" data-act="x" data-i="${i}" title="下載存檔檔案">⬇</button>` : ''}</span></div>`).join('') +
      `${write ? '<button class="btn" data-act="file">⬇ 下載為存檔檔案</button>' : ''}
       <button class="btn" data-act="back">${write && after ? '不存檔，繼續' : '返回'}</button></div>`;
    UI.screen('slotScreen');
    el.querySelectorAll('button').forEach((btn) => (btn.onclick = () => {
      const i = +btn.dataset.i;
      switch (btn.dataset.act) {
        case 'w': store.write(i, currentSave()); UI.toast('已存到欄位 ' + (i + 1)); UI.screen('slotScreen', false); if (after) after(); break;
        case 'r': loadSave(store.read(i)); break;
        case 'x': download(`srpg_save_${i + 1}.json`, JSON.stringify(store.read(i), null, 1)); break;
        case 'file': download('srpg_save.json', JSON.stringify(currentSave(), null, 1)); break;
        case 'back': UI.screen('slotScreen', false); if (after) after(); break;
      }
    }));
  }

  function loadSave(sv) {
    try { SV.check(sv); } catch (e) { UI.toast(e.message); return; }
    if (sv.source === 'custom' || sv.source === 'demo') loadCampaignBySource(sv.source);
    if (sv.campaign && sv.campaign !== G.campaign.meta.title) {
      if (!confirm(`存檔屬於「${sv.campaign}」，目前劇本是「${G.campaign.meta.title}」。仍要讀取嗎？`)) return;
    }
    G.roster = U.clone(sv.roster || {}); G.flags = U.clone(sv.flags || {});
    G.chapterStart = sv.chapterStart || { roster: U.clone(G.roster), flags: U.clone(G.flags) };
    hideScreens();
    if (!sv.chapter) return showEnding();
    if (sv.battle) startChapter(sv.chapter, sv.battle);
    else startChapter(sv.chapter);
  }

  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function readFile(input) {
    return new Promise((resolve, reject) => {
      input.onchange = () => {
        const f = input.files[0]; input.value = '';
        if (!f) return;
        const r = new FileReader();
        r.onload = () => { try { resolve(JSON.parse(r.result)); } catch (e) { reject(e); } };
        r.readAsText(f);
      };
      input.click();
    });
  }

  /* ================= 標題 ================= */
  function hideScreens() { for (const id of ['titleScreen', 'slotScreen', 'endScreen']) UI.screen(id, false); }

  function showTitle() {
    G.battle = null; G.mode = 'title';
    hideScreens();
    UI.screen('titleScreen');
  }

  $('campaignSelect').onchange = async (e) => {
    if (e.target.value === 'file') {
      try { const raw = await readFile($('fileCampaign')); const errs = useCampaign(raw, 'file'); UI.toast(errs.length ? `已載入（${errs.length} 個警告，見主控台）` : '已載入劇本'); }
      catch (err) { UI.toast('劇本讀取失敗：' + err.message); e.target.value = 'demo'; loadCampaignBySource('demo'); }
    } else loadCampaignBySource(e.target.value);
  };
  $('btnNew').onclick = () => {
    G.roster = {}; G.flags = {};
    if (!G.campaign.meta.start) { UI.toast('劇本沒有任何章節'); return; }
    startChapter(G.campaign.meta.start);
  };
  $('btnLoad').onclick = () => showSaveScreen('讀取存檔', false, null);
  $('btnImportSave').onclick = async () => {
    try { loadSave(await readFile($('fileSave'))); } catch (e) { UI.toast('存檔讀取失敗：' + e.message); }
  };

  /* ================= 玩家操作 ================= */
  function resetSelection() {
    G.sel = null; G.reach = null; G.threat = null; G.path = null; G.targets = null; G.view = null;
    UI.closeMenu();
  }

  function tileFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) / r.width * canvas.width / TS), y: Math.floor((e.clientY - r.top) / r.height * canvas.height / TS) };
  }

  function screenPosOfTile(x, y) {
    const r = canvas.getBoundingClientRect(), app = $('app').getBoundingClientRect();
    const k = r.width / canvas.width;
    return { x: r.left - app.left + (x + 1) * TS * k + 6, y: r.top - app.top + y * TS * k };
  }

  function setCursor(x, y) {
    const b = G.battle;
    if (!b) return;
    G.cursor = { x: U.clamp(x, 0, b.map.w - 1), y: U.clamp(y, 0, b.map.h - 1) };
    if (G.mode === 'move' && G.reach) {
      const n = G.reach.get(G.cursor.x + ',' + G.cursor.y);
      G.path = n && n.stop ? R.pathTo(G.reach, G.cursor.x, G.cursor.y) : null;
    }
    updateCards();
  }

  async function select(x, y) {
    const b = G.battle;
    if (!b || b.phase !== 'player' || b.status !== 'playing') return;
    const u = R.unitAt(b, x, y);
    if (G.mode === 'idle') {
      if (u && u.team === 'player' && !u.acted) {
        G.view = null; G.sel = u.uid;
        G.threat = R.threatTiles(b, u); G.reach = G.threat.reach;
        G.mode = 'move'; setCursor(x, y);
      } else if (u) {
        G.view = G.view && G.view.uid === u.uid ? null : Object.assign(R.threatTiles(b, u), { uid: u.uid });
      } else {
        G.view = null;
        await mapMenu(x, y);
      }
    } else if (G.mode === 'move') {
      const me = B.byUid(b, G.sel);
      const n = G.reach.get(x + ',' + y);
      if (n && n.stop) {
        G.mode = 'busy';
        const path = B.moveUnit(b, me, x, y);
        await animateMove(me, path);
        await actionMenu(me);
      } else if (u && u !== me && u.team === 'player' && !u.acted) {
        resetSelection(); G.mode = 'idle'; await select(x, y);
      } else { resetSelection(); G.mode = 'idle'; }
    } else if (G.mode === 'target') {
      const me = B.byUid(b, G.sel);
      const t = G.targets.find((o) => o.x === x && o.y === y);
      if (!t) return;
      G.mode = 'busy';
      const ok = await UI.forecast(B.previewAttack(b, me, t), me, t);
      if (!ok) { G.mode = 'target'; return; }
      G.targets = null;
      await doAttack(me, t);
      resetSelection();
      await afterAction();
    }
    updateHud();
  }

  async function actionMenu(me) {
    const b = G.battle;
    G.mode = 'action';
    G.cursor = { x: me.x, y: me.y };
    const acts = B.actionsFor(b, me);
    const pos = screenPosOfTile(me.x, me.y);
    const pick = await UI.menu(acts, pos.x, pos.y);
    const act = acts.find((a) => a.id === pick);
    if (!act) { // 取消 → 回到移動前
      B.undoMove(me);
      G.threat = R.threatTiles(b, me); G.reach = G.threat.reach;
      G.mode = 'move'; setCursor(me.x, me.y);
      return;
    }
    switch (act.id) {
      case 'attack':
        G.targets = B.targetsFrom(b, me); G.mode = 'target';
        setCursor(G.targets[0].x, G.targets[0].y);
        UI.toast('選擇攻擊目標（Esc 取消）');
        return;
      case 'talk': {
        let other = B.byUid(b, act.targets[0]);
        if (act.targets.length > 1) {
          const id = await UI.menu(act.targets.map((uid) => ({ id: uid, name: B.byUid(b, uid).name })), pos.x, pos.y);
          if (id == null) return actionMenu(me);
          other = B.byUid(b, id);
        }
        G.mode = 'busy';
        B.talk(b, me, other);
        break;
      }
      case 'visit': G.mode = 'busy'; B.visit(b, me); break;
      case 'seize': G.mode = 'busy'; B.seize(b, me); break;
      default: B.wait(b, me);
    }
    resetSelection();
    await afterAction();
  }

  async function cancel() {
    if (G.mode === 'move') { resetSelection(); G.mode = 'idle'; }
    else if (G.mode === 'target') { G.targets = null; await actionMenu(B.byUid(G.battle, G.sel)); }
    else if (G.mode === 'idle') G.view = null;
    updateHud();
  }

  async function mapMenu(x, y) {
    G.mode = 'action';
    const pos = x != null ? screenPosOfTile(x, y) : { x: window.innerWidth - 170, y: 46 };
    const id = await UI.menu([
      { id: 'end', name: '⏭ 結束回合' },
      { id: 'danger', name: (G.dangerAll ? '隱藏' : '顯示') + '危險範圍' },
      { id: 'save', name: '💾 中斷存檔' },
      { id: 'title', name: '↩ 回到標題' },
    ], pos.x, pos.y);
    G.mode = 'idle';
    if (id === 'end') await endPlayerPhase();
    else if (id === 'danger') G.dangerAll = !G.dangerAll;
    else if (id === 'save') showSaveScreen('中斷存檔', true, null);
    else if (id === 'title' && confirm('回到標題？未存檔的進度會遺失。')) showTitle();
    updateHud();
  }

  canvas.addEventListener('click', (e) => {
    if (UI.busy() || !['idle', 'move', 'target'].includes(G.mode)) return;
    const t = tileFromEvent(e);
    setCursor(t.x, t.y);
    select(t.x, t.y);
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!G.battle || !['idle', 'move', 'target'].includes(G.mode)) return;
    const t = tileFromEvent(e);
    if (t.x !== G.cursor.x || t.y !== G.cursor.y) setCursor(t.x, t.y);
  });
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!UI.busy()) cancel(); });

  document.addEventListener('keydown', (e) => {
    if (UI.onKey(e)) { e.preventDefault(); return; }
    if (!G.battle) return;
    const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (['idle', 'move', 'target'].includes(G.mode)) {
      if (d) {
        e.preventDefault();
        if (G.mode === 'target') { // 目標間切換
          const i = G.targets.findIndex((o) => o.x === G.cursor.x && o.y === G.cursor.y);
          const n = G.targets[(i + (d[0] + d[1] > 0 ? 1 : -1) + G.targets.length) % G.targets.length];
          setCursor(n.x, n.y);
        } else setCursor(G.cursor.x + d[0], G.cursor.y + d[1]);
      } else if (['Enter', 'z', 'Z', ' '].includes(e.key)) { e.preventDefault(); select(G.cursor.x, G.cursor.y); }
      else if (['Escape', 'x', 'X'].includes(e.key)) cancel();
      else if ((e.key === 'e' || e.key === 'E') && G.mode === 'idle' && G.battle.phase === 'player') endPlayerPhase();
      else if (e.key === 'd' || e.key === 'D') { G.dangerAll = !G.dangerAll; updateHud(); }
      else if (e.key === 'm' || e.key === 'M') { if (G.mode === 'idle') mapMenu(); }
    }
  });

  $('btnEnd').onclick = () => { if (G.mode === 'idle' && G.battle && G.battle.phase === 'player') endPlayerPhase(); };
  $('btnDanger').onclick = () => { G.dangerAll = !G.dangerAll; updateHud(); };
  $('btnMenu').onclick = () => { if (G.mode === 'idle') mapMenu(); else if (G.mode === 'title') UI.toast('請先開始遊戲'); };
  SP.onload = () => {};

  /* ================= 啟動 ================= */
  const params = new URLSearchParams(location.search);
  if (params.get('playtest')) {
    // 編輯器「試玩」：從 localStorage 讀取暫存劇本，直接進入指定章節
    const raw = readJSONStorage(PLAYTEST_KEY);
    if (raw) {
      useCampaign(raw, 'custom');
      G.roster = {}; G.flags = {};
      const ch = params.get('chapter');
      startChapter(ch && G.campaign.chapters[ch] ? ch : G.campaign.meta.start);
    } else { loadCampaignBySource('demo'); showTitle(); UI.toast('找不到試玩資料'); }
  } else {
    loadCampaignBySource(readJSONStorage(CUSTOM_KEY) && params.get('custom') ? 'custom' : 'demo');
    showTitle();
  }
})();
