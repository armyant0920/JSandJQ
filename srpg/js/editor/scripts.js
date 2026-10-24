/* 劇本對話分頁：指令列編輯（說話/旁白/選項/標籤/跳轉/旗標/條件/增援/說服/給予）＋ 對話預覽 */
(function () {
  'use strict';
  const { h } = ED;
  const CMDS = [['say', '💬 說話'], ['narrate', '📜 旁白'], ['choice', '🔀 選項'], ['label', '🏷 標籤'], ['goto', '↪ 跳轉'],
    ['set', '🚩 設定旗標'], ['if', '❓ 條件跳轉'], ['spawn', '⚔ 增援'], ['recruit', '🤝 說服加入'], ['give', '🎁 給予物品'], ['gold', '💰 軍資金'], ['learn', '🌀 學會技能'], ['end', '⏹ 結束']];
  const TEAMS = [['enemy', '敵方'], ['player', '我方'], ['ally', '友軍']];
  const TEMPLATES = {
    say: () => ({ cmd: 'say', who: Object.keys(ED.c.units)[0], text: '' }),
    narrate: () => ({ cmd: 'narrate', text: '' }),
    choice: () => ({ cmd: 'choice', prompt: '', options: [{ text: '選項一' }, { text: '選項二' }] }),
    label: () => ({ cmd: 'label', name: 'L' + Math.floor(Math.random() * 1000) }),
    goto: () => ({ cmd: 'goto', label: '' }),
    set: () => ({ cmd: 'set', flag: 'flag1' }),
    if: () => ({ cmd: 'if', flag: 'flag1', goto: '' }),
    spawn: () => ({ cmd: 'spawn', units: [{ unit: Object.keys(ED.c.units)[0], team: 'enemy', x: 0, y: 0 }] }),
    recruit: () => ({ cmd: 'recruit', unit: Object.keys(ED.c.units)[0] }),
    give: () => ({ cmd: 'give', unit: Object.keys(ED.c.units)[0], weapon: Object.keys(ED.c.weapons)[0] }),
    gold: () => ({ cmd: 'gold', add: 1000 }),
    learn: () => ({ cmd: 'learn', unit: Object.keys(ED.c.units)[0], skill: Object.keys(ED.c.skills)[0] }),
    end: () => ({ cmd: 'end' }),
  };

  function allFlags() {
    const out = new Set();
    for (const s of Object.values(ED.c.scripts)) for (const c of s) {
      if (c.flag) out.add(c.flag.replace(/^!/, ''));
      for (const o of c.options || []) { if (o.set) out.add(o.set); if (o.if) out.add(o.if.replace(/^!/, '')); }
    }
    for (const ch of Object.values(ED.c.chapters)) for (const n of [].concat(ch.next || [])) if (n && n.if) out.add(n.if.replace(/^!/, ''));
    return [...out];
  }

  function cmdFields(cmd, labels, script) {
    const lab = (obj, key) => ED.select(obj, key, labels, { optional: true, optionalLabel: '（選擇標籤）' });
    const units = ED.named('units');
    const flagIn = (obj, key, ph) => ED.text(obj, key, { optional: true, attrs: { list: 'flagList', placeholder: ph || '旗標名稱', style: 'width:140px' } });
    switch (cmd.cmd) {
      case 'say': return [
        h('div.row', {}, ED.select(cmd, 'who', units, { optional: true, optionalLabel: '（無角色）' }),
          ED.text(cmd, 'name', { optional: true, attrs: { placeholder: '顯示名稱（可覆寫）', style: 'width:130px' } }),
          ED.select(cmd, 'side', [['left', '頭像在左'], ['right', '頭像在右']]),
          ED.select(cmd, 'portrait', ED.keys('portraits'), { optional: true, optionalLabel: '（預設頭像）' })),
        ED.area(cmd, 'text', 2)];
      case 'narrate': return [ED.area(cmd, 'text', 2)];
      case 'choice': {
        cmd.options = cmd.options || [];
        return [ED.text(cmd, 'prompt', { optional: true, attrs: { placeholder: '提示文字（可省略）' } }),
          h('div.hint', {}, '選項文字 ／ 選擇後設定旗標 ／ 跳到標籤'),
          ...cmd.options.map((o, i) => h('div.opt', {}, ED.text(o, 'text'), flagIn(o, 'set', '設定旗標'), lab(o, 'goto'),
            h('button.danger', { onclick: () => { cmd.options.splice(i, 1); ED.dirty(true); } }, '✕'))),
          h('div.row', {}, h('button', { onclick: () => { cmd.options.push({ text: '新選項' }); ED.dirty(true); } }, '＋ 選項'))];
      }
      case 'label': return [h('div.row', {}, '標籤名稱', ED.text(cmd, 'name', { rerender: true, attrs: { style: 'width:160px' } }))];
      case 'goto': return [h('div.row', {}, '跳到', lab(cmd, 'label'))];
      case 'set': {
        const vstate = { v: 'add' in cmd ? 'add' : 'value' in cmd ? 'value' : 'true' };
        return [h('div.row', {}, flagIn(cmd, 'flag'),
          ED.select(vstate, 'v', [['true', '= 真'], ['value', '= 指定值'], ['add', '+= 數值']], { onchange: (v) => { delete cmd.value; delete cmd.add; if (v === 'value') cmd.value = 1; if (v === 'add') cmd.add = 1; ED.dirty(true); } }),
          vstate.v === 'value' ? h('input', { type: 'text', value: JSON.stringify(cmd.value), style: 'width:80px', onchange: (e) => { try { cmd.value = JSON.parse(e.target.value); } catch (er) { cmd.value = e.target.value; } ED.dirty(); } }) : null,
          vstate.v === 'add' ? ED.num(cmd, 'add') : null)];
      }
      case 'if': {
        const cmp = { k: 'eq' in cmd ? 'eq' : 'gte' in cmd ? 'gte' : 'lte' in cmd ? 'lte' : 'truthy' };
        return [h('div.row', {}, '若', flagIn(cmd, 'flag', '旗標（!開頭＝否定）'),
          ED.select(cmp, 'k', [['truthy', '為真'], ['eq', '等於'], ['gte', '≥'], ['lte', '≤']], { onchange: (v) => { delete cmd.eq; delete cmd.gte; delete cmd.lte; if (v !== 'truthy') cmd[v] = 1; ED.dirty(true); } }),
          cmp.k !== 'truthy' ? h('input', { type: 'text', value: JSON.stringify(cmd[cmp.k]), style: 'width:70px', onchange: (e) => { try { cmd[cmp.k] = JSON.parse(e.target.value); } catch (er) { cmd[cmp.k] = e.target.value; } ED.dirty(); } }) : null,
          '→', lab(cmd, 'goto'), '否則', ED.select(cmd, 'else', labels, { optional: true, optionalLabel: '（往下執行）' }))];
      }
      case 'spawn':
        cmd.units = cmd.units || [];
        return [...cmd.units.map((p, i) => h('div.row', {}, ED.select(p, 'unit', units), ED.select(p, 'team', TEAMS), 'x', ED.num(p, 'x'), 'y', ED.num(p, 'y'),
          p.team !== 'player' ? ED.select(p, 'ai', [['aggressive', '進攻'], ['guard', '守備'], ['hold', '不動']]) : null,
          h('button.danger', { onclick: () => { cmd.units.splice(i, 1); ED.dirty(true); } }, '✕'))),
          h('div.row', {}, h('button', { onclick: () => { cmd.units.push({ unit: Object.keys(ED.c.units)[0], team: 'enemy', x: 0, y: 0 }); ED.dirty(true); } }, '＋ 單位'),
            h('span.hint', {}, '座標被占用時會自動找最近空格'))];
      case 'recruit': return [h('div.row', {}, '讓', ED.select(cmd, 'unit', units), '加入我方')];
      case 'give': {
        const kind = { k: cmd.item ? 'item' : 'weapon' };
        return [h('div.row', {}, '給', ED.select(cmd, 'unit', units),
          ED.select(kind, 'k', [['weapon', '武器'], ['item', '道具']], { onchange: (v) => { delete cmd.weapon; delete cmd.item; cmd[v] = Object.keys(ED.c[v === 'item' ? 'items' : 'weapons'])[0]; ED.dirty(true); } }),
          kind.k === 'item' ? ED.select(cmd, 'item', ED.named('items')) : ED.select(cmd, 'weapon', ED.named('weapons')))];
      }
      case 'gold': return [h('div.row', {}, '軍資金增減', ED.num(cmd, 'add'), h('span.hint', {}, '負數為扣除'))];
      case 'learn': return [h('div.row', {}, '讓', ED.select(cmd, 'unit', units), '學會', ED.select(cmd, 'skill', ED.named('skills')))];
      default: return [h('span.hint', {}, cmd.cmd === 'end' ? '結束這段劇本' : JSON.stringify(cmd))];
    }
  }

  async function preview(id) {
    const flags = {};
    const r = SRPG.script.createRunner(ED.c, id, {
      flags,
      spawn: (u) => ED.toast(`（增援 ${u.length} 名）`),
      recruit: (u) => ED.toast(`（${u} 加入我方）`),
      give: (u, w) => ED.toast(`（${u} 獲得 ${w}）`),
    });
    try {
      for (;;) {
        const s = r.next();
        if (s.type === 'end') break;
        if (s.type === 'say') await SRPG.UI.say(s, ED.c);
        else { SRPG.UI.hideDialog(); r.choose(await SRPG.UI.choice(s)); }
      }
    } catch (e) { ED.toast('劇本錯誤：' + e.message, 4000); }
    SRPG.UI.hideDialog();
    ED.toast('預覽結束，旗標：' + JSON.stringify(flags), 3000);
  }

  ED.tabs.scripts = function () {
    const id = ED.sel.scripts = ED.sel.scripts && ED.c.scripts[ED.sel.scripts] ? ED.sel.scripts : Object.keys(ED.c.scripts)[0];
    const left = ED.listPanel('scripts', { prefix: 'script', make: () => [TEMPLATES.say()] });
    if (!id) return h('div.split', {}, left, h('p.hint', {}, '尚無劇本'));
    const s = ED.c.scripts[id];
    const labels = s.filter((c) => c.cmd === 'label').map((c) => c.name);
    const usedBy = Object.entries(ED.c.chapters).flatMap(([cid, ch]) => (ch.events || []).filter((ev) => ev.script === id).map((ev) => `${cid}:${ev.on}`));
    const addBar = (at) => ED.select({ v: '' }, 'v', CMDS, { optional: true, optionalLabel: '＋ 插入指令…', onchange: (v) => { if (!v) return; s.splice(at, 0, TEMPLATES[v]()); ED.dirty(true); } });
    const rows = s.map((cmd, i) => h('div.cmd', { className: 'cmd' + (cmd.cmd === 'label' ? ' label' : '') },
      h('span.idx', {}, i + 1),
      ED.select(cmd, 'cmd', CMDS, { onchange: (v) => { s[i] = TEMPLATES[v](); ED.dirty(true); } }),
      h('div.fields', {}, ...cmdFields(cmd, labels, s)),
      h('div.ops', {},
        h('button', { title: '上移', disabled: i === 0, onclick: () => { [s[i - 1], s[i]] = [s[i], s[i - 1]]; ED.dirty(true); } }, '↑'),
        h('button', { title: '下移', disabled: i === s.length - 1, onclick: () => { [s[i + 1], s[i]] = [s[i], s[i + 1]]; ED.dirty(true); } }, '↓'),
        h('button', { title: '複製', onclick: () => { s.splice(i + 1, 0, SRPG.util.clone(cmd)); ED.dirty(true); } }, '⧉'),
        h('button.danger', { title: '刪除', onclick: () => { s.splice(i, 1); ED.dirty(true); } }, '✕'))));
    return h('div.split', {}, left, h('div', {},
      h('datalist', { id: 'flagList' }, ...allFlags().map((f) => h('option', { value: f }))),
      h('h2', {}, '劇本：' + id),
      h('div.row', {}, 'ID', ED.idField('scripts'), h('button.primary', { onclick: () => preview(id) }, '▶ 預覽對話'),
        h('span.hint', {}, usedBy.length ? '觸發於：' + usedBy.join('、') : '⚠ 尚未被任何章節事件使用')),
      ...rows.flatMap((r, i) => [r]),
      h('div.row', {}, addBar(s.length),
        h('button', { onclick: () => { s.push(TEMPLATES.say()); ED.dirty(true); } }, '＋ 說話'),
        h('button', { onclick: () => { s.push(TEMPLATES.choice()); ED.dirty(true); } }, '＋ 選項')),
      h('p.hint', {}, '選項可「設定旗標」並「跳到標籤」；旗標可用於條件跳轉、事件條件與章節分歧。')));
  };
})();
