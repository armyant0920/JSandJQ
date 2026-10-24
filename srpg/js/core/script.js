/* 劇本直譯器（與 UI 無關）
   指令：
     say      {who, text, side?:'left'|'right', name?}   角色說話（who 對應 units 的 key，可省略為旁白）
     narrate  {text}                                     旁白
     choice   {prompt?, options:[{text, set?, value?, goto?, if?}]}
     label    {name}
     goto     {label}
     set      {flag, value?=true | add:n}
     if       {flag, eq?/gte?/lte?, goto, else?}        flag 前加 ! 表示否定
     spawn    {units:[placement...]}                    增援（戰鬥中）
     recruit  {unit}                                    說服加入我方
     end                                                結束本段劇本
   用法：r = createRunner(campaign, id, ctx); 反覆呼叫 r.next() 取得要顯示的步驟，
        遇到 choice 時呼叫 r.choose(i) 後再 next()。 */
(function (root) {
  'use strict';
  const SRPG = root.SRPG = root.SRPG || {};
  const C = SRPG.campaign;

  function createRunner(campaign, scriptId, ctx) {
    ctx = ctx || {};
    const flags = ctx.flags || {};
    const lines = campaign.scripts[scriptId];
    if (!Array.isArray(lines)) throw new Error('找不到劇本 ' + scriptId);
    let pc = 0, pendingChoice = null, steps = 0;

    const jump = (label) => {
      const i = lines.findIndex((l) => l.cmd === 'label' && l.name === label);
      if (i < 0) throw new Error(`劇本 ${scriptId} 找不到標籤 ${label}`);
      pc = i + 1;
    };

    function speaker(cmd) {
      const u = cmd.who ? campaign.units[cmd.who] : null;
      return {
        name: cmd.name || (u ? u.name : (cmd.who || '')),
        portrait: cmd.portrait || (u ? u.portrait : null) || null,
      };
    }

    function next() {
      if (pendingChoice) throw new Error('等待選擇中');
      while (pc < lines.length) {
        if (++steps > 10000) throw new Error(`劇本 ${scriptId} 可能無限迴圈`);
        const cmd = lines[pc++];
        switch (cmd.cmd) {
          case 'say': {
            const s = speaker(cmd);
            return { type: 'say', who: cmd.who || null, name: s.name, portrait: s.portrait, side: cmd.side || 'left', text: cmd.text || '' };
          }
          case 'narrate': return { type: 'say', who: null, name: '', portrait: null, side: 'center', text: cmd.text || '' };
          case 'choice': {
            const options = (cmd.options || []).filter((o) => !o.if || C.testCond({ if: o.if }, flags));
            pendingChoice = options;
            return { type: 'choice', prompt: cmd.prompt || '', options: options.map((o) => o.text) };
          }
          case 'label': break;
          case 'goto': jump(cmd.label || cmd.goto); break;
          case 'set':
            if ('add' in cmd) flags[cmd.flag] = (flags[cmd.flag] || 0) + cmd.add;
            else flags[cmd.flag] = 'value' in cmd ? cmd.value : true;
            break;
          case 'if':
            if (C.testCond(Object.assign({}, cmd, { if: cmd.flag }), flags)) { if (cmd.goto) jump(cmd.goto); }
            else if (cmd.else) jump(cmd.else);
            break;
          case 'spawn': if (ctx.spawn) ctx.spawn(cmd.units || []); break;
          case 'recruit': if (ctx.recruit) ctx.recruit(cmd.unit); break;
          case 'end': pc = lines.length; break;
          default: if (ctx.custom) ctx.custom(cmd);
        }
      }
      return { type: 'end' };
    }

    function choose(i) {
      if (!pendingChoice) throw new Error('目前沒有選項');
      const o = pendingChoice[i];
      if (!o) throw new Error('無效選項 ' + i);
      pendingChoice = null;
      if (o.set) flags[o.set] = 'value' in o ? o.value : true;
      if (o.goto) jump(o.goto);
    }

    return { next, choose, get waiting() { return !!pendingChoice; } };
  }

  SRPG.script = { createRunner };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRPG;
})(typeof window !== 'undefined' ? window : globalThis);
