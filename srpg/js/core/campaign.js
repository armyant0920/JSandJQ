/* 劇本資料：預設值補齊、驗證、地圖解析、單位實例化、章節分歧 */
(function (root) {
  'use strict';
  const SRPG = root.SRPG = root.SRPG || {};
  const { clone } = SRPG.util;

  const STAT_KEYS = ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res'];
  const STAT_NAMES = { hp: 'HP', str: '力量', mag: '魔力', skl: '技巧', spd: '速度', lck: '幸運', def: '守備', res: '魔防' };

  // 劇本缺少時使用的基本地形（編輯器也以此為起點）
  const BASE_TERRAINS = {
    plain:    { name: '平地', char: '.', color: '#8fbf5a', cost: { foot: 1, horse: 1, fly: 1, armor: 1 }, def: 0, avo: 0, heal: 0 },
    forest:   { name: '森林', char: 'F', color: '#3f7d3a', cost: { foot: 2, horse: 3, fly: 1, armor: 2 }, def: 1, avo: 20, heal: 0 },
    mountain: { name: '山地', char: 'M', color: '#9a7b52', cost: { foot: 4, fly: 1 }, def: 2, avo: 30, heal: 0 },
    water:    { name: '水域', char: '~', color: '#3a78c2', cost: { fly: 1 }, def: 0, avo: 0, heal: 0 },
    wall:     { name: '牆壁', char: '#', color: '#5a5a66', cost: {}, def: 0, avo: 0, heal: 0 },
    road:     { name: '道路', char: '=', color: '#c9b27a', cost: { foot: 1, horse: 1, fly: 1, armor: 1 }, def: 0, avo: 0, heal: 0 },
    fort:     { name: '砦',   char: 'T', color: '#a0606a', cost: { foot: 2, horse: 2, fly: 1, armor: 2 }, def: 2, avo: 20, heal: 20 },
    village:  { name: '村莊', char: 'V', color: '#d08a4a', cost: { foot: 1, horse: 1, fly: 1, armor: 1 }, def: 0, avo: 10, heal: 0 },
    throne:   { name: '王座', char: 'K', color: '#c8a030', cost: { foot: 1, horse: 1, fly: 1, armor: 1 }, def: 3, avo: 30, heal: 10 },
  };

  // 預設精神指令（SRW 風格），劇本可覆寫或新增
  const BASE_SPIRITS = {
    strike:   { name: '必中', cost: 15, effect: 'sureHit', target: 'self', desc: '本回合命中率 100%' },
    alert:    { name: '閃避', cost: 15, effect: 'alert', target: 'self', desc: '下一次受到的攻擊必定迴避' },
    valor:    { name: '熱血', cost: 30, effect: 'valor', target: 'self', desc: '下一場戰鬥傷害 2 倍' },
    iron_wall:{ name: '鐵壁', cost: 20, effect: 'ironWall', target: 'self', desc: '本回合受到傷害 1/4' },
    accel:    { name: '加速', cost: 5, effect: 'accel', value: 3, target: 'self', desc: '本次移動力 +3' },
    focus:    { name: '集中', cost: 15, effect: 'focus', target: 'self', desc: '本回合命中、迴避 +30' },
    effort:   { name: '努力', cost: 10, effect: 'effort', target: 'self', desc: '下一場戰鬥經驗值 2 倍' },
    trust:    { name: '信賴', cost: 25, effect: 'heal', value: 15, target: 'ally', desc: '回復一名同伴 15 HP' },
    guts:     { name: '氣合', cost: 20, effect: 'morale', value: 10, target: 'self', desc: '氣力 +10' },
    cheer:    { name: '激勵', cost: 40, effect: 'morale', value: 5, target: 'allies', desc: '全體同伴氣力 +5' },
  };

  // 預設道具：kind = heal(HP) / boost(永久能力) / sp / mp(法力) / st(體力) / morale(氣力)
  const BASE_ITEMS = {
    vulnerary: { name: '傷藥', kind: 'heal', power: 10, uses: 3, icon: 217, price: 300, desc: '回復 10 HP' },
    elixir:    { name: '萬靈藥', kind: 'heal', power: 99, uses: 1, icon: 225, price: 1200, desc: 'HP 全回復' },
    ether:     { name: '魔力水', kind: 'mp', power: 10, uses: 2, icon: 218, price: 500, desc: '回復 10 MP' },
    tonic:     { name: '提神藥', kind: 'st', power: 10, uses: 2, icon: 219, price: 400, desc: '回復 10 體力' },
  };

  /* 預設被動技能（effect 種類見 rules.SKILL_EFFECTS）
     rate：發動率，可為數字或能力名稱（spd/skl/lck…），rateMul 為倍率 */
  const BASE_SKILLS = {
    canto:   { name: '再移動', effect: 'canto', desc: '行動後可用剩餘的移動力再移動' },
    vantage: { name: '先制', effect: 'vantage', value: 50, desc: 'HP 50% 以下被攻擊時先出手' },
    pursuit: { name: '追擊', effect: 'pursuit', value: 2, desc: '追擊所需的速度差 -2' },
    adept:   { name: '連續', effect: 'adept', rate: 'spd', desc: '速度% 機率連續攻擊兩次' },
    sol:     { name: '太陽', effect: 'sol', rate: 'skl', desc: '技巧% 機率吸收造成的傷害' },
    luna:    { name: '月光', effect: 'luna', rate: 'skl', rateMul: 0.5, desc: '技巧/2% 機率無視防禦' },
    keen:    { name: '銳眼', effect: 'bonus', hit: 15, crit: 10, desc: '命中 +15、必殺 +10' },
    guard:   { name: '堅守', effect: 'bonus', avo: 10, block: 2, desc: '迴避 +10、受到傷害 -2' },
  };

  function normalize(raw) {
    const c = clone(raw || {});
    if (c.format && c.format !== 'srpg-campaign') throw new Error('不是 srpg-campaign 格式：' + c.format);
    c.format = 'srpg-campaign';
    c.version = c.version || 1;
    c.meta = Object.assign({ title: '未命名劇本', author: '', start: null, permadeath: true }, c.meta || {});
    c.terrains = Object.assign({}, clone(BASE_TERRAINS), c.terrains || {});
    c.spirits = Object.assign({}, clone(BASE_SPIRITS), c.spirits || {});
    c.items = Object.assign({}, clone(BASE_ITEMS), c.items || {});
    c.skills = Object.assign({}, clone(BASE_SKILLS), c.skills || {});
    c.supports = c.supports || {};
    if (SRPG.media) {
      c.sounds = Object.assign({}, clone(SRPG.media.BASE_SOUNDS), c.sounds || {});
      c.animations = Object.assign({}, clone(SRPG.media.BASE_ANIMATIONS), c.animations || {});
    }
    c.scenes = c.scenes || {};
    for (const k of ['weapons', 'classes', 'units', 'sprites', 'portraits', 'chapters', 'scripts']) c[k] = c[k] || {};
    if (!c.meta.start) c.meta.start = Object.keys(c.chapters)[0] || null;
    return c;
  }

  // 回傳錯誤字串陣列（空陣列＝通過）
  function validate(c) {
    const errs = [];
    for (const [id, cl] of Object.entries(c.classes)) {
      if (!cl.move) errs.push(`職業 ${id} 缺少 move`);
    }
    for (const [id, u] of Object.entries(c.units)) {
      if (!c.classes[u.class]) errs.push(`角色 ${id} 的職業 ${u.class} 不存在`);
      for (const w of u.weapons || []) if (!c.weapons[w]) errs.push(`角色 ${id} 的武器 ${w} 不存在`);
      for (const it of u.items || []) if (!c.items[it]) errs.push(`角色 ${id} 的道具 ${it} 不存在`);
      for (const sp of u.spirits || []) if (!c.spirits[sp]) errs.push(`角色 ${id} 的精神指令 ${sp} 不存在`);
      for (const sk of u.skills || []) if (!c.skills[sk]) errs.push(`角色 ${id} 的技能 ${sk} 不存在`);
    }
    for (const [id, cl] of Object.entries(c.classes)) {
      for (const sk of cl.skills || []) if (!c.skills[sk]) errs.push(`職業 ${id} 的技能 ${sk} 不存在`);
      for (const pr of cl.promote || []) {
        if (!c.classes[pr.to]) errs.push(`職業 ${id} 的轉職目標 ${pr.to} 不存在`);
        if (pr.item && !c.items[pr.item]) errs.push(`職業 ${id} 的轉職道具 ${pr.item} 不存在`);
      }
    }
    for (const [id, sk] of Object.entries(c.skills)) {
      if (!SRPG.rules || !SRPG.rules.SKILL_EFFECTS[sk.effect]) errs.push(`技能 ${id} 的效果 ${sk.effect} 不存在`);
    }
    for (const [id, w] of Object.entries(c.weapons)) if (w.anim && c.animations && !c.animations[w.anim]) errs.push(`武器 ${id} 的演出 ${w.anim} 不存在`);
    for (const [id, an] of Object.entries(c.animations || {})) {
      for (const st of an.steps || []) if (st.type === 'sound' && c.sounds && !c.sounds[st.id]) errs.push(`演出 ${id} 的音效 ${st.id} 不存在`);
    }
    for (const [id, snd] of Object.entries(c.sounds || {})) {
      if (snd.type === 'bgm') for (const tr of snd.tracks || []) { try { SRPG.media.parseNotes(tr.notes); } catch (e) { errs.push(`BGM ${id}：${e.message}`); } }
    }
    for (const [id, ch] of Object.entries(c.chapters)) for (const k of ['player', 'enemy']) {
      const b = ch.bgm && ch.bgm[k];
      if (b && c.sounds && !c.sounds[b]) errs.push(`章節 ${id} 的 BGM ${b} 不存在`);
    }
    for (const [id, sp] of Object.entries(c.supports)) {
      if (!c.units[sp.a] || !c.units[sp.b]) errs.push(`支援 ${id} 的角色不存在`);
      for (const r of sp.ranks || []) if (r.script && !c.scripts[r.script]) errs.push(`支援 ${id} 的劇本 ${r.script} 不存在`);
    }
    for (const [id, ch] of Object.entries(c.chapters)) {
      let grid;
      try { grid = parseMap(c, ch.map); } catch (e) { errs.push(`章節 ${id}：${e.message}`); continue; }
      for (const p of ch.units || []) {
        if (!c.units[p.unit]) errs.push(`章節 ${id}：單位 ${p.unit} 不存在`);
        if (p.x < 0 || p.y < 0 || p.x >= grid.w || p.y >= grid.h) errs.push(`章節 ${id}：單位 ${p.unit} 在地圖外 (${p.x},${p.y})`);
      }
      for (const ev of ch.events || []) if (ev.script && !c.scripts[ev.script]) errs.push(`章節 ${id}：劇本 ${ev.script} 不存在`);
      for (const sid of ch.shop || []) if (!c.items[sid] && !c.weapons[sid]) errs.push(`章節 ${id}：商店商品 ${sid} 不存在`);
      for (const p of ch.deploySlots || []) if (p.x < 0 || p.y < 0 || p.x >= grid.w || p.y >= grid.h) errs.push(`章節 ${id}：出擊位置在地圖外 (${p.x},${p.y})`);
      for (const n of [].concat(ch.next || [])) {
        const cid = typeof n === 'string' ? n : n.chapter;
        if (cid && !c.chapters[cid]) errs.push(`章節 ${id}：下一章 ${cid} 不存在`);
      }
    }
    for (const [id, sp] of Object.entries(c.spirits)) {
      if (!SRPG.rules || !SRPG.rules.EFFECTS[sp.effect]) errs.push(`精神指令 ${id} 的效果 ${sp.effect} 不存在`);
    }
    for (const [id, s] of Object.entries(c.scripts)) {
      if (!Array.isArray(s)) { errs.push(`劇本 ${id} 必須是陣列`); continue; }
      const labels = new Set(s.filter((x) => x.cmd === 'label').map((x) => x.name));
      const jumps = [];
      for (const cmd of s) {
        if (cmd.goto) jumps.push(cmd.goto);
        if (cmd.else) jumps.push(cmd.else);
        for (const o of cmd.options || []) if (o.goto) jumps.push(o.goto);
      }
      for (const j of jumps) if (!labels.has(j)) errs.push(`劇本 ${id}：找不到標籤 ${j}`);
    }
    return errs;
  }

  // 地圖 = { legend:{字元:地形key}, rows:[字串...] } → { w, h, tiles[y][x] = 地形key }
  function parseMap(c, map) {
    if (!map || !Array.isArray(map.rows) || !map.rows.length) throw new Error('地圖缺少 rows');
    const legend = Object.assign({}, defaultLegend(c), map.legend || {});
    const h = map.rows.length, w = Math.max(...map.rows.map((r) => r.length));
    const tiles = map.rows.map((row, y) => {
      const out = [];
      for (let x = 0; x < w; x++) {
        const ch = row[x] || '.';
        const t = legend[ch];
        if (!t || !c.terrains[t]) throw new Error(`地圖 (${x},${y}) 未知字元 "${ch}"`);
        out.push(t);
      }
      return out;
    });
    return { w, h, tiles };
  }

  function defaultLegend(c) {
    const lg = {};
    for (const [k, t] of Object.entries(c.terrains)) if (t.char) lg[t.char] = k;
    return lg;
  }

  // 依角色定義 + 存檔名冊 建立戰場單位
  function makeUnit(c, place, roster, uid) {
    const def = c.units[place.unit];
    if (!def) throw new Error('未知單位 ' + place.unit);
    const saved = place.team === 'player' && roster ? roster[place.unit] : null;
    const clsId = (saved && saved.cls) || place.cls || def.class;
    const cls = c.classes[clsId] || {};
    const stats = clone(saved ? saved.stats : def.stats) || {};
    for (const k of STAT_KEYS) stats[k] = stats[k] || 0;
    const level = saved ? saved.level : (place.level || def.level || 1);
    const rules = Object.assign({ moraleStart: 100 }, (c.meta && c.meta.rules) || {});
    const items = saved && saved.items ? clone(saved.items)
      : (def.items || []).map((id) => ({ id, uses: (c.items[id] && c.items[id].uses) || 1 }));
    return {
      uid, id: place.unit, name: def.name || place.unit, team: place.team || 'enemy',
      cls: clsId, className: cls.name || clsId,
      level, exp: saved ? saved.exp : 0,
      x: place.x, y: place.y, hp: stats.hp, stats,
      growth: clone(def.growth || cls.growth || {}),
      weapons: clone(saved && saved.weapons ? saved.weapons : (def.weapons || [])),
      equip: 0,
      move: cls.move || 5, moveType: cls.moveType || 'foot', tags: clone(cls.tags || []),
      sprite: def.sprite || cls.sprite || null, portrait: def.portrait || null,
      wup: clone((saved && saved.wup) || {}), upg: clone((saved && saved.upg) || {}),
      ai: place.ai || 'aggressive', boss: !!place.boss, lord: !!(def.lord || place.lord),
      items, spirits: clone(def.spirits || cls.spirits || []),
      skills: [...new Set([].concat(cls.skills || [], def.skills || [], (saved && saved.skills) || []))],
      sp: def.sp || 0, maxSp: def.sp || 0,
      mp: def.mp != null ? def.mp : (cls.mp || 0), maxMp: def.mp != null ? def.mp : (cls.mp || 0),
      st: def.st != null ? def.st : (cls.st || 0), maxSt: def.st != null ? def.st : (cls.st || 0),
      vision: def.vision || cls.vision || 3, moveUsed: 0,
      morale: def.morale || rules.moraleStart, buffs: {}, dir: place.team === 'enemy' ? 1 : 2,
      acted: false, moved: false,
    };
  }

  /* 轉職：class.promote = [{ to, level?, item?, bonus:{hp,str,…,mp,st} }]
     itemId 有值時只列出需要該道具（或不需道具）的路線 */
  function promotionOptions(c, clsId, level, itemId) {
    const cl = c.classes[clsId] || {};
    return (cl.promote || []).filter((p) => c.classes[p.to] && (level || 1) >= (p.level || 1) &&
      (itemId === undefined ? !p.item : (!p.item || p.item === itemId)));
  }

  function resolveNext(chapter, flags) {
    const list = [].concat(chapter.next || []);
    for (const n of list) {
      if (typeof n === 'string') return n;
      if (!n.if || testCond(n, flags)) return n.chapter || null;
    }
    return null;
  }

  // 條件：{if:'flag'} 為真值；{if:'flag', eq:v}；{if:'flag', gte:n}；{if:'!flag'} 否定
  function testCond(cond, flags) {
    let name = cond.if || cond.flag;
    let neg = false;
    if (name && name[0] === '!') { neg = true; name = name.slice(1); }
    const v = flags[name];
    let ok;
    if ('eq' in cond) ok = v === cond.eq;
    else if ('gte' in cond) ok = (v || 0) >= cond.gte;
    else if ('lte' in cond) ok = (v || 0) <= cond.lte;
    else ok = !!v;
    return neg ? !ok : ok;
  }

  SRPG.campaign = { promotionOptions, STAT_KEYS, STAT_NAMES, BASE_TERRAINS, BASE_SPIRITS, BASE_ITEMS, BASE_SKILLS, normalize, validate, parseMap, defaultLegend, makeUnit, resolveNext, testCond };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRPG;
})(typeof window !== 'undefined' ? window : globalThis);
