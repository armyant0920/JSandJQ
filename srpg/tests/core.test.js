/* 核心規則測試：node --test srpg/tests/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
for (const f of ['util', 'campaign', 'rules', 'battle', 'ai', 'script', 'save', 'prep']) require(path.join(ROOT, 'js/core', f + '.js'));
const SRPG = globalThis.SRPG;
const { campaign: C, rules: R, battle: B, ai: AI, script: S, save: SV, util: U, prep: P } = SRPG;

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

test('示範全章節：雙方全自動對打能正常結束', () => {
  const c = loadDemo();
  for (const [ch, seed] of [['ch1', 1], ['ch1', 2], ['ch1', 3], ['ch2a', 4], ['ch2b', 5], ['ch3', 6], ['ch3', 7]]) {
    const b = B.createBattle(c, ch, { seed, flags: { kit_joined: true } });
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
    assert.notEqual(b.status, 'playing', ch + ' seed ' + seed + ' 未結束');
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

/* ---------- M5b 戰術深化 ---------- */
function mini3() {
  const c = mini2();
  c.meta.rules.resources = true;
  c.classes.horse = { move: 5, moveType: 'horse', skills: ['canto'] };
  c.units.k = { name: 'K', class: 'horse', stats: { hp: 20, str: 5, skl: 5, spd: 5, def: 3 }, weapons: ['sword'] };
  c.chapters.c.map.rows = ['........', '........', '........', '........'];
  return c;
}

test('再移動：攻擊後可用剩餘移動力移動', () => {
  const c = mini3();
  const b = B.createBattle(c, 'c', { seed: 1 });
  const e = b.units[1]; e.x = 3; e.y = 2; e.hp = 99; e.stats.hp = 99;
  const k = B.addUnit(b, { unit: 'k', team: 'player', x: 0, y: 2 });
  B.moveUnit(b, k, 2, 2);
  B.attack(b, k, e);
  assert.equal(k.cantoMove, 3);
  assert.ok(B.cantoMove(b, k, 2, 3));
  assert.equal(k.cantoMove, undefined);
  assert.ok(k.acted);
  const a = b.units[0];                        // 沒有技能的單位不會再移動
  a.acted = false; e.x = 1; e.y = 1; a.x = 1; a.y = 0;
  B.attack(b, a, e);
  assert.equal(a.cantoMove, undefined);
});

test('救出與放下：被搬運者離開地圖、搬運者能力減半、倒下時放下', () => {
  const c = mini3();
  const b = B.createBattle(c, 'c', { seed: 1 });
  const a = b.units[0];
  const k = B.addUnit(b, { unit: 'k', team: 'player', x: 1, y: 0 });
  assert.deepEqual(B.rescueTargets(b, k).map((u) => u.uid), [a.uid]);
  const foe = b.units[1];
  const before = R.combatSide(b, foe, k, { x: 2, y: 0 }, k);
  B.rescue(b, k, a);
  assert.equal(R.unitAt(b, 0, 0), null);
  assert.ok(!B.living(b, 'player').includes(a));
  const after = R.combatSide(b, foe, k, { x: 2, y: 0 }, k);
  assert.ok(after.hit > before.hit);   // 搬運中速度減半 → 迴避下降
  k.acted = false;
  assert.ok(B.dropTiles(b, k).length >= 2);
  B.drop(b, k, 1, 1);
  assert.equal(a.x, 1); assert.equal(a.y, 1); assert.ok(!a.carriedBy);
  // 搬運者被擊倒 → 被搬運者回到地圖
  k.acted = false; B.rescue(b, k, a);
  foe.x = 2; foe.y = 0; k.hp = 1; foe.stats.skl = 99;
  B.attack(b, foe, k);
  assert.equal(k.hp, 0);
  assert.ok(!a.carriedBy && a.hp > 0 && R.unitAt(b, a.x, a.y) === a);
});

test('被動技能：先制、追擊、銳眼、月光、太陽、連續', () => {
  const c = mini3();
  const b = B.createBattle(c, 'c', { seed: 1 });
  const [a, e] = b.units;
  e.x = 1; e.y = 0;
  a.skills = ['keen'];
  const base = R.combatSide(b, e, a, e, a);
  a.skills = [];
  const s0 = R.forecast(b, a, e).att;
  a.skills = ['keen'];
  const s1 = R.forecast(b, a, e).att;
  assert.ok(s1.crit === s0.crit + 10);
  // 先制
  e.skills = ['vantage']; e.hp = 5;
  const r = R.resolveCombat(b, a, e, U.makeRng(9));
  assert.equal(r.vantage, true);
  assert.equal(r.strikes[0].by, e.uid);
  // 追擊：速度差 3 平常不追擊，有技能時追擊
  e.hp = 20; e.skills = []; e.stats.spd = 6; a.stats.spd = 3;
  assert.equal(R.forecast(b, e, a).att.count, 1);
  e.skills = ['pursuit'];
  assert.equal(R.forecast(b, e, a).att.count, 2);
  // 100% 發動的月光 / 太陽 / 連續
  c.skills.luna100 = { name: 'L', effect: 'luna', rate: 100 };
  c.skills.sol100 = { name: 'S', effect: 'sol', rate: 100 };
  c.skills.adept100 = { name: 'A', effect: 'adept', rate: 100 };
  a.skills = ['luna100', 'sol100', 'adept100']; a.hp = 10; a.stats.spd = 0;
  e.hp = 99; e.stats.hp = 99; e.skills = []; e.stats.spd = 0;
  const r2 = R.resolveCombat(b, a, e, U.makeRng(1));
  const mine = r2.strikes.filter((s) => s.by === a.uid);
  assert.equal(mine.length, 2);
  assert.ok(mine[0].skills.includes('L') && mine[0].skills.includes('S'));
  assert.ok(a.hp > 10);
  assert.ok(mine.some((s) => s.dmg === r2.fc.att.dmgLuna || !s.hit));
});

test('體力/法力：武器消耗、不足無法使用、回合回復與待機喘息', () => {
  const c = mini3();
  c.weapons.power = { name: '重擊', type: 'sword', mt: 10, hit: 100, range: [1, 1], cost: 5 };
  c.weapons.spell = { name: '法術', type: 'anima', dmg: 'mag', mt: 5, hit: 100, range: [1, 2], cost: 4 };
  c.units.a.st = 8; c.units.a.mp = 4;
  c.units.a.weapons = ['power', 'spell'];
  const b = B.createBattle(c, 'c', { seed: 1 });
  const [a, e] = b.units; e.x = 1; e.y = 0; e.hp = 99; e.stats.hp = 99; e.stats.spd = 99;
  assert.equal(R.weaponCost(c.weapons.power).type, 'st');
  assert.equal(R.weaponCost(c.weapons.spell).type, 'mp');
  B.attack(b, a, e, 0);
  assert.equal(a.st, 3);
  assert.deepEqual(B.weaponsFor(b, a, 1).map((x) => x.i), [1]);   // 體力不足，只剩法術
  B.endPhase(b); B.endPhase(b);
  assert.equal(a.st, 3 + 3);           // 回合開始回復 +3
  B.wait(b, a);
  assert.equal(a.st, 8);               // 待機喘息 +3（上限 8）
  c.meta.rules.resources = false;
  a.st = 0;
  assert.equal(B.weaponsFor(b, a, 1).length, 2);  // 關閉資源系統時不檢查
});

test('地圖兵器：範圍內所有敵人各受一擊、不反擊、消耗法力', () => {
  const c = mini3();
  c.weapons.storm = { name: '風暴', type: 'anima', dmg: 'mag', mt: 8, hit: 100, range: [1, 3], cost: 6, map: { shape: 'burst', size: 1 } };
  c.units.a.weapons = ['sword', 'storm']; c.units.a.mp = 10; c.units.a.stats.mag = 5;
  const b = B.createBattle(c, 'c', { seed: 1 });
  const [a, e] = b.units;
  const e2 = B.addUnit(b, { unit: 'e', team: 'enemy', x: 3, y: 1 });
  e.x = 3; e.y = 0;
  assert.ok(B.actionsFor(b, a).some((x) => x.id === 'mapAttack'));
  assert.equal(B.targetsFrom(b, a).length, 0);    // 地圖兵器不算一般攻擊
  const res = B.mapAttack(b, a, 1, { x: 3, y: 1 });
  assert.equal(res.strikes.length, 2);
  assert.ok(e.hp < 20 && e2.hp < 20);
  assert.equal(a.mp, 4);
  assert.equal(a.hp, 20);
  const line = Object.assign({}, c.weapons.storm, { map: { shape: 'line', size: 3 } });
  assert.equal(R.mapArea(b, a, line, { x: 1, y: 0 }).length, 3);
  assert.equal(R.mapCenters(b, a, line).length, 2);
});

test('AI 會用地圖兵器與精神指令', () => {
  const c = mini3();
  c.weapons.storm = { name: '風暴', type: 'anima', dmg: 'mag', mt: 8, hit: 100, range: [1, 3], map: { shape: 'burst', size: 1 } };
  c.units.e.weapons = ['axe', 'storm']; c.units.e.stats.mag = 6;
  c.units.e.spirits = ['valor', 'iron_wall']; c.units.e.sp = 60;
  const b = B.createBattle(c, 'c', { seed: 1 });
  const [a, e] = b.units;
  B.addUnit(b, { unit: 'h', team: 'player', x: 1, y: 0 });
  B.addUnit(b, { unit: 'k', team: 'player', x: 0, y: 1 });
  const p = AI.plan(b, e);
  assert.ok(p.map, JSON.stringify(p));
  e.boss = true;
  const sp = AI.pickSpirits(b, e, { x: 1, y: 1, target: a.uid });
  assert.ok(sp.includes('iron_wall'));
});

test('支援：鄰近累積支援值、支援對話升級、範圍內加成', () => {
  const c = mini3();
  c.scripts.sup_c = [{ cmd: 'say', who: 'a', text: 'C' }];
  c.supports = { a_h: { a: 'a', b: 'h', ranks: [{ rank: 'C', need: 2, script: 'sup_c' }, { rank: 'B', need: 5 }] } };
  const b = B.createBattle(c, 'c', { seed: 1 });
  const [a, e] = b.units;
  const h = B.addUnit(b, { unit: 'h', team: 'player', x: 1, y: 0 });
  e.x = 5; e.y = 3;
  B.startPhase(b, 'player');
  assert.equal(B.supportTargets(b, a).length, 0);
  B.startPhase(b, 'player');
  assert.deepEqual(B.supportTargets(b, a).map((u) => u.uid), [h.uid]);
  const before = R.combatSide(b, a, e, a, { x: 0, y: 1 });
  B.supportTalk(b, a, h);
  assert.equal(R.supportRank(b, 'a', 'h'), 'C');
  assert.ok(b.queue.includes('sup_c'));
  e.x = 0; e.y = 1;
  const fc = R.forecast(b, a, e).att;
  assert.ok(fc.tags.some((t) => t.startsWith('支援')));
  assert.equal(B.supportTargets(b, a).length, 0);
});

test('視野：只看得到我方附近的格子', () => {
  const c = mini3();
  const b = B.createBattle(c, 'c', { seed: 1 });
  const vis = R.visibleTiles(b, 'player');
  assert.ok(vis.has('0,0') && vis.has('3,0'));
  assert.ok(!vis.has('7,3'));
});

test('出擊準備：候選、強制出擊、配置、商店與輸送隊', () => {
  const c = loadDemo();
  const roster = {};
  const info = P.deployInfo(c, 'ch3', roster, { kit_joined: true });
  assert.ok(info.candidates.find((x) => x.id === 'alan').forced);
  const sel = P.defaultSelection(info);
  assert.ok(sel.includes('alan'));
  const dep = P.assignSlots(info, sel.filter((id) => id !== 'rook'));
  assert.ok(!dep.some((d) => d.unit === 'rook'));
  const b = B.createBattle(c, 'ch3', { roster, deploy: dep, seed: 1 });
  assert.ok(!b.units.some((u) => u.id === 'rook'));
  const party = { roster, convoy: [], gold: 1000 };
  assert.equal(P.buy(c, party, 'vulnerary', 'alan').price, 300);
  assert.equal(party.gold, 700);
  assert.equal(P.buy(c, party, 'elixir', null).error, '金錢不足');
  const n = party.roster.alan.items.length;
  P.toConvoy(c, party, 'alan', 'item', n - 1);
  assert.equal(party.convoy.length, 1);
  P.fromConvoy(c, party, 'mira', 0);
  assert.ok(party.roster.mira.items.some((i) => i.id === 'vulnerary'));
  const s = P.sell(c, party, 'mira', 'item', party.roster.mira.items.length - 1);
  assert.ok(s.price > 0);
});
