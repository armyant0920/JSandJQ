/* 出擊準備：選擇出擊成員、整備（輸送隊）、商店
   隊伍狀態 party = { roster, convoy:[{kind:'weapon'|'item', id, uses?}], gold }
   章節設定：
     chapter.prep: true          戰鬥前顯示出擊準備畫面
     chapter.deploySlots: [{x,y}] 額外的出擊位置（章節中我方配置的位置也算出擊位置）
     chapter.shop: [武器或道具 id]  可購買的商品（價格取 price） */
(function (root) {
  'use strict';
  const SRPG = root.SRPG = root.SRPG || {};
  const C = SRPG.campaign;
  const { clone } = SRPG.util;

  // 名冊中沒有的角色，依角色定義建立一筆名冊資料
  function ensureRoster(c, roster, id) {
    if (roster[id]) return roster[id];
    const def = c.units[id];
    if (!def) return null;
    const u = C.makeUnit(c, { unit: id, team: 'enemy', x: 0, y: 0 }, null, 0);
    roster[id] = { level: u.level, exp: 0, stats: clone(u.stats), weapons: clone(u.weapons), items: clone(u.items), skills: clone(u.skills), cls: u.cls, wup: {}, upg: {}, dead: false };
    return roster[id];
  }

  /* 出擊候選與位置
     回傳 { slots:[{x,y}], candidates:[{id, forced, slot?}] }
     - 章節中的我方配置：符合條件者為候選，其位置成為出擊位置；lord 或 forced 必定出擊
     - 名冊中其他存活角色也是候選（使用剩餘位置） */
  function deployInfo(c, chapterId, roster, flags) {
    const ch = c.chapters[chapterId];
    const slots = [];
    const candidates = [];
    const seen = new Set();
    for (const p of ch.units || []) {
      if (p.team !== 'player') continue;
      if (roster[p.unit] && roster[p.unit].dead) continue;
      if (p.if && !C.testCond({ if: p.if }, flags || {})) continue;
      slots.push({ x: p.x, y: p.y });
      if (seen.has(p.unit)) continue;
      seen.add(p.unit);
      const def = c.units[p.unit] || {};
      candidates.push({ id: p.unit, forced: !!(p.forced || def.lord || p.lord), slot: slots.length - 1 });
    }
    for (const p of ch.deploySlots || []) slots.push({ x: p.x, y: p.y });
    for (const [id, r] of Object.entries(roster)) {
      if (r.dead || seen.has(id) || !c.units[id]) continue;
      seen.add(id);
      candidates.push({ id, forced: false });
    }
    return { slots, candidates };
  }

  function defaultSelection(info) {
    const sel = info.candidates.filter((x) => x.forced).map((x) => x.id);
    for (const x of info.candidates) if (sel.length < info.slots.length && !sel.includes(x.id)) sel.push(x.id);
    return sel;
  }

  // 將選擇的角色分配到出擊位置：原本有位置的優先使用自己的位置
  function assignSlots(info, selected) {
    const used = new Set();
    const out = [];
    const sel = selected.slice(0, info.slots.length);
    for (const id of sel) {
      const cnd = info.candidates.find((x) => x.id === id);
      if (cnd && cnd.slot != null && !used.has(cnd.slot)) { used.add(cnd.slot); out.push({ unit: id, x: info.slots[cnd.slot].x, y: info.slots[cnd.slot].y }); }
    }
    for (const id of sel) {
      if (out.some((o) => o.unit === id)) continue;
      const i = info.slots.findIndex((_, k) => !used.has(k));
      if (i < 0) break;
      used.add(i);
      out.push({ unit: id, x: info.slots[i].x, y: info.slots[i].y });
    }
    return out;
  }

  /* ---------- 輸送隊 / 商店 ---------- */
  function priceOf(c, id) {
    const d = c.weapons[id] || c.items[id];
    return d ? (d.price != null ? d.price : 500) : 0;
  }
  function kindOf(c, id) { return c.weapons[id] ? 'weapon' : c.items[id] ? 'item' : null; }

  function giveTo(c, party, unitId, id, uses) {
    const kind = kindOf(c, id);
    if (!kind) return false;
    const entry = kind === 'item' ? { id, uses: uses != null ? uses : (c.items[id].uses || 1) } : id;
    if (unitId) {
      const r = ensureRoster(c, party.roster, unitId);
      if (kind === 'weapon') r.weapons.push(id); else (r.items = r.items || []).push(entry);
    } else party.convoy.push(kind === 'weapon' ? { kind, id } : { kind, id, uses: entry.uses });
    return true;
  }

  // 購買：unitId 為 null 時放進輸送隊
  function buy(c, party, id, unitId) {
    const price = priceOf(c, id);
    if (!kindOf(c, id)) return { error: '沒有這個商品' };
    if ((party.gold || 0) < price) return { error: '金錢不足' };
    party.gold -= price;
    giveTo(c, party, unitId, id);
    return { price };
  }

  // 賣出角色身上的物品：半價（道具依剩餘次數）
  function sell(c, party, unitId, kind, idx) {
    const r = party.roster[unitId];
    const list = kind === 'weapon' ? r.weapons : r.items;
    if (!list || !list[idx]) return { error: '沒有物品' };
    const [x] = list.splice(idx, 1);
    const id = kind === 'weapon' ? x : x.id;
    let price = Math.floor(priceOf(c, id) / 2);
    if (kind === 'item') price = Math.floor(price * (x.uses || 1) / ((c.items[id] || {}).uses || 1));
    party.gold = (party.gold || 0) + price;
    return { price };
  }

  function toConvoy(c, party, unitId, kind, idx) {
    const r = party.roster[unitId];
    const list = kind === 'weapon' ? r.weapons : r.items;
    if (!list || !list[idx]) return false;
    const [x] = list.splice(idx, 1);
    party.convoy.push(kind === 'weapon' ? { kind, id: x } : { kind, id: x.id, uses: x.uses });
    return true;
  }

  function fromConvoy(c, party, unitId, idx) {
    const e = party.convoy[idx];
    if (!e) return false;
    party.convoy.splice(idx, 1);
    return giveTo(c, party, unitId, e.id, e.uses);
  }

  /* ---------- 改造（rules.upgrades） ---------- */
  const UNIT_UPGRADES = { hp: { name: '最大 HP', step: 2 }, def: { name: '守備', step: 1 }, res: { name: '魔防', step: 1 } };
  const maxUp = (c) => ((c.meta && c.meta.rules && c.meta.rules.upgradeMax) || 5);
  function weaponUpgradeCost(c, wid, lvl) { return Math.round(((c.weapons[wid] || {}).price || 500) * 0.4 * (lvl + 1) / 50) * 50; }
  function unitUpgradeCost(c, stat, lvl) { return 400 * (lvl + 1); }
  function upgradeWeapon(c, party, unitId, wid) {
    const r = ensureRoster(c, party.roster, unitId);
    if (!r.weapons.includes(wid)) return { error: '沒有這把武器' };
    r.wup = r.wup || {};
    const lvl = r.wup[wid] || 0;
    if (lvl >= maxUp(c)) return { error: '已達上限' };
    const cost = weaponUpgradeCost(c, wid, lvl);
    if ((party.gold || 0) < cost) return { error: '金錢不足' };
    party.gold -= cost; r.wup[wid] = lvl + 1;
    return { cost, level: lvl + 1 };
  }
  function upgradeUnit(c, party, unitId, stat) {
    const r = ensureRoster(c, party.roster, unitId);
    const up = UNIT_UPGRADES[stat];
    if (!up) return { error: '無此項目' };
    r.upg = r.upg || {};
    const lvl = r.upg[stat] || 0;
    if (lvl >= maxUp(c)) return { error: '已達上限' };
    const cost = unitUpgradeCost(c, stat, lvl);
    if ((party.gold || 0) < cost) return { error: '金錢不足' };
    party.gold -= cost; r.upg[stat] = lvl + 1; r.stats[stat] += up.step;
    return { cost, level: lvl + 1 };
  }

  SRPG.prep = { UNIT_UPGRADES, weaponUpgradeCost, unitUpgradeCost, upgradeWeapon, upgradeUnit, ensureRoster, deployInfo, defaultSelection, assignSlots, priceOf, kindOf, giveTo, buy, sell, toConvoy, fromConvoy };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRPG;
})(typeof window !== 'undefined' ? window : globalThis);
