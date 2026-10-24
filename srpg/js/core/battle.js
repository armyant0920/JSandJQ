/* 戰場狀態機：回合/陣營、行動、事件觸發、勝敗判定。
   戰場物件除了 campaign/map 參照外都是純資料，可直接序列化成中斷存檔 */
(function (root) {
  'use strict';
  const SRPG = root.SRPG = root.SRPG || {};
  const { makeRng, clone, dist } = SRPG.util;
  const R = SRPG.rules;
  const C = SRPG.campaign;

  const PHASES = ['player', 'ally', 'enemy'];
  const PHASE_NAMES = { player: '我方回合', ally: '友軍回合', enemy: '敵方回合' };

  function createBattle(campaign, chapterId, opts) {
    opts = opts || {};
    const ch = campaign.chapters[chapterId];
    if (!ch) throw new Error('找不到章節 ' + chapterId);
    const roster = opts.roster || {};
    const b = {
      chapterId, turn: 1, phase: 'player', status: 'playing',
      units: [], nextUid: 1, fired: [], queue: [],
      rngState: (opts.seed != null ? opts.seed : (Date.now() & 0x7fffffff)) || 1,
      flags: opts.flags || {},
    };
    attach(b, campaign);
    for (const p of ch.units || []) {
      if (p.team === 'player' && roster[p.unit] && roster[p.unit].dead) continue;
      addUnit(b, p, roster);
    }
    return b;
  }

  // 重新掛上不可序列化的部分（讀取中斷存檔時用）
  function attach(b, campaign) {
    Object.defineProperty(b, 'campaign', { value: campaign, enumerable: false, configurable: true, writable: true });
    Object.defineProperty(b, 'chapter', { value: campaign.chapters[b.chapterId], enumerable: false, configurable: true, writable: true });
    Object.defineProperty(b, 'map', { value: C.parseMap(campaign, campaign.chapters[b.chapterId].map), enumerable: false, configurable: true, writable: true });
    const rng = makeRng(b.rngState);
    Object.defineProperty(rng, 'state', {
      get: () => b.rngState, set: (v) => { b.rngState = v; }, enumerable: true, configurable: true,
    });
    Object.defineProperty(b, 'rng', { value: rng, enumerable: false, configurable: true, writable: true });
    return b;
  }

  function serialize(b) { return clone(b); }
  function restore(campaign, data) { return attach(clone(data), campaign); }

  function addUnit(b, place, roster) {
    // 指定位置被占用時，找最近空格
    let { x, y } = place;
    if (R.unitAt(b, x, y)) {
      const free = nearestFree(b, x, y);
      if (!free) return null;
      ({ x, y } = free);
    }
    const u = C.makeUnit(b.campaign, Object.assign({}, place, { x, y }), roster, b.nextUid++);
    b.units.push(u);
    return u;
  }

  function nearestFree(b, x, y) {
    for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) + Math.abs(dy) !== r) continue;
      const nx = x + dx, ny = y + dy;
      const t = R.terrainAt(b, nx, ny);
      if (t && Object.keys(t.cost || {}).length && !R.unitAt(b, nx, ny)) return { x: nx, y: ny };
    }
    return null;
  }

  const living = (b, team) => b.units.filter((u) => u.hp > 0 && (!team || u.team === team));
  const byUid = (b, uid) => b.units.find((u) => u.uid === uid) || null;

  /* ---------- 事件 ---------- */
  function eventMatches(ev, type, info) {
    if ((ev.on || 'start') !== type) return false;
    switch (type) {
      case 'turn': return ev.turn === info.turn && (ev.phase || 'player') === info.phase;
      case 'death': return ev.unit === info.unit;
      case 'talk': return (ev.a === info.a && ev.b === info.b) || (ev.a === info.b && ev.b === info.a);
      case 'visit': return ev.x === info.x && ev.y === info.y;
      default: return true;
    }
  }

  // 觸發事件：把符合的劇本推入 queue；回傳本次加入的劇本 id
  function fire(b, type, info) {
    const added = [];
    (b.chapter.events || []).forEach((ev, i) => {
      const id = 'e' + i;
      if (!eventMatches(ev, type, info || {})) return;
      if (ev.if && !C.testCond({ if: ev.if }, b.flags)) return;
      if (ev.once !== false && b.fired.includes(id)) return;
      b.fired.push(id);
      if (ev.script) { b.queue.push(ev.script); added.push(ev.script); }
    });
    return added;
  }

  function hasEvent(b, type, info) {
    return (b.chapter.events || []).some((ev, i) =>
      eventMatches(ev, type, info) && !(ev.once !== false && b.fired.includes('e' + i)) &&
      (!ev.if || C.testCond({ if: ev.if }, b.flags)));
  }

  /* ---------- 行動 ---------- */
  function moveUnit(b, u, x, y) {
    const reach = R.reachable(b, u);
    const n = reach.get(x + ',' + y);
    if (!n || !n.stop) return null;
    const path = R.pathTo(reach, x, y);
    u.prevPos = { x: u.x, y: u.y };
    u.x = x; u.y = y; u.moved = true;
    return path;
  }

  function undoMove(u) {
    if (u.prevPos && !u.acted) { u.x = u.prevPos.x; u.y = u.prevPos.y; u.moved = false; delete u.prevPos; }
  }

  // 選擇可在距離 d 使用的武器（威力最高者）
  function autoEquip(b, u, d) {
    let best = -1, bestMt = -1;
    u.weapons.forEach((id, i) => {
      const w = b.campaign.weapons[id];
      if (w && R.canHitAt(w, d) && (w.mt || 0) > bestMt) { best = i; bestMt = w.mt || 0; }
    });
    if (best >= 0) u.equip = best;
    return best >= 0;
  }

  function targetsFrom(b, u) {
    return living(b).filter((o) => !R.friendly(o.team, u.team) &&
      u.weapons.some((id) => R.canHitAt(b.campaign.weapons[id], dist(u, o))));
  }

  function previewAttack(b, u, t) {
    autoEquip(b, u, dist(u, t));
    autoEquip(b, t, dist(u, t));
    return R.forecast(b, u, t);
  }

  // 可執行的行動清單
  function actionsFor(b, u) {
    const acts = [];
    if (targetsFrom(b, u).length) acts.push({ id: 'attack', name: '攻擊' });
    const talkTo = living(b).filter((o) => o !== u && dist(o, u) === 1 && hasEvent(b, 'talk', { a: u.id, b: o.id }));
    if (u.team === 'player' && talkTo.length) acts.push({ id: 'talk', name: '交談', targets: talkTo.map((o) => o.uid) });
    if (u.team === 'player' && hasEvent(b, 'visit', { x: u.x, y: u.y })) acts.push({ id: 'visit', name: '拜訪' });
    const v = b.chapter.victory || {};
    if (v.type === 'seize' && u.lord && u.x === v.x && u.y === v.y) acts.push({ id: 'seize', name: '壓制' });
    acts.push({ id: 'wait', name: '待機' });
    return acts;
  }

  function finishAction(b, u) {
    u.acted = true;
    delete u.prevPos;
    checkOutcome(b);
  }

  // 攻擊：回傳 { combat, exp:{uid:amount}, levelUps:{uid:[gains]}, deaths:[unit] }
  function attack(b, u, t) {
    previewAttack(b, u, t);
    const combat = R.resolveCombat(b, u, t, b.rng);
    const res = { combat, exp: {}, levelUps: {}, deaths: [] };
    for (const [me, foe] of [[u, t], [t, u]]) {
      if (me.team !== 'player' || me.hp <= 0) continue;
      const didHit = combat.strikes.some((s) => s.by === me.uid && s.hit);
      const killed = foe.hp <= 0;
      const e = R.expGain(me, foe, didHit, killed);
      res.exp[me.uid] = e;
      const ups = R.addExp(b, me, e, b.rng);
      if (ups.length) res.levelUps[me.uid] = ups;
    }
    for (const d of [u, t]) if (d.hp <= 0) { res.deaths.push(d); fire(b, 'death', { unit: d.id }); }
    finishAction(b, u);
    return res;
  }

  function talk(b, u, other) { fire(b, 'talk', { a: u.id, b: other.id }); finishAction(b, u); }
  function visit(b, u) { fire(b, 'visit', { x: u.x, y: u.y }); finishAction(b, u); }
  function seize(b, u) { u.acted = true; b.status = 'victory'; fire(b, 'victory'); }
  function wait(b, u) { finishAction(b, u); }

  /* ---------- 回合 ---------- */
  function startPhase(b, phase) {
    b.phase = phase;
    const msgs = [];
    for (const u of living(b, phase)) {
      u.acted = false; u.moved = false; delete u.prevPos;
      const t = R.terrainAt(b, u.x, u.y);
      if (t && t.heal && u.hp < u.stats.hp) {
        const h = Math.min(u.stats.hp - u.hp, Math.ceil(u.stats.hp * t.heal / 100));
        u.hp += h; msgs.push({ uid: u.uid, heal: h });
      }
    }
    fire(b, 'turn', { turn: b.turn, phase });
    checkOutcome(b);
    return msgs;
  }

  // 結束目前陣營，進入下一個有單位的陣營；回傳新的 phase
  function endPhase(b) {
    let i = PHASES.indexOf(b.phase);
    for (let n = 0; n < PHASES.length; n++) {
      i = (i + 1) % PHASES.length;
      if (i === 0) b.turn++;
      if (PHASES[i] === 'player' || living(b, PHASES[i]).length) break;
    }
    startPhase(b, PHASES[i]);
    return b.phase;
  }

  function phaseDone(b) { return living(b, b.phase).every((u) => u.acted); }

  function checkOutcome(b) {
    if (b.status !== 'playing') return b.status;
    const ch = b.chapter;
    const df = ch.defeat || { type: 'lordDies' };
    const players = living(b, 'player');
    let lost = players.length === 0;
    if (df.type === 'unitDies') lost = lost || !b.units.some((u) => u.id === df.unit && u.hp > 0);
    if (df.type === 'lordDies') lost = lost || b.units.some((u) => u.lord && u.team === 'player' && u.hp <= 0);
    if (df.type === 'turnLimit') lost = lost || b.turn > df.turns;
    if (lost) { b.status = 'defeat'; return b.status; }
    const v = ch.victory || { type: 'rout' };
    let won = false;
    if (v.type === 'rout') won = living(b, 'enemy').length === 0;
    if (v.type === 'boss') won = !b.units.some((u) => u.boss && u.team === 'enemy' && u.hp > 0);
    if (v.type === 'survive') won = b.turn > v.turns || living(b, 'enemy').length === 0;
    if (won) { b.status = 'victory'; fire(b, 'victory'); }
    return b.status;
  }

  function objectiveText(ch) {
    const v = ch.victory || { type: 'rout' };
    switch (v.type) {
      case 'boss': return '擊破敵將';
      case 'survive': return `存活 ${v.turns} 回合`;
      case 'seize': return `壓制 (${v.x},${v.y})`;
      default: return '殲滅敵軍';
    }
  }

  // 章節結束：把我方狀態寫回名冊
  function commitRoster(b, roster) {
    const permadeath = b.campaign.meta.permadeath !== false;
    for (const u of b.units) {
      if (u.team !== 'player') continue;
      roster[u.id] = {
        level: u.level, exp: u.exp, stats: clone(u.stats), weapons: clone(u.weapons),
        dead: permadeath && u.hp <= 0,
      };
    }
    return roster;
  }

  // 劇本指令用
  function spawn(b, placements) { return placements.map((p) => addUnit(b, p, null)).filter(Boolean); }
  function recruit(b, unitId) {
    const u = b.units.find((x) => x.id === unitId && x.hp > 0);
    if (u) { u.team = 'player'; u.acted = true; u.ai = 'aggressive'; }
    return u;
  }

  function give(b, unitId, weaponId) {
    const u = b.units.find((x) => x.id === unitId && x.hp > 0);
    if (u && b.campaign.weapons[weaponId]) u.weapons.push(weaponId);
    return u;
  }

  SRPG.battle = {
    PHASES, PHASE_NAMES, createBattle, attach, serialize, restore, addUnit, living, byUid,
    fire, hasEvent, moveUnit, undoMove, autoEquip, targetsFrom, previewAttack, actionsFor,
    attack, talk, visit, seize, wait, startPhase, endPhase, phaseDone, checkOutcome,
    objectiveText, commitRoster, spawn, recruit, give,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRPG;
})(typeof window !== 'undefined' ? window : globalThis);
