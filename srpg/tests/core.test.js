/* 核心規則測試：node --test srpg/tests/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
for (const f of ['util', 'campaign', 'rules', 'battle', 'ai', 'script', 'save']) require(path.join(ROOT, 'js/core', f + '.js'));
const SRPG = globalThis.SRPG;
const { campaign: C, rules: R, battle: B, ai: AI, script: S, save: SV, util: U } = SRPG;

function loadDemo() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data/demo-campaign.js'), 'utf8'), ctx);
  return C.normalize(ctx.window.SRPG_DEFAULT_CAMPAIGN);
}

// 小型測試劇本
function mini(extra) {
  return C.normalize(Object.assign({
    meta: { start: 'c' },
    weapons: {
      sword: { name: '劍', type: 'sword', mt: 5, hit: 100, crit: 0, range: [1, 1] },
      axe: { name: '斧', type: 'axe', mt: 5, hit: 100, crit: 0, range: [1, 1] },
      bow: { name: '弓', type: 'bow', mt: 5, hit: 100, crit: 0, range: [2, 2], effective: ['fly'] },
    },
    classes: { foot: { move: 3 }, flier: { move: 3, moveType: 'fly', tags: ['fly'] } },
    units: {
      a: { name: 'A', class: 'foot', stats: { hp: 20, str: 5, skl: 0, spd: 10, def: 2 }, weapons: ['sword'], lord: true, growth: { hp: 100, str: 250 } },
      e: { name: 'E', class: 'foot', stats: { hp: 20, str: 5, skl: 0, spd: 5, def: 2 }, weapons: ['axe'] },
      f: { name: 'F', class: 'flier', stats: { hp: 20, str: 5, spd: 0, def: 0 }, weapons: [] },
      r: { name: 'R', class: 'foot', stats: { hp: 20, str: 5, skl: 50, spd: 0, def: 0 }, weapons: ['bow'] },
    },
    chapters: {
      c: {
        map: { rows: ['.....', '.F~..', '.....'] },
        units: [{ unit: 'a', team: 'player', x: 0, y: 0 }, { unit: 'e', team: 'enemy', x: 4, y: 2 }],
      },
    },
    scripts: {},
  }, extra || {}));
}

test('示範劇本通過驗證', () => {
  const c = loadDemo();
  assert.deepEqual(C.validate(c), []);
});

test('地圖解析', () => {
  const c = mini();
  const m = C.parseMap(c, c.chapters.c.map);
  assert.equal(m.w, 5); assert.equal(m.h, 3);
  assert.equal(m.tiles[1][1], 'forest'); assert.equal(m.tiles[1][2], 'water');
  assert.throws(() => C.parseMap(c, { rows: ['?'] }), /未知字元/);
});

test('移動範圍：森林花費 2、水域不可進入、不能穿過敵人', () => {
  const c = mini();
  const b = B.createBattle(c, 'c', { seed: 1 });
  const a = b.units[0];
  const reach = R.reachable(b, a);
  assert.ok(reach.has('3,0'));
  assert.ok(!reach.has('4,0'));            // 距離 4 > 移動 3
  assert.equal(reach.get('1,1').cost, 3);  // 進森林 = 1 + 2
  assert.ok(!reach.has('2,1'));            // 水域
  // 敵人擋路
  const e = b.units[1]; e.x = 1; e.y = 0;
  const r2 = R.reachable(b, a);
  assert.ok(!r2.has('1,0'));
  assert.ok(!r2.has('2,0') || r2.get('2,0').cost > 2);
});

test('飛行單位可以越過水域', () => {
  const c = mini();
  const b = B.createBattle(c, 'c', { seed: 1 });
  const f = B.addUnit(b, { unit: 'f', team: 'player', x: 1, y: 2 });
  assert.ok(R.reachable(b, f).has('2,1'));
});

test('戰鬥預測：相剋、追擊、反擊', () => {
  const c = mini();
  const b = B.createBattle(c, 'c', { seed: 1 });
  const [a, e] = b.units;
  e.x = 1; e.y = 0;
  const fc = B.previewAttack(b, a, e);
  // 劍剋斧：攻 5+5+1 - 守 2 = 9
  assert.equal(fc.att.dmg, 9);
  assert.equal(fc.att.count, 2);            // 速度 10 vs 5
  assert.equal(fc.def.dmg, 7);              // 5+5-1(被剋) - 守 2
  assert.equal(fc.def.count, 1);
  assert.equal(fc.att.tri, 1);
});

test('弓不能反擊鄰接、對飛行特效', () => {
  const c = mini();
  const b = B.createBattle(c, 'c', { seed: 1 });
  const r = B.addUnit(b, { unit: 'r', team: 'enemy', x: 1, y: 0 });
  const a = b.units[0];
  const fc = B.previewAttack(b, a, r);
  assert.equal(fc.def, null);
  const f = B.addUnit(b, { unit: 'f', team: 'player', x: 3, y: 0 });
  r.x = 1; r.y = 0;
  const fc2 = R.forecast(b, r, f);
  assert.equal(fc2.att.dmg, 5 + 15);        // 5 力 + 5*3 特效
});

test('戰鬥結算、擊殺、經驗與升級', () => {
  const c = mini();
  const b = B.createBattle(c, 'c', { seed: 7 });
  const [a, e] = b.units;
  e.x = 1; e.y = 0; e.hp = 9;
  const res = B.attack(b, a, e);
  assert.equal(e.hp, 0);
  assert.equal(res.deaths[0], e);
  assert.ok(res.exp[a.uid] >= 21);
  assert.equal(b.status, 'victory');        // 預設 rout
  a.exp = 99;
  const ups = R.addExp(b, a, 5, b.rng);
  assert.equal(ups.length, 1);
  assert.equal(ups[0].hp, 1);
  assert.ok(ups[0].str === 2 || ups[0].str === 3);
});

test('回合流程與 AI 會接近並攻擊', () => {
  const c = mini();
  const b = B.createBattle(c, 'c', { seed: 3 });
  const [a, e] = b.units;
  B.wait(b, a);
  assert.ok(B.phaseDone(b));
  assert.equal(B.endPhase(b), 'enemy');
  const p = AI.plan(b, e);
  assert.ok(U.dist(p, e) <= 3);
  assert.ok(U.dist(p, a) < U.dist(e, a));    // 往目標前進
  e.x = 2; e.y = 0;
  const p2 = AI.plan(b, e);
  assert.equal(p2.target, a.uid);
  assert.equal(U.dist(p2, a), 1);
  B.wait(b, e);
  assert.equal(B.endPhase(b), 'player');
  assert.equal(b.turn, 2);
});

test('勝敗條件：主角死亡＝失敗、survive', () => {
  const c = mini();
  const b = B.createBattle(c, 'c', { seed: 3 });
  b.units[0].hp = 0;
  assert.equal(B.checkOutcome(b), 'defeat');
  const c2 = mini();
  c2.chapters.c.victory = { type: 'survive', turns: 1 };
  const b2 = B.createBattle(c2, 'c', { seed: 3 });
  B.wait(b2, b2.units[0]);
  B.endPhase(b2); B.wait(b2, b2.units[1]); B.endPhase(b2);
  assert.equal(b2.status, 'victory');
});

test('劇本：選項、旗標、條件跳轉、增援', () => {
  const c = mini({
    scripts: {
      s: [
        { cmd: 'say', who: 'a', text: 'hi' },
        { cmd: 'choice', options: [{ text: 'x', set: 'fx', goto: 'L' }, { text: 'y' }] },
        { cmd: 'say', text: 'not here' },
        { cmd: 'label', name: 'L' },
        { cmd: 'set', flag: 'n', add: 2 },
        { cmd: 'if', flag: 'n', gte: 2, goto: 'M', else: 'L' },
        { cmd: 'label', name: 'M' },
        { cmd: 'spawn', units: [{ unit: 'e', team: 'enemy', x: 0, y: 2 }] },
      ],
    },
  });
  const flags = {};
  const spawned = [];
  const r = S.createRunner(c, 's', { flags, spawn: (u) => spawned.push(...u) });
  const s1 = r.next();
  assert.equal(s1.name, 'A');
  const s2 = r.next();
  assert.equal(s2.type, 'choice');
  r.choose(0);
  assert.equal(r.next().type, 'end');
  assert.equal(flags.fx, true);
  assert.equal(flags.n, 2);
  assert.equal(spawned.length, 1);
});

test('章節分歧依旗標決定', () => {
  const ch = { next: [{ if: 'route_forest', chapter: 'A' }, { chapter: 'B' }] };
  assert.equal(C.resolveNext(ch, { route_forest: true }), 'A');
  assert.equal(C.resolveNext(ch, {}), 'B');
  assert.equal(C.resolveNext({ next: [] }, {}), null);
});

test('事件：說服加入、只觸發一次', () => {
  const c = loadDemo();
  const b = B.createBattle(c, 'ch1', { seed: 5 });
  B.startPhase(b, 'player');
  const alan = b.units.find((u) => u.id === 'alan');
  const kit = b.units.find((u) => u.id === 'kit');
  alan.x = kit.x - 1; alan.y = kit.y;
  const acts = B.actionsFor(b, alan).map((a) => a.id);
  assert.ok(acts.includes('talk'));
  B.talk(b, alan, kit);
  assert.ok(b.queue.includes('ch1_kit'));
  B.recruit(b, 'kit');
  assert.equal(kit.team, 'player');
  assert.ok(!B.hasEvent(b, 'talk', { a: 'alan', b: 'kit' }));
});

test('中斷存檔可序列化並還原（含亂數狀態）', () => {
  const c = loadDemo();
  const b = B.createBattle(c, 'ch1', { seed: 42 });
  b.rng.next();
  const store = SV.createStore(SV.memoryStorage());
  store.write(0, SV.makeSave({ chapter: 'ch1', roster: {}, flags: { x: 1 }, battle: b }));
  const sv = store.read(0);
  const b2 = B.restore(c, sv.battle);
  assert.equal(b2.units.length, b.units.length);
  assert.equal(b2.rng.next(), b.rng.next());
  assert.equal(sv.flags.x, 1);
});

test('名冊：永久死亡的角色下一章不出場', () => {
  const c = loadDemo();
  const b = B.createBattle(c, 'ch1', { seed: 1 });
  b.units.find((u) => u.id === 'rook').hp = 0;
  const roster = B.commitRoster(b, {});
  assert.equal(roster.rook.dead, true);
  const b2 = B.createBattle(c, 'ch3', { roster, seed: 1 });
  assert.ok(!b2.units.some((u) => u.id === 'rook'));
});

test('示範第一章：雙方全自動對打能正常結束', () => {
  const c = loadDemo();
  for (const seed of [1, 2, 3, 4, 5]) {
    const b = B.createBattle(c, 'ch1', { seed });
    B.startPhase(b, 'player');
    let guard = 0;
    while (b.status === 'playing' && guard++ < 400) {
      for (const u of B.living(b, b.phase)) {
        if (u.acted || u.hp <= 0 || b.status !== 'playing') continue;
        const p = AI.plan(b, Object.assign(u, { ai: u.team === 'player' ? 'aggressive' : u.ai }));
        if (p.x !== u.x || p.y !== u.y) B.moveUnit(b, u, p.x, p.y);
        const t = p.target && B.byUid(b, p.target);
        if (t && t.hp > 0) B.attack(b, u, t);
        else if (p.heal) B.heal(b, u, B.byUid(b, p.heal));
        else if (p.item != null) B.useItem(b, u, p.item);
        else B.wait(b, u);
      }
      if (b.status === 'playing') B.endPhase(b);
    }
    assert.notEqual(b.status, 'playing', 'seed ' + seed + ' 未結束');
  }
});

test('條件出場：未說服的角色不會出現在下一章', () => {
  const c = loadDemo();
  const b1 = B.createBattle(c, 'ch2a', { flags: {}, seed: 1 });
  assert.ok(!b1.units.some((u) => u.id === 'kit'));
  const b2 = B.createBattle(c, 'ch2a', { flags: { kit_joined: true }, seed: 1 });
  assert.ok(b2.units.some((u) => u.id === 'kit' && u.team === 'player'));
});

/* ---------- 戰鬥指令擴充 ---------- */
function mini2() {
  const c = mini();
  c.meta.rules = { morale: true, spirits: true };
  Object.assign(c.weapons, {
    heal: { name: '治療杖', type: 'staff', dmg: 'mag', heal: 10, range: [1, 1] },
    brave: { name: '勇者劍', type: 'sword', mt: 5, hit: 100, crit: 0, range: [1, 1], brave: true },
    finisher: { name: '必殺技', type: 'sword', mt: 20, hit: 100, crit: 0, range: [1, 1], morale: 120 },
  });
  c.units.h = { name: 'H', class: 'foot', stats: { hp: 15, mag: 5 }, weapons: ['heal'], items: ['vulnerary'] };
  c.units.a.spirits = ['strike', 'alert', 'valor', 'iron_wall', 'accel', 'trust', 'effort'];
  c.units.a.sp = 100;
  return c;
}

test('杖：治療相鄰受傷同伴並獲得經驗；杖不能用來攻擊', () => {
  const c = mini2();
  const b = B.createBattle(c, 'c', { seed: 1 });
  const a = b.units[0];
  const h = B.addUnit(b, { unit: 'h', team: 'player', x: 1, y: 0 });
  a.hp = 5;
  assert.deepEqual(B.healTargets(b, h).map((u) => u.uid), [a.uid]);
  const r = B.heal(b, h, a);
  assert.equal(a.hp, 20); assert.equal(r.amount, 15);
  assert.ok(r.exp[h.uid] > 0);
  const e = b.units[1]; e.x = 2; e.y = 0; h.x = 1; h.y = 0;
  assert.equal(B.targetsFrom(b, h).length, 0);
  assert.equal(R.forecast(b, e, h).def, null);   // 拿杖不會反擊
});

test('道具：傷藥回復、次數用完會消失', () => {
  const c = mini2();
  const b = B.createBattle(c, 'c', { seed: 1 });
  const h = B.addUnit(b, { unit: 'h', team: 'player', x: 1, y: 0 });
  h.hp = 1;
  B.useItem(b, h, 0); assert.equal(h.hp, 11); assert.equal(h.items[0].uses, 2);
  h.items[0].uses = 1;
  B.useItem(b, h, 0); assert.equal(h.items.length, 0);
});

test('交換：武器與道具可在相鄰同伴間移動', () => {
  const c = mini2();
  const b = B.createBattle(c, 'c', { seed: 1 });
  const a = b.units[0];
  const h = B.addUnit(b, { unit: 'h', team: 'player', x: 1, y: 0 });
  assert.deepEqual(B.tradePartners(b, a).map((u) => u.uid), [h.uid]);
  B.transfer(b, h, a, 'item', 0);
  B.transfer(b, a, h, 'weapon', 0);
  assert.equal(a.items[0].id, 'vulnerary');
  assert.deepEqual(h.weapons, ['heal', 'sword']);
});

test('勇者武器每次攻擊兩下、氣力影響傷害與武器使用', () => {
  const c = mini2();
  const b = B.createBattle(c, 'c', { seed: 1 });
  const [a, e] = b.units;
  e.x = 1; e.y = 0;
  a.weapons = ['brave', 'finisher'];
  let fc = B.previewAttack(b, a, e);
  assert.equal(fc.att.per, 2); assert.equal(fc.att.strikes, 4);
  assert.deepEqual(B.weaponsFor(b, a, 1).map((x) => x.i), [0]);   // 氣力 100 < 120
  a.morale = 120;
  assert.equal(B.weaponsFor(b, a, 1).length, 2);
  fc = B.previewAttack(b, a, e, 0);
  assert.equal(fc.att.dmg, Math.floor(9 * 120 / 100));
  const res = R.resolveCombat(b, a, e, U.makeRng(1));
  assert.ok(res.strikes.filter((s) => s.by === a.uid).length >= 2);
});

test('精神指令：必中、熱血、鐵壁、閃避、加速、信賴、SP 消耗', () => {
  const c = mini2();
  const b = B.createBattle(c, 'c', { seed: 1 });
  const [a, e] = b.units;
  e.x = 1; e.y = 0;
  const base = B.previewAttack(b, a, e).att;
  B.useSpirit(b, a, 'strike'); B.useSpirit(b, a, 'valor');
  const fc = B.previewAttack(b, a, e);
  assert.equal(fc.att.hit, 100);
  assert.equal(fc.att.dmg, base.dmg * 2);
  assert.equal(a.sp, 100 - 15 - 30);
  B.useSpirit(b, a, 'iron_wall');
  assert.equal(B.previewAttack(b, e, a).att.dmg, Math.floor(7 / 4));
  B.useSpirit(b, a, 'alert');
  const r = R.resolveCombat(b, e, a, U.makeRng(3));
  assert.equal(r.strikes[0].evaded, true);
  assert.ok(!a.buffs.alert);
  assert.ok(!a.buffs.valor);                         // 反擊後熱血消耗
  const mv = R.reachable(b, a).size;
  B.useSpirit(b, a, 'accel');
  assert.ok(R.reachable(b, a).size > mv);
  const h = B.addUnit(b, { unit: 'h', team: 'player', x: 0, y: 2 }); h.hp = 3;
  assert.ok(B.spiritTargets(b, a, 'trust').includes(h));
  a.sp = 25;
  B.useSpirit(b, a, 'trust', h); assert.equal(h.hp, 15);
  assert.equal(a.sp, 0);
  assert.equal(B.useSpirit(b, a, 'valor').error, 'SP 不足');
  // 回合型狀態在下一個我方回合開始時解除
  B.wait(b, a); B.endPhase(b); B.endPhase(b);
  assert.ok(!a.buffs.sureHit && !a.buffs.ironWall);
});

test('敵方 AI 會用杖治療、低血量會喝藥', () => {
  const c = mini2();
  const b = B.createBattle(c, 'c', { seed: 1 });
  const e = b.units[1];
  const h = B.addUnit(b, { unit: 'h', team: 'enemy', x: 4, y: 0 });
  e.hp = 5;
  const p = AI.plan(b, h);
  assert.equal(p.heal, e.uid);
  h.hp = 2; e.hp = e.stats.hp;
  assert.equal(AI.plan(b, h).item, 0);
});
