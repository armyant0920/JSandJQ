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
      supports: clone(opts.supports || {}),
    };
    attach(b, campaign);
    // opts.deploy：出擊準備畫面決定的我方配置 [{unit,x,y}]，取代章節中的我方配置
    const places = opts.deploy
      ? (ch.units || []).filter((p) => p.team !== 'player').concat(opts.deploy.map((d) => Object.assign({ team: 'player' }, d)))
      : (ch.units || []);
    for (const p of places) {
      if (p.team === 'player' && roster[p.unit] && roster[p.unit].dead) continue;
      if (!opts.deploy && p.if && !C.testCond({ if: p.if }, b.flags)) continue; // 條件出場（例如 kit_joined）
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

  // 在地圖上的單位（被救出搬運中的不算）
  const living = (b, team) => b.units.filter((u) => R.onMap(u) && (!team || u.team === team));
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
  function moveUnit(b, u, x, y, moveOverride) {
    const reach = R.reachable(b, u, moveOverride);
    const n = reach.get(x + ',' + y);
    if (!n || !n.stop) return null;
    const path = R.pathTo(reach, x, y);
    if (!u.prevPos) u.prevPos = { x: u.x, y: u.y, used: u.moveUsed || 0 };
    u.moveUsed = (u.prevPos.used || 0) + n.cost;
    if (path.length > 1) {
      const a = path[path.length - 2], z = path[path.length - 1];
      u.dir = z.y > a.y ? 0 : z.x < a.x ? 1 : z.x > a.x ? 2 : 3;
    }
    u.x = x; u.y = y; u.moved = true;
    return path;
  }

  function undoMove(u) {
    if (u.prevPos && !u.acted) { u.x = u.prevPos.x; u.y = u.prevPos.y; u.moveUsed = u.prevPos.used || 0; u.moved = false; delete u.prevPos; }
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

  // 救出：相鄰、同陣營、雙方都沒有在搬運
  function rescueTargets(b, u) {
    if (u.carrying) return [];
    return living(b).filter((o) => o !== u && o.team === u.team && dist(o, u) === 1 && !o.carrying);
  }
  // 放下：相鄰、空的、被搬運者能站立的格子
  function dropTiles(b, u) {
    const c = u.carrying && byUid(b, u.carrying);
    if (!c) return [];
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: u.x + dx, y: u.y + dy }))
      .filter((p) => R.moveCost(R.terrainAt(b, p.x, p.y), c.moveType) < Infinity && !R.unitAt(b, p.x, p.y));
  }

  // 支援對話：相鄰、已累積足夠支援值、下一階段尚未看過
  function nextSupportRank(b, a, o) {
    const k = R.supportKey(a.id, o.id);
    const def = Object.values(b.campaign.supports).find((s) => R.supportKey(s.a, s.b) === k);
    if (!def) return null;
    const st = b.supports[k] || { points: 0, rank: null };
    const ranks = def.ranks || [];
    const idx = st.rank ? ranks.findIndex((r) => r.rank === st.rank) + 1 : 0;
    const nr = ranks[idx];
    return nr && st.points >= (nr.need || 0) ? nr : null;
  }
  function supportTargets(b, u) {
    if (u.team !== 'player') return [];
    return living(b, 'player').filter((o) => o !== u && dist(o, u) === 1 && nextSupportRank(b, u, o));
  }

  function spiritsUsable(b, u) {
    if (!R.rulesOf(b).spirits) return [];
    return (u.spirits || []).map((id) => Object.assign({ id }, b.campaign.spirits[id])).filter((s) => s.effect);
  }

  // 可執行的行動清單（free:true 表示不會結束行動）
  function actionsFor(b, u) {
    const acts = [];
    if (targetsFrom(b, u).length) acts.push({ id: 'attack', name: '攻擊' });
    if (healTargets(b, u).length) acts.push({ id: 'staff', name: '杖' });
    if (R.mapWeapons(b, u).length) acts.push({ id: 'mapAttack', name: '地圖兵器' });
    const sp = spiritsUsable(b, u);
    if (sp.length) acts.push({ id: 'spirit', name: '精神', free: true, disabled: !sp.some((s) => (s.cost || 0) <= u.sp) });
    if ((u.items || []).length) acts.push({ id: 'item', name: '道具', disabled: !u.items.some((_, i) => itemUsable(b, u, i)) });
    if (u.team === 'player' && tradePartners(b, u).length) acts.push({ id: 'trade', name: '交換', free: true });
    if (u.team === 'player' && rescueTargets(b, u).length) acts.push({ id: 'rescue', name: '救出' });
    if (u.team === 'player' && dropTiles(b, u).length) acts.push({ id: 'drop', name: '放下' });
    if (supportTargets(b, u).length) acts.push({ id: 'support', name: '支援' });
    const talkTo = living(b).filter((o) => o !== u && dist(o, u) === 1 && hasEvent(b, 'talk', { a: u.id, b: o.id }));
    if (u.team === 'player' && talkTo.length) acts.push({ id: 'talk', name: '交談', targets: talkTo.map((o) => o.uid) });
    if (u.team === 'player' && hasEvent(b, 'visit', { x: u.x, y: u.y })) acts.push({ id: 'visit', name: '拜訪' });
    const v = b.chapter.victory || {};
    if (v.type === 'seize' && u.lord && u.x === v.x && u.y === v.y) acts.push({ id: 'seize', name: '壓制' });
    acts.push({ id: 'wait', name: '待機' });
    return acts;
  }

  // canto:true 的行動完成後，有「再移動」技能的我方單位可用剩餘移動力移動（u.cantoMove）
  function finishAction(b, u, canto) {
    u.acted = true;
    const left = R.moveOf(u) - (u.moveUsed || 0);
    delete u.prevPos;
    if (u.buffs) delete u.buffs.accel;
    if (canto && u.team === 'player' && u.hp > 0 && left > 0 && R.hasSkill(b, u, 'canto')) u.cantoMove = left;
    checkOutcome(b);
  }

  // 再移動：回傳路徑
  function cantoMove(b, u, x, y) {
    if (!u.cantoMove) return null;
    const path = moveUnit(b, u, x, y, u.cantoMove);
    delete u.prevPos;
    delete u.cantoMove;
    return path;
  }
  function endCanto(u) { delete u.cantoMove; }

  // 搬運者倒下或被移除時，放下被搬運的單位
  function dropOnDeath(b, u) {
    const c = u.carrying && byUid(b, u.carrying);
    if (!c) return null;
    delete u.carrying; delete c.carriedBy;
    c.x = u.x; c.y = u.y;
    const free = R.unitAt(b, c.x, c.y) && R.unitAt(b, c.x, c.y) !== c ? nearestFree(b, u.x, u.y) : null;
    if (free) { c.x = free.x; c.y = free.y; }
    return c;
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
    for (const d of [u, t]) if (d.hp <= 0) { res.deaths.push(d); dropOnDeath(b, d); fire(b, 'death', { unit: d.id }); }
    finishAction(b, u, true);
    return res;
  }

  // 地圖兵器：at 為中心（burst）或方向格（line）。所有範圍內目標各受一擊、不會反擊
  function mapAttack(b, u, weaponIdx, at) {
    const w = R.weaponDef(b, u.weapons[weaponIdx]);
    if (!w || !R.isMapWeapon(w) || !R.usable(b, u, w)) return null;
    const area = R.mapArea(b, u, w, at);
    const victims = R.mapVictims(b, u, w, area);
    const res = { area, strikes: [], exp: {}, levelUps: {}, deaths: [] };
    const RU = R.rulesOf(b);
    let expSum = 0;
    for (const v of victims) {
      const s = R.combatSide(b, u, v, u, v, { weapon: w, ignoreRange: true });
      if (!s) continue;
      let hit, evaded = false;
      if (v.buffs && v.buffs.alert) { hit = false; evaded = true; delete v.buffs.alert; }
      else hit = b.rng.roll(s.hitBase);
      const crit = hit && b.rng.roll(s.crit);
      const dmg = hit ? Math.min(v.hp, crit ? s.dmg * RU.critMult : s.dmg) : 0;
      v.hp -= dmg;
      res.strikes.push({ by: u.uid, target: v.uid, hit, crit, dmg, hpAfter: v.hp, evaded, skills: [] });
      if (!R.friendly(v.team, u.team)) expSum += R.expGain(u, v, hit, v.hp <= 0);
      R.addMorale(b, v, 1);
      if (v.hp <= 0) { res.deaths.push(v); dropOnDeath(b, v); fire(b, 'death', { unit: v.id }); }
    }
    R.payCost(b, u, w);
    if (u.buffs) delete u.buffs.valor;
    R.addMorale(b, u, 1 + res.deaths.length * 3);
    gainExp(b, u, Math.min(100, expSum), res);
    finishAction(b, u, true);
    return res;
  }

  function rescue(b, u, t) {
    if (!rescueTargets(b, u).includes(t)) return false;
    u.carrying = t.uid; t.carriedBy = u.uid; t.acted = true;
    finishAction(b, u, true);
    return true;
  }

  function drop(b, u, x, y) {
    if (!dropTiles(b, u).some((p) => p.x === x && p.y === y)) return null;
    const c = byUid(b, u.carrying);
    delete u.carrying; delete c.carriedBy;
    c.x = x; c.y = y;
    finishAction(b, u, true);
    return c;
  }

  function supportTalk(b, u, o) {
    const nr = nextSupportRank(b, u, o);
    if (!nr) return null;
    const k = R.supportKey(u.id, o.id);
    b.supports[k] = Object.assign(b.supports[k] || { points: 0 }, { rank: nr.rank });
    if (nr.script) b.queue.push(nr.script);
    finishAction(b, u, true);
    return nr;
  }

  // 支援值：我方回合開始時，有支援關係且距離 ≤ 2 的同伴 +1
  function gainSupportPoints(b) {
    const units = living(b, 'player');
    for (const def of Object.values(b.campaign.supports)) {
      const a = units.find((x) => x.id === def.a), c = units.find((x) => x.id === def.b);
      if (!a || !c || dist(a, c) > 2) continue;
      const k = R.supportKey(def.a, def.b);
      b.supports[k] = b.supports[k] || { points: 0, rank: null };
      b.supports[k].points++;
    }
  }

  // 杖：回傳 { amount, exp, levelUps }
  function heal(b, u, t, staffIdx) {
    const st = R.staves(b, u).filter(({ w }) => R.canHitAt(w, dist(u, t)));
    const pick = st.find((x) => x.i === staffIdx) || st[0];
    if (!pick) return null;
    const amount = Math.min(t.stats.hp - t.hp, R.healAmount(b, u, pick.w));
    t.hp += amount;
    R.payCost(b, u, pick.w);
    const res = { amount, exp: {}, levelUps: {} };
    gainExp(b, u, 11 + Math.floor(amount / 2), res);
    finishAction(b, u, true);
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
      case 'mp': { const n = Math.min(u.maxMp - u.mp, def.power || 10); u.mp += n; text = `MP +${n}`; break; }
      case 'st': { const n = Math.min(u.maxSt - u.st, def.power || 10); u.st += n; text = `體力 +${n}`; break; }
      case 'morale': R.addMorale(b, u, def.power || 10); text = `氣力 +${def.power || 10}`; break;
      case 'promote': {
        const opts2 = C.promotionOptions(b.campaign, u.cls, u.level, it.id).filter((p) => p.item === it.id);
        const pick = opts2.find((p) => p.to === (opts && opts.promoteTo)) || opts2[0];
        if (!pick) return null;
        promote(b, u, pick.to, pick);
        text = '轉職為 ' + u.className;
        break;
      }
      default: text = def.name;
    }
    it.uses = (it.uses || 1) - 1;
    if (it.uses <= 0) u.items.splice(idx, 1);
    if (!(opts && opts.free)) finishAction(b, u, true);
    return { text };
  }

  // 道具可否使用（轉職道具需要符合條件）
  function itemUsable(b, u, idx) {
    const it = (u.items || [])[idx];
    const def = it && b.campaign.items[it.id];
    if (!def) return false;
    if (def.kind === 'promote') return C.promotionOptions(b.campaign, u.cls, u.level, it.id).some((p) => p.item === it.id);
    return true;
  }

  // 轉職：改變職業、加上能力加成、取得新職業技能；route 為職業 promote 中的一筆
  function promote(b, u, toCls, route) {
    const c = b.campaign;
    const nc = c.classes[toCls];
    if (!nc) return null;
    const def = c.units[u.id] || {};
    const bonus = (route && route.bonus) || nc.bonus || {};
    for (const k of C.STAT_KEYS) if (bonus[k]) { u.stats[k] += bonus[k]; if (k === 'hp') u.hp += bonus[k]; }
    if (bonus.mp) { u.maxMp += bonus.mp; u.mp += bonus.mp; }
    if (bonus.st) { u.maxSt += bonus.st; u.st += bonus.st; }
    u.cls = toCls; u.className = nc.name || toCls;
    u.move = nc.move || u.move; u.moveType = nc.moveType || u.moveType; u.tags = clone(nc.tags || []);
    if (!def.sprite && nc.sprite) u.sprite = nc.sprite;
    if (nc.vision) u.vision = nc.vision;
    u.skills = [...new Set(u.skills.concat(nc.skills || []))];
    for (const w of (route && route.weapons) || []) if (c.weapons[w]) u.weapons.push(w);
    if (R.rulesOf(b).promoteReset) { u.level = 1; u.exp = 0; }
    return u;
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

  function talk(b, u, other) { fire(b, 'talk', { a: u.id, b: other.id }); finishAction(b, u, true); }
  function visit(b, u) { fire(b, 'visit', { x: u.x, y: u.y }); finishAction(b, u, true); }
  function seize(b, u) { u.acted = true; b.status = 'victory'; fire(b, 'victory'); }
  // 待機：資源系統開啟時額外回復體力（喘口氣）
  function wait(b, u) {
    const RU = R.rulesOf(b);
    if (RU.resources && u.maxSt) u.st = Math.min(u.maxSt, u.st + RU.restSt);
    finishAction(b, u);
  }

  /* ---------- 回合 ---------- */
  function startPhase(b, phase) {
    b.phase = phase;
    const msgs = [];
    const RU = R.rulesOf(b);
    if (phase === 'player') gainSupportPoints(b);
    for (const u of b.units.filter((x) => x.hp > 0 && x.team === phase)) {
      u.acted = !!u.carriedBy; u.moved = false; u.moveUsed = 0; delete u.prevPos; delete u.cantoMove;
      if (RU.resources) {
        if (u.maxSt) u.st = Math.min(u.maxSt, u.st + RU.stRegen);
        if (u.maxMp) u.mp = Math.min(u.maxMp, u.mp + RU.mpRegen);
      }
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
        skills: clone(u.skills || []), cls: u.cls, wup: clone(u.wup || {}), upg: clone(u.upg || {}),
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

  function learn(b, unitId, skillId) {
    const u = b.units.find((x) => x.id === unitId && x.hp > 0);
    if (!u || !b.campaign.skills[skillId]) return null;
    if (!u.skills.includes(skillId)) u.skills.push(skillId);
    return u;
  }

  SRPG.battle = {
    PHASES, PHASE_NAMES, createBattle, attach, serialize, restore, addUnit, living, byUid,
    fire, hasEvent, moveUnit, undoMove, autoEquip, weaponsFor, targetsFrom, previewAttack, actionsFor,
    healTargets, tradePartners, spiritsUsable, spiritTargets, rescueTargets, dropTiles, supportTargets, nextSupportRank,
    attack, mapAttack, heal, useItem, transfer, useSpirit, rescue, drop, supportTalk, gainSupportPoints,
    cantoMove, endCanto, talk, visit, seize, wait, startPhase, endPhase, phaseDone, checkOutcome,
    objectiveText, commitRoster, spawn, recruit, give, learn, promote, itemUsable,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRPG;
})(typeof window !== 'undefined' ? window : globalThis);
