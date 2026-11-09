/* 敵方/友軍 AI
   ai 類型：aggressive(主動進攻) / guard(範圍內有目標才行動) / hold(原地不動，只攻擊射程內)
            cautious(慎重：不打會被反擊打倒的仗，不站進會被圍攻致死的位置)
            ambush(伏擊：觸發前同 hold，觸發後整組變 aggressive)
            flee(逃跑：不攻擊，往撤退點移動，抵達就離開地圖) */
(function (root) {
  'use strict';
  const SRPG = root.SRPG = root.SRPG || {};
  const R = SRPG.rules;
  const B = SRPG.battle;
  const { dist, key } = SRPG.util;

  // 評估從 pos 攻擊 target 的分數（期望傷害 + 擊殺獎勵 - 預期反擊）
  function scoreAttack(b, u, t, pos) {
    const ox = u.x, oy = u.y;
    u.x = pos.x; u.y = pos.y;
    B.autoEquip(b, u, dist(pos, t));
    B.autoEquip(b, t, dist(pos, t));
    const fc = R.forecast(b, u, t);
    u.x = ox; u.y = oy;
    if (!fc.att) return null;
    const exp = fc.att.dmg * fc.att.count * fc.att.hit / 100;
    const kill = fc.att.dmg * fc.att.count >= t.hp ? 50 * fc.att.hit / 100 : 0;
    const back = fc.def ? fc.def.dmg * fc.def.count * fc.def.hit / 100 : 0;
    const terr = R.terrainAt(b, pos.x, pos.y) || {};
    return exp * 2 + kill - back + (terr.def || 0) + (terr.avo || 0) / 10 + (t.lord ? 5 : 0);
  }

  // 下回合可能受到的最大傷害（所有能到達此格的敵人各打一次）
  function dangerAt(b, u, pos) {
    let total = 0;
    const ox = u.x, oy = u.y;
    u.x = pos.x; u.y = pos.y;
    for (const o of B.living(b)) {
      if (R.friendly(o.team, u.team)) continue;
      const k = pos.x + ',' + pos.y;
      if (o.ai === 'hold' || o.ai === 'ambush') { if (!R.attackTilesFrom(b, o, o).some((p) => p.x === pos.x && p.y === pos.y)) continue; }
      else { const t = R.threatTiles(b, o); if (!t.atk.has(k) && !t.move.has(k)) continue; }
      const w = R.attackWeapons(b, o)[0];
      if (!w) continue;
      const s = R.combatSide(b, o, u, o, u, { weapon: w.w, ignoreRange: true });
      if (s) total += s.dmg * s.count;
    }
    u.x = ox; u.y = oy;
    return total;
  }

  // 杖：找可到達、可治療的受傷同伴（缺血最多者）
  function planHeal(b, u, reach) {
    const st = R.staves(b, u);
    if (!st.length) return null;
    let best = null;
    for (const o of B.living(b)) {
      if (o === u || !R.friendly(o.team, u.team) || o.hp >= o.stats.hp) continue;
      const lack = o.stats.hp - o.hp;
      for (const n of reach.values()) {
        if (!n.stop || !st.some(({ w }) => R.canHitAt(w, dist(n, o)))) continue;
        const sc = lack - n.cost * 0.01;
        if (!best || sc > best.score) best = { x: n.x, y: n.y, heal: o.uid, score: sc };
      }
    }
    return best;
  }

  // 地圖兵器：找出能打到最多敵人（扣掉誤傷同伴）的位置與中心
  function planMap(b, u, reach) {
    let best = null;
    for (const { i, w } of R.mapWeapons(b, u)) {
      for (const n of reach.values()) {
        if (!n.stop) continue;
        const ox = u.x, oy = u.y;
        u.x = n.x; u.y = n.y;
        for (const at of R.mapCenters(b, u, w)) {
          let sc = 0;
          for (const v of R.mapVictims(b, u, w, R.mapArea(b, u, w, at))) {
            const s = R.combatSide(b, u, v, u, v, { weapon: w, ignoreRange: true });
            if (!s) continue;
            const ev = Math.min(v.hp, s.dmg) * s.hit / 100 + (s.dmg >= v.hp ? 10 * s.hit / 100 : 0);
            sc += R.friendly(v.team, u.team) ? -ev * 2 : ev;
          }
          if (sc > 0 && (!best || sc > best.score)) best = { x: n.x, y: n.y, map: { weapon: i, at }, score: sc - n.cost * 0.01 };
        }
        u.x = ox; u.y = oy;
      }
    }
    return best;
  }

  /* 主動技能：評估每個可到達位置、每個施放點的效果分數 */
  const STATUS_VALUE = { sleep: 10, stun: 9, poison: 4, slow: 3, silence: 4, regen: 5 };
  function scoreAbility(b, u, ab, at) {
    const A = SRPG.ability;
    const foes = B.living(b).filter((o) => !R.friendly(o.team, u.team));
    const threatened = (v) => foes.some((f) => dist(f, v) <= 6);
    let sc = 0;
    for (const v of A.victims(b, u, ab, A.area(b, u, ab, at))) {
      const foe = !R.friendly(v.team, u.team);
      const s = A.strikeInfo(b, u, ab, v);
      let val = 0;
      if (s) val += (Math.min(v.hp, s.dmg) * s.hit / 100) * 2 + (s.dmg >= v.hp ? 25 * s.hit / 100 : 0) + (v.lord ? 3 : 0);
      if (ab.heal) val += Math.min(v.stats.hp - v.hp, A.healAmount(u, ab)) * 0.9;
      const hitP = s ? s.hit / 100 : 1;
      for (const e of ab.effects || []) {
        if (e.status && R.STATUSES[e.status]) {
          if (!(v.status || {})[e.status] && v.hp > (s ? s.dmg : 0)) val += (STATUS_VALUE[e.status] || 3) * A.statusChance(e, v) / 100 * hitP;
        } else if (e.stat) {
          if (!(v.mods || []).some((m) => m.stat === e.stat && Math.sign(m.value) === Math.sign(e.value))) val += Math.abs(e.value) * (threatened(v) ? 1 : 0.1);
        } else if (e.cure) val += Object.keys(v.status || {}).filter((k) => (R.STATUSES[k] || {}).bad).length * 6 + (v.mods || []).filter((m) => m.value < 0).length * 2;
        else if (e.push) val += 1;
      }
      sc += ab.target === 'any' && !foe && (s || (ab.effects || []).some((e) => e.status && R.STATUSES[e.status].bad)) ? -val * 2 : val;
    }
    return sc - (ab.cost || 0) * 0.2;
  }
  function planAbility(b, u, reach) {
    const A = SRPG.ability;
    if (!A || !(u.abilities || []).length) return null;
    const list = A.listFor(b, u).filter((ab) => !A.blockReason(b, u, ab, true));
    if (!list.length) return null;
    const perTile = [];
    const ox = u.x, oy = u.y;
    for (const n of reach.values()) {
      if (!n.stop) continue;
      u.x = n.x; u.y = n.y;
      let best = null;
      for (const ab of list) for (const at of A.centers(b, u, ab)) {
        const sc = scoreAbility(b, u, ab, at) - n.cost * 0.01;
        if (sc > 3 && (!best || sc > best.score)) best = { x: n.x, y: n.y, ability: { id: ab.id, at }, score: sc };
      }
      if (best) perTile.push(best);
    }
    u.x = ox; u.y = oy;
    perTile.sort((a, z) => z.score - a.score);
    if (u.ai !== 'cautious') return perTile[0] || null;
    // 慎重：只在不會被圍攻致死的位置施放
    for (const p of perTile.slice(0, 6)) if (dangerAt(b, u, p) < u.hp * 0.6) return p;
    return null;
  }

  /* 敵方精神指令：依計畫決定要用哪些（回傳精神指令 id 陣列，尚未施放） */
  function pickSpirits(b, u, p) {
    if (!R.rulesOf(b).spirits || !(u.spirits || []).length) return [];
    const has = (eff) => (u.spirits || []).find((id) => { const s = b.campaign.spirits[id]; return s && s.effect === eff && (s.cost || 0) <= u.sp; });
    const out = [];
    let budget = u.sp;
    const take = (id) => { if (!id) return; const c = b.campaign.spirits[id].cost || 0; if (c <= budget) { budget -= c; out.push(id); } };
    const t = p && p.target && B.byUid(b, p.target);
    if (t) {
      const ox = u.x, oy = u.y; u.x = p.x; u.y = p.y;
      const fc = B.previewAttack(b, u, t);
      u.x = ox; u.y = oy;
      if (fc.att) {
        const sh = has('sureHit');
        if (sh && fc.att.hit < 75) take(sh);
        const vl = has('valor');
        const total = fc.att.dmg * fc.att.strikes;
        if (vl && (total < t.hp && total * 2 >= t.hp || t.lord)) take(vl);
      }
    }
    const iw = has('ironWall');
    if (iw && (u.boss || u.hp <= u.stats.hp / 2)) take(iw);
    return out;
  }

  /* 回傳 { x, y, target?:uid, heal?:uid, item?:索引, map?:{weapon,at} } */
  // 逃跑：沿路徑往撤退點走到最遠可停的格子；抵達時 escape:true
  function planFlee(b, u) {
    const goal = B.escapePoint(b, u);
    if (!goal) return { x: u.x, y: u.y, target: null };
    if (u.x === goal.x && u.y === goal.y) return { x: u.x, y: u.y, target: null, escape: true };
    const reach = R.reachable(b, u);
    const far = R.reachable(b, u, 999);
    if (!far.get(key(goal.x, goal.y))) return { x: u.x, y: u.y, target: null };
    let dest = { x: u.x, y: u.y };
    for (const p of R.pathTo(far, goal.x, goal.y)) {
      const n = reach.get(key(p.x, p.y));
      if (!n) break;
      if (n.stop) dest = p;
    }
    return { x: dest.x, y: dest.y, target: null, escape: dest.x === goal.x && dest.y === goal.y };
  }

  function plan(b, u) {
    if (u.ai === 'flee') return planFlee(b, u);
    const reach = u.ai === 'hold' || u.ai === 'ambush' ? new Map([[key(u.x, u.y), { x: u.x, y: u.y, cost: 0, stop: true }]]) : R.reachable(b, u);
    const foes = B.living(b).filter((o) => !R.friendly(o.team, u.team));
    const hv = planHeal(b, u, reach);
    if (hv && hv.score >= 5) return hv;
    // 血量低且有回復道具 → 原地喝藥
    const potion = (u.items || []).findIndex((it) => (b.campaign.items[it.id] || {}).kind === 'heal');
    if (potion >= 0 && u.hp <= u.stats.hp * 0.4) return { x: u.x, y: u.y, item: potion };
    let best = null;
    for (const n of reach.values()) {
      if (!n.stop) continue;
      for (const t of foes) {
        const d = dist(n, t);
        if (!B.weaponsFor(b, u, d).length) continue;
        const s = scoreAttack(b, u, t, n);
        if (s == null) continue;
        if (u.ai === 'cautious') {
          const ox = u.x, oy = u.y; u.x = n.x; u.y = n.y;
          const fc = B.previewAttack(b, u, t);
          u.x = ox; u.y = oy;
          const kills = fc.att && fc.att.dmg * fc.att.strikes >= t.hp && fc.att.hit >= 70;
          const back = fc.def ? fc.def.dmg * fc.def.strikes : 0;
          if (back >= u.hp) continue;
          const danger = back + dangerAt(b, u, n);
          if (!kills && danger >= u.hp * 0.6) continue;
          if (u.lord && danger >= u.hp) continue;   // 主角：就算能擊倒也不站進會被打死的位置
        }
        const sc = s - n.cost * 0.01; // 同分時少走一點
        if (!best || sc > best.score) best = { x: n.x, y: n.y, target: t.uid, score: sc };
      }
    }
    const ap = planAbility(b, u, reach);
    if (ap && (!best || ap.score > best.score * 0.9)) return ap;
    const mp = planMap(b, u, reach);
    if (mp && (!best || mp.score > best.score * 0.8)) return mp;
    if (best) return best;
    if (hv) return hv;
    if (u.ai === 'cautious' && foes.length) {
      // 沒有安全的攻擊：往安全且靠近敵人的地方移動
      let safe = null;
      const nearest = (n) => Math.min(...foes.map((f) => dist(n, f)));
      for (const n of reach.values()) {
        if (!n.stop) continue;
        const d = dangerAt(b, u, n);
        const sc = (d >= u.hp * 0.6 ? -100 : 0) - nearest(n) * 0.5 - d * 0.2;
        if (!safe || sc > safe.score) safe = { x: n.x, y: n.y, target: null, score: sc };
      }
      if (safe) return safe;
    }
    if (u.ai !== 'aggressive' || !foes.length) return { x: u.x, y: u.y, target: null };

    // 沒有可攻擊目標：朝最近敵人前進（用無限移動力的路徑距離）
    const far = R.reachable(b, u, 999);
    let goal = null, gd = Infinity;
    // 逃跑中的敵人不當前進目標（射程內仍會攻擊），只剩他們時才追
    const chase = foes.some((o) => o.ai !== 'flee') ? foes.filter((o) => o.ai !== 'flee') : foes;
    for (const t of chase) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = far.get(key(t.x + dx, t.y + dy));
      if (n && n.cost < gd) { gd = n.cost; goal = n; }
    }
    if (!goal) return { x: u.x, y: u.y, target: null };
    const path = R.pathTo(far, goal.x, goal.y);
    let dest = { x: u.x, y: u.y };
    for (const p of path) {
      const n = reach.get(key(p.x, p.y));
      if (!n) break;
      if (n.stop) dest = p;
    }
    return { x: dest.x, y: dest.y, target: null };
  }

  SRPG.ai = { plan, planFlee, planAbility, scoreAbility, scoreAttack, planMap, pickSpirits, dangerAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRPG;
})(typeof window !== 'undefined' ? window : globalThis);
