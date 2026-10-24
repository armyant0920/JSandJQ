/* 戰棋規則：地形、移動範圍、攻擊範圍、戰鬥預測與結算、經驗值/升級
   公式參考 GBA 火焰之紋章，數值可在劇本 meta.rules 覆寫 */
(function (root) {
  'use strict';
  const SRPG = root.SRPG = root.SRPG || {};
  const { dist, key, clamp } = SRPG.util;

  const DEFAULT_RULES = {
    doubleThreshold: 4,   // 速度差 ≥ 此值追擊
    triangleDmg: 1, triangleHit: 15,
    critMult: 3, effectiveMult: 3,
    expPerLevel: 100,
  };
  // 武器相剋：key 剋 value
  const TRIANGLE = { sword: 'axe', axe: 'lance', lance: 'sword', anima: 'light', light: 'dark', dark: 'anima' };

  const rulesOf = (b) => Object.assign({}, DEFAULT_RULES, (b.campaign.meta && b.campaign.meta.rules) || {});

  const friendly = (a, b) => (a === 'enemy') === (b === 'enemy');

  function terrainAt(b, x, y) {
    if (x < 0 || y < 0 || x >= b.map.w || y >= b.map.h) return null;
    return b.campaign.terrains[b.map.tiles[y][x]];
  }

  function moveCost(terrain, moveType) {
    if (!terrain) return Infinity;
    const c = terrain.cost && terrain.cost[moveType];
    return c == null ? Infinity : c;
  }

  function unitAt(b, x, y) {
    return b.units.find((u) => u.hp > 0 && u.x === x && u.y === y) || null;
  }

  /* 可移動範圍（Dijkstra）。可穿過友軍、不能穿過敵軍；回傳 Map(key → {x,y,cost,prev,stop}) */
  function reachable(b, u, moveOverride) {
    const mv = moveOverride != null ? moveOverride : u.move;
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
    // 只能停在沒有其他單位的格子
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

  function weaponOf(b, u) {
    const id = u.weapons[u.equip] || u.weapons[0];
    return id ? Object.assign({ id }, b.campaign.weapons[id]) : null;
  }

  function weaponRange(w) { return w ? (w.range || [1, 1]) : [0, -1]; }

  function canHitAt(w, d) { const [a, z] = weaponRange(w); return d >= a && d <= z; }

  // 從 from 位置出發，所有武器可攻擊的格子
  function attackTilesFrom(b, u, from) {
    const out = [];
    let lo = 99, hi = 0;
    for (const id of u.weapons) { const [a, z] = weaponRange(b.campaign.weapons[id]); lo = Math.min(lo, a); hi = Math.max(hi, z); }
    for (let dy = -hi; dy <= hi; dy++) for (let dx = -hi; dx <= hi; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d < lo || d > hi) continue;
      const x = from.x + dx, y = from.y + dy;
      if (terrainAt(b, x, y)) out.push({ x, y });
    }
    return out;
  }

  // 危險範圍：可移動格 + 從可停留格可攻擊的格子
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

  // 由 attacker 在 from 位置攻擊 defender 時，各自的戰鬥數值
  function combatSide(b, me, other, myPos, otherPos) {
    const R = rulesOf(b);
    const w = weaponOf(b, me);
    const ow = weaponOf(b, other);
    const d = dist(myPos, otherPos);
    if (!w || !canHitAt(w, d)) return null;
    const tOther = terrainAt(b, otherPos.x, otherPos.y) || { def: 0, avo: 0 };
    const magic = w.dmg === 'mag';
    let mt = w.mt || 0;
    if (w.effective && w.effective.some((t) => other.tags.includes(t))) mt *= R.effectiveMult;
    let tri = 0;
    if (ow && TRIANGLE[w.type] === ow.type) tri = 1;
    else if (ow && TRIANGLE[ow.type] === w.type) tri = -1;
    const atk = (magic ? me.stats.mag : me.stats.str) + mt + tri * R.triangleDmg;
    const def = (magic ? other.stats.res : other.stats.def) + (tOther.def || 0);
    const dmg = Math.max(0, atk - def);
    const hitRaw = (w.hit || 0) + me.stats.skl * 2 + Math.floor(me.stats.lck / 2) + tri * R.triangleHit;
    const avo = other.stats.spd * 2 + other.stats.lck + (tOther.avo || 0);
    const hit = clamp(hitRaw - avo, 0, 100);
    const crit = clamp((w.crit || 0) + Math.floor(me.stats.skl / 2) - other.stats.lck, 0, 100);
    const count = me.stats.spd - other.stats.spd >= R.doubleThreshold ? 2 : 1;
    return { weapon: w.name || w.id, dmg, hit, crit, count, tri };
  }

  function forecast(b, att, def, from) {
    const aPos = from || att;
    return {
      att: combatSide(b, att, def, aPos, def),
      def: combatSide(b, def, att, def, aPos),
    };
  }

  /* 結算戰鬥（會修改單位 hp），rng 為 util.makeRng 物件
     回傳 { strikes:[{by,target,hit,crit,dmg,hpAfter}], fc, dead:[uid] } */
  function resolveCombat(b, att, def, rng) {
    const R = rulesOf(b);
    const fc = forecast(b, att, def);
    const seq = [];
    if (fc.att) seq.push('att');
    if (fc.def) seq.push('def');
    if (fc.att && fc.att.count > 1) seq.push('att');
    else if (fc.def && fc.def.count > 1) seq.push('def');
    const strikes = [];
    for (const who of seq) {
      const me = who === 'att' ? att : def, tg = who === 'att' ? def : att, s = fc[who];
      if (me.hp <= 0 || tg.hp <= 0) break;
      const hit = rng.roll(s.hit);
      const crit = hit && rng.roll(s.crit);
      const dmg = hit ? (crit ? s.dmg * R.critMult : s.dmg) : 0;
      tg.hp = Math.max(0, tg.hp - dmg);
      strikes.push({ by: me.uid, target: tg.uid, hit, crit, dmg, hpAfter: tg.hp });
      if (tg.hp <= 0) break;
    }
    const dead = [att, def].filter((u) => u.hp <= 0).map((u) => u.uid);
    return { strikes, fc, dead };
  }

  // 經驗值（FE 風格簡化）
  function expGain(me, foe, didHit, killed) {
    if (me.hp <= 0) return 0;
    const diff = foe.level - me.level;
    let e = didHit ? Math.max(1, 10 + diff) : 1;
    if (killed) e += Math.max(0, 20 + diff * 3) + (foe.boss ? 40 : 0);
    return clamp(e, 1, 100);
  }

  // 升級：回傳 {statKey: +n}
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

  SRPG.rules = {
    DEFAULT_RULES, TRIANGLE, friendly, terrainAt, moveCost, unitAt, reachable, pathTo,
    weaponOf, weaponRange, canHitAt, attackTilesFrom, threatTiles, combatSide, forecast,
    resolveCombat, expGain, levelUp, addExp,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRPG;
})(typeof window !== 'undefined' ? window : globalThis);
