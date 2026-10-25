/* 遊戲控制器：流程（標題 → 章節 → 回合 → 結算 → 下一章）、輸入、動畫、存讀檔 */
(function () {
  'use strict';
  const { campaign: C, rules: R, battle: B, ai: AI, script: S, save: SV, util: U, renderer: RD, sprites: SP, UI } = SRPG;
  const SND = SRPG.sound, SET = SRPG.settings;
  const speed = () => SET.get('speed') || 1;
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
    gold: 0, convoy: [], supports: {},  // 軍資金、輸送隊、支援關係（跨章節保存）
    vis: null,                          // 霧戰：我方可見格
  };
  // 霧戰中看不到的敵人不顯示、不能被選取
  const visible = (u) => !G.vis || u.team === 'player' || u.team === 'ally' || G.vis.has(u.x + ',' + u.y);
  const seenUnitAt = (x, y) => { const u = G.battle && R.unitAt(G.battle, x, y); return u && visible(u) ? u : null; };
  const party = () => ({ roster: G.roster, convoy: G.convoy, get gold() { return G.gold; }, set gold(v) { G.gold = v; } });
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
    SND.setCampaign(c);
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
    applyZoom();
  }

  /* 地圖縮放：0 = 符合畫面，其餘為倍率；鏡頭跟隨 */
  const ZOOMS = [0, 0.75, 1, 1.25, 1.5, 2];
  function applyZoom() {
    const z = SET.get('zoom') || 0;
    canvas.classList.toggle('zoomed', z > 0);
    canvas.style.width = z > 0 ? Math.round(canvas.width * z) + 'px' : '';
  }
  function zoomStep(d) {
    const i = Math.max(0, ZOOMS.indexOf(SET.get('zoom') || 0));
    let z = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + d))];
    if (z === 0 && d > 0) z = 1;
    SET.set('zoom', z); applyZoom();
  }
  function ensureVisible(x, y) {
    const st = $('stage'), r = canvas.getBoundingClientRect(), sr = st.getBoundingClientRect();
    const k = r.width / canvas.width;
    const px = r.left + (x + 0.5) * TS * k, py = r.top + (y + 0.5) * TS * k;
    const m = TS * k * 1.5;
    if (px < sr.left + m || px > sr.right - m) st.scrollLeft += px - (sr.left + sr.width / 2);
    if (py < sr.top + m || py > sr.bottom - m) st.scrollTop += py - (sr.top + sr.height / 2);
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
    G.vis = b.chapter.fog ? R.visibleTiles(b, 'player') : null;
    if (G.dangerAll && G.dangerTiles) RD.tint(ctx, G.dangerTiles, 'rgba(255,60,60,0.22)');
    if (G.view) { RD.tint(ctx, G.view.move, 'rgba(200,80,255,0.30)'); RD.tint(ctx, G.view.atk, 'rgba(255,60,60,0.30)'); }
    if (G.mode === 'move' && G.threat) {
      RD.tint(ctx, G.threat.move, 'rgba(70,130,255,0.40)');
      RD.tint(ctx, G.threat.atk, 'rgba(255,70,70,0.32)');
      RD.drawPath(ctx, G.path);
    }
    if (G.mode === 'target' && G.targets) RD.tint(ctx, G.targets.map((u) => u.x + ',' + u.y), G.targetKind === 'attack' ? 'rgba(255,70,70,0.45)' : G.targetKind === 'map' ? 'rgba(255,170,60,0.30)' : 'rgba(80,230,140,0.45)');
    if (G.mode === 'target' && G.targetKind === 'map' && G.targets.some((p) => p.x === G.cursor.x && p.y === G.cursor.y)) {
      const me = B.byUid(b, G.sel);
      RD.tint(ctx, R.mapArea(b, me, G.mapW.w, G.cursor).map((p) => p.x + ',' + p.y), 'rgba(255,120,30,0.55)');
    }
    if (G.mode === 'canto' && G.reach) RD.tint(ctx, [...G.reach.values()].filter((n) => n.stop).map((n) => n.x + ',' + n.y), 'rgba(70,200,255,0.40)');
    if (G.flash && now - G.flash.t0 < 500) RD.tint(ctx, G.flash.tiles.map((p) => p.x + ',' + p.y), `rgba(255,200,80,${0.6 * (1 - (now - G.flash.t0) / 500)})`);
    // 目標壓制點
    const v = b.chapter.victory || {};
    if (v.type === 'seize') { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3; ctx.strokeRect(v.x * TS + 3, v.y * TS + 3, TS - 6, TS - 6); }
    const units = b.units.filter((u) => R.onMap(u) && !G.hidden.has(u.uid) && visible(u)).sort((a, c) => a.y - c.y);
    for (const u of units) {
      const p = unitPixel(u);
      const dir = G.anim && G.anim.uid === u.uid && G.anim.dir != null ? G.anim.dir : undefined;
      RD.drawUnit(ctx, G.campaign, u, p.x, p.y, now, { gray: u.acted && u.team === b.phase && !u.cantoMove, dir });
      if (u.carrying) { ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('🫂', p.x + 1, p.y + TS - 6); }
    }
    // 霧
    if (G.vis) {
      ctx.fillStyle = 'rgba(10,14,30,0.55)';
      for (let y = 0; y < b.map.h; y++) for (let x = 0; x < b.map.w; x++) if (!G.vis.has(x + ',' + y)) ctx.fillRect(x * TS, y * TS, TS, TS);
    }
    // 死亡淡出
    for (const d of G.fx.filter((f) => f.dying)) {
      const age = (now - d.t0) / 600;
      if (age > 1) continue;
      ctx.globalAlpha = 1 - age;
      RD.drawUnit(ctx, G.campaign, d.unit, d.unit.x * TS, d.unit.y * TS, now, { still: true, hp: false });
      ctx.globalAlpha = 1;
    }
    if (['idle', 'move', 'target', 'canto'].includes(G.mode)) RD.drawCursor(ctx, G.cursor.x, G.cursor.y, now, G.mode === 'target' ? (G.targetKind === 'attack' ? '#ff6464' : '#5ae07a') : '#fff');
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
    $('objective').textContent = '勝利：' + B.objectiveText(b.chapter) + (b.chapter.fog ? '　🌫 霧戰' : '');
    $('goldInfo').hidden = false; $('goldInfo').textContent = '💰 ' + G.gold;
    const myTurn = b.phase === 'player' && b.status === 'playing' && G.mode === 'idle';
    $('btnEnd').disabled = !myTurn;
    $('btnDanger').classList.toggle('primary', G.dangerAll);
    G.dangerTiles = null;
    if (G.dangerAll) {
      const all = new Set();
      for (const e of B.living(b, 'enemy').filter(visible)) { const t = R.threatTiles(b, e); for (const k of t.move) all.add(k); for (const k of t.atk) all.add(k); }
      G.dangerTiles = all;
    }
    updateCards();
  }

  function updateCards() {
    const b = G.battle;
    if (!b) return;
    const u = seenUnitAt(G.cursor.x, G.cursor.y);
    UI.unitCard(u || (G.sel && B.byUid(b, G.sel)), b);
    UI.terrainCard(R.terrainAt(b, G.cursor.x, G.cursor.y));
  }

  /* ================= 動畫 ================= */
  function animateMove(u, path) {
    if (!path || path.length < 2) return Promise.resolve();
    return new Promise((resolve) => {
      const per = 70 / speed(); const t0 = performance.now();
      G.anim = { uid: u.uid, pos: { x: path[0].x * TS, y: path[0].y * TS } };
      const step = (now) => {
        const f = Math.max(0, (now - t0) / per);
        const i = Math.min(path.length - 1, Math.floor(f));
        const a = path[i], c = path[Math.min(path.length - 1, i + 1)], k = Math.min(1, f - i);
        G.anim.pos = { x: (a.x + (c.x - a.x) * k) * TS, y: (a.y + (c.y - a.y) * k) * TS };
        if (c !== a) G.anim.dir = c.y > a.y ? 0 : c.x < a.x ? 1 : c.x > a.x ? 2 : 3;
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
        const f = Math.max(0, (now - t0) / (260 / speed()));
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
      gold: (n) => { G.gold = Math.max(0, G.gold + n); UI.toast((n >= 0 ? '獲得 ' : '失去 ') + Math.abs(n) + ' 金'); updateHud(); },
      promote: (uid, to) => {
        const u = b && b.units.find((x) => x.id === uid && x.hp > 0);
        if (u) { B.promote(b, u, to, (G.campaign.classes[u.cls].promote || []).find((p) => p.to === to)); fx(u.x, u.y, '轉職 ' + u.className, '#ffd24a'); }
        else if (G.roster[uid]) G.roster[uid].cls = to;
      },
      learn: (uid, sk) => {
        const u = b && B.learn(b, uid, sk);
        const name = (G.campaign.skills[sk] || {}).name || sk;
        if (u) fx(u.x, u.y, '學會 ' + name, '#9fd8ff');
        else if (G.roster[uid]) { const r = G.roster[uid]; r.skills = [...new Set((r.skills || []).concat(sk))]; }
      },
      give: (uid, wid) => {
        const def = G.campaign.weapons[wid] || G.campaign.items[wid] || {};
        const u = b && B.give(b, uid, wid);
        if (u) fx(u.x, u.y, '獲得 ' + (def.name || wid), '#ffd24a');
        else if (G.roster[uid]) {
          const r = G.roster[uid];
          if (G.campaign.weapons[wid]) (r.weapons = r.weapons || []).push(wid);
          else (r.items = r.items || []).push({ id: wid, uses: def.uses || 1 });
        }
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
      G.chapterStart = { roster: U.clone(G.roster), flags: U.clone(G.flags), gold: G.gold, convoy: U.clone(G.convoy), supports: U.clone(G.supports) };
      let deploy = null;
      if (G.campaign.chapters[id].prep) { G.mode = 'busy'; deploy = await SRPG.PrepUI.show({ campaign: G.campaign, chapterId: id, party: party(), flags: G.flags }); }
      G.battle = B.createBattle(G.campaign, id, { roster: G.roster, flags: G.flags, supports: G.supports, deploy });
    }
    await SP.preload(G.campaign);
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
      playPhaseBgm();
      UI.sfx('phase');
      await UI.banner(B.PHASE_NAMES.player, '第 1 回合', '#8fb4ff');
      await drainQueue();
    }
    if (restoreBattle) playPhaseBgm();
    await afterAction();
  }

  function playPhaseBgm() {
    const b = G.battle;
    if (!b) return;
    const bg = b.chapter.bgm || {};
    SND.bgm(b.phase === 'player' ? (bg.player || 'bgm_player') : (bg.enemy || 'bgm_enemy'));
  }

  // 每個行動後的共通檢查：事件、勝敗、回合自動結束
  async function afterAction() {
    const b = G.battle;
    await drainQueue();
    if (b.status === 'victory') return chapterClear();
    if (b.status === 'defeat') return gameOver();
    if (b.phase === 'player') {
      if (B.phaseDone(b) && SET.get('autoEnd') !== false) return endPlayerPhase();
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
      playPhaseBgm();
      UI.sfx('phase');
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
      if (visible(u)) { G.cursor = { x: u.x, y: u.y }; ensureVisible(u.x, u.y); }
      for (const sid of AI.pickSpirits(b, u, plan)) {
        const r = B.useSpirit(b, u, sid);
        if (!r.error && visible(u)) { UI.sfx('spirit'); fx(u.x, u.y, G.campaign.spirits[sid].name, '#ff9ae8'); await UI.sleep(350); }
      }
      if (plan.x !== u.x || plan.y !== u.y) {
        const path = B.moveUnit(b, u, plan.x, plan.y);
        if (path && (visible(u) || G.vis && path.some((p) => G.vis.has(p.x + ',' + p.y)))) await animateMove(u, path);
      }
      const t = plan.target && B.byUid(b, plan.target);
      if (plan.map) await doMapAttack(u, plan.map.weapon, plan.map.at);
      else if (t && t.hp > 0) await doAttack(u, t);
      else if (plan.heal) await doHeal(u, B.byUid(b, plan.heal));
      else if (plan.item != null) await doItem(u, plan.item);
      else B.wait(b, u);
      updateHud();
      await drainQueue();
      if (b.status !== 'playing') return;
      await UI.sleep(120);
    }
  }

  async function showGains(res) {
    const b = G.battle;
    for (const [uid, e] of Object.entries(res.exp)) {
      const pu = B.byUid(b, +uid);
      if (pu && pu.hp > 0) fx(pu.x, pu.y - 0.4, '+' + e + ' EXP', '#8fb4ff');
    }
    for (const [uid, ups] of Object.entries(res.levelUps)) for (const g of ups) await UI.levelUp(B.byUid(b, +uid), g);
  }

  async function doHeal(u, t) {
    const res = B.heal(G.battle, u, t);
    if (!res) return B.wait(G.battle, u);
    await lunge(u, t);
    UI.sfx('heal');
    fx(t.x, t.y, '+' + res.amount, '#5ae07a');
    await UI.sleep(450);
    await showGains(res);
    updateHud();
  }

  async function doItem(u, idx, promoteTo) {
    const def = G.campaign.items[(u.items[idx] || {}).id] || {};
    const r = B.useItem(G.battle, u, idx, { promoteTo });
    if (!r) return;
    if (def.kind === 'promote') { UI.sfx('levelup'); await UI.banner('轉職！', u.name + ' → ' + u.className, '#ffd24a', 1200); }
    UI.sfx('heal');
    fx(u.x, u.y, (def.name || '') + ' ' + r.text, '#5ae07a');
    await UI.sleep(600);
    updateHud();
  }

  async function doAttack(u, t, weaponIdx) {
    const b = G.battle;
    const before = { [u.uid]: u.hp, [t.uid]: t.hp };
    const res = B.attack(b, u, t, weaponIdx);
    const finals = { [u.uid]: u.hp, [t.uid]: t.hp };
    u.hp = before[u.uid]; t.hp = before[t.uid];
    if (wantScene(u, t, res.combat)) {
      await SRPG.scene.play({ campaign: G.campaign, att: u, def: t, fc: res.combat.fc, strikes: res.combat.strikes, terrain: b.map.tiles[t.y][t.x], speed: speed() });
      u.hp = finals[u.uid]; t.hp = finals[t.uid];
      for (const d of res.deaths) fx(d.x, d.y, '擊破', '#ffffff');
      await showGains(res);
      updateHud();
      return;
    }
    for (const s of res.combat.strikes) {
      const by = B.byUid(b, s.by), tg = B.byUid(b, s.target);
      await lunge(by, tg);
      tg.hp = s.hpAfter;
      UI.sfx(s.hit ? (s.crit ? 'crit' : 'hit') : 'miss');
      if (s.evaded) fx(tg.x, tg.y, '閃避！', '#ff9ae8');
      else if (!s.hit) fx(tg.x, tg.y, 'MISS', '#cfd6e0');
      else fx(tg.x, tg.y, (s.crit ? '必殺！' : '') + '-' + s.dmg, s.crit ? '#ffd24a' : '#ff6464');
      if (s.skills && s.skills.length) fx(by.x, by.y - 0.6, s.skills.join('・'), '#9fd8ff');
      updateCards();
      await UI.sleep(380 / speed());
    }
    u.hp = finals[u.uid]; t.hp = finals[t.uid];
    for (const d of res.deaths) {
      G.fx.push({ dying: true, unit: d, t0: performance.now() });
      fx(d.x, d.y, '擊破', '#ffffff');
    }
    if (res.deaths.length) { UI.sfx('death'); await UI.sleep(500); }
    await showGains(res);
    updateHud();
  }

  // 戰鬥演出設定：on 全部播放 / special 只播有頭像切入的必殺演出 / off 關閉
  function wantScene(u, t, combat) {
    const mode = SET.get('scene') || 'on';
    if (mode === 'off' || !SRPG.scene) return false;
    if (G.vis && (!visible(u) || !visible(t))) return false;
    if (mode === 'on') return true;
    return combat.strikes.some((s) => {
      const side = s.by === u.uid ? combat.fc.att : combat.fc.def;
      const w = side && G.campaign.weapons[side.weaponId];
      const an = w && G.campaign.animations[SRPG.media.animFor(G.campaign, Object.assign({ id: side.weaponId }, w))];
      return an && an.cutin;
    });
  }

  async function doMapAttack(u, wi, at) {
    const b = G.battle;
    const w = R.weaponDef(b, u.weapons[wi]);
    const victims = R.mapVictims(b, u, w, R.mapArea(b, u, w, at));
    const before = new Map(victims.map((v) => [v.uid, v.hp]));
    const res = B.mapAttack(b, u, wi, at);
    if (!res) return B.wait(b, u);
    const finals = new Map(victims.map((v) => [v.uid, v.hp]));
    for (const v of victims) v.hp = before.get(v.uid);
    const animId = SRPG.media.animFor(G.campaign, w);
    if (SET.get('scene') !== 'off' && animId && (!G.vis || visible(u))) await SRPG.scene.overlay({ campaign: G.campaign, anim: animId, unit: u, weaponName: w.name || w.id, speed: speed() });
    else { UI.sfx('magic'); await UI.banner(w.name || '地圖兵器', u.name, '#ffb44a', 700); }
    G.flash = { tiles: res.area, t0: performance.now() };
    await UI.sleep(400);
    for (const st of res.strikes) {
      const tg = B.byUid(b, st.target);
      tg.hp = st.hpAfter;
      UI.sfx(st.hit ? (st.crit ? 'crit' : 'hit') : 'miss');
      if (st.evaded) fx(tg.x, tg.y, '閃避！', '#ff9ae8');
      else if (!st.hit) fx(tg.x, tg.y, 'MISS', '#cfd6e0');
      else fx(tg.x, tg.y, (st.crit ? '必殺！' : '') + '-' + st.dmg, st.crit ? '#ffd24a' : '#ff6464');
      await UI.sleep(220);
    }
    for (const v of victims) v.hp = finals.get(v.uid);
    for (const d of res.deaths) { G.fx.push({ dying: true, unit: d, t0: performance.now() }); fx(d.x, d.y, '擊破', '#ffffff'); }
    if (res.deaths.length) await UI.sleep(500);
    await showGains(res);
    updateHud();
  }

  // 行動結束後：先跑事件劇本，再處理「再移動」，最後共通檢查
  async function postAction(me) {
    const b = G.battle;
    await drainQueue();
    if (me && me.cantoMove && me.hp > 0 && b.status === 'playing') {
      G.sel = me.uid; G.targets = null; G.targetKind = null; G.threat = null;
      G.reach = R.reachable(b, me, me.cantoMove);
      G.mode = 'canto'; setCursor(me.x, me.y);
      UI.toast(`再移動（剩 ${me.cantoMove}）：選擇位置，Esc 留在原地`);
      updateHud();
      return;
    }
    resetSelection();
    await afterAction();
  }

  async function chapterClear() {
    const b = G.battle;
    G.mode = 'busy';
    SND.stopBgm(); UI.sfx('victory');
    await UI.banner('勝利！', b.chapter.name, '#ffd24a', 1400);
    B.commitRoster(b, G.roster);
    G.supports = U.clone(b.supports || {});
    const next = C.resolveNext(b.chapter, G.flags);
    G.battle = null;
    G.chapter = next;
    if (!next) return showEnding();
    showSaveScreen('章節完成！要存檔嗎？', true, () => startChapter(next));
  }

  function gameOver() {
    G.mode = 'busy';
    SND.stopBgm(); UI.sfx('defeat');
    const el = $('endScreen');
    el.innerHTML = `<h1 style="color:#ff6464">GAME OVER</h1><p>${UI.esc(G.battle.chapter.name || '')}</p>
      <div class="col"><button class="btn primary" id="btnRetry">重新挑戰本章</button><button class="btn" id="btnToTitle">回到標題</button></div>`;
    UI.screen('endScreen');
    $('btnRetry').onclick = () => {
      const cs = G.chapterStart;
      G.roster = U.clone(cs.roster); G.flags = U.clone(cs.flags);
      G.gold = cs.gold || 0; G.convoy = U.clone(cs.convoy || []); G.supports = U.clone(cs.supports || {});
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
    }), { source: G.source, chapterStart: G.chapterStart, gold: G.gold, convoy: U.clone(G.convoy), supports: U.clone(G.battle ? G.battle.supports : G.supports) });
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
    G.gold = sv.gold || 0; G.convoy = U.clone(sv.convoy || []); G.supports = U.clone(sv.supports || {});
    G.chapterStart = sv.chapterStart || { roster: U.clone(G.roster), flags: U.clone(G.flags), gold: G.gold, convoy: U.clone(G.convoy), supports: U.clone(G.supports) };
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
  function hideScreens() { for (const id of ['titleScreen', 'slotScreen', 'endScreen', 'prepScreen', 'settingsScreen']) UI.screen(id, false); }

  /* ================= 設定 ================= */
  function showSettings() {
    const el = $('settingsScreen');
    const s = SET.all();
    const opt = (k, v, l) => `<option value="${v}" ${String(s[k]) === String(v) ? 'selected' : ''}>${l}</option>`;
    el.innerHTML = `<h2>⚙ 設定</h2><div class="col card" style="min-width:min(420px,92vw);text-align:left">
      <label>音效音量 <input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-k="sfx"></label>
      <label>BGM 音量 <input type="range" min="0" max="1" step="0.05" value="${s.bgm}" data-k="bgm"></label>
      <label>戰鬥演出 <select data-k="scene">${opt('scene', 'on', '全部播放')}${opt('scene', 'special', '只播必殺技')}${opt('scene', 'off', '關閉')}</select></label>
      <label>動畫速度 <select data-k="speed">${opt('speed', 1, '1×')}${opt('speed', 1.5, '1.5×')}${opt('speed', 2, '2×')}${opt('speed', 3, '3×')}</select></label>
      <label>全員行動後自動結束回合 <input type="checkbox" data-k="autoEnd" ${s.autoEnd !== false ? 'checked' : ''}></label>
      <button class="btn" id="btnTestSfx">🔊 試聽音效</button>
      <button class="btn primary" id="btnSetClose">完成</button></div>`;
    UI.screen('settingsScreen');
    el.querySelectorAll('[data-k]').forEach((inp) => (inp.oninput = inp.onchange = () => {
      const k = inp.dataset.k;
      SET.set(k, inp.type === 'checkbox' ? inp.checked : inp.type === 'range' || k === 'speed' ? Number(inp.value) : inp.value);
    }));
    $('btnTestSfx').onclick = () => UI.sfx('crit');
    $('btnSetClose').onclick = () => UI.screen('settingsScreen', false);
  }
  $('btnSettings').onclick = showSettings;
  $('btnZoomIn').onclick = () => zoomStep(1);
  $('btnZoomOut').onclick = () => zoomStep(-1);
  $('btnZoomFit').onclick = () => { SET.set('zoom', 0); applyZoom(); };
  $('stage').addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); zoomStep(e.deltaY < 0 ? 1 : -1); } }, { passive: false });

  function showTitle() {
    G.battle = null; G.mode = 'title';
    SND.stopBgm();
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
    G.roster = {}; G.flags = {}; G.gold = 0; G.convoy = []; G.supports = {};
    if (!G.campaign.meta.start) { UI.toast('劇本沒有任何章節'); return; }
    startChapter(G.campaign.meta.start);
  };
  $('btnLoad').onclick = () => showSaveScreen('讀取存檔', false, null);
  $('btnImportSave').onclick = async () => {
    try { loadSave(await readFile($('fileSave'))); } catch (e) { UI.toast('存檔讀取失敗：' + e.message); }
  };

  /* ================= 玩家操作 ================= */
  function resetSelection() {
    G.sel = null; G.reach = null; G.threat = null; G.path = null; G.targets = null; G.view = null; G.targetKind = null; G.targetCb = null;
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
    const nx = U.clamp(x, 0, b.map.w - 1), ny = U.clamp(y, 0, b.map.h - 1);
    if (nx !== G.cursor.x || ny !== G.cursor.y) UI.sfx('cursor');
    G.cursor = { x: nx, y: ny };
    if (G.mode === 'move' && G.reach) {
      const n = G.reach.get(G.cursor.x + ',' + G.cursor.y);
      G.path = n && n.stop ? R.pathTo(G.reach, G.cursor.x, G.cursor.y) : null;
    }
    updateCards();
  }

  async function select(x, y) {
    const b = G.battle;
    if (!b || b.phase !== 'player' || b.status !== 'playing') return;
    const u = seenUnitAt(x, y);
    if (G.mode === 'canto') {
      const me = B.byUid(b, G.sel);
      const n = G.reach.get(x + ',' + y);
      if (!n || !n.stop) return;
      G.mode = 'busy';
      const path = B.cantoMove(b, me, x, y);
      await animateMove(me, path);
      resetSelection();
      await afterAction();
      updateHud();
      return;
    }
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
      if (G.targetKind === 'attack') {
        const ws = B.weaponsFor(b, me, U.dist(me, t)).map(({ i, w }) => ({ i, name: w.name || w.id, icon: w.icon }));
        B.previewAttack(b, me, t);
        const r = await UI.forecast({ att: me, def: t, campaign: G.campaign, weapons: ws, cur: me.equip, compute: (i) => B.previewAttack(b, me, t, i) });
        if (!r.ok) { G.mode = 'target'; return; }
        G.targets = null;
        await doAttack(me, t, r.weapon);
        if (me.hp <= 0) { resetSelection(); await afterAction(); return; }
      } else if (G.targetKind === 'heal') {
        G.targets = null;
        await doHeal(me, t);
      } else if (G.targetKind === 'spirit') {
        const cb = G.targetCb; G.targets = null;
        cb(t);
        return;
      } else if (G.targetKind === 'rescue') {
        G.targets = null;
        B.rescue(b, me, t);
        fx(me.x, me.y, '救出 ' + t.name, '#8fb4ff');
        await UI.sleep(300);
      } else if (G.targetKind === 'drop') {
        G.targets = null;
        const c = B.drop(b, me, t.x, t.y);
        if (c) fx(c.x, c.y, '放下', '#8fb4ff');
        await UI.sleep(300);
      } else if (G.targetKind === 'map') {
        const area = R.mapArea(b, me, G.mapW.w, t);
        const vs = R.mapVictims(b, me, G.mapW.w, area).filter(visible);
        const foes = vs.filter((v) => !R.friendly(v.team, me.team)).length, allies = vs.length - foes;
        const pos = screenPosOfTile(t.x, t.y);
        const go = await UI.menu([{ id: 'go', name: `發動 ${G.mapW.w.name}`, note: `敵 ${foes}${allies ? ' / 友 ' + allies : ''}` }, { id: 'no', name: '取消' }], pos.x, pos.y);
        if (go !== 'go') { G.mode = 'target'; return; }
        G.targets = null;
        await doMapAttack(me, G.mapW.i, t);
      }
      await postAction(me);
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
    const menuAt = (list) => UI.menu(list, pos.x, pos.y);
    const pickTarget = (kind, list, msg) => {
      G.targets = list; G.targetKind = kind; G.mode = 'target';
      setCursor(list[0].x, list[0].y);
      UI.toast(msg);
    };
    switch (act.id) {
      case 'attack': {
        const ts = B.targetsFrom(b, me).filter(visible);
        if (!ts.length) { UI.toast('看不到可攻擊的目標'); return actionMenu(me); }
        return pickTarget('attack', ts, '選擇攻擊目標（Esc 取消）');
      }
      case 'mapAttack': {
        const ws = R.mapWeapons(b, me);
        let pickW = ws[0];
        if (ws.length > 1) {
          const wi = await menuAt(ws.map(({ i, w }) => ({ id: i, name: w.name || w.id, icon: w.icon })));
          if (wi == null) return actionMenu(me);
          pickW = ws.find((x) => x.i === wi);
        }
        G.mapW = pickW;
        const shape = pickW.w.map.shape === 'line' ? '選擇方向' : '選擇中心點';
        return pickTarget('map', R.mapCenters(b, me, pickW.w), `${pickW.w.name}：${shape}（橘色為影響範圍，Esc 取消）`);
      }
      case 'rescue': return pickTarget('rescue', B.rescueTargets(b, me), '選擇要救出的同伴（Esc 取消）');
      case 'drop': return pickTarget('drop', B.dropTiles(b, me), '選擇放下的位置（Esc 取消）');
      case 'support': {
        const ps = B.supportTargets(b, me);
        let other = ps[0];
        if (ps.length > 1) {
          const id = await menuAt(ps.map((o) => ({ id: o.uid, name: o.name, note: (B.nextSupportRank(b, me, o) || {}).rank })));
          if (id == null) return actionMenu(me);
          other = B.byUid(b, id);
        }
        G.mode = 'busy';
        const nr = B.supportTalk(b, me, other);
        await drainQueue();
        if (nr) await UI.banner(`支援 ${nr.rank}`, `${me.name} ＆ ${other.name}`, '#ffb3f0', 1000);
        return postAction(me);
      }
      case 'staff': return pickTarget('heal', B.healTargets(b, me), '選擇治療對象（Esc 取消）');
      case 'spirit': {
        const list = B.spiritsUsable(b, me).map((s) => ({ id: s.id, name: s.name, note: 'SP ' + (s.cost || 0), title: s.desc || '', disabled: (s.cost || 0) > me.sp }));
        const sid = await menuAt(list);
        if (sid == null) return actionMenu(me);
        const sp = G.campaign.spirits[sid];
        const apply = async (target) => {
          const r = B.useSpirit(b, me, sid, target);
          if (r.error) UI.toast(r.error);
          else { UI.sfx('spirit'); for (const t of r.targets) fx(t.x, t.y, sp.name + (r.text !== sp.name ? ' ' + r.text : ''), '#ff9ae8'); }
          await UI.sleep(350);
          updateHud();
          if (sp.effect === 'accel' && !r.error) { B.undoMove(me); G.threat = R.threatTiles(b, me); G.reach = G.threat.reach; G.mode = 'move'; setCursor(me.x, me.y); UI.toast('移動力 +' + (sp.value || 3)); return; }
          return actionMenu(me);
        };
        if (sp.target === 'ally') {
          const ts = B.spiritTargets(b, me, sid);
          if (!ts.length) { UI.toast('沒有可選的同伴'); return actionMenu(me); }
          G.targetCb = (t) => { G.targetKind = null; apply(t); };
          return pickTarget('spirit', ts, `${sp.name}：選擇同伴（Esc 取消）`);
        }
        return apply();
      }
      case 'item': {
        const list = me.items.map((it, i) => { const d = G.campaign.items[it.id] || {}; return { id: i, name: d.name || it.id, icon: d.icon, note: '×' + it.uses, title: d.desc || '', disabled: !B.itemUsable(b, me, i) }; });
        const idx = await menuAt(list);
        if (idx == null) return actionMenu(me);
        const idef = G.campaign.items[me.items[idx].id] || {};
        let promoteTo;
        if (idef.kind === 'promote') {
          const routes = C.promotionOptions(G.campaign, me.cls, me.level, me.items[idx].id).filter((p) => p.item === me.items[idx].id);
          if (routes.length > 1) {
            promoteTo = await menuAt(routes.map((p) => ({ id: p.to, name: '轉職：' + ((G.campaign.classes[p.to] || {}).name || p.to) })));
            if (promoteTo == null) return actionMenu(me);
          }
        }
        G.mode = 'busy';
        await doItem(me, idx, promoteTo);
        return postAction(me);
      }
      case 'trade': {
        const ps = B.tradePartners(b, me);
        let other = ps[0];
        if (ps.length > 1) {
          const id = await menuAt(ps.map((o) => ({ id: o.uid, name: o.name })));
          if (id == null) return actionMenu(me);
          other = B.byUid(b, id);
        }
        await UI.trade(me, other, G.campaign, (f, t2, k, i) => B.transfer(b, f, t2, k, i));
        updateHud();
        return actionMenu(me);
      }
      case 'talk': {
        let other = B.byUid(b, act.targets[0]);
        if (act.targets.length > 1) {
          const id = await UI.menu(act.targets.map((uid) => ({ id: uid, name: B.byUid(b, uid).name })), pos.x, pos.y);
          if (id == null) return actionMenu(me);
          other = B.byUid(b, id);
        }
        G.mode = 'busy';
        B.talk(b, me, other);
        return postAction(me);
      }
      case 'visit': G.mode = 'busy'; B.visit(b, me); return postAction(me);
      case 'seize': G.mode = 'busy'; B.seize(b, me); break;
      default: B.wait(b, me);
    }
    resetSelection();
    await afterAction();
  }

  async function cancel() {
    if (G.mode === 'canto') { B.endCanto(B.byUid(G.battle, G.sel)); resetSelection(); G.mode = 'busy'; await afterAction(); }
    else if (G.mode === 'move') { resetSelection(); G.mode = 'idle'; }
    else if (G.mode === 'target') { G.targets = null; G.targetKind = null; await actionMenu(B.byUid(G.battle, G.sel)); }
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
      { id: 'settings', name: '⚙ 設定' },
      { id: 'title', name: '↩ 回到標題' },
    ], pos.x, pos.y);
    G.mode = 'idle';
    if (id === 'end') await endPlayerPhase();
    else if (id === 'danger') G.dangerAll = !G.dangerAll;
    else if (id === 'save') showSaveScreen('中斷存檔', true, null);
    else if (id === 'settings') showSettings();
    else if (id === 'title' && confirm('回到標題？未存檔的進度會遺失。')) showTitle();
    updateHud();
  }

  // 觸控長按（0.5 秒）：查看單位資訊與範圍，不會選取
  let pressT = null, longPressed = false;
  canvas.addEventListener('pointerdown', (e) => {
    longPressed = false;
    if (e.pointerType !== 'touch' || !G.battle) return;
    clearTimeout(pressT);
    pressT = setTimeout(() => {
      const t = tileFromEvent(e);
      const u = seenUnitAt(t.x, t.y);
      longPressed = true;
      setCursor(t.x, t.y);
      if (u && G.mode === 'idle') G.view = Object.assign(R.threatTiles(G.battle, u), { uid: u.uid });
      if (navigator.vibrate) navigator.vibrate(20);
    }, 500);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => canvas.addEventListener(ev, () => clearTimeout(pressT)));
  canvas.addEventListener('click', (e) => {
    if (longPressed) { longPressed = false; return; }
    if (UI.busy() || !['idle', 'move', 'target', 'canto'].includes(G.mode)) return;
    const t = tileFromEvent(e);
    setCursor(t.x, t.y);
    select(t.x, t.y);
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!G.battle || !['idle', 'move', 'target', 'canto'].includes(G.mode)) return;
    const t = tileFromEvent(e);
    if (t.x !== G.cursor.x || t.y !== G.cursor.y) setCursor(t.x, t.y);
  });
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!UI.busy()) cancel(); });

  document.addEventListener('keydown', (e) => {
    if (UI.onKey(e)) { e.preventDefault(); return; }
    if (!G.battle) return;
    const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (['idle', 'move', 'target', 'canto'].includes(G.mode)) {
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
