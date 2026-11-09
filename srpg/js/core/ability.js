/* 主動技能（招式／魔法）：有施放距離與作用範圍，可造成傷害、回復、增益/減益、狀態異常、擊退、吸血
   技能定義 campaign.abilities[id] = {
     name, desc, icon, fx:'fire|ice|thunder|holy|dark|wind|poison|slash|heal|buff|earth', color, anim?,
     target: 'enemy'|'ally'|'any'|'self',
     range: [最小, 最大]（[0,0] = 以自己為中心），
     area: { shape:'single'|'burst'|'square'|'cross'|'line'|'cone'|'all', size, hollow? },
     power?（威力，>0 才造成傷害）, dmg:'phys'|'mag', hit?, crit?,
     heal?（回復量，實際 = heal + 魔力/2）,
     effects?: [ {status, chance?, turns?} | {stat, value, turns?} | {push:格數} | {drain:%} | {cure:true} ],
     cost?, costType?:'st'|'mp', morale?, cooldown?（使用後幾回合不能再用）
   }
   單位：u.abilities = [id]；職業/角色可用 learn:[{ level, ability }] 在升級時學會 */
(function (root) {
  'use strict';
  const SRPG = root.SRPG = root.SRPG || {};
  const R = SRPG.rules;
  const B = SRPG.battle;
  const { dist, key, clamp, clone } = SRPG.util;

  const SHAPES = {
    single: '單體', burst: '菱形範圍', square: '方形範圍', cross: '十字', line: '直線（貫穿）', cone: '扇形', all: '全地圖',
  };
  const DIRECTIONAL = { line: true, cone: true };
  const FX = ['slash', 'fire', 'ice', 'thunder', 'wind', 'earth', 'holy', 'dark', 'poison', 'heal', 'buff'];

  /* 內建技能庫（劇本可覆寫或增加） */
  const BASE_ABILITIES = {
    whirlwind:  { name: '旋風斬', desc: '以自己為中心，攻擊周圍所有敵人', target: 'enemy', range: [0, 0], area: { shape: 'burst', size: 1, hollow: true }, power: 4, dmg: 'phys', hit: 85, cost: 4, fx: 'slash', color: '#ffffff' },
    pierce:     { name: '貫穿突刺', desc: '直線貫穿 2 格的敵人', target: 'enemy', range: [1, 1], area: { shape: 'line', size: 2 }, power: 5, dmg: 'phys', hit: 85, cost: 3, fx: 'slash', color: '#cfe8ff' },
    arrow_rain: { name: '箭雨', desc: '對遠處範圍降下箭雨', target: 'enemy', range: [2, 4], area: { shape: 'burst', size: 1 }, power: 3, dmg: 'phys', hit: 75, cost: 5, cooldown: 1, fx: 'slash', color: '#e8d8a0' },
    fireball:   { name: '火球術', desc: '在指定地點爆炸', target: 'enemy', range: [1, 3], area: { shape: 'burst', size: 1 }, power: 4, dmg: 'mag', hit: 85, cost: 5, fx: 'fire', color: '#ff8a3a' },
    ice_lance:  { name: '冰槍', desc: '直線 3 格冰槍，命中時 50% 緩速', target: 'enemy', range: [1, 1], area: { shape: 'line', size: 3 }, power: 4, dmg: 'mag', hit: 85, cost: 5, fx: 'ice', color: '#8fe0ff', effects: [{ status: 'slow', chance: 50, turns: 2 }] },
    thunder_cross: { name: '十字雷', desc: '十字形落雷', target: 'enemy', range: [1, 3], area: { shape: 'cross', size: 1 }, power: 5, dmg: 'mag', hit: 80, cost: 6, cooldown: 1, fx: 'thunder', color: '#ffe14a' },
    sleep_mist: { name: '睡魔之霧', desc: '範圍內敵人 60% 機率睡眠（受到傷害就會醒）', target: 'enemy', range: [1, 3], area: { shape: 'burst', size: 1 }, cost: 6, cooldown: 2, fx: 'dark', color: '#9fb4ff', effects: [{ status: 'sleep', chance: 60, turns: 1 }] },
    poison_blade: { name: '毒刃', desc: '攻擊並使目標中毒', target: 'enemy', range: [1, 1], area: { shape: 'single' }, power: 3, dmg: 'phys', hit: 90, cost: 2, fx: 'poison', color: '#9be15a', effects: [{ status: 'poison', chance: 100, turns: 3 }] },
    shield_bash: { name: '盾擊', desc: '擊退目標 1 格，50% 暈眩', target: 'enemy', range: [1, 1], area: { shape: 'single' }, power: 2, dmg: 'phys', hit: 90, cost: 3, fx: 'earth', color: '#d0b080', effects: [{ push: 1 }, { status: 'stun', chance: 50, turns: 1 }] },
    heal_circle: { name: '治癒之環', desc: '範圍內的同伴回復 HP', target: 'ally', range: [0, 2], area: { shape: 'burst', size: 1 }, heal: 8, cost: 6, fx: 'heal', color: '#5ae07a' },
    purify:     { name: '淨化', desc: '解除同伴的所有異常狀態與減益', target: 'ally', range: [0, 2], area: { shape: 'single' }, cost: 3, fx: 'holy', color: '#fff6b0', effects: [{ cure: true }] },
    war_cry:    { name: '戰吼', desc: '周圍同伴力量 +3（2 回合）', target: 'ally', range: [0, 0], area: { shape: 'burst', size: 2 }, cost: 4, cooldown: 2, fx: 'buff', color: '#ff9a5a', effects: [{ stat: 'str', value: 3, turns: 2 }] },
    holy_shield: { name: '聖盾', desc: '同伴守備、魔防 +4（2 回合）', target: 'ally', range: [0, 2], area: { shape: 'single' }, cost: 4, fx: 'holy', color: '#fff6b0', effects: [{ stat: 'def', value: 4, turns: 2 }, { stat: 'res', value: 4, turns: 2 }] },
    haste:      { name: '疾風', desc: '同伴移動力 +2、迴避 +15（1 回合）', target: 'ally', range: [0, 2], area: { shape: 'single' }, cost: 4, fx: 'wind', color: '#b8ffd8', effects: [{ stat: 'move', value: 2, turns: 1 }, { stat: 'avo', value: 15, turns: 1 }] },
    weaken:     { name: '衰弱詛咒', desc: '範圍內敵人守備、魔防 -3（2 回合）', target: 'enemy', range: [1, 3], area: { shape: 'burst', size: 1 }, cost: 4, fx: 'dark', color: '#c7a0ff', effects: [{ stat: 'def', value: -3, turns: 2 }, { stat: 'res', value: -3, turns: 2 }] },
    drain_touch: { name: '吸精', desc: '攻擊並吸收 50% 傷害', target: 'enemy', range: [1, 2], area: { shape: 'single' }, power: 5, dmg: 'mag', hit: 90, cost: 4, fx: 'dark', color: '#ff6aa8', effects: [{ drain: 50 }] },
    regen_aura: { name: '再生之光', desc: '範圍內同伴獲得再生（每回合回復 10% HP，3 回合）', target: 'ally', range: [0, 0], area: { shape: 'burst', size: 2 }, cost: 6, cooldown: 3, fx: 'heal', color: '#a8ffb0', effects: [{ status: 'regen', chance: 100, turns: 3 }] },
    dragon_breath: { name: '龍息', desc: '扇形噴出烈焰', target: 'enemy', range: [1, 1], area: { shape: 'cone', size: 3 }, power: 5, dmg: 'mag', hit: 80, cost: 8, cooldown: 2, fx: 'fire', color: '#ff5a2a' },
  };

  const abilityDef = (b, id) => (id && b.campaign.abilities && b.campaign.abilities[id] ? Object.assign({ id }, b.campaign.abilities[id]) : null);
  const rangeOf = (ab) => ab.range || [1, 1];

  /* ---------- 可用性 ---------- */
  function costOf(ab) {
    if (!ab.cost) return null;
    return { type: ab.costType || (ab.dmg === 'phys' ? 'st' : 'mp'), n: ab.cost };
  }
  // 回傳 null（可用）或不能用的理由
  function blockReason(b, u, ab, ignoreTargets) {
    if (!ab) return '沒有這個技能';
    const RU = R.rulesOf(b);
    if (u.status && u.status.silence) return '沉默中';
    if (R.disabled(u)) return '無法行動';
    if ((u.cd || {})[ab.id] > 0) return `冷卻 ${u.cd[ab.id]}`;
    if (ab.morale && RU.morale && (u.morale || 0) < ab.morale) return `氣力 ${ab.morale}`;
    const c = costOf(ab);
    if (c && RU.resources && (u[c.type] || 0) < c.n) return (c.type === 'mp' ? '法力' : '體力') + '不足';
    if (ignoreTargets) return null;
    if (!centers(b, u, ab).some((at) => victims(b, u, ab, area(b, u, ab, at)).length)) return '沒有目標';
    return null;
  }
  function listFor(b, u) {
    return (u.abilities || []).map((id) => abilityDef(b, id)).filter(Boolean).map((ab) => Object.assign(ab, { blocked: blockReason(b, u, ab) }));
  }
  function usableList(b, u) { return listFor(b, u).filter((ab) => !ab.blocked); }

  /* ---------- 範圍 ---------- */
  // 可選的施放點：方向型 → 相鄰 4 格；其他 → 距離在 range 內的格子；self → 自己
  function centers(b, u, ab) {
    const shape = (ab.area || {}).shape || 'single';
    if (ab.target === 'self') return [{ x: u.x, y: u.y }];
    if (shape === 'all') return [{ x: u.x, y: u.y }];
    if (DIRECTIONAL[shape]) return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: u.x + dx, y: u.y + dy })).filter((p) => R.terrainAt(b, p.x, p.y));
    const [lo, hi] = rangeOf(ab);
    const out = [];
    for (let dy = -hi; dy <= hi; dy++) for (let dx = -hi; dx <= hi; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d >= lo && d <= hi && R.terrainAt(b, u.x + dx, u.y + dy)) out.push({ x: u.x + dx, y: u.y + dy });
    }
    return out;
  }

  // 純幾何：以 caster 位置與施放點 at 計算格子（不檢查地圖），編輯器預覽也用這個
  function shapeTiles(ab, from, at, mapW, mapH) {
    const ar = ab.area || { shape: 'single' };
    const n = ar.size != null ? ar.size : 1;
    const out = [];
    const push = (x, y) => { if (mapW == null || (x >= 0 && y >= 0 && x < mapW && y < mapH)) out.push({ x, y }); };
    switch (ar.shape) {
      case 'burst': case 'square':
        for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) {
          if (ar.shape === 'burst' && Math.abs(dx) + Math.abs(dy) > n) continue;
          if (ar.hollow && !dx && !dy) continue;
          push(at.x + dx, at.y + dy);
        }
        break;
      case 'cross':
        if (!ar.hollow) push(at.x, at.y);
        for (let i = 1; i <= n; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) push(at.x + dx * i, at.y + dy * i);
        break;
      case 'line': {
        const dx = Math.sign(at.x - from.x), dy = Math.sign(at.y - from.y);
        for (let i = 1; i <= Math.max(1, n); i++) push(from.x + dx * i, from.y + dy * i);
        break;
      }
      case 'cone': {
        const dx = Math.sign(at.x - from.x), dy = Math.sign(at.y - from.y);
        for (let i = 1; i <= Math.max(1, n); i++) for (let w = -(i - 1); w <= i - 1; w++) push(from.x + dx * i + dy * w, from.y + dy * i + dx * w);
        break;
      }
      case 'all':
        if (mapW != null) for (let y = 0; y < mapH; y++) for (let x = 0; x < mapW; x++) out.push({ x, y });
        break;
      default: push(at.x, at.y);
    }
    return out;
  }
  function area(b, u, ab, at) {
    return shapeTiles(ab, u, at, b.map.w, b.map.h).filter((p) => R.terrainAt(b, p.x, p.y));
  }

  function victims(b, u, ab, tiles) {
    const ks = new Set(tiles.map((p) => key(p.x, p.y)));
    return b.units.filter((o) => {
      if (!R.onMap(o) || !ks.has(key(o.x, o.y))) return false;
      switch (ab.target) {
        case 'self': return o === u;
        case 'ally': return R.friendly(o.team, u.team);
        case 'any': return o !== u;
        default: return o !== u && !R.friendly(o.team, u.team);
      }
    });
  }

  /* ---------- 數值預估 ---------- */
  // 攻擊型技能對單一目標的預估：{ dmg, hit, crit }（沿用戰鬥公式；不會被反擊）
  function pseudoWeapon(ab) {
    return { id: 'ability:' + ab.id, name: ab.name, type: 'ability', dmg: ab.dmg || 'mag', mt: ab.power || 0,
      hit: ab.hit != null ? ab.hit : 90, crit: ab.crit || 0, range: [0, 99] };
  }
  function strikeInfo(b, u, ab, v) {
    if (!(ab.power > 0)) return null;
    return R.combatSide(b, u, v, u, v, { weapon: pseudoWeapon(ab), ignoreRange: true, initiator: true, ability: true });
  }
  function healAmount(u, ab) { return (ab.heal || 0) + Math.floor(R.statOf(u, 'mag') / 2); }
  // 狀態命中率：基本機率；敵將減半
  function statusChance(eff, v) { const c = eff.chance != null ? eff.chance : 100; return v.boss && R.STATUSES[eff.status] && R.STATUSES[eff.status].bad ? Math.floor(c / 2) : c; }

  function preview(b, u, ab, at) {
    const tiles = area(b, u, ab, at);
    const vs = victims(b, u, ab, tiles);
    return { tiles, targets: vs.map((v) => ({ unit: v, strike: strikeInfo(b, u, ab, v), heal: ab.heal ? Math.min(v.stats.hp - v.hp, healAmount(u, ab)) : 0 })) };
  }

  /* ---------- 效果 ---------- */
  function addMod(v, stat, value, turns) {
    v.mods = (v.mods || []).filter((m) => !(m.stat === stat && Math.sign(m.value) === Math.sign(value)));
    v.mods.push({ stat, value, turns: turns || 2 });
  }
  function addStatus(v, id, turns) {
    v.status = v.status || {};
    v.status[id] = Math.max(v.status[id] || 0, turns || 1);
  }
  function cure(v) {
    if (v.status) for (const k of Object.keys(v.status)) if ((R.STATUSES[k] || {}).bad) delete v.status[k];
    if (v.mods) v.mods = v.mods.filter((m) => m.value > 0);
  }
  // 擊退：沿施放者→目標方向推 n 格，遇到不能站的格子或單位就停
  function push(b, u, v, n) {
    const dx = Math.sign(v.x - u.x), dy = dx ? 0 : Math.sign(v.y - u.y);
    if (!dx && !dy) return 0;
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const nx = v.x + dx, ny = v.y + dy;
      if (R.moveCost(R.terrainAt(b, nx, ny), v.moveType) === Infinity || R.unitAt(b, nx, ny)) break;
      v.x = nx; v.y = ny; moved++;
    }
    return moved;
  }

  /* 施放：回傳 { area, results:[{target, hit, crit, dmg, hpAfter, heal, evaded, effects:[文字]}], exp, levelUps, deaths, learned } */
  function use(b, u, abilityId, at) {
    const ab = abilityDef(b, abilityId);
    if (!ab || !(u.abilities || []).includes(abilityId) || blockReason(b, u, ab)) return null;
    if (!centers(b, u, ab).some((p) => p.x === at.x && p.y === at.y)) return null;
    const RU = R.rulesOf(b);
    const tiles = area(b, u, ab, at);
    const vs = victims(b, u, ab, tiles);
    const res = { ability: ab, area: tiles, results: [], exp: {}, levelUps: {}, deaths: [], learned: {} };
    const td = R.dirToward(u, at);
    if (td != null) u.dir = td;
    let expSum = 0;
    for (const v of vs) {
      const r = { target: v.uid, hit: true, crit: false, dmg: 0, heal: 0, evaded: false, effects: [] };
      const s = strikeInfo(b, u, ab, v);
      if (s) {
        if (v.buffs && v.buffs.alert) { r.hit = false; r.evaded = true; delete v.buffs.alert; }
        else r.hit = b.rng.roll(s.hitBase);
        r.crit = r.hit && b.rng.roll(s.crit);
        r.dmg = r.hit ? Math.min(v.hp, r.crit ? s.dmg * RU.critMult : s.dmg) : 0;
        v.hp -= r.dmg;
        if (r.dmg > 0 && v.status && v.status.sleep) { delete v.status.sleep; r.effects.push('醒來'); }
        if (!R.friendly(v.team, u.team)) { expSum += R.expGain(u, v, r.hit, v.hp <= 0); R.addMorale(b, v, 1); }
        if (r.hit && v.hp > 0 && v.ai === 'ambush') B.wakeAmbush(b, v);
      }
      if (ab.heal) { r.heal = Math.min(v.stats.hp - v.hp, healAmount(u, ab)); v.hp += r.heal; expSum += 4 + Math.floor(r.heal / 2); }
      if (r.hit && v.hp > 0) {
        for (const e of ab.effects || []) {
          if (e.status && R.STATUSES[e.status]) {
            if (b.rng.roll(statusChance(e, v))) { addStatus(v, e.status, e.turns); r.effects.push(R.STATUSES[e.status].name); }
            else if (R.STATUSES[e.status].bad) r.effects.push('抵抗');
          } else if (e.stat) { addMod(v, e.stat, e.value || 0, e.turns); r.effects.push(statLabel(e.stat) + (e.value > 0 ? '+' : '') + e.value); if (R.friendly(v.team, u.team)) expSum += 3; }
          else if (e.push) { if (push(b, u, v, e.push)) r.effects.push('擊退'); }
          else if (e.cure) { cure(v); r.effects.push('淨化'); expSum += 3; }
        }
      }
      const drain = (ab.effects || []).find((e) => e.drain);
      if (drain && r.dmg > 0) { const h = Math.min(u.stats.hp - u.hp, Math.floor(r.dmg * drain.drain / 100)); u.hp += h; r.drain = h; }
      r.hpAfter = v.hp; r.x = v.x; r.y = v.y;
      res.results.push(r);
      if (v.hp <= 0) {
        res.deaths.push(v);
        B.fire(b, 'death', { unit: v.id });
        const loot = B.takeLoot(b, u, v);
        if (loot.length) { res.loot = (res.loot || []).concat(loot); res.lootBy = u.uid; }
      }
    }
    // 消耗、冷卻、氣力、經驗
    const c = costOf(ab);
    if (c && RU.resources) u[c.type] = Math.max(0, (u[c.type] || 0) - c.n);
    if (ab.cooldown) (u.cd = u.cd || {})[ab.id] = ab.cooldown;
    if (u.buffs) delete u.buffs.valor;
    R.addMorale(b, u, 1 + res.deaths.filter((d) => !R.friendly(d.team, u.team)).length * 3);
    if (u.team === 'player' && u.hp > 0) {
      let e = Math.min(100, Math.max(vs.length ? 5 : 0, expSum));
      if (u.buffs && u.buffs.effort) { e = Math.min(100, e * 2); delete u.buffs.effort; }
      if (e) {
        res.exp[u.uid] = e;
        const ups = R.addExp(b, u, e, b.rng);
        if (ups.length) { res.levelUps[u.uid] = ups; const l = learnFor(b, u); if (l.length) res.learned[u.uid] = l; }
      }
    }
    B.finishAction(b, u, true);
    return res;
  }

  function statLabel(k) {
    return ({ hit: '命中', avo: '迴避', crit: '必殺', move: '移動' })[k] || (SRPG.campaign.STAT_NAMES[k] || k);
  }

  /* ---------- 學習 ---------- */
  // 依職業與角色的 learn 表，學會目前等級以下的技能；回傳新學會的技能名稱
  function learnFor(b, u) {
    const c = b.campaign;
    const list = [].concat((c.classes[u.cls] || {}).learn || [], (c.units[u.id] || {}).learn || []);
    const got = [];
    u.abilities = u.abilities || [];
    for (const l of list) {
      if (!l.ability || !c.abilities[l.ability] || (l.level || 1) > u.level || u.abilities.includes(l.ability)) continue;
      u.abilities.push(l.ability);
      got.push(c.abilities[l.ability].name || l.ability);
    }
    return got;
  }

  /* ---------- 回合開始：狀態、增益與冷卻 ---------- */
  function phaseStart(b, u) {
    const msgs = [];
    if (u.status) {
      const st = u.status;
      if (st.sleep || st.stun) { u.acted = true; msgs.push({ uid: u.uid, text: st.sleep ? '睡眠中' : '暈眩中' }); }
      if (st.poison) { const n = Math.min(u.hp - 1, Math.max(1, Math.floor(u.stats.hp / 10))); if (n > 0) { u.hp -= n; msgs.push({ uid: u.uid, text: '中毒 -' + n, dmg: n }); } }
      if (st.regen && u.hp < u.stats.hp) { const n = Math.min(u.stats.hp - u.hp, Math.max(1, Math.floor(u.stats.hp / 10))); u.hp += n; msgs.push({ uid: u.uid, heal: n }); }
      for (const k of Object.keys(st)) { st[k]--; if (st[k] <= 0) delete st[k]; }
    }
    if (u.mods) u.mods = u.mods.filter((m) => --m.turns > 0);
    if (u.cd) for (const k of Object.keys(u.cd)) { u.cd[k]--; if (u.cd[k] <= 0) delete u.cd[k]; }
    return msgs;
  }

  SRPG.ability = {
    SHAPES, DIRECTIONAL, FX, BASE_ABILITIES, abilityDef, costOf, blockReason, listFor, usableList, centers, shapeTiles, area, victims,
    strikeInfo, healAmount, statusChance, preview, use, learnFor, phaseStart, statLabel, addMod, addStatus, cure, push,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRPG;
})(typeof window !== 'undefined' ? window : globalThis);
