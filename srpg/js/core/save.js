/* 存檔：localStorage 多欄位 + 匯出/匯入 .json 檔（都存在玩家電腦）
   storage 可注入（node 測試用 Map 模擬） */
(function (root) {
  'use strict';
  const SRPG = root.SRPG = root.SRPG || {};
  const { clone } = SRPG.util;
  const PREFIX = 'srpg_save_';
  const SLOTS = 3;

  function memoryStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  }

  function defaultStorage() {
    try { const s = root.localStorage; s.setItem('__t', '1'); s.removeItem('__t'); return s; } catch (e) { return memoryStorage(); }
  }

  /* 存檔內容：
     { format:'srpg-save', version:1, campaign:標題, chapter, roster, flags, battle:(中斷存檔，可為 null), time, label } */
  function makeSave(state) {
    return {
      format: 'srpg-save', version: 1,
      campaign: state.campaignTitle || '',
      chapter: state.chapter,
      roster: clone(state.roster || {}),
      flags: clone(state.flags || {}),
      battle: state.battle ? SRPG.battle.serialize(state.battle) : null,
      time: new Date().toISOString(),
      label: state.label || '',
    };
  }

  function createStore(storage) {
    const st = storage || defaultStorage();
    const k = (slot) => PREFIX + slot;
    return {
      SLOTS,
      write(slot, save) { try { st.setItem(k(slot), JSON.stringify(save)); return true; } catch (e) { return false; } },
      read(slot) { try { const s = st.getItem(k(slot)); return s ? check(JSON.parse(s)) : null; } catch (e) { return null; } },
      remove(slot) { try { st.removeItem(k(slot)); } catch (e) { /* 忽略 */ } },
      list() { const out = []; for (let i = 0; i < SLOTS; i++) out.push(this.read(i)); return out; },
    };
  }

  function check(obj) {
    if (!obj || obj.format !== 'srpg-save') throw new Error('不是 SRPG 存檔');
    return obj;
  }

  SRPG.save = { makeSave, createStore, memoryStorage, check, SLOTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRPG;
})(typeof window !== 'undefined' ? window : globalThis);
