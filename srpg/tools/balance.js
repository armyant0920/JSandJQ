#!/usr/bin/env node
/* 數值平衡統計：雙方都由 AI 操作，從第一章打到結局（名冊、等級、旗標會延續）
   用法：node srpg/tools/balance.js [次數=30] [劇本 JS/JSON 路徑]
   輸出每章的首次勝率、最終通過率（輸了會重試，最多 3 次）、平均回合數、我方平均陣亡數。
   注意：我方 AI 只會「找最划算的攻擊」，比真人玩家弱很多；勝率 60% 以上通常代表真人能輕鬆過關。 */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
for (const f of ['util', 'media', 'campaign', 'rules', 'battle', 'ai', 'script', 'save', 'prep']) require(path.join(ROOT, 'js/core', f + '.js'));
const { campaign: C, rules: R, battle: B, ai: AI, script: S, prep: P, util: U } = globalThis.SRPG;

function loadCampaign(file) {
  const src = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.json')) return C.normalize(JSON.parse(src));
  const ctx = { window: {} };
  vm.runInNewContext(src, ctx);
  return C.normalize(ctx.window.SRPG_DEFAULT_CAMPAIGN);
}

// 劇本事件：選項一律選第一個，增援/說服/給予照常執行
function runScripts(c, b, party, seed) {
  let guard = 0;
  while (b.queue.length && guard++ < 50) {
    const id = b.queue.shift();
    const r = S.createRunner(c, id, {
      flags: party.flags,
      spawn: (list) => B.spawn(b, list),
      recruit: (uid) => B.recruit(b, uid),
      give: (uid, wid) => B.give(b, uid, wid),
      gold: (n) => { party.gold += n; },
      learn: (uid, sk) => B.learn(b, uid, sk),
      promote: (uid, to) => { const u = b.units.find((x) => x.id === uid && x.hp > 0); if (u) B.promote(b, u, to); },
    });
    for (let st = r.next(); st.type !== 'end'; st = r.next()) if (st.type === 'choice') r.choose((seed || 0) % st.options.length);
    B.checkOutcome(b);
  }
}

// 主角在敵將倒下後走向壓制點
function trySeize(b, u) {
  const v = b.chapter.victory || {};
  if (v.type !== 'seize' || !u.lord) return false;
  if (b.units.some((o) => o.team === 'enemy' && o.boss && o.hp > 0)) return false;
  if (u.x === v.x && u.y === v.y) { B.seize(b, u); return true; }
  const far = R.reachable(b, u, 999);
  if (!far.get(v.x + ',' + v.y)) return false;
  const reach = R.reachable(b, u);
  let dest = null;
  for (const p of R.pathTo(far, v.x, v.y)) {
    const n = reach.get(p.x + ',' + p.y);
    if (n && n.stop && (p.x === v.x && p.y === v.y || AI.dangerAt(b, u, p) < u.hp * 0.6)) dest = p;
  }
  if (!dest || (dest.x === u.x && dest.y === u.y)) return false;   // 走不到安全的位置 → 交給一般 AI
  B.moveUnit(b, u, dest.x, dest.y);
  if (u.x === v.x && u.y === v.y) { B.seize(b, u); return true; }
  B.wait(b, u);
  return true;
}

// 模擬玩家：主角、前兩回合與受傷的角色謹慎，其餘積極
function playerStyle(b, u) {
  if (u.lord || u.hp < u.stats.hp * 0.4) return 'cautious';
  if (b.turn <= 2) return 'cautious';
  return 'aggressive';
}

function act(b, u, seed) {
  if (u.team === 'player') {
    // 能轉職就轉職
    const si = (u.items || []).findIndex((it, i) => (b.campaign.items[it.id] || {}).kind === 'promote' && B.itemUsable(b, u, i));
    if (si >= 0) { B.useItem(b, u, si); return; }
    if (trySeize(b, u)) return;
  }
  const p = AI.plan(b, Object.assign(u, { ai: u.team === 'player' ? playerStyle(b, u) : u.ai }));
  for (const sid of AI.pickSpirits(b, u, p)) B.useSpirit(b, u, sid);
  if (p.x !== u.x || p.y !== u.y) B.moveUnit(b, u, p.x, p.y);
  const t = p.target && B.byUid(b, p.target);
  if (p.map) B.mapAttack(b, u, p.map.weapon, p.map.at);
  else if (t && t.hp > 0) B.attack(b, u, t);
  else if (p.heal) B.heal(b, u, B.byUid(b, p.heal));
  else if (p.item != null) B.useItem(b, u, p.item);
  else B.wait(b, u);
  if (u.cantoMove) B.endCanto(u);
}

// 模擬玩家花錢：先改造主角，再輪流改造出擊成員的主武器與 HP
function spendGold(c, party, ids) {
  const rules = (c.meta && c.meta.rules) || {};
  if (!rules.upgrades) return;
  let progress = true;
  while (progress && party.gold > 0) {
    progress = false;
    for (const id of ids) {
      const r = P.ensureRoster(c, party.roster, id);
      const w = (r.weapons || []).find((x) => !(c.weapons[x] || {}).map && (c.weapons[x] || {}).type !== 'staff');
      if (w && !P.upgradeWeapon(c, party, id, w).error) progress = true;
      if (!P.upgradeUnit(c, party, id, 'hp').error) progress = true;
    }
  }
}

function playChapter(c, chId, party, seed) {
  let deploy = null;
  if (c.chapters[chId].prep) {
    const info = P.deployInfo(c, chId, party.roster, party.flags);
    deploy = P.assignSlots(info, P.defaultSelection(info));
  }
  if (deploy) spendGold(c, party, deploy.map((d) => d.unit));
  const b = B.createBattle(c, chId, { roster: party.roster, flags: party.flags, supports: party.supports, deploy, seed });
  B.fire(b, 'start'); runScripts(c, b, party, seed);
  B.startPhase(b, 'player'); runScripts(c, b, party, seed);
  let guard = 0;
  while (b.status === 'playing' && guard++ < 120) {
    for (const u of B.living(b, b.phase).sort((a, z) => a.uid - z.uid)) {
      if (u.acted || u.hp <= 0 || b.status !== 'playing') continue;
      act(b, u, seed);
      runScripts(c, b, party, seed);
    }
    if (b.status === 'playing') { B.endPhase(b); runScripts(c, b, party, seed); }
  }
  runScripts(c, b, party, seed);
  const deaths = b.units.filter((u) => u.team === 'player' && u.hp <= 0).length;
  if (b.status === 'victory') { B.commitRoster(b, party.roster); party.supports = U.clone(b.supports); }
  return { status: b.status, turns: b.turn, deaths };
}

// 每章最多重試 retries 次（像玩家讀檔重來），統計首次勝率與最終通過率
function simulate(c, runs, opts) {
  opts = opts || {};
  const retries = opts.retries != null ? opts.retries : 3;
  const stats = {};
  for (let i = 0; i < runs; i++) {
    let party = { roster: {}, flags: {}, gold: 0, convoy: [], supports: {} };
    let ch = c.meta.start;
    let seed = 1000 + i * 7919;
    while (ch) {
      const s = stats[ch] = stats[ch] || { name: c.chapters[ch].name, runs: 0, firstWins: 0, cleared: 0, attempts: 0, turns: 0, deaths: 0, timeouts: 0 };
      s.runs++;
      let won = false;
      for (let t = 0; t <= retries && !won; t++) {
        const saved = U.clone(party);
        const r = playChapter(c, ch, party, seed++);
        s.attempts++; s.turns += r.turns; s.deaths += r.deaths;
        if (r.status === 'playing') s.timeouts++;
        if (r.status === 'victory') { won = true; if (t === 0) s.firstWins++; }
        else party = saved;
      }
      if (!won) break;
      s.cleared++;
      ch = C.resolveNext(c.chapters[ch], party.flags);
    }
  }
  return stats;
}

function report(stats) {
  const rows = Object.entries(stats).map(([id, s]) => ({
    章節: `${id} ${s.name}`, 到達: s.runs, 首次勝率: Math.round(s.firstWins / s.runs * 100) + '%', 最終通過: Math.round(s.cleared / s.runs * 100) + '%',
    平均回合: (s.turns / s.attempts).toFixed(1), 平均陣亡: (s.deaths / s.attempts).toFixed(1), 未結束: s.timeouts,
  }));
  console.table(rows);
}

if (require.main === module) {
  const runs = Number(process.argv[2]) || 30;
  const file = process.argv[3] || path.join(ROOT, 'data/demo-campaign.js');
  const c = loadCampaign(file);
  console.log(`劇本：${c.meta.title}，自動對打 ${runs} 輪…`);
  report(simulate(c, runs));
}

module.exports = { loadCampaign, simulate, playChapter, report };
