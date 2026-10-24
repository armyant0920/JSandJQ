/* 音效與 BGM 播放（WebAudio 即時合成 + 自訂音檔），以及玩家設定
   SRPG.sound.play(id)        播放劇本中的音效
   SRPG.sound.playDef(def)    直接播放定義（編輯器試聽）
   SRPG.sound.bgm(id)         切換 BGM（同一首不重播）；bgm(null) 停止 */
(function () {
  'use strict';
  const SRPG = window.SRPG = window.SRPG || {};
  const M = SRPG.media;

  /* ---------- 玩家設定 ---------- */
  const SET_KEY = 'srpg_settings';
  const DEFAULTS = { sfx: 0.7, bgm: 0.5, scene: 'on', speed: 1, autoEnd: true };
  const settings = Object.assign({}, DEFAULTS);
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY) || '{}')); } catch (e) { /* 無法存取時使用預設 */ }
  SRPG.settings = {
    get: (k) => settings[k],
    set(k, v) {
      settings[k] = v;
      try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* 忽略 */ }
      if (k === 'bgm') snd.refreshBgmVolume();
    },
    all: () => Object.assign({}, settings),
    DEFAULTS,
  };

  /* ---------- WebAudio ---------- */
  let ac = null, sfxBus = null, bgmBus = null, noiseBuf = null;
  function ctx() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    sfxBus = ac.createGain(); sfxBus.connect(ac.destination);
    bgmBus = ac.createGain(); bgmBus.connect(ac.destination);
    bgmBus.gain.value = settings.bgm;
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ac;
  }
  // 瀏覽器規定需要使用者操作後才能出聲
  const unlock = () => { const c = ctx(); if (c && c.state === 'suspended') c.resume(); };
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));

  // 播放一個音（osc 或 noise），回傳節點以便停止
  function voice(c, bus, t0, tn, vol) {
    const g = c.createGain();
    const a = tn.a != null ? tn.a : 0.005;
    const dur = Math.max(0.01, tn.d || 0.1);
    const peak = Math.max(0.0001, vol * (tn.v != null ? tn.v : 1));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(bus);
    let src;
    if (tn.wave === 'noise') {
      src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(tn.f || 1000, t0);
      if (tn.f2) f.frequency.exponentialRampToValueAtTime(Math.max(20, tn.f2), t0 + dur);
      src.connect(f); f.connect(g);
    } else {
      src = c.createOscillator();
      src.type = ['square', 'sine', 'triangle', 'sawtooth'].includes(tn.wave) ? tn.wave : 'square';
      src.frequency.setValueAtTime(tn.f || 440, t0);
      if (tn.f2) src.frequency.exponentialRampToValueAtTime(Math.max(20, tn.f2), t0 + dur);
      src.connect(g);
    }
    src.start(t0); src.stop(t0 + dur + 0.05);
    return src;
  }

  const fileCache = new Map();
  function playFile(def, volume, loop) {
    let a = fileCache.get(def.data);
    if (!a || loop) { a = new Audio(def.data); if (!loop) fileCache.set(def.data, a); }
    try { a.currentTime = 0; } catch (e) { /* 忽略 */ }
    a.loop = !!loop;
    a.volume = Math.max(0, Math.min(1, volume));
    const p = a.play(); if (p && p.catch) p.catch(() => {});
    return a;
  }

  let campaign = null;
  const snd = {
    setCampaign(c) { campaign = c; },
    play(id) {
      const def = campaign && campaign.sounds && campaign.sounds[id];
      if (def) snd.playDef(def);
    },
    playDef(def, opts) {
      const vol = (opts && opts.volume != null ? opts.volume : settings.sfx) * (def.vol != null ? def.vol : 0.5);
      if (!def || vol <= 0) return;
      if (def.type === 'file') return playFile(def, vol, false);
      if (def.type === 'bgm') return snd.previewBgm(def);
      const c = ctx();
      if (!c) return;
      const t0 = c.currentTime + 0.01;
      for (const tn of def.tones || []) voice(c, sfxBus, t0 + (tn.t || 0), tn, vol);
    },

    /* ---------- BGM ---------- */
    _bgm: null,   // { id, def, timer, nodes, audio }
    bgm(id) {
      if (snd._bgm && snd._bgm.id === id) return;
      snd.stopBgm();
      const def = id && campaign && campaign.sounds && campaign.sounds[id];
      if (!def) return;
      snd._startBgm(def, id);
    },
    previewBgm(def) { snd.stopBgm(); snd._startBgm(def, '__preview'); },
    _startBgm(def, id) {
      const st = { id, def, nodes: [], timer: null, audio: null };
      snd._bgm = st;
      if (def.type === 'file') { st.audio = playFile(def, settings.bgm * (def.vol != null ? def.vol : 0.5), def.loop !== false); return; }
      const c = ctx();
      if (!c) return;
      let tracks;
      try { tracks = (def.tracks || []).map((tr) => ({ tr, notes: M.parseNotes(tr.notes) })); } catch (e) { console.warn(e); return; }
      const beat = 60 / (def.bpm || 120);
      const len = Math.max(...tracks.map((t) => t.notes.reduce((a, n) => a + n.beats, 0))) * beat;
      if (!(len > 0)) return;
      const schedule = (t0) => {
        if (snd._bgm !== st) return;
        for (const { tr, notes } of tracks) {
          let t = t0;
          for (const n of notes) {
            const d = n.beats * beat;
            if (n.freq) st.nodes.push(voice(c, bgmBus, t, { wave: tr.wave || 'square', f: n.freq, d: d * 0.9, a: 0.01 }, (def.vol != null ? def.vol : 0.15) * (tr.v != null ? tr.v : 1)));
            t += d;
          }
        }
        st.nodes = st.nodes.slice(-400);
        if (def.loop !== false) st.timer = setTimeout(() => schedule(t0 + len), Math.max(50, (t0 + len - c.currentTime - 0.3) * 1000));
      };
      schedule(c.currentTime + 0.05);
    },
    stopBgm() {
      const st = snd._bgm;
      snd._bgm = null;
      if (!st) return;
      clearTimeout(st.timer);
      for (const n of st.nodes) { try { n.stop(); } catch (e) { /* 已停止 */ } }
      if (st.audio) st.audio.pause();
    },
    refreshBgmVolume() {
      if (bgmBus) bgmBus.gain.value = settings.bgm;
      const st = snd._bgm;
      if (st && st.audio) st.audio.volume = Math.min(1, settings.bgm * (st.def.vol != null ? st.def.vol : 0.5));
    },
    get playing() { return snd._bgm ? snd._bgm.id : null; },
  };
  SRPG.sound = snd;
})();
