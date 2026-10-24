/* 敵方/友軍 AI
   ai 類型：aggressive(主動進攻) / guard(範圍內有目標才行動) / hold(原地不動，只攻擊射程內) */
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

  /* 回傳 { x, y, target?:uid, heal?:uid, item?:索引 } */
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
        const sc = s - n.cost * 0.01; // 同分時少走一點
        if (!best || sc > best.score) best = { x: n.x, y: n.y, target: t.uid, score: sc };
      }
    }
    if (best) return best;
    if (hv) return hv;
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

  SRPG.ai = { plan, scoreAttack };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRPG;
})(typeof window !== 'undefined' ? window : globalThis);
