/* 出擊準備畫面：出擊選擇 / 整備（輸送隊）/ 商店
   SRPG.PrepUI.show({ campaign, chapterId, party:{roster,convoy,gold}, flags }) → Promise<deploy 陣列> */
(function () {
  'use strict';
  const { prep: P, UI } = SRPG;
  const $ = (id) => document.getElementById(id);
  const esc = UI.esc;

  function show(opts) {
    const c = opts.campaign, party = opts.party, ch = c.chapters[opts.chapterId];
    const info = P.deployInfo(c, opts.chapterId, party.roster, opts.flags);
    let selected = P.defaultSelection(info);
    for (const cnd of info.candidates) P.ensureRoster(c, party.roster, cnd.id);
    let tab = 'deploy';
    let cur = selected[0] || (info.candidates[0] || {}).id;
    const el = $('prepScreen');

    const nameOf = (id) => (c.units[id] || {}).name || id;
    const icon = (d) => UI.icon(d && d.icon, 18);
    const invOf = (id) => {
      const r = party.roster[id];
      return [].concat((r.weapons || []).map((w, i) => ({ kind: 'weapon', i, id: w, d: c.weapons[w] || {} })),
        (r.items || []).map((it, i) => ({ kind: 'item', i, id: it.id, uses: it.uses, d: c.items[it.id] || {} })));
    };

    return new Promise((resolve) => {
      const draw = () => {
        const tabs = [['deploy', `出擊（${selected.length}/${info.slots.length}）`], ['equip', '整備'], ...(ch.shop && ch.shop.length ? [['shop', '商店']] : [])];
        let body = '';
        if (tab === 'deploy') {
          body = `<p class="hint">選擇要出擊的角色（★ 為必定出擊）。出擊位置 ${info.slots.length} 個。</p><div class="pgrid">` +
            info.candidates.map((cnd) => {
              const r = party.roster[cnd.id] || {};
              const on = selected.includes(cnd.id);
              return `<button class="btn pcard ${on ? 'primary' : ''}" data-dep="${cnd.id}" ${cnd.forced ? 'title="必定出擊"' : ''}>
                <b>${cnd.forced ? '★ ' : ''}${esc(nameOf(cnd.id))}</b><small>${esc((c.classes[(c.units[cnd.id] || {}).class] || {}).name || '')} Lv${r.level || 1}</small>
                <small>HP ${r.stats ? r.stats.hp : '?'}　${on ? '出擊' : '待命'}</small></button>`;
            }).join('') + '</div>';
        } else {
          const unitList = info.candidates.map((cnd) => `<button class="btn ${cur === cnd.id ? 'primary' : ''}" data-cur="${cnd.id}">${esc(nameOf(cnd.id))}${selected.includes(cnd.id) ? '' : ' <small>(待命)</small>'}</button>`).join('');
          const inv = cur ? invOf(cur).map((x) => `<div class="prow">${icon(x.d)} ${esc(x.d.name || x.id)}${x.uses != null ? ' ×' + x.uses : ''}
            <span class="sp"></span>${tab === 'equip' ? `<button class="btn sm" data-tc="${x.kind}:${x.i}">→ 輸送隊</button>` : `<button class="btn sm" data-sell="${x.kind}:${x.i}">賣出 ${Math.floor(P.priceOf(c, x.id) / 2)}</button>`}</div>`).join('') || '<p class="hint">（沒有物品）</p>' : '';
          let right = '';
          if (tab === 'equip') {
            right = `<h3>輸送隊（${party.convoy.length}）</h3>` + (party.convoy.map((e, i) => { const d = (e.kind === 'weapon' ? c.weapons : c.items)[e.id] || {}; return `<div class="prow">${icon(d)} ${esc(d.name || e.id)}${e.uses != null ? ' ×' + e.uses : ''}<span class="sp"></span><button class="btn sm" data-fc="${i}">給 ${esc(nameOf(cur))}</button></div>`; }).join('') || '<p class="hint">（空）</p>');
          } else {
            right = `<h3>商品</h3>` + ch.shop.map((id) => { const d = c.weapons[id] || c.items[id] || {}; const pr = P.priceOf(c, id); return `<div class="prow" title="${esc(d.desc || '')}">${icon(d)} ${esc(d.name || id)}<span class="sp"></span><small>${pr} 金</small>
              <button class="btn sm" data-buy="${id}" ${party.gold < pr ? 'disabled' : ''}>買給 ${esc(nameOf(cur))}</button><button class="btn sm" data-buyc="${id}" ${party.gold < pr ? 'disabled' : ''}>買到輸送隊</button></div>`; }).join('');
          }
          body = `<div class="pcols"><div class="plist">${unitList}</div><div><h3>${esc(nameOf(cur))} 的物品</h3>${inv}</div><div>${right}</div></div>`;
        }
        el.innerHTML = `<h2>出擊準備：${esc(ch.name || opts.chapterId)}</h2>
          <div class="row ptabs">${tabs.map(([k, l]) => `<button class="btn ${tab === k ? 'primary' : ''}" data-tab="${k}">${l}</button>`).join('')}<span class="sp"></span><span class="pill">💰 ${party.gold} 金</span></div>
          <div class="pbody card">${body}</div>
          <div class="row"><span class="sp"></span><button class="btn primary" data-go="1" ${selected.length ? '' : 'disabled'}>⚔ 開始戰鬥</button></div>`;
        el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; draw(); }));
        el.querySelectorAll('[data-dep]').forEach((b) => (b.onclick = () => {
          const id = b.dataset.dep, cnd = info.candidates.find((x) => x.id === id);
          if (selected.includes(id)) { if (!cnd.forced) selected = selected.filter((x) => x !== id); }
          else if (selected.length < info.slots.length) selected.push(id);
          else UI.toast('出擊位置已滿');
          draw();
        }));
        el.querySelectorAll('[data-cur]').forEach((b) => (b.onclick = () => { cur = b.dataset.cur; draw(); }));
        el.querySelectorAll('[data-tc]').forEach((b) => (b.onclick = () => { const [k, i] = b.dataset.tc.split(':'); P.toConvoy(c, party, cur, k, +i); draw(); }));
        el.querySelectorAll('[data-fc]').forEach((b) => (b.onclick = () => { P.fromConvoy(c, party, cur, +b.dataset.fc); draw(); }));
        el.querySelectorAll('[data-sell]').forEach((b) => (b.onclick = () => { const [k, i] = b.dataset.sell.split(':'); const r = P.sell(c, party, cur, k, +i); UI.toast(r.error || `賣出 +${r.price} 金`); draw(); }));
        el.querySelectorAll('[data-buy],[data-buyc]').forEach((b) => (b.onclick = () => {
          const r = P.buy(c, party, b.dataset.buy || b.dataset.buyc, b.dataset.buy ? cur : null);
          if (!r.error) UI.sfx('buy'); UI.toast(r.error || `購買 -${r.price} 金`); draw();
        }));
        el.querySelector('[data-go]').onclick = () => { UI.screen('prepScreen', false); resolve(P.assignSlots(info, selected)); };
      };
      UI.screen('prepScreen');
      draw();
    });
  }

  SRPG.PrepUI = { show };
})();
