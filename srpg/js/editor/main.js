/* 編輯器主程式：分頁導覽、上方按鈕、啟動 */
(function () {
  'use strict';
  const { h } = ED;
  const C = SRPG.campaign;
  const $ = (id) => document.getElementById(id);
  const TABS = [['meta', '📘 劇本資訊'], ['chapters', '🗺 地圖章節'], ['units', '🧍 角色'], ['classes', '🎖 職業'], ['weapons', '🗡 武器'],
    ['terrains', '⛰ 地形'], ['sprites', '🎨 精靈圖'], ['scripts', '📜 劇本對話'], ['json', '{ } JSON']];

  ED.render = function () {
    const nav = $('tabs');
    nav.innerHTML = '';
    for (const [k, l] of TABS) nav.append(h('button', { className: ED.tab === k ? 'on' : '', onclick: () => { ED.tab = k; ED.render(); } }, l));
    const main = $('main');
    const scroll = main.scrollTop;
    main.innerHTML = '';
    try { main.append(ED.tabs[ED.tab]()); } catch (e) { console.error(e); main.append(h('p.err', {}, '顯示錯誤：' + e.message)); }
    main.scrollTop = scroll;
  };

  function blankCampaign() {
    return {
      format: 'srpg-campaign', version: 1,
      meta: { title: '我的劇本', author: '', start: 'ch1', permadeath: true },
      weapons: { iron_sword: { name: '鐵劍', type: 'sword', dmg: 'phys', mt: 5, hit: 90, crit: 0, range: [1, 1] } },
      classes: { lord: { name: '領主', move: 5, moveType: 'foot', sprite: 'swordsman' } },
      units: { hero: { name: '主角', class: 'lord', level: 1, lord: true, stats: { hp: 20, str: 6, mag: 1, skl: 6, spd: 7, lck: 5, def: 5, res: 2 }, growth: { hp: 70, str: 45, skl: 45, spd: 45, lck: 40, def: 30, res: 20 }, weapons: ['iron_sword'] } },
      sprites: { swordsman: SRPG.util.clone(window.SRPG_DEFAULT_CAMPAIGN.sprites.swordsman) },
      chapters: { ch1: { name: '第一章', map: { rows: Array.from({ length: 10 }, () => '.'.repeat(14)) }, units: [{ unit: 'hero', team: 'player', x: 1, y: 5 }], victory: { type: 'rout' }, defeat: { type: 'lordDies' }, events: [], next: [] } },
      scripts: {},
    };
  }

  function check() {
    const errs = C.validate(ED.c);
    ED.modal('✔ 劇本檢查', errs.length ? h('div', {}, ...errs.map((e) => h('div.err', {}, '⚠ ' + e))) : h('p.ok', {}, '沒有發現問題！'));
    return errs;
  }

  $('btnNewC').onclick = () => { if (confirm('建立空白劇本？目前內容請先匯出備份。')) ED.load(blankCampaign(), '新劇本'); };
  $('btnDemo').onclick = () => { if (confirm('載入示範劇本？目前內容請先匯出備份。')) ED.load(window.SRPG_DEFAULT_CAMPAIGN, '示範劇本'); };
  $('btnOpen').onclick = async () => {
    try { const f = await ED.readFile($('fileOpen')); ED.load(JSON.parse(f.data), f.name); }
    catch (e) { ED.toast('開啟失敗：' + e.message, 4000); }
  };
  $('btnExport').onclick = () => ED.download((ED.c.meta.title || 'campaign').replace(/[\\/:*?"<>|\s]+/g, '_') + '.json', JSON.stringify(ED.c, null, 1));
  $('btnSaveGame').onclick = () => {
    try { localStorage.setItem('srpg_campaign_custom', JSON.stringify(ED.c)); ED.toast('已存為遊戲劇本：遊戲標題畫面選「編輯器中的劇本」'); }
    catch (e) { ED.toast('儲存失敗（容量不足？）：' + e.message, 4000); }
  };
  $('btnPlay').onclick = () => {
    const errs = C.validate(ED.c);
    if (errs.length && !confirm(`劇本有 ${errs.length} 個問題，仍要試玩嗎？\n\n${errs.slice(0, 5).join('\n')}`)) return;
    try { localStorage.setItem('srpg_campaign_playtest', JSON.stringify(ED.c)); } catch (e) { ED.toast('無法寫入試玩資料：' + e.message); return; }
    const ch = ED.tab === 'chapters' && ED.sel.chapters ? ED.sel.chapters : ED.c.meta.start;
    window.open('index.html?playtest=1&chapter=' + encodeURIComponent(ch || ''), '_blank');
  };
  $('btnAI').onclick = () => ED.aiBundle();
  $('btnAIImport').onclick = () => ED.aiImport();
  $('btnCheck').onclick = check;
  ED.runCheck = check;

  document.addEventListener('keydown', (e) => { if (SRPG.UI.onKey(e)) e.preventDefault(); });

  if (!ED.loadWork()) ED.load(window.SRPG_DEFAULT_CAMPAIGN, '示範劇本');
  ED.render();
})();
