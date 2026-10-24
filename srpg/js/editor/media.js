/* 演出與音效分頁：🔊 音效/BGM、🎬 戰鬥演出（時間軸）、🏞 戰鬥背景 */
(function () {
  'use strict';
  const { h } = ED;
  const M = SRPG.media, SND = SRPG.sound;
  const WAVES = [['square', '方波'], ['sine', '正弦波'], ['triangle', '三角波'], ['sawtooth', '鋸齒波'], ['noise', '噪音']];

  // 遊戲內固定會播放的系統音效
  const SYSTEM_SOUNDS = {
    cursor: '游標移動', select: '選單確定', cancel: '取消', hit: '命中', crit: '必殺', miss: '未命中', heal: '回復',
    levelup: '升級', death: '擊破', spirit: '精神指令', magic: '地圖兵器', phase: '回合開始', victory: '勝利', defeat: '敗北', buy: '購買',
    bgm_player: '我方回合（預設 BGM）', bgm_enemy: '敵方回合（預設 BGM）',
  };

  /* ================= 音效 ================= */
  const sst = { tab: 'sfx' };
  ED.tabs.sounds = function () {
    const id = ED.sel.sounds = ED.sel.sounds && ED.c.sounds[ED.sel.sounds] ? ED.sel.sounds : Object.keys(ED.c.sounds)[0];
    const left = h('div', {}, ED.listPanel('sounds', { prefix: 'sfx', make: () => ({ name: '新音效', type: 'synth', vol: 0.4, tones: [{ wave: 'square', f: 660, t: 0, d: 0.1 }] }) }),
      h('div.row', {},
        h('button', { onclick: () => { const nid = ED.newId('sounds', 'bgm'); ED.c.sounds[nid] = { name: '新 BGM', type: 'bgm', bpm: 120, vol: 0.12, loop: true, tracks: [{ wave: 'square', v: 0.6, notes: 'C5 E5 G5 E5 F5 A5 G5:2' }, { wave: 'triangle', v: 1, notes: 'C3:2 F3:2 G3:2 C3:2' }] }; ED.sel.sounds = nid; ED.dirty(true); } }, '＋ BGM'),
        h('button', { onclick: uploadNew }, '📥 上傳音檔')),
      h('p.hint', {}, '系統音效（遊戲自動播放）：' + Object.entries(SYSTEM_SOUNDS).map(([k, v]) => `${k}=${v}`).join('、') + '。用相同 ID 覆寫即可替換。'));
    if (!id) return h('div.split', {}, left, h('p.hint', {}, '尚無音效'));
    const s = ED.c.sounds[id];
    const play = h('button.primary', { onclick: () => SND.playDef(s, { volume: 1 }) }, s.type === 'bgm' ? '▶ 播放' : '▶ 試聽');
    const stop = h('button', { onclick: () => SND.stopBgm() }, '■ 停止');
    let body;
    if (s.type === 'file') {
      body = h('div', {},
        h('p', {}, `音檔大小：約 ${Math.round((s.data || '').length * 0.75 / 1024)} KB`),
        h('audio', { controls: true, src: s.data || '' }),
        h('div.row', {}, h('button', { onclick: async () => { const f = await ED.readFile(document.getElementById('fileAudio'), true); s.data = f.data; ED.dirty(true); } }, '更換音檔'),
          ED.check(s, 'loop', '當作 BGM 時循環')));
    } else if (s.type === 'bgm') {
      s.tracks = s.tracks || [];
      body = h('div', {},
        h('div.row', {}, 'BPM', ED.num(s, 'bpm'), '音量', ED.num(s, 'vol', { attrs: { step: 0.01 } }), ED.check(s, 'loop', '循環')),
        h('p.hint', {}, '音符語法：音名+八度（C4、F#5、Bb3），冒號後是拍數（E4:0.5 = 半拍），R 是休止符。各音軌同時演奏。'),
        ...s.tracks.map((tr, i) => {
          let err = '';
          try { M.parseNotes(tr.notes); } catch (e) { err = e.message; }
          return h('div.card', {},
            h('div.row', {}, `音軌 ${i + 1}`, ED.select(tr, 'wave', WAVES.filter((w) => w[0] !== 'noise')), '音量', ED.num(tr, 'v', { attrs: { step: 0.1 } }),
              h('button.danger', { onclick: () => { s.tracks.splice(i, 1); ED.dirty(true); } }, '✕')),
            h('textarea', { rows: 3, value: tr.notes || '', style: { fontFamily: 'monospace' }, onchange: (e) => { tr.notes = e.target.value; ED.dirty(true); } }),
            err ? h('div.err', {}, '⚠ ' + err) : h('div.hint', {}, `${M.parseNotes(tr.notes).length} 個音符`));
        }),
        h('button', { onclick: () => { s.tracks.push({ wave: 'square', v: 0.5, notes: 'C4 D4 E4 F4' }); ED.dirty(true); } }, '＋ 音軌'));
    } else {
      s.tones = s.tones || [];
      body = h('div', {},
        h('div.row', {}, '總音量', h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.vol != null ? s.vol : 0.5, oninput: (e) => { s.vol = +e.target.value; ED.dirty(); } })),
        h('p.hint', {}, '每一列是一個音：波形、起始頻率 → 結束頻率（滑音，可空白）、開始時間、長度（秒）、相對音量、起音時間。噪音的頻率是濾波中心頻率。'),
        h('table.tbl', {}, h('tr', {}, ...['波形', '頻率 Hz', '→ 結束 Hz', '開始 s', '長度 s', '音量', '起音 s', ''].map((t) => h('th', {}, t))),
          ...s.tones.map((tn, i) => h('tr', {},
            h('td', {}, ED.select(tn, 'wave', WAVES)),
            h('td', {}, ED.num(tn, 'f', { attrs: { style: 'width:70px' } })),
            h('td', {}, ED.num(tn, 'f2', { attrs: { style: 'width:70px', placeholder: '—' } })),
            h('td', {}, ED.num(tn, 't', { attrs: { step: 0.01, style: 'width:60px' } })),
            h('td', {}, ED.num(tn, 'd', { attrs: { step: 0.01, style: 'width:60px' } })),
            h('td', {}, ED.num(tn, 'v', { attrs: { step: 0.1, style: 'width:50px', placeholder: '1' } })),
            h('td', {}, ED.num(tn, 'a', { attrs: { step: 0.005, style: 'width:60px', placeholder: '0.005' } })),
            h('td', {}, h('button', { title: '試聽此音', onclick: () => SND.playDef({ type: 'synth', vol: s.vol, tones: [Object.assign({}, tn, { t: 0 })] }, { volume: 1 }) }, '▶'),
              h('button.danger', { onclick: () => { s.tones.splice(i, 1); ED.dirty(true); } }, '✕'))))),
        h('div.row', {}, h('button', { onclick: () => { const last = s.tones[s.tones.length - 1]; s.tones.push({ wave: 'square', f: 880, t: last ? +((last.t || 0) + (last.d || 0.1)).toFixed(3) : 0, d: 0.1 }); ED.dirty(true); } }, '＋ 音'),
          h('button', { onclick: () => { s.tones.forEach((tn) => { tn.f = Math.round(tn.f * 1.122); if (tn.f2) tn.f2 = Math.round(tn.f2 * 1.122); }); ED.dirty(true); } }, '♯ 升高'),
          h('button', { onclick: () => { s.tones.forEach((tn) => { tn.f = Math.round(tn.f / 1.122); if (tn.f2) tn.f2 = Math.round(tn.f2 / 1.122); }); ED.dirty(true); } }, '♭ 降低')));
    }
    return h('div.split', {}, left, h('div', {},
      h('h2', {}, '音效：' + (s.name || id) + (SYSTEM_SOUNDS[id] ? `（系統：${SYSTEM_SOUNDS[id]}）` : '')),
      h('div.row', {}, play, s.type === 'bgm' || s.type === 'file' ? stop : null, h('span.hint', {}, `長度約 ${M.soundDuration(s).toFixed(2)} 秒`)),
      h('div.form', {},
        ...ED.formRow('ID', ED.idField('sounds')),
        ...ED.formRow('名稱', ED.text(s, 'name')),
        ...ED.formRow('類型', ED.select(s, 'type', [['synth', '合成音效'], ['bgm', '合成 BGM'], ['file', '音檔']], { rerender: true, onchange: (v) => {
          if (v === 'synth' && !s.tones) s.tones = [{ wave: 'square', f: 660, t: 0, d: 0.1 }];
          if (v === 'bgm' && !s.tracks) Object.assign(s, { bpm: 120, loop: true, tracks: [{ wave: 'square', v: 0.6, notes: 'C5 E5 G5:2' }] });
        } }))),
      body));
  };

  async function uploadNew() {
    const f = await ED.readFile(document.getElementById('fileAudio'), true);
    const nid = ED.newId('sounds', f.name.replace(/\.\w+$/, '').replace(/[^\w]/g, '_') || 'audio');
    ED.c.sounds[nid] = { name: f.name, type: 'file', data: f.data, vol: 0.6 };
    ED.sel.sounds = nid; ED.dirty(true);
    ED.toast('已加入音檔 ' + nid + '（存在劇本中，檔案會變大）');
  }

  /* ================= 戰鬥演出 ================= */
  const STEP_TYPES = [['move', '移動'], ['hit', '命中結算'], ['wait', '等待'], ['particles', '粒子特效'], ['projectile', '飛行道具'], ['flash', '閃光'], ['shake', '震動'], ['tint', '背景染色'], ['text', '大字'], ['cutin', '頭像切入'], ['sound', '音效']];
  const STEP_DEFAULT = {
    move: { who: 'self', to: 'target', ms: 200 }, hit: {}, wait: { ms: 200 }, particles: { kind: 'burst', at: 'target', color: '#ffffff', count: 10, ms: 300 },
    projectile: { kind: 'orb', color: '#ff7a2a', size: 10, ms: 300 }, flash: { color: '#ffffff', ms: 150 }, shake: { power: 6, ms: 200 },
    tint: { color: 'rgba(0,0,0,0.5)', ms: 1000, async: true }, text: { text: '{weapon}！', color: '#ffffff', size: 44, ms: 800 }, cutin: { text: '{weapon}！', color: '#ffd24a', ms: 900 }, sound: { id: 'hit' },
  };
  const pv = { att: null, def: null, terrain: 'plain', outcome: 'hit', handle: null };

  function stepFields(st) {
    const n = (k, ph) => ED.num(st, k, { attrs: { style: 'width:64px', placeholder: ph || '' } });
    const col = (k) => h('input', { type: 'text', value: st[k] || '', style: 'width:150px', placeholder: '#rrggbb 或 rgba()', onchange: (e) => { st[k] = e.target.value; ED.dirty(); } });
    switch (st.type) {
      case 'move': return [ED.select(st, 'who', [['self', '攻擊者'], ['target', '目標']]), '→', ED.select(st, 'to', [['target', '衝到對方面前'], ['home', '回原位'], ['back', '後退蓄力']]), 'ms', n('ms')];
      case 'hit': return [h('span.hint', {}, '此時結算傷害、顯示數字與命中/未命中動作')];
      case 'wait': return ['ms', n('ms')];
      case 'particles': return [ED.select(st, 'kind', [['slash', '斬擊線'], ['burst', '爆散'], ['spark', '火花'], ['ring', '聚氣環'], ['heal', '上升光點']]), '位置', ED.select(st, 'at', [['target', '目標'], ['self', '自己']]), '顏色', col('color'), '數量', n('count'), 'ms', n('ms')];
      case 'projectile': return [ED.select(st, 'kind', [['orb', '光球'], ['arrow', '箭'], ['bolt', '落雷']]), '顏色', col('color'), '大小', n('size'), 'ms', n('ms')];
      case 'flash': return ['顏色', col('color'), 'ms', n('ms')];
      case 'shake': return ['強度', n('power'), 'ms', n('ms')];
      case 'tint': return ['顏色', col('color'), 'ms', n('ms')];
      case 'text': return [ED.text(st, 'text', { attrs: { style: 'width:150px' } }), '顏色', col('color'), '字級', n('size'), 'ms', n('ms')];
      case 'cutin': return [ED.text(st, 'text', { attrs: { style: 'width:150px' } }), '顏色', col('color'), 'ms', n('ms')];
      case 'sound': return [ED.select(st, 'id', ED.named('sounds')), h('button', { onclick: () => SND.play(st.id) }, '▶')];
      default: return [JSON.stringify(st)];
    }
  }

  function fakeUnit(unitId, team, uid) {
    const u = SRPG.campaign.makeUnit(ED.c, { unit: unitId, team, x: 0, y: 0 }, null, uid);
    return u;
  }

  ED.tabs.animations = function () {
    const id = ED.sel.animations = ED.sel.animations && ED.c.animations[ED.sel.animations] ? ED.sel.animations : Object.keys(ED.c.animations)[0];
    const left = ED.listPanel('animations', { prefix: 'anim', make: () => ({ name: '新演出', steps: [{ type: 'move', who: 'self', to: 'target', ms: 200 }, { type: 'hit' }, { type: 'move', who: 'self', to: 'home', ms: 200 }] }) });
    if (!id) return h('div.split', {}, left, h('p.hint', {}, '尚無演出'));
    const an = ED.c.animations[id];
    an.steps = an.steps || [];
    const tl = M.timeline(an);
    const users = Object.entries(ED.c.weapons).filter(([wid, w]) => M.animFor(ED.c, Object.assign({ id: wid }, w)) === id).map(([wid, w]) => w.name || wid);
    const rows = an.steps.map((st, i) => h('div.cmd', {},
      h('span.idx', {}, (tl.steps[i] ? Math.round(tl.steps[i].start) : 0) + 'ms'),
      ED.select(st, 'type', STEP_TYPES, { onchange: (v) => { an.steps[i] = Object.assign({ type: v }, SRPG.util.clone(STEP_DEFAULT[v])); ED.dirty(true); } }),
      h('div.fields', {}, h('div.row', {}, ...stepFields(st)),
        h('div.row', {}, ED.check(st, 'with', '與上一步同時開始'), ED.check(st, 'async', '背景執行（不等它結束）'))),
      h('div.ops', {},
        h('button', { disabled: i === 0, onclick: () => { [an.steps[i - 1], an.steps[i]] = [an.steps[i], an.steps[i - 1]]; ED.dirty(true); } }, '↑'),
        h('button', { disabled: i === an.steps.length - 1, onclick: () => { [an.steps[i + 1], an.steps[i]] = [an.steps[i], an.steps[i + 1]]; ED.dirty(true); } }, '↓'),
        h('button', { onclick: () => { an.steps.splice(i + 1, 0, SRPG.util.clone(st)); ED.dirty(true); } }, '⧉'),
        h('button.danger', { onclick: () => { an.steps.splice(i, 1); ED.dirty(true); } }, '✕'))));

    // 預覽
    const units = Object.keys(ED.c.units);
    if (!pv.att || !ED.c.units[pv.att]) pv.att = units[0];
    if (!pv.def || !ED.c.units[pv.def]) pv.def = units.find((u) => u !== pv.att) || units[0];
    const cv = h('canvas', { width: SRPG.scene.W, height: SRPG.scene.H, style: { width: '100%', maxWidth: '640px', background: '#000', imageRendering: 'pixelated', borderRadius: '6px' } });
    const runPreview = () => {
      if (pv.handle) pv.handle.stop();
      const a = fakeUnit(pv.att, 'player', 1), d = fakeUnit(pv.def, 'enemy', 2);
      const dmg = 7;
      const strike = { by: 1, target: 2, hit: pv.outcome !== 'miss', crit: pv.outcome === 'crit', dmg: pv.outcome === 'miss' ? 0 : pv.outcome === 'crit' ? dmg * 3 : dmg, evaded: false, skills: [] };
      strike.hpAfter = Math.max(0, d.hp - strike.dmg);
      const fc = { att: { weapon: users[0] || an.name || id, weaponId: null, dmg, hit: 90, crit: 5 }, def: null };
      pv.handle = SRPG.scene.play({ campaign: ED.c, canvas: cv, att: a, def: d, fc, strikes: [strike], terrain: pv.terrain, animDef: an, speed: 1 });
    };
    setTimeout(runPreview, 50);
    return h('div.split', {}, left, h('div', {},
      h('h2', {}, '戰鬥演出：' + (an.name || id)),
      h('div.form', {},
        ...ED.formRow('ID', ED.idField('animations')),
        ...ED.formRow('名稱', ED.text(an, 'name')),
        ...ED.formRow('必殺演出', ED.check(an, 'cutin', '設定為「只播必殺技」時仍會播放（SRW 式頭像切入建議勾選）')),
        ...ED.formRow('使用的武器', h('span', {}, users.join('、') || '（尚未指定，武器頁可選擇演出）'))),
      h('div.row', {}, h('b', {}, '預覽'), '攻擊者', ED.select(pv, 'att', ED.named('units'), { onchange: runPreview }), '目標', ED.select(pv, 'def', ED.named('units'), { onchange: runPreview }),
        '地形', ED.select(pv, 'terrain', ED.keys('terrains'), { onchange: runPreview }),
        '結果', ED.select(pv, 'outcome', [['hit', '命中'], ['crit', '必殺'], ['miss', '未命中']], { onchange: runPreview }),
        h('button.primary', { onclick: runPreview }, '▶ 重播')),
      cv,
      h('h3', {}, `時間軸（總長約 ${Math.round(tl.total)} ms）`),
      ...rows,
      h('div.row', {}, ED.select({ v: '' }, 'v', STEP_TYPES, { optional: true, optionalLabel: '＋ 新增步驟…', onchange: (v) => { if (v) { an.steps.push(Object.assign({ type: v }, SRPG.util.clone(STEP_DEFAULT[v]))); ED.dirty(true); } } })),
      h('p.hint', {}, '每一步依序執行；勾「與上一步同時開始」可疊加特效；「背景執行」適合長時間的背景染色。文字中的 {weapon} 會換成武器名、{name} 換成角色名。沒有「命中結算」步驟時會在最後結算。')));
  };

  /* ================= 戰鬥背景 ================= */
  ED.tabs.scenes = function () {
    const keys = Object.keys(ED.c.terrains);
    const id = ED.sel.scenes = ED.sel.scenes && ED.c.terrains[ED.sel.scenes] ? ED.sel.scenes : keys[0];
    const list = h('div.list', {}, ...keys.map((k) => h('button', { className: k === id ? 'on' : '', onclick: () => { ED.sel.scenes = k; ED.render(); } },
      h('span', {}, ED.c.terrains[k].name || k), h('small', {}, ED.c.scenes[k] ? '自訂' : '預設'))));
    const cur = M.sceneFor(ED.c, id);
    const own = () => (ED.c.scenes[id] = ED.c.scenes[id] || { sky: cur.sky.slice(), ground: cur.ground, deco: cur.deco });
    const cv = h('canvas', { width: SRPG.scene.W, height: SRPG.scene.H, style: { width: '100%', maxWidth: '640px', borderRadius: '6px' } });
    const paint = () => { const sc = M.sceneFor(ED.c, id); SRPG.scene.drawBackground(cv.getContext('2d'), sc, 0); };
    setTimeout(paint, 30); setTimeout(paint, 400);
    const colorIn = (get, set) => h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(get()) ? get() : '#888888', oninput: (e) => { set(e.target.value); ED.dirty(); paint(); } });
    return h('div.split', {}, h('div', {}, h('h3', {}, '地形'), list), h('div', {},
      h('h2', {}, '戰鬥背景：' + (ED.c.terrains[id].name || id)),
      cv,
      h('div.form', {},
        ...ED.formRow('天空', colorIn(() => cur.sky[0], (v) => { own().sky[0] = v; }), colorIn(() => cur.sky[1], (v) => { own().sky[1] = v; })),
        ...ED.formRow('地面', colorIn(() => cur.ground, (v) => { own().ground = v; })),
        ...ED.formRow('景物', ED.select({ get deco() { return cur.deco; }, set deco(v) { own().deco = v; } }, 'deco',
          [['grass', '草丘'], ['trees', '樹林'], ['mountain', '山脈'], ['water', '水邊'], ['wall', '城牆'], ['road', '道路'], ['castle', '城堡'], ['none', '無']], { rerender: true })),
        ...ED.formRow('背景圖片', h('button', { onclick: async () => { const f = await ED.readFile(document.getElementById('fileImg'), true); own().image = f.data; ED.dirty(true); } }, '📥 上傳圖片'),
          cur.image ? h('button.danger', { onclick: () => { delete own().image; ED.dirty(true); } }, '移除圖片') : null),
        ...ED.formRow('', h('button', { disabled: !ED.c.scenes[id], onclick: () => { delete ED.c.scenes[id]; ED.dirty(true); } }, '↺ 還原預設'))),
      h('p.hint', {}, '戰鬥演出時使用「被攻擊者所在地形」的背景。上傳的圖片會鋪滿畫面（建議 16:9），並存進劇本檔。')));
  };
})();
