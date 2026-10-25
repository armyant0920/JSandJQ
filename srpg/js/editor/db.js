/* 資料庫分頁：劇本資訊 / 角色 / 職業 / 武器 / 地形 / 原始 JSON */
(function () {
  'use strict';
  const { h } = ED;
  const C = SRPG.campaign;
  const MOVE_TYPES = [['foot', '步行'], ['horse', '騎馬'], ['armor', '重甲'], ['fly', '飛行']];
  const WTYPES = [['sword', '劍'], ['lance', '槍'], ['axe', '斧'], ['bow', '弓'], ['anima', '理魔法'], ['light', '光魔法'], ['dark', '闇魔法'], ['staff', '杖（治療）'], ['other', '其他']];
  const ITEM_KINDS = [['heal', '回復 HP'], ['boost', '永久提升能力'], ['sp', '回復 SP'], ['mp', '回復法力 MP'], ['st', '回復體力'], ['morale', '提升氣力'], ['promote', '轉職道具']];
  const SPIRIT_TARGETS = [['self', '自己'], ['ally', '指定同伴'], ['allies', '全體同伴']];

  // 圖示：顯示 + 點擊開啟選擇器
  function iconCell(i) { return h('span', { style: SRPG.sprites.iconStyle(i, 24) }); }
  function iconPicker(obj, key) {
    return h('span.row', {}, obj[key] != null ? iconCell(obj[key]) : h('span.hint', {}, '（無）'),
      h('button', { onclick: () => {
        const img = h('img', { src: 'assets/icons.png', style: { width: '512px', imageRendering: 'pixelated', cursor: 'pointer', background: '#223' } });
        img.onclick = (e) => {
          const r = img.getBoundingClientRect();
          const c = Math.floor((e.clientX - r.left) / r.width * 16), rr = Math.floor((e.clientY - r.top) / r.height * 19);
          obj[key] = rr * 16 + c; ED.closeModal(); ED.dirty(true);
        };
        ED.modal('選擇圖示（assets/icons.png）', h('div', {}, img), [{ label: '清除圖示', onclick: () => { delete obj[key]; ED.dirty(true); } }]);
      } }, '選擇…'));
  }
  ED.iconPicker = iconPicker;
  // 可重複的 id 清單編輯（道具可以帶多個）
  function idList(obj, key, group, multi) {
    obj[key] = obj[key] || [];
    return h('div.chips', {}, ...ED.keys(group).map((id) => {
      const d = ED.c[group][id];
      const n = obj[key].filter((x) => x === id).length;
      return h('span.chip', { className: 'chip' + (n ? ' on' : ''), title: d.desc || '',
        onclick: () => { if (n && !multi) obj[key] = obj[key].filter((x) => x !== id); else obj[key] = obj[key].concat(id); ED.dirty(true); },
        oncontextmenu: (e) => { e.preventDefault(); const i = obj[key].indexOf(id); if (i >= 0) { obj[key].splice(i, 1); ED.dirty(true); } } },
      d.icon != null ? iconCell(d.icon) : null, (d.name || id) + (multi && n > 1 ? ' ×' + n : ''));
    }));
  }

  function spritePreview(spId, team, size) {
    const cv = h('canvas.px', { width: size || 64, height: size || 64 });
    const sp = spId && (ED.c.sprites[spId] || ED.c.portraits[spId]);
    const ctx = cv.getContext('2d');
    if (sp && !SRPG.sprites.draw(ctx, sp, 0, team || 'player', 0, 0, cv.width, cv.height)) {
      SRPG.sprites.onload = () => SRPG.sprites.draw(ctx, sp, 0, team || 'player', 0, 0, cv.width, cv.height);
    }
    return cv;
  }
  ED.spritePreview = spritePreview;

  /* ---------- 劇本資訊 ---------- */
  ED.tabs.meta = function () {
    const m = ED.c.meta;
    const counts = ['chapters', 'units', 'classes', 'weapons', 'sprites', 'portraits', 'scripts'].map((k) => `${k}: ${Object.keys(ED.c[k]).length}`).join('　');
    return h('div', {},
      h('h2', {}, '劇本資訊'),
      h('div.form', {},
        ...ED.formRow('標題', ED.text(m, 'title')),
        ...ED.formRow('作者', ED.text(m, 'author')),
        ...ED.formRow('簡介', ED.area(m, 'desc', 3)),
        ...ED.formRow('起始章節', ED.select(m, 'start', ED.named('chapters'))),
        ...ED.formRow('永久死亡', ED.check(m, 'permadeath', '我方陣亡後不再出場（FE 風格）')),
        ...ED.formRow('氣力系統', ED.check(m.rules = m.rules || {}, 'morale', 'SRW 風格：戰鬥/擊破提升氣力，傷害 × 攻方氣力 / 守方氣力')),
        ...ED.formRow('精神指令', ED.check(m.rules, 'spirits', 'SRW 風格：消耗 SP 發動必中、熱血、加速等')),
        ...ED.formRow('體力 / 法力', ED.check(m.rules, 'resources', '武器與杖可設定消耗體力或法力；每回合回復、待機可喘息')),
        ...ED.formRow('改造', ED.check(m.rules, 'upgrades', 'SRW 風格：出擊準備畫面花軍資金強化武器與能力'), '上限', ED.num(m.rules, 'upgradeMax', { attrs: { placeholder: '5' } })),
        ...ED.formRow('轉職', h('label', {}, h('input', { type: 'checkbox', checked: m.rules.promoteReset !== false, onchange: (e) => { if (e.target.checked) delete m.rules.promoteReset; else m.rules.promoteReset = false; ED.dirty(); } }), ' 轉職後等級回到 1（FE 風格）')),
        ...(m.rules.resources ? ED.formRow('回復量', '體力/回合', ED.num(m.rules, 'stRegen', { attrs: { placeholder: '3' } }), '法力/回合', ED.num(m.rules, 'mpRegen', { attrs: { placeholder: '2' } }), '待機喘息', ED.num(m.rules, 'restSt', { attrs: { placeholder: '3' } })) : [])),
      h('p.hint', {}, counts),
      h('h2', {}, '使用說明'),
      h('div.hint', { innerHTML: `
        1. <b>地圖章節</b>：畫地形、擺放單位、設定勝敗條件、事件與下一章（分歧）。<br>
        2. <b>角色 / 職業 / 武器 / 地形</b>：資料庫。角色的外觀預設跟職業走，也可個別指定。<br>
        3. <b>精靈圖</b>：像素繪製（ASCII 格式，<code>T/t</code> 等「隊伍色」會依我方/敵方自動換色）、匯入 PNG / RPG Maker 行走圖。<br>
        4. <b>劇本對話</b>：說話、旁白、選項、旗標、條件跳轉、增援、說服加入、給予武器。<br>
        5. <b>🤖 AI 協作包</b>：匯出含格式說明的 .md 給 ChatGPT / Claude 等 AI，請它畫圖、寫劇情、設計地圖；AI 回傳的 JSON 用「⬆ 匯入 AI 回傳」合併。<br>
        6. <b>💾 存為遊戲劇本</b>後，遊戲標題選「編輯器中的劇本」即可遊玩；<b>▶ 試玩</b>會直接開啟目前章節。<br>
        編輯內容會自動暫存在瀏覽器；要備份或分享請用「⬇ 匯出 JSON」。` }));
  };

  /* ---------- 角色 ---------- */
  ED.tabs.units = function () {
    const id = ED.sel.units = ED.sel.units && ED.c.units[ED.sel.units] ? ED.sel.units : Object.keys(ED.c.units)[0];
    const left = ED.listPanel('units', { prefix: 'unit', make: () => ({ name: '新角色', class: Object.keys(ED.c.classes)[0], level: 1, stats: { hp: 18, str: 5, mag: 0, skl: 5, spd: 5, lck: 3, def: 3, res: 1 }, growth: {}, weapons: [] }) });
    if (!id) return h('div.split', {}, left, h('p.hint', {}, '尚無角色'));
    const u = ED.c.units[id];
    u.stats = u.stats || {}; u.growth = u.growth || {}; u.weapons = u.weapons || [];
    const stats = (obj) => h('div.grid8', {}, ...C.STAT_KEYS.map((k) => h('label', {}, C.STAT_NAMES[k], ED.num(obj, k))));
    const cls = ED.c.classes[u.class] || {};
    const sprite = u.sprite || cls.sprite;
    return h('div.split', {}, left, h('div', {},
      h('h2', {}, '角色：' + (u.name || id)),
      h('div.row', {}, spritePreview(sprite, 'player'), spritePreview(sprite, 'enemy'), u.portrait ? spritePreview(u.portrait, 'player', 96) : h('span.hint', {}, '（未設定頭像）')),
      h('div.form', {},
        ...ED.formRow('ID', ED.idField('units')),
        ...ED.formRow('名稱', ED.text(u, 'name')),
        ...ED.formRow('職業', ED.select(u, 'class', ED.named('classes'), { rerender: true })),
        ...ED.formRow('等級', ED.num(u, 'level')),
        ...ED.formRow('主角', ED.check(u, 'lord', '主角（陣亡＝敗北、可壓制）')),
        ...ED.formRow('外觀', ED.select(u, 'sprite', ED.keys('sprites'), { optional: true, optionalLabel: '（跟隨職業）', rerender: true })),
        ...ED.formRow('頭像', ED.select(u, 'portrait', ED.keys('portraits').concat(ED.keys('sprites').filter((k) => !ED.c.portraits[k])), { optional: true, rerender: true })),
        ...ED.formRow('武器', idList(u, 'weapons', 'weapons', false)),
        ...ED.formRow('道具', idList(u, 'items', 'items', true), h('span.hint', {}, '點擊增加，右鍵減少')),
        ...ED.formRow('SP', ED.num(u, 'sp'), h('span.hint', {}, '精神指令點數（每章回滿）')),
        ...ED.formRow('初始氣力', ED.num(u, 'morale', { attrs: { placeholder: '100' } })),
        ...ED.formRow('精神指令', idList(u, 'spirits', 'spirits', false)),
        ...ED.formRow('體力 / 法力', '體力', ED.num(u, 'st', { attrs: { placeholder: '職業值' } }), '法力', ED.num(u, 'mp', { attrs: { placeholder: '職業值' } }), h('span.hint', {}, '資源系統開啟時使用')),
        ...ED.formRow('視野', ED.num(u, 'vision', { attrs: { placeholder: '職業值' } }), h('span.hint', {}, '霧戰時看得到的距離')),
        ...ED.formRow('技能', idList(u, 'skills', 'skills', false), h('span.hint', {}, '另外會繼承職業技能'))),
      h('h3', {}, '基礎能力'), stats(u.stats),
      h('h3', {}, '成長率 %（每升一級各項提升的機率）'), stats(u.growth)));
  };

  /* ---------- 職業 ---------- */
  ED.tabs.classes = function () {
    const id = ED.sel.classes = ED.sel.classes && ED.c.classes[ED.sel.classes] ? ED.sel.classes : Object.keys(ED.c.classes)[0];
    const left = ED.listPanel('classes', { prefix: 'class', make: () => ({ name: '新職業', move: 5, moveType: 'foot' }) });
    if (!id) return h('div.split', {}, left, h('p.hint', {}, '尚無職業'));
    const c = ED.c.classes[id];
    return h('div.split', {}, left, h('div', {},
      h('h2', {}, '職業：' + (c.name || id)),
      h('div.row', {}, spritePreview(c.sprite, 'player'), spritePreview(c.sprite, 'enemy'), spritePreview(c.sprite, 'ally')),
      h('div.form', {},
        ...ED.formRow('ID', ED.idField('classes')),
        ...ED.formRow('名稱', ED.text(c, 'name')),
        ...ED.formRow('移動力', ED.num(c, 'move')),
        ...ED.formRow('移動類型', ED.select(c, 'moveType', MOVE_TYPES), h('span.hint', {}, '決定各地形的移動花費')),
        ...ED.formRow('外觀', ED.select(c, 'sprite', ED.keys('sprites'), { optional: true, rerender: true })),
        ...ED.formRow('標籤', h('input', { type: 'text', value: (c.tags || []).join(','), placeholder: 'fly,armor,horse（特效武器用）', onchange: (e) => { c.tags = e.target.value.split(',').map((s) => s.trim()).filter(Boolean); ED.dirty(); } })),
        ...ED.formRow('體力 / 法力', '體力', ED.num(c, 'st'), '法力', ED.num(c, 'mp'), h('span.hint', {}, '此職業角色的預設值')),
        ...ED.formRow('視野', ED.num(c, 'vision', { attrs: { placeholder: '3' } })),
        ...ED.formRow('職業技能', idList(c, 'skills', 'skills', false))),
      h('h3', {}, '轉職路線'),
      ...(c.promote || []).map((p, i) => h('div.card', {},
        h('div.row', {}, '轉職為', ED.select(p, 'to', ED.named('classes')), '需要等級', ED.num(p, 'level', { attrs: { placeholder: '1' } }),
          '道具', ED.select(p, 'item', ED.named('items').filter(([k]) => ED.c.items[k].kind === 'promote'), { optional: true, optionalLabel: '（劇情轉職）' }),
          h('button.danger', { onclick: () => { c.promote.splice(i, 1); if (!c.promote.length) delete c.promote; ED.dirty(true); } }, '✕')),
        h('div.grid8', {}, ...C.STAT_KEYS.concat(['mp', 'st']).map((k) => h('label', {}, (C.STAT_NAMES[k] || (k === 'mp' ? '法力' : '體力')) + '+', ED.num(p.bonus = p.bonus || {}, k)))),
        h('div.row', {}, '額外給予武器', idList(p, 'weapons', 'weapons', false)))),
      h('button', { onclick: () => { (c.promote = c.promote || []).push({ to: Object.keys(ED.c.classes).find((k) => k !== id) || id, level: 10, bonus: { hp: 4, str: 2, def: 2 } }); ED.dirty(true); } }, '＋ 轉職路線'),
      h('p.hint', {}, '設定「道具」時，角色在戰鬥中使用該轉職道具（道具效果選「轉職道具」）即可轉職；不設定道具時，用劇本指令「轉職」觸發。轉職會套用新職業的移動力、技能與外觀，並加上能力加成。')));
  };

  /* ---------- 武器 ---------- */
  ED.tabs.weapons = function () {
    const id = ED.sel.weapons = ED.sel.weapons && ED.c.weapons[ED.sel.weapons] ? ED.sel.weapons : Object.keys(ED.c.weapons)[0];
    const left = ED.listPanel('weapons', { prefix: 'weapon', make: () => ({ name: '新武器', type: 'sword', dmg: 'phys', mt: 5, hit: 80, crit: 0, range: [1, 1] }) });
    if (!id) return h('div.split', {}, left, h('p.hint', {}, '尚無武器'));
    const w = ED.c.weapons[id];
    w.range = w.range || [1, 1];
    const rg = { min: w.range[0], max: w.range[1] };
    const rgIn = (k, i) => h('input', { type: 'number', value: rg[k], min: 0, oninput: (e) => { w.range[i] = Number(e.target.value); ED.dirty(); } });
    return h('div.split', {}, left, h('div', {},
      h('h2', {}, '武器：' + (w.name || id)),
      h('div.form', {},
        ...ED.formRow('ID', ED.idField('weapons')),
        ...ED.formRow('名稱', ED.text(w, 'name')),
        ...ED.formRow('種類', ED.select(w, 'type', WTYPES), h('span.hint', {}, '劍>斧>槍>劍、理>光>闇>理')),
        ...ED.formRow('傷害類型', ED.select(w, 'dmg', [['phys', '物理（力量 vs 守備）'], ['mag', '魔法（魔力 vs 魔防）']])),
        ...ED.formRow('威力', ED.num(w, 'mt')),
        ...ED.formRow('命中', ED.num(w, 'hit')),
        ...ED.formRow('必殺', ED.num(w, 'crit')),
        ...ED.formRow('射程', rgIn('min', 0), '～', rgIn('max', 1)),
        ...ED.formRow('圖示', iconPicker(w, 'icon')),
        ...ED.formRow('戰鬥演出', ED.select(w, 'anim', ED.named('animations'), { optional: true, optionalLabel: `（依種類：${SRPG.media.DEFAULT_ANIM_BY_TYPE[w.type] || 'slash'}）` }),
          h('button', { onclick: () => { ED.sel.animations = SRPG.media.animFor(ED.c, w); ED.tab = 'animations'; ED.render(); } }, '✎ 編輯演出')),
        ...(w.type === 'staff' ? ED.formRow('回復量', ED.num(w, 'heal'), h('span.hint', {}, '實際回復 = 魔力 + 回復量')) : []),
        ...ED.formRow('勇者武器', ED.check(w, 'brave', '每次攻擊連續兩下')),
        ...ED.formRow('氣力需求', ED.num(w, 'morale', { attrs: { placeholder: '無' } }), h('span.hint', {}, '氣力系統開啟時，氣力不足無法使用（必殺技）')),
        ...ED.formRow('消耗', ED.num(w, 'cost', { attrs: { placeholder: '0' } }), ED.select(w, 'costType', [['st', '體力'], ['mp', '法力']], { optional: true, optionalLabel: '（自動：魔法/杖用法力）' }), h('span.hint', {}, '資源系統開啟時使用；反擊也會消耗')),
        ...ED.formRow('地圖兵器', h('label', {}, h('input', { type: 'checkbox', checked: !!w.map, onchange: (e) => { if (e.target.checked) w.map = { shape: 'burst', size: 1 }; else delete w.map; ED.dirty(true); } }), ' 範圍攻擊（不會反擊、不能用來反擊）'),
          ...(w.map ? [ED.select(w.map, 'shape', [['burst', '爆炸（射程內選中心）'], ['line', '直線（選方向）']]), '大小', ED.num(w.map, 'size'), ED.check(w.map, 'friendly', '會誤傷同伴')] : [])),
        ...ED.formRow('說明', ED.text(w, 'desc', { optional: true })),
        ...ED.formRow('價格', ED.num(w, 'price', { attrs: { placeholder: '500' } })),
        ...ED.formRow('改造成長', '每級威力 +', ED.num(w, 'upMt', { attrs: { placeholder: '1' } }), '命中 +', ED.num(w, 'upHit', { attrs: { placeholder: '3' } })),
        ...ED.formRow('特效', h('input', { type: 'text', value: (w.effective || []).join(','), placeholder: '例如 fly（對飛行 3 倍威力）', onchange: (e) => { const v = e.target.value.split(',').map((s) => s.trim()).filter(Boolean); if (v.length) w.effective = v; else delete w.effective; ED.dirty(); } })))));
  };

  /* ---------- 道具 ---------- */
  ED.tabs.items = function () {
    const id = ED.sel.items = ED.sel.items && ED.c.items[ED.sel.items] ? ED.sel.items : Object.keys(ED.c.items)[0];
    const left = ED.listPanel('items', { prefix: 'item', make: () => ({ name: '新道具', kind: 'heal', power: 10, uses: 1 }) });
    if (!id) return h('div.split', {}, left, h('p.hint', {}, '尚無道具'));
    const it = ED.c.items[id];
    return h('div.split', {}, left, h('div', {},
      h('h2', {}, '道具：' + (it.name || id)),
      h('div.form', {},
        ...ED.formRow('ID', ED.idField('items')),
        ...ED.formRow('名稱', ED.text(it, 'name')),
        ...ED.formRow('圖示', iconPicker(it, 'icon')),
        ...ED.formRow('效果', ED.select(it, 'kind', ITEM_KINDS, { rerender: true })),
        ...(it.kind === 'boost' ? ED.formRow('能力', ED.select(it, 'stat', C.STAT_KEYS.map((k) => [k, C.STAT_NAMES[k]]))) : []),
        ...ED.formRow('數值', ED.num(it, 'power')),
        ...ED.formRow('使用次數', ED.num(it, 'uses')),
        ...ED.formRow('價格', ED.num(it, 'price', { attrs: { placeholder: '500' } })),
        ...ED.formRow('說明', ED.text(it, 'desc', { optional: true }))),
      h('p.hint', {}, '使用道具會結束該單位的行動。')));
  };

  /* ---------- 精神指令 ---------- */
  ED.tabs.spirits = function () {
    const id = ED.sel.spirits = ED.sel.spirits && ED.c.spirits[ED.sel.spirits] ? ED.sel.spirits : Object.keys(ED.c.spirits)[0];
    const left = ED.listPanel('spirits', { prefix: 'spirit', make: () => ({ name: '新指令', cost: 10, effect: 'sureHit', target: 'self' }) });
    if (!id) return h('div.split', {}, left, h('p.hint', {}, '尚無精神指令'));
    const sp = ED.c.spirits[id];
    const E = SRPG.rules.EFFECTS;
    const KIND = { turn: '持續到下個我方回合', once: '用一次就消失', instant: '立即生效' };
    return h('div.split', {}, left, h('div', {},
      h('h2', {}, '精神指令：' + (sp.name || id)),
      h('div.form', {},
        ...ED.formRow('ID', ED.idField('spirits')),
        ...ED.formRow('名稱', ED.text(sp, 'name')),
        ...ED.formRow('SP 消耗', ED.num(sp, 'cost')),
        ...ED.formRow('效果', ED.select(sp, 'effect', Object.entries(E).map(([k, e]) => [k, `${e.name}（${k}）— ${KIND[e.kind]}`]), { rerender: true })),
        ...(['accel', 'heal', 'morale', 'sp'].includes(sp.effect) ? ED.formRow('數值', ED.num(sp, 'value')) : []),
        ...ED.formRow('對象', ED.select(sp, 'target', SPIRIT_TARGETS)),
        ...ED.formRow('說明', ED.text(sp, 'desc', { optional: true }))),
      h('p.hint', {}, '劇本資訊頁勾選「精神指令」才會在遊戲中出現；角色頁設定每個人會的指令與 SP。')));
  };

  /* ---------- 技能 ---------- */
  ED.tabs.skills = function () {
    const id = ED.sel.skills = ED.sel.skills && ED.c.skills[ED.sel.skills] ? ED.sel.skills : Object.keys(ED.c.skills)[0];
    const left = ED.listPanel('skills', { prefix: 'skill', make: () => ({ name: '新技能', effect: 'bonus', hit: 10 }) });
    if (!id) return h('div.split', {}, left, h('p.hint', {}, '尚無技能'));
    const sk = ED.c.skills[id];
    const E = SRPG.rules.SKILL_EFFECTS;
    const params = (E[sk.effect] || {}).params || [];
    const P = { value: '數值', rate: '發動率', rateMul: '發動率倍率', hit: '命中', avo: '迴避', crit: '必殺', dmg: '傷害', block: '減傷' };
    const rows = params.map((k) => k === 'rate'
      ? ED.formRow(P[k], ED.select({ get v() { return typeof sk.rate === 'number' ? 'num' : (sk.rate || 'skl'); }, set v(x) { sk.rate = x === 'num' ? 30 : x; } }, 'v',
        [['skl', '技巧%'], ['spd', '速度%'], ['lck', '幸運%'], ['str', '力量%'], ['num', '固定 %']], { rerender: true }),
        typeof sk.rate === 'number' ? ED.num(sk, 'rate') : null)
      : ED.formRow(P[k] || k, ED.num(sk, k)));
    return h('div.split', {}, left, h('div', {},
      h('h2', {}, '技能：' + (sk.name || id)),
      h('div.form', {},
        ...ED.formRow('ID', ED.idField('skills')),
        ...ED.formRow('名稱', ED.text(sk, 'name')),
        ...ED.formRow('效果', ED.select(sk, 'effect', Object.entries(E).map(([k, e]) => [k, `${e.name}（${k}）`]), { rerender: true })),
        ...rows.flat(),
        ...ED.formRow('說明', ED.text(sk, 'desc', { optional: true }))),
      h('p.hint', {}, '再移動：行動後可用剩餘移動力移動｜先制：HP ≤ 數值% 時被攻擊先出手｜追擊：追擊門檻降低｜連續/太陽/月光：依發動率觸發｜能力加成：命中/迴避/必殺/傷害/減傷。技能可設在職業（全職業共有）或角色身上，劇本指令「學會技能」可在劇情中習得。')));
  };

  /* ---------- 支援 ---------- */
  ED.tabs.supports = function () {
    const id = ED.sel.supports = ED.sel.supports && ED.c.supports[ED.sel.supports] ? ED.sel.supports : Object.keys(ED.c.supports)[0];
    const uids = Object.keys(ED.c.units);
    const left = ED.listPanel('supports', { prefix: 'support', make: () => ({ a: uids[0], b: uids[1], ranks: [{ rank: 'C', need: 3 }] }) });
    if (!id) return h('div.split', {}, left, h('p.hint', {}, '尚無支援關係'));
    const sp = ED.c.supports[id];
    sp.ranks = sp.ranks || [];
    const rows = sp.ranks.map((r, i) => h('div.row', {},
      ED.select(r, 'rank', [['C', 'C'], ['B', 'B'], ['A', 'A']]), '需要支援值', ED.num(r, 'need'),
      '對話', ED.select(r, 'script', ED.keys('scripts'), { optional: true }),
      h('button', { onclick: () => { const sid = ED.newId('scripts', `sup_${sp.a}_${sp.b}_${(r.rank || 'c').toLowerCase()}`); ED.c.scripts[sid] = [{ cmd: 'say', who: sp.a, text: '……' }, { cmd: 'say', who: sp.b, side: 'right', text: '……' }]; r.script = sid; ED.dirty(true); } }, '＋新對話'),
      h('button', { disabled: !r.script, onclick: () => { ED.sel.scripts = r.script; ED.tab = 'scripts'; ED.render(); } }, '✎'),
      h('button.danger', { onclick: () => { sp.ranks.splice(i, 1); ED.dirty(true); } }, '✕')));
    return h('div.split', {}, left, h('div', {},
      h('h2', {}, '支援：' + ((ED.c.units[sp.a] || {}).name || sp.a) + ' ＆ ' + ((ED.c.units[sp.b] || {}).name || sp.b)),
      h('div.form', {},
        ...ED.formRow('ID', ED.idField('supports')),
        ...ED.formRow('角色 A', ED.select(sp, 'a', ED.named('units'), { rerender: true })),
        ...ED.formRow('角色 B', ED.select(sp, 'b', ED.named('units'), { rerender: true }))),
      h('h3', {}, '支援等級（依序解鎖）'), ...rows,
      h('button', { onclick: () => { sp.ranks.push({ rank: ['C', 'B', 'A'][sp.ranks.length] || 'A', need: (sp.ranks.length + 1) * 4 }); ED.dirty(true); } }, '＋ 等級'),
      h('p.hint', {}, '兩人在我方回合開始時距離 2 格內，支援值 +1；值夠時相鄰可選「支援」播放對話並升級。範圍 3 格內有支援同伴時：C 命中/迴避 +5，B +10 且傷害 +1，A +15、傷害 +2、必殺 +5。')));
  };

  /* ---------- 地形 ---------- */
  ED.tabs.terrains = function () {
    const id = ED.sel.terrains = ED.sel.terrains && ED.c.terrains[ED.sel.terrains] ? ED.sel.terrains : Object.keys(ED.c.terrains)[0];
    const left = ED.listPanel('terrains', { prefix: 'terrain', make: () => ({ name: '新地形', char: '?', color: '#888888', cost: { foot: 1, horse: 1, fly: 1, armor: 1 }, def: 0, avo: 0, heal: 0 }) });
    const t = ED.c.terrains[id];
    t.cost = t.cost || {};
    const costIn = (mt) => h('label', {}, mt[1], h('input', { type: 'number', value: t.cost[mt[0]] == null ? '' : t.cost[mt[0]], placeholder: '×', oninput: (e) => { if (e.target.value === '') delete t.cost[mt[0]]; else t.cost[mt[0]] = Number(e.target.value); ED.dirty(); } }));
    const preview = h('canvas.px', { width: 48, height: 48 });
    SRPG.renderer.drawTerrain(preview.getContext('2d'), ED.c, id, 0, 0, 48, 0);
    return h('div.split', {}, left, h('div', {},
      h('h2', {}, '地形：' + (t.name || id)), preview,
      h('div.form', {},
        ...ED.formRow('ID', h('code', {}, id), h('span.hint', {}, '內建 key（plain/forest/mountain/water/wall/road/fort/village/throne）有程序化圖樣')),
        ...ED.formRow('名稱', ED.text(t, 'name')),
        ...ED.formRow('地圖字元', h('input', { type: 'text', maxLength: 1, value: t.char || '', style: { width: '40px' }, onchange: (e) => {
          const ch = e.target.value;
          const dup = Object.entries(ED.c.terrains).find(([k, o]) => k !== id && o.char === ch);
          if (!ch || dup) { ED.toast(dup ? `字元已被 ${dup[0]} 使用` : '需要一個字元'); e.target.value = t.char; return; }
          const old = t.char; t.char = ch;
          for (const chp of Object.values(ED.c.chapters)) if (chp.map && chp.map.rows) chp.map.rows = chp.map.rows.map((r) => r.split(old).join(ch));
          ED.dirty(true);
        } })),
        ...ED.formRow('顏色', ED.color(t, 'color')),
        ...ED.formRow('圖塊', ED.select(t, 'sprite', ED.keys('sprites'), { optional: true, optionalLabel: '（程序化繪製）', rerender: true })),
        ...ED.formRow('防禦加成', ED.num(t, 'def')),
        ...ED.formRow('迴避加成', ED.num(t, 'avo')),
        ...ED.formRow('回合回復 %', ED.num(t, 'heal'))),
      h('h3', {}, '移動花費（空白＝無法通過）'),
      h('div.grid8', {}, ...MOVE_TYPES.map(costIn))));
  };

  /* ---------- 原始 JSON ---------- */
  ED.tabs.json = function () {
    const ta = h('textarea', { rows: 30, value: JSON.stringify(ED.c, null, 1), style: { fontFamily: 'monospace' } });
    return h('div', {},
      h('h2', {}, '原始 JSON（進階）'),
      h('p.hint', {}, '可直接修改整份劇本後按「套用」。格式說明見 docs/SRPG_PLAN.md。'),
      ta,
      h('div.row', {}, h('button.primary', { onclick: () => {
        try { ED.load(JSON.parse(ta.value), '已套用 JSON'); ED.toast('已套用'); } catch (e) { ED.toast('JSON 錯誤：' + e.message, 4000); }
      } }, '套用')));
  };

  ED.MOVE_TYPES = MOVE_TYPES;
})();
