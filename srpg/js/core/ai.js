/* 敵方/友軍 AI
   ai 類型：aggressive(主動進攻) / guard(範圍內有目標才行動) / hold(原地不動，只攻擊射程內)
            cautious(慎重：不打會被反擊打倒的仗，不站進會被圍攻致死的位置) */
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
      if (o.ai === 'hold') { if (!R.attackTilesFrom(b, o, o).some((p) => p.x === pos.x && p.y === pos.y)) continue; }
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
  function plan(b, u) {
    const reach = u.ai === 'hold' ? new Map([[key(u.x, u.y), { x: u.x, y: u.y, cost: 0, stop: true }]]) : R.reachable(b, u);
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
          if (!kills && back + dangerAt(b, u, n) >= u.hp * 0.6) continue;
        }
        const sc = s - n.cost * 0.01; // 同分時少走一點
        if (!best || sc > best.score) best = { x: n.x, y: n.y, target: t.uid, score: sc };
      }
    }
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
    for (const t of foes) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
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

  SRPG.ai = { plan, scoreAttack, planMap, pickSpirits, dangerAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRPG;
})(typeof window !== 'undefined' ? window : globalThis);
