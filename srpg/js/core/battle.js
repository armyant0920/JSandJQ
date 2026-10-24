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
      if (p.if && !C.testCond({ if: p.if }, b.flags)) continue; // 條件出場（例如 kit_joined）
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
    if (!u.prevPos) u.prevPos = { x: u.x, y: u.y };
    if (path.length > 1) {
      const a = path[path.length - 2], z = path[path.length - 1];
      u.dir = z.y > a.y ? 0 : z.x < a.x ? 1 : z.x > a.x ? 2 : 3;
    }
    u.x = x; u.y = y; u.moved = true;
    return path;
  }

  function undoMove(u) {
    if (u.prevPos && !u.acted) { u.x = u.prevPos.x; u.y = u.prevPos.y; u.moved = false; delete u.prevPos; }
  }

  // 選擇可在距離 d 使用的攻擊武器（威力最高者）
  function autoEquip(b, u, d) {
    let best = -1, bestMt = -1;
    for (const { i, w } of R.attackWeapons(b, u)) if (R.canHitAt(w, d) && (w.mt || 0) > bestMt) { best = i; bestMt = w.mt || 0; }
    if (best >= 0) u.equip = best;
    return best >= 0;
  }

  // 距離 d 可用的攻擊武器清單 [{i, w}]
  function weaponsFor(b, u, d) { return R.attackWeapons(b, u).filter((x) => R.canHitAt(x.w, d)); }

  function targetsFrom(b, u) {
    return living(b).filter((o) => !R.friendly(o.team, u.team) && weaponsFor(b, u, dist(u, o)).length);
  }

  // weaponIdx 指定攻擊方武器（玩家在預測畫面切換）
  function previewAttack(b, u, t, weaponIdx) {
    const d = dist(u, t);
    if (weaponIdx != null && weaponsFor(b, u, d).some((x) => x.i === weaponIdx)) u.equip = weaponIdx;
    else autoEquip(b, u, d);
    autoEquip(b, t, d);
    return R.forecast(b, u, t);
  }

  // 杖可治療的對象
  function healTargets(b, u) {
    const st = R.staves(b, u);
    if (!st.length) return [];
    return living(b).filter((o) => o !== u && R.friendly(o.team, u.team) && o.hp < o.stats.hp &&
      st.some(({ w }) => R.canHitAt(w, dist(u, o))));
  }

  function tradePartners(b, u) {
    return living(b).filter((o) => o !== u && o.team === u.team && dist(o, u) === 1);
  }

  function spiritsUsable(b, u) {
    if (!R.rulesOf(b).spirits || u.team !== 'player') return [];
    return (u.spirits || []).map((id) => Object.assign({ id }, b.campaign.spirits[id])).filter((s) => s.effect);
  }

  // 可執行的行動清單（free:true 表示不會結束行動）
  function actionsFor(b, u) {
    const acts = [];
    if (targetsFrom(b, u).length) acts.push({ id: 'attack', name: '攻擊' });
    if (healTargets(b, u).length) acts.push({ id: 'staff', name: '杖' });
    const sp = spiritsUsable(b, u);
    if (sp.length) acts.push({ id: 'spirit', name: '精神', free: true, disabled: !sp.some((s) => (s.cost || 0) <= u.sp) });
    if ((u.items || []).length) acts.push({ id: 'item', name: '道具' });
    if (u.team === 'player' && tradePartners(b, u).length) acts.push({ id: 'trade', name: '交換', free: true });
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
    if (u.buffs) delete u.buffs.accel;
    checkOutcome(b);
  }

  function gainExp(b, me, e, res) {
    if (me.team !== 'player' || me.hp <= 0 || !e) return;
    if (me.buffs && me.buffs.effort) { e = Math.min(100, e * 2); delete me.buffs.effort; }
    res.exp[me.uid] = e;
    const ups = R.addExp(b, me, e, b.rng);
    if (ups.length) res.levelUps[me.uid] = ups;
  }

  // 攻擊：回傳 { combat, exp:{uid:amount}, levelUps:{uid:[gains]}, deaths:[unit] }
  function attack(b, u, t, weaponIdx) {
    previewAttack(b, u, t, weaponIdx);
    const combat = R.resolveCombat(b, u, t, b.rng);
    const res = { combat, exp: {}, levelUps: {}, deaths: [] };
    for (const [me, foe] of [[u, t], [t, u]]) {
      const didHit = combat.strikes.some((s) => s.by === me.uid && s.hit);
      const killed = foe.hp <= 0;
      R.addMorale(b, me, 1 + (didHit ? 1 : 0) + (killed ? 3 : 0));
      gainExp(b, me, R.expGain(me, foe, didHit, killed), res);
    }
    for (const d of [u, t]) if (d.hp <= 0) { res.deaths.push(d); fire(b, 'death', { unit: d.id }); }
    finishAction(b, u);
    return res;
  }

  // 杖：回傳 { amount, exp, levelUps }
  function heal(b, u, t, staffIdx) {
    const st = R.staves(b, u).filter(({ w }) => R.canHitAt(w, dist(u, t)));
    const pick = st.find((x) => x.i === staffIdx) || st[0];
    if (!pick) return null;
    const amount = Math.min(t.stats.hp - t.hp, R.healAmount(b, u, pick.w));
    t.hp += amount;
    const res = { amount, exp: {}, levelUps: {} };
    gainExp(b, u, 11 + Math.floor(amount / 2), res);
    finishAction(b, u);
    return res;
  }

  // 使用道具（會結束行動）。回傳 { text } 說明效果
  function useItem(b, u, idx, opts) {
    const it = (u.items || [])[idx];
    const def = it && b.campaign.items[it.id];
    if (!def) return null;
    let text = '';
    switch (def.kind) {
      case 'heal': { const n = Math.min(u.stats.hp - u.hp, def.power || 10); u.hp += n; text = `HP +${n}`; break; }
      case 'boost': { const k = def.stat || 'str', n = def.power || 1; u.stats[k] += n; if (k === 'hp') u.hp += n; text = `${C.STAT_NAMES[k] || k} +${n}`; break; }
      case 'sp': { const n = Math.min(u.maxSp - u.sp, def.power || 10); u.sp += n; text = `SP +${n}`; break; }
      case 'morale': R.addMorale(b, u, def.power || 10); text = `氣力 +${def.power || 10}`; break;
      default: text = def.name;
    }
    it.uses = (it.uses || 1) - 1;
    if (it.uses <= 0) u.items.splice(idx, 1);
    if (!(opts && opts.free)) finishAction(b, u);
    return { text };
  }

  // 交換：把 from 的 weapons/items 第 idx 項移到 to（不結束行動）
  function transfer(b, from, to, kind, idx) {
    const list = kind === 'weapon' ? from.weapons : from.items;
    if (!list || idx < 0 || idx >= list.length) return false;
    const [x] = list.splice(idx, 1);
    if (kind === 'weapon') { to.weapons.push(x); from.equip = 0; }
    else (to.items = to.items || []).push(x);
    return true;
  }

  // 精神指令（不結束行動）。target 為 'ally' 型指令的對象。回傳 { text, targets:[unit] } 或 { error }
  function useSpirit(b, u, spiritId, target) {
    const sp = b.campaign.spirits[spiritId];
    if (!sp || !(u.spirits || []).includes(spiritId)) return { error: '沒有這個精神指令' };
    const cost = sp.cost || 0;
    if (u.sp < cost) return { error: 'SP 不足' };
    const eff = R.EFFECTS[sp.effect];
    if (!eff) return { error: '未知效果' };
    let targets = [u];
    if (sp.target === 'ally') {
      if (!target || target.hp <= 0 || !R.friendly(target.team, u.team)) return { error: '需要選擇同伴' };
      targets = [target];
    } else if (sp.target === 'allies') targets = living(b).filter((o) => R.friendly(o.team, u.team));
    let text = sp.name;
    for (const t of targets) {
      t.buffs = t.buffs || {};
      switch (sp.effect) {
        case 'heal': { const n = Math.min(t.stats.hp - t.hp, sp.value || 10); t.hp += n; text = `HP +${n}`; break; }
        case 'morale': R.addMorale(b, t, sp.value || 10); text = `氣力 +${sp.value || 10}`; break;
        case 'sp': t.sp = Math.min(t.maxSp, t.sp + (sp.value || 10)); text = 'SP 回復'; break;
        case 'accel': t.buffs.accel = sp.value || 3; break;
        default: t.buffs[sp.effect] = true;
      }
    }
    u.sp -= cost;
    return { text, targets };
  }

  // 指令可選的對象（ally 型）
  function spiritTargets(b, u, spiritId) {
    const sp = b.campaign.spirits[spiritId];
    if (!sp || sp.target !== 'ally') return [];
    return living(b).filter((o) => o !== u && R.friendly(o.team, u.team));
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
      if (u.buffs) for (const k of Object.keys(u.buffs)) if ((R.EFFECTS[k] || {}).kind === 'turn') delete u.buffs[k];
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
        level: u.level, exp: u.exp, stats: clone(u.stats), weapons: clone(u.weapons), items: clone(u.items || []),
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

  // 給予武器或道具（id 在 weapons 或 items 中皆可）
  function give(b, unitId, id) {
    const u = b.units.find((x) => x.id === unitId && x.hp > 0);
    if (!u) return null;
    if (b.campaign.weapons[id]) u.weapons.push(id);
    else if (b.campaign.items[id]) (u.items = u.items || []).push({ id, uses: b.campaign.items[id].uses || 1 });
    else return null;
    return u;
  }

  SRPG.battle = {
    PHASES, PHASE_NAMES, createBattle, attach, serialize, restore, addUnit, living, byUid,
    fire, hasEvent, moveUnit, undoMove, autoEquip, weaponsFor, targetsFrom, previewAttack, actionsFor,
    healTargets, tradePartners, spiritsUsable, spiritTargets,
    attack, heal, useItem, transfer, useSpirit, talk, visit, seize, wait, startPhase, endPhase, phaseDone, checkOutcome,
    objectiveText, commitRoster, spawn, recruit, give,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRPG;
})(typeof window !== 'undefined' ? window : globalThis);
