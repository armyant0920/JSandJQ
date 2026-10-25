/* 戰棋規則：地形、移動、攻擊範圍、戰鬥預測與結算、技能、資源（體力/法力）、支援、地圖兵器、視野
   公式參考 GBA 火焰之紋章；SRW 要素（氣力、精神指令）與資源系統可在劇本 meta.rules 開關 */
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
    resources: false,     // 體力(ST)/法力(MP)：武器與杖可設定消耗
    stRegen: 3, mpRegen: 2, restSt: 3,   // 每回合回復量、待機額外回復體力
    supportRange: 3,      // 支援效果範圍
    upgrades: false,      // SRW 式改造（出擊準備畫面花錢強化）
    upgradeMax: 5,
    promoteReset: true,   // 轉職後等級回到 1
  };
  // 武器相剋：key 剋 value
  const TRIANGLE = { sword: 'axe', axe: 'lance', lance: 'sword', anima: 'light', light: 'dark', dark: 'anima' };

  /* 精神指令效果
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

  /* 被動技能效果（劇本 skills 以 effect 指定） */
  const SKILL_EFFECTS = {
    canto:   { name: '再移動', params: [] },
    vantage: { name: '先制', params: ['value'] },        // HP ≤ value% 被攻擊時先攻
    pursuit: { name: '追擊', params: ['value'] },        // 追擊門檻 -value
    adept:   { name: '連續', params: ['rate', 'rateMul'] },
    sol:     { name: '太陽', params: ['rate', 'rateMul'] },
    luna:    { name: '月光', params: ['rate', 'rateMul'] },
    bonus:   { name: '能力加成', params: ['hit', 'avo', 'crit', 'dmg', 'block'] },
  };

  const SUPPORT_BONUS = { C: { hit: 5, avo: 5 }, B: { hit: 10, avo: 10, dmg: 1 }, A: { hit: 15, avo: 15, dmg: 2, crit: 5 } };

  const rulesOf = (b) => Object.assign({}, DEFAULT_RULES, (b.campaign.meta && b.campaign.meta.rules) || {});

  const friendly = (a, b) => (a === 'enemy') === (b === 'enemy');
  const buffs = (u) => u.buffs || {};
  const onMap = (u) => u.hp > 0 && !u.carriedBy;

  /* ---------- 技能 ---------- */
  function skillsOf(b, u) {
    return (u.skills || []).map((id) => Object.assign({ id }, b.campaign.skills[id])).filter((s) => s.effect);
  }
  function hasSkill(b, u, effect) { return skillsOf(b, u).find((s) => s.effect === effect) || null; }
  function skillRate(u, sk) {
    if (!sk) return 0;
    const base = typeof sk.rate === 'number' ? sk.rate : (u.stats[sk.rate || 'skl'] || 0);
    return clamp(Math.floor(base * (sk.rateMul || 1)), 0, 100);
  }

  /* ---------- 地形 / 移動 ---------- */
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
    return b.units.find((u) => onMap(u) && u.x === x && u.y === y) || null;
  }

  /* 可移動範圍（Dijkstra）。可穿過友軍、不能穿過敵軍；回傳 Map(key → {x,y,cost,prev,stop}) */
  function reachable(b, u, moveOverride) {
    const mv = moveOverride != null ? moveOverride : moveOf(u);
    const occ = new Map();
    for (const o of b.units) if (onMap(o)) occ.set(key(o.x, o.y), o);
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

  /* ---------- 武器 / 資源 ---------- */
  function weaponDef(b, id) { return id && b.campaign.weapons[id] ? Object.assign({ id }, b.campaign.weapons[id]) : null; }
  function weaponOf(b, u) { return weaponDef(b, u.weapons[u.equip] || u.weapons[0]); }
  function weaponRange(w) { return w ? (w.range || [1, 1]) : [0, -1]; }
  function canHitAt(w, d) { const [a, z] = weaponRange(w); return d >= a && d <= z; }
  const isStaff = (w) => !!w && w.type === 'staff';
  const isMapWeapon = (w) => !!w && !!w.map;

  // 武器消耗：{ type:'st'|'mp', n }
  function weaponCost(w) {
    if (!w || !w.cost) return null;
    return { type: w.costType || (w.dmg === 'mag' || isStaff(w) ? 'mp' : 'st'), n: w.cost };
  }
  function canAfford(b, u, w) {
    const c = weaponCost(w);
    if (!c || !rulesOf(b).resources) return true;
    return (u[c.type] || 0) >= c.n;
  }
  function payCost(b, u, w) {
    const c = weaponCost(w);
    if (!c || !rulesOf(b).resources) return 0;
    u[c.type] = Math.max(0, (u[c.type] || 0) - c.n);
    return c.n;
  }
  function usable(b, u, w) {
    if (!w) return false;
    if (w.morale && rulesOf(b).morale && (u.morale || 0) < w.morale) return false;
    return canAfford(b, u, w);
  }

  // 可用來一般攻擊/反擊的武器（排除杖、地圖兵器、氣力或資源不足）
  function canAttackWith(b, u, w) { return !!w && !isStaff(w) && !isMapWeapon(w) && usable(b, u, w); }
  const listWeapons = (b, u, pred) => u.weapons.map((id, i) => ({ i, w: weaponDef(b, id) })).filter((x) => x.w && pred(x.w));
  function attackWeapons(b, u) { return listWeapons(b, u, (w) => canAttackWith(b, u, w)); }
  function staves(b, u) { return listWeapons(b, u, (w) => isStaff(w) && usable(b, u, w)); }
  function mapWeapons(b, u) { return listWeapons(b, u, (w) => isMapWeapon(w) && usable(b, u, w)); }

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

  /* ---------- 支援 ---------- */
  function supportKey(a, b2) { return [a, b2].sort().join('|'); }
  function supportRank(b, a, b2) {
    const st = (b.supports || {})[supportKey(a, b2)];
    return st && st.rank ? st.rank : null;
  }
  // 範圍內已建立支援的同伴提供加成
  function supportBonus(b, u) {
    const out = { hit: 0, avo: 0, dmg: 0, crit: 0, partners: [] };
    if (!b.supports) return out;
    const range = rulesOf(b).supportRange;
    for (const o of b.units) {
      if (o === u || !onMap(o) || o.team !== u.team || dist(o, u) > range) continue;
      const rk = supportRank(b, u.id, o.id);
      const bon = rk && SUPPORT_BONUS[rk];
      if (!bon) continue;
      for (const k of ['hit', 'avo', 'dmg', 'crit']) out[k] += bon[k] || 0;
      out.partners.push(o.name + rk);
    }
    return out;
  }

  /* ---------- 戰鬥 ---------- */
  // me 以目前裝備從 myPos 攻擊 other 時的數值；無法攻擊回傳 null
  // opts.weapon 指定武器、opts.ignoreRange（地圖兵器）
  function combatSide(b, me, other, myPos, otherPos, opts) {
    opts = opts || {};
    const R = rulesOf(b);
    const w = opts.weapon || weaponOf(b, me);
    const ow = weaponOf(b, other);
    const d = dist(myPos, otherPos);
    if (opts.weapon ? !usable(b, me, w) : !canAttackWith(b, me, w)) return null;
    if (!opts.ignoreRange && !canHitAt(w, d)) return null;
    const mb = buffs(me), ob = buffs(other);
    const tOther = terrainAt(b, otherPos.x, otherPos.y) || { def: 0, avo: 0 };
    const magic = w.dmg === 'mag';
    const carryMe = me.carrying ? 0.5 : 1, carryOther = other.carrying ? 0.5 : 1;
    const ms = { skl: Math.floor(me.stats.skl * carryMe), spd: Math.floor(me.stats.spd * carryMe) };
    const os = { spd: Math.floor(other.stats.spd * carryOther) };
    // 技能與支援
    const myBonus = { hit: 0, avo: 0, crit: 0, dmg: 0, block: 0 }, otBonus = { hit: 0, avo: 0, crit: 0, dmg: 0, block: 0 };
    for (const sk of skillsOf(b, me)) if (sk.effect === 'bonus') for (const k in myBonus) myBonus[k] += sk[k] || 0;
    for (const sk of skillsOf(b, other)) if (sk.effect === 'bonus') for (const k in otBonus) otBonus[k] += sk[k] || 0;
    const sMe = supportBonus(b, me), sOt = supportBonus(b, other);
    // 改造等級（每級威力 +upMt、命中 +upHit）
    const wl = (me.wup && me.wup[w.id]) || 0;
    let mt = (w.mt || 0) + wl * (w.upMt != null ? w.upMt : 1);
    if (w.effective && w.effective.some((t) => (other.tags || []).includes(t))) mt *= R.effectiveMult;
    let tri = 0;
    if (!opts.ignoreRange) {
      if (ow && !isStaff(ow) && TRIANGLE[w.type] === ow.type) tri = 1;
      else if (ow && !isStaff(ow) && TRIANGLE[ow.type] === w.type) tri = -1;
    }
    const atk = (magic ? me.stats.mag : me.stats.str) + mt + tri * R.triangleDmg + myBonus.dmg + sMe.dmg;
    const defStat = (magic ? other.stats.res : other.stats.def) + (tOther.def || 0);
    const tags = [];
    const finish = (raw) => {
      let dmg = Math.max(0, raw - otBonus.block);
      if (R.morale) dmg = Math.floor(dmg * (me.morale || 100) / (other.morale || 100));
      if (mb.valor) dmg *= 2;
      if (ob.ironWall) dmg = Math.floor(dmg / 4);
      return dmg;
    };
    const dmg = finish(Math.max(0, atk - defStat));
    const dmgLuna = finish(Math.max(0, atk));
    if (mb.valor) tags.push('熱血');
    if (ob.ironWall) tags.push('對方鐵壁');
    let hitRaw = (w.hit || 0) + wl * (w.upHit != null ? w.upHit : 3) + ms.skl * 2 + Math.floor(me.stats.lck / 2) + tri * R.triangleHit + myBonus.hit + sMe.hit;
    let avo = os.spd * 2 + other.stats.lck + (tOther.avo || 0) + otBonus.avo + sOt.avo;
    if (mb.focus) { hitRaw += 30; tags.push('集中'); }
    if (ob.focus) avo += 30;
    let hitBase = clamp(hitRaw - avo, 0, 100);
    if (mb.sureHit) { hitBase = 100; tags.push('必中'); }
    const hit = ob.alert ? 0 : hitBase;
    if (ob.alert) tags.push('對方閃避');
    if (sMe.partners.length) tags.push('支援 ' + sMe.partners.join('、'));
    const crit = clamp((w.crit || 0) + Math.floor(ms.skl / 2) - other.stats.lck + myBonus.crit + sMe.crit, 0, 100);
    const purs = hasSkill(b, me, 'pursuit');
    const threshold = R.doubleThreshold - (purs ? (purs.value || 2) : 0);
    const count = opts.ignoreRange ? 1 : (ms.spd - os.spd >= threshold ? 2 : 1);
    const per = w.brave && !opts.ignoreRange ? 2 : 1;
    const procs = [];
    for (const eff of ['adept', 'sol', 'luna']) {
      const sk = hasSkill(b, me, eff);
      if (sk) procs.push({ effect: eff, name: sk.name, rate: skillRate(me, sk) });
    }
    return { weapon: w.name || w.id, weaponId: w.id, icon: w.icon, dmg, dmgLuna, hit, hitBase, crit, count, per,
      strikes: count * per, tri, tags, procs, cost: weaponCost(w) };
  }

  function forecast(b, att, def, from) {
    const aPos = from || att;
    return { att: combatSide(b, att, def, aPos, def), def: combatSide(b, def, att, def, aPos) };
  }

  // 先制：守方 HP 比例 ≤ value% 時先出手
  function vantageActive(b, def) {
    const sk = hasSkill(b, def, 'vantage');
    return !!sk && def.hp * 100 <= def.stats.hp * (sk.value || 50);
  }

  function strike(b, me, tg, s, rng, R, extra) {
    const proc = (eff) => { const p = s.procs.find((x) => x.effect === eff); return p && rng.roll(p.rate) ? p : null; };
    let hit, evaded = false;
    if (tg.buffs && tg.buffs.alert) { hit = false; evaded = true; delete tg.buffs.alert; }
    else hit = rng.roll(s.hitBase);
    const skills = extra ? [extra] : [];
    let base = s.dmg;
    if (hit) { const l = proc('luna'); if (l) { base = s.dmgLuna; skills.push(l.name); } }
    const crit = hit && rng.roll(s.crit);
    const dmg = hit ? Math.min(tg.hp, crit ? base * R.critMult : base) : 0;
    tg.hp -= dmg;
    let drain = 0;
    if (hit && dmg > 0) { const so = proc('sol'); if (so) { drain = Math.min(me.stats.hp - me.hp, dmg); me.hp += drain; skills.push(so.name); } }
    return { by: me.uid, target: tg.uid, hit, crit, dmg, hpAfter: tg.hp, evaded, skills, drain, hpSelf: me.hp };
  }

  /* 結算戰鬥（會修改 hp、消耗一次性狀態與資源）
     回傳 { strikes:[{by,target,hit,crit,dmg,hpAfter,evaded,skills,drain,hpSelf}], fc, dead:[uid] } */
  function resolveCombat(b, att, def, rng) {
    const R = rulesOf(b);
    const fc = forecast(b, att, def);
    const rounds = [];
    const first = fc.def && vantageActive(b, def) ? ['def', 'att'] : ['att', 'def'];
    for (const r of first) if (fc[r]) rounds.push(r);
    if (fc.att && fc.att.count > 1) rounds.push('att');
    else if (fc.def && fc.def.count > 1) rounds.push('def');
    const strikes = [];
    const struck = new Set();
    outer:
    for (const who of rounds) {
      const me = who === 'att' ? att : def, tg = who === 'att' ? def : att, s = fc[who];
      let n = s.per;
      const ad = s.procs.find((p) => p.effect === 'adept');
      let adeptName = null;
      if (ad && rng.roll(ad.rate)) { n += 1; adeptName = ad.name; }
      for (let k = 0; k < n; k++) {
        if (me.hp <= 0 || tg.hp <= 0) break outer;
        struck.add(me);
        strikes.push(strike(b, me, tg, s, rng, R, k === n - 1 && adeptName && k > 0 ? adeptName : null));
      }
    }
    for (const u of struck) {
      if (u.buffs) delete u.buffs.valor;
      payCost(b, u, weaponOf(b, u));
    }
    const dead = [att, def].filter((u) => u.hp <= 0).map((u) => u.uid);
    return { strikes, fc, dead, vantage: first[0] === 'def' };
  }

  /* ---------- 地圖兵器 ---------- */
  // 可選的中心點：burst → 射程內任一格；line → 相鄰 4 格（決定方向）
  function mapCenters(b, u, w) {
    const out = [];
    if (w.map.shape === 'line') {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (terrainAt(b, u.x + dx, u.y + dy)) out.push({ x: u.x + dx, y: u.y + dy });
      return out;
    }
    const [lo, hi] = weaponRange(w);
    for (let dy = -hi; dy <= hi; dy++) for (let dx = -hi; dx <= hi; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d >= lo && d <= hi && terrainAt(b, u.x + dx, u.y + dy)) out.push({ x: u.x + dx, y: u.y + dy });
    }
    return out;
  }

  function mapArea(b, u, w, at) {
    const size = w.map.size || 1;
    const out = [];
    if (w.map.shape === 'line') {
      const dx = Math.sign(at.x - u.x), dy = Math.sign(at.y - u.y);
      for (let i = 1; i <= size; i++) if (terrainAt(b, u.x + dx * i, u.y + dy * i)) out.push({ x: u.x + dx * i, y: u.y + dy * i });
      return out;
    }
    for (let dy = -size; dy <= size; dy++) for (let dx = -size; dx <= size; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > size) continue;
      if (terrainAt(b, at.x + dx, at.y + dy)) out.push({ x: at.x + dx, y: at.y + dy });
    }
    return out;
  }

  function mapVictims(b, u, w, area) {
    const ks = new Set(area.map((p) => key(p.x, p.y)));
    return b.units.filter((o) => onMap(o) && o !== u && ks.has(key(o.x, o.y)) && (w.map.friendly || !friendly(o.team, u.team)));
  }

  /* ---------- 其他 ---------- */
  function healAmount(b, healer, staff) { return (healer.stats.mag || 0) + (staff.heal || 10); }

  // 視野：team 方（含友軍）看得到的格子集合
  function visibleTiles(b, team) {
    const out = new Set();
    for (const u of b.units) {
      if (!onMap(u) || !friendly(u.team, team || 'player')) continue;
      const v = u.vision || 3;
      for (let dy = -v; dy <= v; dy++) for (let dx = -v; dx <= v; dx++) {
        if (Math.abs(dx) + Math.abs(dy) <= v && terrainAt(b, u.x + dx, u.y + dy)) out.add(key(u.x + dx, u.y + dy));
      }
    }
    return out;
  }

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
    DEFAULT_RULES, TRIANGLE, EFFECTS, SKILL_EFFECTS, SUPPORT_BONUS, rulesOf, friendly, onMap,
    skillsOf, hasSkill, skillRate, terrainAt, moveCost, moveOf, unitAt, reachable, pathTo,
    weaponDef, weaponOf, weaponRange, canHitAt, isStaff, isMapWeapon, weaponCost, canAfford, payCost, usable,
    canAttackWith, attackWeapons, staves, mapWeapons, attackTilesFrom, threatTiles,
    supportKey, supportRank, supportBonus, combatSide, forecast, vantageActive, resolveCombat,
    mapCenters, mapArea, mapVictims, healAmount, visibleTiles, expGain, levelUp, addExp, addMorale,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRPG;
})(typeof window !== 'undefined' ? window : globalThis);
