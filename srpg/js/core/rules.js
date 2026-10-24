/* 戰棋規則：地形、移動範圍、攻擊範圍、戰鬥預測與結算、經驗值/升級
   公式參考 GBA 火焰之紋章；SRW 要素（氣力、精神指令狀態）可在劇本 meta.rules 開關 */
(function (root) {
  'use strict';
  const SRPG = root.SRPG = root.SRPG || {};
  const { dist, key, clamp } = SRPG.util;

  const DEFAULT_RULES = {
    doubleThreshold: 4,   // 速度差 ≥ 此值追擊
    triangleDmg: 1, triangleHit: 15,
    critMult: 3, effectiveMult: 3,
    expPerLevel: 100,
    morale: false,        // 氣力系統（SRW）：傷害 × 攻方氣力 / 守方氣力
    moraleStart: 100, moraleMin: 50, moraleMax: 150,
    spirits: false,       // 精神指令（SRW）
  };
  // 武器相剋：key 剋 value
  const TRIANGLE = { sword: 'axe', axe: 'lance', lance: 'sword', anima: 'light', light: 'dark', dark: 'anima' };

  /* 精神指令可用的效果（劇本 spirits 以 effect 指定）
     turn：持續到該單位下一個自軍回合開始；once：用過一次就消失；instant：立即生效 */
  const EFFECTS = {
    sureHit:  { name: '必中', kind: 'turn' },     // 命中 100%
    focus:    { name: '集中', kind: 'turn' },     // 命中 / 迴避 +30
    ironWall: { name: '鐵壁', kind: 'turn' },     // 受到傷害 1/4
    alert:    { name: '閃避', kind: 'once' },     // 下一次被攻擊必定迴避
    valor:    { name: '熱血', kind: 'once' },     // 下一場戰鬥傷害 ×2
    effort:   { name: '努力', kind: 'once' },     // 下一場戰鬥經驗 ×2
    accel:    { name: '加速', kind: 'once' },     // 本回合移動力 +value(預設 3)
    heal:     { name: '信賴', kind: 'instant' },  // 回復 HP value
    morale:   { name: '氣合', kind: 'instant' },  // 氣力 +value
    sp:       { name: '補給', kind: 'instant' },  // SP +value
  };

  const rulesOf = (b) => Object.assign({}, DEFAULT_RULES, (b.campaign.meta && b.campaign.meta.rules) || {});

  const friendly = (a, b) => (a === 'enemy') === (b === 'enemy');
  const buffs = (u) => u.buffs || {};

  function terrainAt(b, x, y) {
    if (x < 0 || y < 0 || x >= b.map.w || y >= b.map.h) return null;
    return b.campaign.terrains[b.map.tiles[y][x]];
  }

  function moveCost(terrain, moveType) {
    if (!terrain) return Infinity;
    const c = terrain.cost && terrain.cost[moveType];
    return c == null ? Infinity : c;
  }

  function moveOf(u) { return u.move + (buffs(u).accel || 0); }

  function unitAt(b, x, y) {
    return b.units.find((u) => u.hp > 0 && u.x === x && u.y === y) || null;
  }

  /* 可移動範圍（Dijkstra）。可穿過友軍、不能穿過敵軍；回傳 Map(key → {x,y,cost,prev,stop}) */
  function reachable(b, u, moveOverride) {
    const mv = moveOverride != null ? moveOverride : moveOf(u);
    const occ = new Map();
    for (const o of b.units) if (o.hp > 0) occ.set(key(o.x, o.y), o);
    const out = new Map();
    const start = { x: u.x, y: u.y, cost: 0, prev: null };
    out.set(key(u.x, u.y), start);
    const open = [start];
    while (open.length) {
      open.sort((a, b2) => a.cost - b2.cost);
      const cur = open.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const c = cur.cost + moveCost(terrainAt(b, nx, ny), u.moveType);
        if (c > mv) continue;
        const o = occ.get(key(nx, ny));
        if (o && !friendly(o.team, u.team)) continue;
        const k = key(nx, ny);
        const ex = out.get(k);
        if (ex && ex.cost <= c) continue;
        const node = { x: nx, y: ny, cost: c, prev: key(cur.x, cur.y) };
        out.set(k, node);
        open.push(node);
      }
    }
    for (const n of out.values()) {
      const o = occ.get(key(n.x, n.y));
      n.stop = !o || o === u;
    }
    return out;
  }

  function pathTo(reach, x, y) {
    const path = [];
    let n = reach.get(key(x, y));
    while (n) { path.unshift({ x: n.x, y: n.y }); n = n.prev ? reach.get(n.prev) : null; }
    return path;
  }

  function weaponDef(b, id) { return id && b.campaign.weapons[id] ? Object.assign({ id }, b.campaign.weapons[id]) : null; }
  function weaponOf(b, u) { return weaponDef(b, u.weapons[u.equip] || u.weapons[0]); }
  function weaponRange(w) { return w ? (w.range || [1, 1]) : [0, -1]; }
  function canHitAt(w, d) { const [a, z] = weaponRange(w); return d >= a && d <= z; }
  const isStaff = (w) => !!w && w.type === 'staff';

  // 可用來攻擊的武器（排除杖、氣力不足的武器）
  function canAttackWith(b, u, w) {
    if (!w || isStaff(w)) return false;
    if (w.morale && rulesOf(b).morale && (u.morale || 0) < w.morale) return false;
    return true;
  }
  function attackWeapons(b, u) {
    return u.weapons.map((id, i) => ({ i, w: weaponDef(b, id) })).filter((x) => canAttackWith(b, u, x.w));
  }
  function staves(b, u) {
    return u.weapons.map((id, i) => ({ i, w: weaponDef(b, id) })).filter((x) => isStaff(x.w));
  }

  // 從 from 位置出發，可攻擊的格子
  function attackTilesFrom(b, u, from) {
    const out = [];
    let lo = 99, hi = 0;
    for (const { w } of attackWeapons(b, u)) { const [a, z] = weaponRange(w); lo = Math.min(lo, a); hi = Math.max(hi, z); }
    for (let dy = -hi; dy <= hi; dy++) for (let dx = -hi; dx <= hi; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d < lo || d > hi) continue;
      const x = from.x + dx, y = from.y + dy;
      if (terrainAt(b, x, y)) out.push({ x, y });
    }
    return out;
  }

  function threatTiles(b, u) {
    const reach = reachable(b, u);
    const move = new Set(), atk = new Set();
    for (const n of reach.values()) {
      move.add(key(n.x, n.y));
      if (!n.stop) continue;
      for (const t of attackTilesFrom(b, u, n)) atk.add(key(t.x, t.y));
    }
    for (const k of move) atk.delete(k);
    return { reach, move, atk };
  }

  // me 以目前裝備從 myPos 攻擊 other 時的數值；無法攻擊回傳 null
  function combatSide(b, me, other, myPos, otherPos) {
    const R = rulesOf(b);
    const w = weaponOf(b, me);
    const ow = weaponOf(b, other);
    const d = dist(myPos, otherPos);
    if (!canAttackWith(b, me, w) || !canHitAt(w, d)) return null;
    const mb = buffs(me), ob = buffs(other);
    const tOther = terrainAt(b, otherPos.x, otherPos.y) || { def: 0, avo: 0 };
    const magic = w.dmg === 'mag';
    let mt = w.mt || 0;
    if (w.effective && w.effective.some((t) => (other.tags || []).includes(t))) mt *= R.effectiveMult;
    let tri = 0;
    if (ow && !isStaff(ow) && TRIANGLE[w.type] === ow.type) tri = 1;
    else if (ow && !isStaff(ow) && TRIANGLE[ow.type] === w.type) tri = -1;
    const atk = (magic ? me.stats.mag : me.stats.str) + mt + tri * R.triangleDmg;
    const def = (magic ? other.stats.res : other.stats.def) + (tOther.def || 0);
    let dmg = Math.max(0, atk - def);
    const tags = [];
    if (R.morale) dmg = Math.floor(dmg * (me.morale || 100) / (other.morale || 100));
    if (mb.valor) { dmg *= 2; tags.push('熱血'); }
    if (ob.ironWall) { dmg = Math.floor(dmg / 4); tags.push('對方鐵壁'); }
    let hitRaw = (w.hit || 0) + me.stats.skl * 2 + Math.floor(me.stats.lck / 2) + tri * R.triangleHit;
    let avo = other.stats.spd * 2 + other.stats.lck + (tOther.avo || 0);
    if (mb.focus) { hitRaw += 30; tags.push('集中'); }
    if (ob.focus) avo += 30;
    let hitBase = clamp(hitRaw - avo, 0, 100);
    if (mb.sureHit) { hitBase = 100; tags.push('必中'); }
    const hit = ob.alert ? 0 : hitBase;
    if (ob.alert) tags.push('對方閃避');
    const crit = clamp((w.crit || 0) + Math.floor(me.stats.skl / 2) - other.stats.lck, 0, 100);
    const count = me.stats.spd - other.stats.spd >= R.doubleThreshold ? 2 : 1;
    const per = w.brave ? 2 : 1;
    return { weapon: w.name || w.id, weaponId: w.id, icon: w.icon, dmg, hit, hitBase, crit, count, per, strikes: count * per, tri, tags };
  }

  function forecast(b, att, def, from) {
    const aPos = from || att;
    return { att: combatSide(b, att, def, aPos, def), def: combatSide(b, def, att, def, aPos) };
  }

  /* 結算戰鬥（會修改 hp、消耗一次性狀態）
     回傳 { strikes:[{by,target,hit,crit,dmg,hpAfter,evaded}], fc, dead:[uid] } */
  function resolveCombat(b, att, def, rng) {
    const R = rulesOf(b);
    const fc = forecast(b, att, def);
    const rounds = [];
    if (fc.att) rounds.push('att');
    if (fc.def) rounds.push('def');
    if (fc.att && fc.att.count > 1) rounds.push('att');
    else if (fc.def && fc.def.count > 1) rounds.push('def');
    const strikes = [];
    const struck = new Set();
    outer:
    for (const who of rounds) {
      const me = who === 'att' ? att : def, tg = who === 'att' ? def : att, s = fc[who];
      for (let k = 0; k < s.per; k++) {
        if (me.hp <= 0 || tg.hp <= 0) break outer;
        struck.add(me);
        let hit, evaded = false;
        if (tg.buffs && tg.buffs.alert) { hit = false; evaded = true; delete tg.buffs.alert; }
        else hit = rng.roll(s.hitBase);
        const crit = hit && rng.roll(s.crit);
        const dmg = hit ? (crit ? s.dmg * R.critMult : s.dmg) : 0;
        tg.hp = Math.max(0, tg.hp - dmg);
        strikes.push({ by: me.uid, target: tg.uid, hit, crit, dmg, hpAfter: tg.hp, evaded });
      }
    }
    for (const u of struck) if (u.buffs) delete u.buffs.valor;
    const dead = [att, def].filter((u) => u.hp <= 0).map((u) => u.uid);
    return { strikes, fc, dead };
  }

  function healAmount(b, healer, staff) { return (healer.stats.mag || 0) + (staff.heal || 10); }

  function expGain(me, foe, didHit, killed) {
    if (me.hp <= 0) return 0;
    const diff = foe.level - me.level;
    let e = didHit ? Math.max(1, 10 + diff) : 1;
    if (killed) e += Math.max(0, 20 + diff * 3) + (foe.boss ? 40 : 0);
    return clamp(e, 1, 100);
  }

  function levelUp(u, rng) {
    const gains = {};
    for (const k of SRPG.campaign.STAT_KEYS) {
      const g = (u.growth && u.growth[k]) || 0;
      let n = Math.floor(g / 100);
      if (rng.roll(g % 100)) n++;
      if (n) { gains[k] = n; u.stats[k] += n; if (k === 'hp') u.hp += n; }
    }
    u.level++;
    return gains;
  }

  function addExp(b, u, amount, rng) {
    const R = rulesOf(b);
    const ups = [];
    u.exp += amount;
    while (u.exp >= R.expPerLevel && u.level < 99) { u.exp -= R.expPerLevel; ups.push(levelUp(u, rng)); }
    return ups;
  }

  function addMorale(b, u, n) {
    const R = rulesOf(b);
    if (!R.morale || u.hp <= 0) return;
    u.morale = clamp((u.morale || R.moraleStart) + n, R.moraleMin, R.moraleMax);
  }

  SRPG.rules = {
    DEFAULT_RULES, TRIANGLE, EFFECTS, rulesOf, friendly, terrainAt, moveCost, moveOf, unitAt, reachable, pathTo,
    weaponDef, weaponOf, weaponRange, canHitAt, isStaff, canAttackWith, attackWeapons, staves, attackTilesFrom, threatTiles,
    combatSide, forecast, resolveCombat, healAmount, expGain, levelUp, addExp, addMorale,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRPG;
})(typeof window !== 'undefined' ? window : globalThis);
