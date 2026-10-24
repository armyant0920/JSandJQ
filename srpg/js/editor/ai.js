/* AI 協作：
   1. 匯出「AI 委託單 (.md)」= 角色設定 + 格式說明 + 目前資料 + 委託任務，貼給任何聊天 AI（不需 API Key）
   2. 把 AI 回傳的 JSON 貼回「匯入 AI 回傳」→ 預覽差異 → 合併
   精靈圖是 ASCII 字元網格、地圖是字元列，LLM 可以直接讀寫。 */
(function () {
  'use strict';
  const { h } = ED;
  const C = SRPG.campaign;
  const GROUPS = ['meta', 'terrains', 'weapons', 'items', 'spirits', 'classes', 'units', 'sprites', 'portraits', 'chapters', 'scripts'];

  const SCOPES = {
    sprites: { label: '🎨 精靈圖 / 頭像（像素畫）', groups: ['sprites', 'portraits'], ctx: ['classes'] },
    maps: { label: '🗺 地圖與章節', groups: ['chapters'], ctx: ['terrains', 'units', 'scripts'] },
    story: { label: '📜 劇情對話', groups: ['scripts', 'chapters'], ctx: ['units'] },
    db: { label: '⚖ 角色 / 職業 / 武器 / 道具 / 精神指令', groups: ['units', 'classes', 'weapons', 'items', 'spirits'], ctx: ['sprites'] },
  };
  const TASKS = {
    sprites: '請新增一個 16×16 的單位精靈 `sprite_xxx`：（描述外觀，例如：戴兜帽、拿法杖的白魔道士）。衣服主色用隊伍色 T/t。',
    maps: '請設計新章節 `ch_new`：（地形主題、尺寸、敵人配置、勝利條件、開場與結束對話）。',
    story: '請為章節 `ch1` 加寫一段開場對話，並加入一個會影響後續分歧的選項。',
    db: '請檢查角色與武器數值的平衡，調整過強/過弱的部分並說明理由（說明寫在 JSON 外）。',
  };

  // 移除過大的圖片資料
  function slim(group, data) {
    if (group !== 'sprites' && group !== 'portraits') return data;
    const out = {};
    for (const [k, v] of Object.entries(data)) out[k] = v.image ? Object.assign({}, v, { image: '(圖片資料省略，請勿修改)' }) : v;
    return out;
  }

  function compactJSON(obj) {
    // 讓每列像素/地圖字串各佔一行，其餘緊湊
    return JSON.stringify(obj, null, 1).replace(/\[\n\s+(-?\d+),\n\s+(-?\d+)\n\s+\]/g, '[$1,$2]');
  }

  function spec(scopes) {
    const parts = [];
    parts.push(`## 資料格式總覽
整個劇本是一個 JSON（format: "srpg-campaign"），由下列頂層區塊組成，每個區塊都是「id → 物件」：
- \`terrains\` 地形：{ name, char(地圖字元), color, cost:{foot,horse,armor,fly}(缺少=不可通過), def, avo, heal }
- \`weapons\` 武器：{ name, type:sword|lance|axe|bow|anima|light|dark, dmg:phys|mag, mt, hit, crit, range:[最小,最大], effective?:["fly"] }
- \`classes\` 職業：{ name, move, moveType:foot|horse|armor|fly, sprite, tags? }
- \`units\` 角色：{ name, class, level, lord?, sprite?, portrait?, stats:{hp,str,mag,skl,spd,lck,def,res}, growth:{同上，百分比}, weapons:[武器id] }
- \`weapons\` 補充：type 為 "staff" 是治療杖（heal: 回復量，回復 = 魔力 + heal）；brave:true 每次攻擊連打兩下；morale:115 需要氣力 115 才能用；icon: 圖示編號（assets/icons.png，16 欄，編號 = 列×16+欄）
- \`items\` 道具：{ name, kind:heal|boost|sp|morale, power, stat?(boost 用), uses, icon?, desc }
- \`spirits\` 精神指令：{ name, cost(SP), effect, value?, target:self|ally|allies, desc }；effect 可用：${Object.entries(SRPG.rules.EFFECTS).map(([k, e]) => k + '(' + e.name + ')').join('、')}
- \`units\` 另有：items:[道具id]、sp、morale(初始氣力)、spirits:[精神指令id]；sprite 可用 "chara_0"~"chara_7" 等圖片精靈
- \`meta.rules\`：{ morale:true(氣力系統), spirits:true(精神指令) }
- \`sprites\` / \`portraits\` 像素圖（見下）
- \`chapters\` 章節、\`scripts\` 劇本對話（見下）
- id 只用英數與底線。引用其他資料時用 id。`);
    if (scopes.includes('sprites')) parts.push(`## 像素圖格式（ASCII 字元畫）
\`\`\`
{ "name":"說明", "desc":"外觀描述", "w":16, "h":16, "fps":3,
  "palette": { "o":"#1c1c28", "s":"#f2c79a", "T":"team", "t":"teamDark" },
  "frames": [ [ "................", ...共 h 列，每列剛好 w 個字元... ] ] }
\`\`\`
- 每個影格是 h 列字串、每列 w 個字元；字元對照 palette 的顏色，\`.\` = 透明。
- palette 的值可以是 "#rrggbb"，或 "team" / "teamDark" / "teamLight"（遊戲會依我方藍、敵方紅、友軍綠自動換色——制服/盔甲主色請用這些）。
- 單位精靈 16×16、腳踩在最下面 1~2 列、面向右邊；頭像 32×32 胸像。可以有 1~4 個影格做待機動畫（例如呼吸時身體下移 1px）。
- **請盡量沿用既有 palette 字元與色彩**，新增顏色時挑一個沒用過的單一字元。
- 若使用者附上參考圖片，請依圖重畫成乾淨像素，背景一律輸出 \`.\`。`);
    if (scopes.includes('maps')) parts.push(`## 章節格式
\`\`\`
{ "name":"第X章 標題",
  "map": { "rows": [ "MMM..FF....", ... ] },          // 每列字元 = 地形 char，所有列等長
  "units": [ { "unit":"角色id", "team":"player|enemy|ally", "x":0, "y":0, "ai":"aggressive|guard|hold", "boss":true?, "level":5? } ],
  "victory": { "type":"rout|boss|survive|seize", "turns":5?, "x":?, "y":? },
  "defeat":  { "type":"lordDies|unitDies|turnLimit", "unit"?:id, "turns"?:n },
  "events": [ { "on":"start|turn|death|talk|visit|victory", "turn"?:n, "phase"?:"player|enemy", "unit"?:id, "a"?:id, "b"?:id, "x"?:n, "y"?:n, "if"?:"旗標", "script":"劇本id" } ],
  "next": [ { "if":"旗標", "chapter":"chA" }, { "chapter":"chB" } ] }   // 由上往下第一個符合；空陣列=結局
\`\`\`
- 座標 x 向右、y 向下，從 0 開始；單位不能放在無法通行的地形（牆、水）上。
- 地圖字元：${Object.entries(ED.c.terrains).map(([k, t]) => `\`${t.char}\`=${t.name}(${k})`).join('、')}
- 平衡建議：我方 4~6 人、敵人 6~12 人，給玩家一兩個有防禦加成的地形據點。`);
    if (scopes.includes('story') || scopes.includes('maps')) parts.push(`## 劇本（scripts）格式：指令陣列
\`\`\`
[ {"cmd":"say","who":"角色id","text":"台詞","side":"left|right"},
  {"cmd":"narrate","text":"旁白"},
  {"cmd":"choice","prompt":"問題","options":[{"text":"選項","set":"旗標","goto":"標籤"}]},
  {"cmd":"label","name":"標籤"}, {"cmd":"goto","label":"標籤"},
  {"cmd":"set","flag":"旗標"} 或 {"cmd":"set","flag":"好感","add":1},
  {"cmd":"if","flag":"旗標","goto":"標籤","else":"標籤"}  // 也可加 "gte":2 / "eq":值；flag 前加 ! 表示否定
  {"cmd":"spawn","units":[{"unit":"id","team":"enemy","x":0,"y":0}]},
  {"cmd":"recruit","unit":"id"}, {"cmd":"give","unit":"id","weapon":"武器id"} 或 {"cmd":"give","unit":"id","item":"道具id"}, {"cmd":"end"} ]
\`\`\`
- 沒有角色的人物可用 {"cmd":"say","name":"村長","text":"..."}。
- 每個 goto / 選項跳轉的標籤都必須存在於同一段劇本。`);
    return parts.join('\n\n');
  }

  function buildBundle(scopes, task) {
    const groups = new Set(), ctx = new Set();
    for (const s of scopes) { SCOPES[s].groups.forEach((g) => groups.add(g)); SCOPES[s].ctx.forEach((g) => ctx.add(g)); }
    const data = { format: 'srpg-campaign', version: 1 };
    for (const g of GROUPS) if (groups.has(g) || ctx.has(g)) data[g] = slim(g, ED.c[g]);
    data.meta = { title: ED.c.meta.title };
    const ids = GROUPS.filter((g) => g !== 'meta').map((g) => `- ${g}: ${Object.keys(ED.c[g]).join(', ') || '（無）'}`).join('\n');
    return `# SRPG 戰棋劇本 — AI 委託單

你是**戰棋遊戲（類似火焰之紋章）的關卡設計師兼像素美術**。請依「## 委託任務」修改或新增下方的資料，
**最後只回傳一個 JSON 物件**（可以用 \`\`\`json 包起來），我會直接匯入編輯器。

## 回傳規則（重要）
1. 只需要包含**有新增或修改的頂層區塊**與其中**有變動的 id**，例如 \`{ "sprites": { "mage_white": {...} }, "scripts": {...} }\`。
   編輯器會以 id 為單位覆蓋合併（沒列出的資料保持不變）。
2. 物件內容要**完整**（覆蓋時不會保留舊欄位）。
3. 新的 id 不要和既有 id 重複（除非你是要修改它）。
4. 嚴格 JSON：雙引號、不可有註解或尾逗號。說明文字請寫在 JSON 區塊外面。

${spec(scopes)}

## 目前已有的 id
${ids}

## 委託任務
${task || '（請在這裡描述要 AI 做的事）'}

## 目前資料（相關部分）
\`\`\`json
${compactJSON(data)}
\`\`\`
`;
  }

  ED.aiBundle = function () {
    const sel = { sprites: true, maps: false, story: false, db: false };
    const ta = h('textarea', { rows: 6, value: TASKS.sprites });
    const body = h('div', {},
      h('p.hint', {}, '產生一份 Markdown 檔，把它（或其內容）貼到 ChatGPT、Claude、Gemini 等 AI 對話中；有參考圖的話一起上傳到對話。AI 回傳 JSON 後，用「⬆ 匯入 AI 回傳」合併。'),
      h('h3', {}, '委託範圍'),
      ...Object.entries(SCOPES).map(([k, s]) => h('label', { style: { display: 'block' } }, h('input', { type: 'checkbox', checked: sel[k], onchange: (e) => { sel[k] = e.target.checked; if (e.target.checked) ta.value = TASKS[k]; } }), ' ' + s.label)),
      h('h3', {}, '委託任務（寫清楚要做什麼）'), ta);
    ED.modal('🤖 AI 協作包', body, [
      { label: '📋 複製到剪貼簿', onclick: () => { const md = buildBundle(Object.keys(sel).filter((k) => sel[k]), ta.value); navigator.clipboard.writeText(md).then(() => ED.toast('已複製（' + md.length + ' 字）'), () => ED.toast('無法存取剪貼簿，請改用下載')); return false; } },
      { label: '⬇ 下載 .md', primary: true, onclick: () => { const md = buildBundle(Object.keys(sel).filter((k) => sel[k]), ta.value); ED.download('SRPG_AI委託單.md', md, 'text/markdown'); } },
    ]);
  };

  /* ---------- 匯入 AI 回傳 ---------- */
  function extractJSON(text) {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    let src = fence ? fence[1] : text;
    const a = src.indexOf('{'), b = src.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('找不到 JSON 物件');
    src = src.slice(a, b + 1);
    return JSON.parse(src);
  }

  // 修正 AI 常見的小錯：精靈列長度不一
  function fixSprite(sp) {
    if (!sp || !Array.isArray(sp.frames) || sp.image) return sp;
    sp.frames = sp.frames.map((f) => (Array.isArray(f) ? f : String(f).split('\n')));
    sp.h = sp.h || sp.frames[0].length;
    sp.w = sp.w || Math.max(...sp.frames[0].map((r) => r.length));
    sp.frames = sp.frames.map((rows) => { const out = []; for (let y = 0; y < sp.h; y++) out.push(((rows[y] || '') + '.'.repeat(sp.w)).slice(0, sp.w)); return out; });
    return sp;
  }

  function mergeInto(base, inc) {
    const summary = [];
    for (const g of GROUPS) {
      if (!inc[g] || typeof inc[g] !== 'object') continue;
      if (g === 'meta') { Object.assign(base.meta, inc.meta); summary.push('meta：更新'); continue; }
      const add = [], upd = [];
      for (const [id, v] of Object.entries(inc[g])) {
        if (g === 'sprites' || g === 'portraits') {
          if (v && v.image === '(圖片資料省略，請勿修改)') { if (base[g][id]) v.image = base[g][id].image; else continue; }
          fixSprite(v);
        }
        (base[g][id] ? upd : add).push(id);
        base[g][id] = v;
      }
      if (add.length || upd.length) summary.push(`${g}：${add.length ? '新增 ' + add.join(', ') : ''}${add.length && upd.length ? '；' : ''}${upd.length ? '修改 ' + upd.join(', ') : ''}`);
    }
    return summary;
  }
  ED.mergeAI = (base, inc) => mergeInto(base, inc);
  ED.extractJSON = extractJSON;

  ED.aiImport = function () {
    const ta = h('textarea', { rows: 14, placeholder: '把 AI 的整段回覆貼在這裡（會自動抓出 JSON）', style: { fontFamily: 'monospace' } });
    const out = h('div');
    let pending = null;
    const check = () => {
      out.innerHTML = '';
      pending = null;
      try {
        const inc = extractJSON(ta.value);
        const trial = C.normalize(SRPG.util.clone(ED.c));
        const summary = mergeInto(trial, inc);
        const errs = C.validate(trial);
        pending = trial;
        out.append(h('h3', {}, '將會套用的變更'), ...(summary.length ? summary.map((s) => h('div.ok', {}, '✔ ' + s)) : [h('div.err', {}, '沒有可辨識的區塊（sprites / chapters / scripts…）')]),
          errs.length ? h('div', {}, h('h3', {}, `檢查到 ${errs.length} 個問題（仍可套用後再修）`), ...errs.slice(0, 20).map((e) => h('div.err', {}, '⚠ ' + e))) : h('div.ok', {}, '✔ 劇本檢查通過'));
        if (!summary.length) pending = null;
      } catch (e) { out.append(h('div.err', {}, '解析失敗：' + e.message)); }
    };
    ta.addEventListener('input', () => { clearTimeout(ta._t); ta._t = setTimeout(check, 300); });
    ED.modal('⬆ 匯入 AI 回傳', h('div', {}, ta, h('div.row', {}, h('button', { onclick: async () => { const f = await ED.readFile(document.getElementById('fileOpen')); ta.value = f.data; check(); } }, '或選擇檔案…')), out), [
      { label: '合併到劇本', primary: true, onclick: () => { if (!pending) { ED.toast('沒有可套用的內容'); return false; } ED.c = pending; SRPG.sprites.tag(ED.c); SRPG.sprites.invalidate(); ED.dirty(true); ED.toast('已合併'); } },
    ]);
  };

  ED.buildBundle = buildBundle;
})();
