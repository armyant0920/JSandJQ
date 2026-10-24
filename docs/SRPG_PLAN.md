# 戰棋 SRPG 專案 — 需求評估與開發計畫

> 目標：以「火焰之紋章 (FE)」「超級機器人大戰 (SRW)」類型為參考的**網頁回合制戰棋遊戲**，
> 附帶**編輯器**（角色 / 地圖 / 對話 / 劇情分支）與 **AI 協作繪圖**流程。

---

## 0. 現況盤點（舊程式碼）

| 檔案 | 內容 | 可沿用程度 |
|---|---|---|
| `animation.html` | jQuery + Canvas 試驗：隨機 RPG Maker 規格角色 (`images/role.png`，36px、3×4 動作格、4×2 角色) 生成、點選、右鍵移動 | **概念可沿用**：精靈圖切格規則 (`size*(3*roleX+action)`, `size*(4*roleY+direction)`)；程式本身耦合 DOM，不直接沿用 |
| `images/role.png` / `item.png` | 角色行走圖 (432×288)、道具圖示 (512×608，32px 格) | ⚠ 來源/授權不明（看起來是同人素材），**僅建議作為本機測試**，不放入正式遊戲預設資料 |
| `createRange*.html`、`readText.html`、`自訂右鍵選項/`、`test.html`、`js/test.js` | 文字選取、FileReader、右鍵選單、輪播試驗 | 與遊戲無關，保留不動。FileReader 讀檔、右鍵選單概念會在編輯器中以新程式實作 |

**結論**：舊專案沒有可直接擴充的回合制核心，新遊戲放在獨立資料夾 `srpg/`，舊檔原封保留。

參考專案 [HOMEGUARD_Game](https://github.com/armyant0920/HOMEGUARD_Game) 中可借鏡的設計：
- **資料驅動**：外型模組(module) → 動作(action) → 影格(frame)，缺動作自動退回。
- **ASCII 像素格式**：每影格是字串陣列 + palette，`.` 為透明 → LLM 能讀也能畫。
- **AI 協作包 (.md)**：匯出「格式說明 + 現有資料 + 委託任務範本」，人工貼給 AI、貼回匯入，**不需 API Key**。
- **零依賴、雙擊可跑**、內建範例資料（`file://` 下 fetch 被擋時仍可運作）。

---

## 1. 需求確認與評估

| # | 需求 | 評估 / 決策 |
|---|---|---|
| 1 | 網頁遊戲，加套件需報備 | **目前不加任何套件**。原生 JS (ES2020) + Canvas 2D + HTML/CSS。測試使用 Node 內建 `node:test`（非套件）。 |
| 2a | 編輯器：擴展角色 | 編輯職業/角色能力值/成長率/武器/外型綁定 |
| 2b | 編輯器：自訂地圖 | 地形筆刷、單位擺放、勝敗條件、事件觸發 |
| 2c | 編輯器：對話框 | 劇本指令（說話、頭像、旁白、選項、旗標、跳轉、增援） |
| 2d | 編輯器：劇情分支 | 選項→旗標→章節分歧（`next` 可依旗標條件選擇下一章） |
| 2e | 自動整合素材 | 匯入 PNG（含 RPG Maker 規格行走圖切格）、拖放、去背；素材存在劇本資料中 (dataURL / ASCII) |
| 2f | AI 協助繪製 | 沿用 HOMEGUARD 的 **ASCII 像素 + AI 協作包** 流程；並延伸到「地圖、劇本、角色數值」也能用 AI 協作包產生。可選：日後加「直接呼叫 API」模式（需使用者自備 Key，見 §3） |
| 3 | 純前端、存檔在玩家電腦 | **建議維持純前端**（理由見 §2）。存檔：localStorage 多欄位 + 匯出/匯入 `.json` 存檔檔 |
| 4 | 開發分支、自動推進 | 開發分支：`claude/affectionate-franklin-bbpmew`（本 session 指定的 DEV 分支）。§6 提供 `/goal` 指令 |

### 待使用者確認的決策（目前採用的預設值）
1. **美術風格**：預設 16×16 像素 ASCII 角色（隊伍色自動換色），地形為程序化繪製。→ 若要用 `role.png` 這類 RPG Maker 素材，編輯器可匯入，但不放進預設劇本。
2. **戰鬥規則**：以 FE 為主（武器/命中/迴避/必殺/追擊/反擊/地形加成/經驗值與成長率）；SRW 元素（精神指令、氣力、改造）排在 M5 選配。
3. **永久死亡**：預設開啟（FE 風格），劇本可設定 `permadeath:false`。
4. **語言**：介面繁體中文。

---

## 2. 架構討論：純前端 vs 前後端

| 面向 | 純前端（建議） | 前後端 |
|---|---|---|
| 部署 | GitHub Pages / 雙擊 HTML 即可 | 需主機、資料庫、維運 |
| 存檔 | localStorage + 存檔檔匯出（符合「存在玩家電腦」） | 雲端存檔、跨裝置 |
| 劇本分享 | 匯出單一 `campaign.json` 分享 | 線上劇本庫 / 工作坊 |
| AI 繪圖 | AI 協作包（免 Key）；或玩家自備 Key 從瀏覽器直呼 | 伺服器代管 Key，較安全 |
| 防作弊 | 無（單機遊戲不需要） | 可做 |
| 開發成本 | 低 | 高 |

**結論**：維持純前端。程式碼以「**核心邏輯（純函式、可在 Node 測試）**」與「**瀏覽器呈現層**」分離，
若日後要加後端（線上劇本庫、雲端存檔、AI 代理），只需新增一個 `storage`/`ai` adapter，不動核心。

### 模組分層
```
srpg/
  index.html            遊戲
  editor.html           編輯器
  js/core/              純邏輯（無 DOM，可 node 測試）
    util.js             RNG(可序列化種子)、工具
    rules.js            地形、移動範圍(Dijkstra)、攻擊範圍、戰鬥預測/結算、經驗/升級
    ai.js               敵方 AI
    battle.js           戰場狀態機（回合/陣營/勝敗/事件觸發）
    script.js           劇本直譯器（對話/選項/旗標/跳轉/增援）
    campaign.js         劇本資料正規化、驗證、章節分歧
    save.js             存檔（localStorage 欄位 + 檔案匯出入）
  js/render/            Canvas 呈現
    sprites.js          ASCII 精靈 → canvas 快取、隊伍換色、RPG Maker 行走圖切格
    renderer.js         地圖/單位/範圍/游標/特效
  js/ui/                DOM UI（對話框、選單、戰鬥預測、標題）
  js/game.js            遊戲控制器（輸入、流程）
  js/editor/            編輯器
  data/demo-campaign.js 內建範例劇本（window.SRPG_DEFAULT_CAMPAIGN，file:// 也能用）
  tests/*.test.js       node --test
```
全部使用傳統 `<script>` 載入（非 ES module），以保留「雙擊 HTML 就能玩」。

---

## 3. 資料格式（劇本檔 `srpg-campaign` v1）

一份 JSON 包含整個遊戲內容，編輯器產出＝遊戲讀取：

```jsonc
{
  "format": "srpg-campaign", "version": 1,
  "meta": { "title": "…", "author": "…", "start": "ch1", "permadeath": true },
  "terrains": { "plain": { "name":"平地", "char":".", "cost":{"foot":1,"horse":1,"fly":1}, "def":0, "avo":0, "heal":0 }, … },
  "weapons":  { "iron_sword": { "name":"鐵劍", "type":"sword", "dmg":"phys", "mt":5, "hit":90, "crit":0, "range":[1,1] }, … },
  "classes":  { "lord": { "name":"領主", "move":5, "moveType":"foot", "sprite":"swordsman" }, … },
  "units":    { "alan": { "name":"艾倫", "class":"lord", "level":1, "portrait":"alan",
                          "stats":{"hp":20,"str":6,"mag":1,"skl":7,"spd":8,"lck":6,"def":5,"res":2},
                          "growth":{"hp":70,"str":45,…}, "weapons":["iron_sword"] }, … },
  "sprites":  { "swordsman": { "w":16,"h":16, "palette":{"o":"#222","T":"team"}, "frames":[[…16 列字串…],[…]] } },
  "portraits":{ "alan": { "w":32,"h":32, "palette":{…}, "frames":[[…]] } 或 { "image":"data:image/png;base64,…" } },
  "chapters": {
    "ch1": {
      "name":"序章", "map": { "legend": {".":"plain","F":"forest",…}, "rows":["....FF..", …] },
      "units":[ {"unit":"alan","team":"player","x":2,"y":5},
                {"unit":"bandit","team":"enemy","x":9,"y":3,"ai":"aggressive","boss":true} ],
      "victory": {"type":"rout"},            // rout | boss | survive(turns) | seize(x,y)
      "defeat":  {"type":"unitDies","unit":"alan"},
      "events":  [ {"on":"start","script":"ch1_intro"},
                   {"on":"turn","turn":3,"phase":"enemy","script":"ch1_reinforce"},
                   {"on":"death","unit":"bandit_boss","script":"ch1_boss_down"} ],
      "next": [ {"if":"spared_thief","chapter":"ch2a"}, {"chapter":"ch2b"} ]
    }
  },
  "scripts": {
    "ch1_intro": [
      {"cmd":"say","who":"alan","text":"……"},
      {"cmd":"choice","options":[{"text":"放過他","set":"spared_thief","goto":"a"},{"text":"不行","goto":"b"}]},
      {"cmd":"label","name":"a"}, …
      {"cmd":"spawn","units":[…]}, {"cmd":"end"}
    ]
  }
}
```
地圖用「字元列 + legend」、精靈用「ASCII 網格 + palette」，兩者都是 **AI 可直接讀寫**的格式。

---

## 4. 里程碑

| 里程碑 | 內容 | 狀態 |
|---|---|---|
| **M0** | 需求評估、架構、資料格式（本文件） | ✅ 完成 |
| **M1 戰棋核心** | 格子地圖、地形、移動範圍、攻擊、戰鬥預測、相剋/反擊/追擊/必殺/特效、敵方 AI（進攻/守備/不動）、回合流程、勝敗條件（殲滅/敵將/存活/壓制）、經驗升級、永久死亡、16 項單元測試 | ✅ 完成 |
| **M2 劇情系統** | 對話框（頭像、打字機效果）、選項分支、旗標、條件跳轉、事件（開場/回合/陣亡/交談/拜訪/勝利）、增援、說服、給予武器、章節分歧、條件出場、3 欄位存讀檔 + 存檔檔匯出入、中斷存檔 | ✅ 完成 |
| **M3 編輯器 v1** | 地圖繪製、單位擺放、勝敗/事件/分歧設定、角色/職業/武器/地形表單、ID 改名同步引用、像素精靈編輯器、劇本指令編輯 + 對話預覽、試玩、匯出入 JSON、自動暫存 | ✅ 完成 |
| **M4 AI 協作 & 素材** | AI 協作包（精靈/地圖/劇情/數值）、匯入 AI 回傳（抓 JSON、差異預覽、驗證、合併）、PNG 匯入（縮放+去背+減色）、RPG Maker 行走圖 | ✅ 完成（初版） |
| M5 進階玩法 | 道具/背包（傷藥）、治療杖、交易、商店/整備畫面、出擊選人、支援對話、SRW 要素（精神指令/氣力/改造）、霧戰 | 待辦 |
| M6 表現強化 | 戰鬥動畫畫面、音效（WebAudio 合成，參考 HOMEGUARD）、BGM、手機觸控最佳化、地圖捲動/縮放、頭像 32×32 範例美術 | 待辦 |
| M7（選配） | 編輯器內直接呼叫 AI API（玩家自備 Key）；後端：線上劇本分享、雲端存檔、AI API 代理 | 需另行討論 |

---

## 5. 測試與品質
- `node --test srpg/tests/*.test.js` 測核心規則（移動成本、範圍、戰鬥計算、AI、劇本直譯器、分歧）。
- 瀏覽器端以 Playwright（環境內建）做冒煙測試：載入、走一回合、對話、存讀檔。

---

## 6. 自動推進指令（/goal）

在 Claude Code 中可直接貼上：

```
/goal 依 docs/SRPG_PLAN.md 的里程碑，在分支 claude/affectionate-franklin-bbpmew 持續推進 srpg/ 戰棋遊戲，直到 M5、M6 全部完成：
每輪挑選下一個「待辦」里程碑中最小、可獨立交付的項目實作（先 M5 再 M6）；
規則：不得新增任何 npm/CDN 套件或後端（需要時停下來詢問）；資料格式向下相容並同步更新 AI 協作包的格式說明；
每輪完成後執行 `node --test srpg/tests/*.test.js` 並用 Playwright 對 srpg/index.html 與 srpg/editor.html 做冒煙測試，全部通過才提交並推送；
同步更新 docs/SRPG_PLAN.md 的里程碑狀態與 srpg/README.md。
遇到美術風格、遊戲規則取捨、或架構（前後端、AI API）決策時停下來詢問。
```

> 若你的 Claude Code 版本沒有 `/goal`，可改用 `/loop` 或直接貼上同一段文字作為任務描述。
