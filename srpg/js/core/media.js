/* 演出與音效的資料定義（純資料 + 工具函式，可在 Node 測試）
   ─ sounds（音效 / BGM）
     合成：{ name, type:'synth', vol, tones:[{ wave, f, f2?, t, d, v?, a? }] }
           wave: square | sine | triangle | sawtooth | noise；f→f2 為滑音；t 開始秒數、d 長度秒數、v 相對音量、a 起音秒數
     檔案：{ name, type:'file', data:'data:audio/...', vol }
     BGM ：{ name, type:'bgm', bpm, vol, loop, tracks:[{ wave, v, notes:'C4 E4:0.5 R:2 …' }] }
           音符：音名(C D E F G A B)+升降(#/b)+八度，冒號後為拍數（預設 1），R 為休止符
   ─ animations（招式演出時間軸）
     { name, cutin?, steps:[ { type, ms?, with?, async?, ... } ] }
       with:true 與上一步同時開始；async:true 在背景執行、下一步不必等它結束
       move      { who:'self'|'target', to:'target'|'home'|'back', ms }
       hit       {}                                  結算一次攻擊（命中/未命中/傷害數字）
       wait      { ms }
       flash     { color, ms }                       全畫面閃光
       shake     { power, ms }                       畫面震動
       tint      { color, ms }                       背景變暗/染色（必殺演出）
       text      { text, color, size, ms }           大字（{weapon} 代入武器名、{name} 代入角色名）
       cutin     { text, color, ms }                 SRW 式頭像切入
       projectile{ kind:'arrow'|'orb'|'bolt', color, size, ms }
       particles { kind:'slash'|'burst'|'spark'|'heal'|'ring', at:'self'|'target', color, count, ms }
       sound     { id }
   ─ scenes（戰鬥背景，依地形 key）
     { sky:[上,下], ground, deco:'grass'|'trees'|'mountain'|'water'|'wall'|'road'|'castle'|'none', image? } */
(function (root) {
  'use strict';
  const SRPG = root.SRPG = root.SRPG || {};

  const tone = (wave, f, t, d, extra) => Object.assign({ wave, f, t, d }, extra || {});

  const BASE_SOUNDS = {
    cursor:  { name: '游標', type: 'synth', vol: 0.15, tones: [tone('square', 880, 0, 0.03)] },
    select:  { name: '確定', type: 'synth', vol: 0.3, tones: [tone('square', 660, 0, 0.05), tone('square', 990, 0.05, 0.07)] },
    cancel:  { name: '取消', type: 'synth', vol: 0.3, tones: [tone('square', 520, 0, 0.05), tone('square', 330, 0.05, 0.08)] },
    swing:   { name: '揮擊', type: 'synth', vol: 0.35, tones: [tone('noise', 2000, 0, 0.12, { f2: 600 })] },
    hit:     { name: '命中', type: 'synth', vol: 0.5, tones: [tone('noise', 900, 0, 0.12), tone('square', 180, 0, 0.12, { f2: 60 })] },
    crit:    { name: '必殺', type: 'synth', vol: 0.6, tones: [tone('noise', 1600, 0, 0.25), tone('sawtooth', 440, 0, 0.25, { f2: 80 }), tone('square', 1320, 0.02, 0.1)] },
    miss:    { name: '未命中', type: 'synth', vol: 0.3, tones: [tone('noise', 3000, 0, 0.1, { f2: 1200, v: 0.5 })] },
    heal:    { name: '回復', type: 'synth', vol: 0.35, tones: [tone('sine', 523, 0, 0.12), tone('sine', 659, 0.1, 0.12), tone('sine', 784, 0.2, 0.25)] },
    levelup: { name: '升級', type: 'synth', vol: 0.4, tones: [tone('square', 523, 0, 0.1), tone('square', 659, 0.1, 0.1), tone('square', 784, 0.2, 0.1), tone('square', 1046, 0.3, 0.3)] },
    death:   { name: '擊破', type: 'synth', vol: 0.45, tones: [tone('sawtooth', 300, 0, 0.5, { f2: 40 }), tone('noise', 400, 0, 0.4, { v: 0.6 })] },
    spirit:  { name: '精神指令', type: 'synth', vol: 0.35, tones: [tone('triangle', 880, 0, 0.3, { f2: 1760 }), tone('sine', 1320, 0.1, 0.25)] },
    magic:   { name: '魔法', type: 'synth', vol: 0.35, tones: [tone('sine', 300, 0, 0.35, { f2: 1200 }), tone('triangle', 600, 0.05, 0.3, { f2: 2400, v: 0.5 })] },
    thunder: { name: '雷', type: 'synth', vol: 0.5, tones: [tone('noise', 5000, 0, 0.35, { f2: 300 }), tone('square', 90, 0, 0.3, { f2: 40 })] },
    arrow:   { name: '射箭', type: 'synth', vol: 0.3, tones: [tone('triangle', 1200, 0, 0.15, { f2: 400 })] },
    phase:   { name: '回合', type: 'synth', vol: 0.3, tones: [tone('square', 392, 0, 0.1), tone('square', 523, 0.1, 0.18)] },
    victory: { name: '勝利', type: 'synth', vol: 0.4, tones: [tone('square', 523, 0, 0.12), tone('square', 523, 0.12, 0.12), tone('square', 523, 0.24, 0.12), tone('square', 698, 0.36, 0.5), tone('triangle', 349, 0.36, 0.5)] },
    defeat:  { name: '敗北', type: 'synth', vol: 0.4, tones: [tone('triangle', 392, 0, 0.3), tone('triangle', 330, 0.3, 0.3), tone('triangle', 262, 0.6, 0.8)] },
    buy:     { name: '購買', type: 'synth', vol: 0.3, tones: [tone('square', 1318, 0, 0.06), tone('square', 1760, 0.06, 0.12)] },
    bgm_player: { name: '我方回合 BGM', type: 'bgm', bpm: 132, vol: 0.12, loop: true, tracks: [
      { wave: 'square', v: 0.6, notes: 'E5:0.5 G5:0.5 A5 G5:0.5 E5:0.5 D5 E5:0.5 G5:0.5 A5:0.5 C6:0.5 B5:2 A5:0.5 G5:0.5 E5 D5:0.5 E5:0.5 G5 A5:0.5 G5:0.5 E5:0.5 D5:0.5 E5:2' },
      { wave: 'triangle', v: 1, notes: 'A3:0.5 A3:0.5 E3:0.5 A3:0.5 F3:0.5 F3:0.5 C4:0.5 F3:0.5 G3:0.5 G3:0.5 D4:0.5 G3:0.5 E3:0.5 E3:0.5 B3:0.5 E3:0.5 A3:0.5 A3:0.5 E3:0.5 A3:0.5 F3:0.5 F3:0.5 C4:0.5 F3:0.5 G3:0.5 G3:0.5 D4:0.5 G3:0.5 A3:2' },
    ] },
    bgm_enemy: { name: '敵方回合 BGM', type: 'bgm', bpm: 144, vol: 0.12, loop: true, tracks: [
      { wave: 'sawtooth', v: 0.4, notes: 'D5:0.5 R:0.5 D5:0.5 F5:0.5 E5:0.5 D5:0.5 C#5 D5:0.5 R:0.5 D5:0.5 A5:0.5 G5:0.5 F5:0.5 E5 D5:0.5 R:0.5 D5:0.5 F5:0.5 E5:0.5 D5:0.5 C#5 A4:2 R:2' },
      { wave: 'square', v: 0.5, notes: 'D3:0.5 D3:0.5 D3:0.5 D3:0.5 Bb2:0.5 Bb2:0.5 A2:0.5 A2:0.5 D3:0.5 D3:0.5 D3:0.5 D3:0.5 C3:0.5 C3:0.5 A2:0.5 A2:0.5 D3:0.5 D3:0.5 D3:0.5 D3:0.5 Bb2:0.5 Bb2:0.5 A2:0.5 A2:0.5 D3:4' },
    ] },
  };

  const BASE_ANIMATIONS = {
    slash: { name: '斬擊', steps: [
      { type: 'move', who: 'self', to: 'target', ms: 220 },
      { type: 'sound', id: 'swing' },
      { type: 'particles', kind: 'slash', at: 'target', color: '#ffffff', count: 1, ms: 250, with: true },
      { type: 'hit' }, { type: 'wait', ms: 150 },
      { type: 'move', who: 'self', to: 'home', ms: 200 }] },
    thrust: { name: '突刺', steps: [
      { type: 'move', who: 'self', to: 'back', ms: 120 },
      { type: 'move', who: 'self', to: 'target', ms: 140 },
      { type: 'particles', kind: 'spark', at: 'target', color: '#dfe8ff', count: 8, ms: 250, with: true },
      { type: 'hit' }, { type: 'wait', ms: 150 },
      { type: 'move', who: 'self', to: 'home', ms: 200 }] },
    chop: { name: '重劈', steps: [
      { type: 'move', who: 'self', to: 'target', ms: 260 },
      { type: 'sound', id: 'swing' },
      { type: 'shake', power: 6, ms: 200 },
      { type: 'particles', kind: 'burst', at: 'target', color: '#ffcf8a', count: 10, ms: 300, with: true },
      { type: 'hit' }, { type: 'wait', ms: 150 },
      { type: 'move', who: 'self', to: 'home', ms: 220 }] },
    arrow: { name: '射箭', steps: [
      { type: 'sound', id: 'arrow' },
      { type: 'projectile', kind: 'arrow', color: '#e8e0c0', size: 3, ms: 300 },
      { type: 'hit' }, { type: 'wait', ms: 200 }] },
    magic_fire: { name: '火焰魔法', steps: [
      { type: 'sound', id: 'magic' },
      { type: 'particles', kind: 'ring', at: 'self', color: '#ff9a3a', count: 12, ms: 350 },
      { type: 'projectile', kind: 'orb', color: '#ff7a2a', size: 12, ms: 320 },
      { type: 'particles', kind: 'burst', at: 'target', color: '#ffb04a', count: 18, ms: 350, with: true },
      { type: 'hit' }, { type: 'wait', ms: 200 }] },
    magic_thunder: { name: '雷擊魔法', steps: [
      { type: 'particles', kind: 'ring', at: 'self', color: '#ffe85a', count: 10, ms: 300 },
      { type: 'sound', id: 'thunder' },
      { type: 'flash', color: '#ffffff', ms: 150 },
      { type: 'projectile', kind: 'bolt', color: '#fff27a', size: 4, ms: 120, with: true },
      { type: 'particles', kind: 'spark', at: 'target', color: '#fff27a', count: 16, ms: 300 },
      { type: 'hit' }, { type: 'wait', ms: 200 }] },
    special_meteor: { name: '必殺技：流星斬', cutin: true, steps: [
      { type: 'tint', color: 'rgba(10,10,40,0.6)', ms: 1800, async: true },
      { type: 'cutin', text: '{weapon}！', color: '#ffd24a', ms: 900, with: true },
      { type: 'move', who: 'self', to: 'target', ms: 160 },
      { type: 'sound', id: 'swing' },
      { type: 'particles', kind: 'slash', at: 'target', color: '#ffe27a', count: 3, ms: 400, with: true },
      { type: 'shake', power: 10, ms: 300 },
      { type: 'flash', color: '#ffd24a', ms: 150, with: true },
      { type: 'hit' }, { type: 'wait', ms: 250 },
      { type: 'move', who: 'self', to: 'home', ms: 220 }] },
  };

  // 武器種類的預設演出
  const DEFAULT_ANIM_BY_TYPE = { sword: 'slash', lance: 'thrust', axe: 'chop', bow: 'arrow', anima: 'magic_fire', light: 'magic_thunder', dark: 'magic_fire', other: 'slash' };

  // 地形的預設戰鬥背景
  const DEFAULT_SCENE_DECO = { plain: 'grass', forest: 'trees', mountain: 'mountain', water: 'water', wall: 'wall', road: 'road', fort: 'castle', village: 'castle', throne: 'castle' };

  const NOTE_IDX = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  function noteFreq(name) {
    const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name);
    if (!m) return null;
    let n = NOTE_IDX[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12;
    return Math.round(440 * Math.pow(2, n / 12) * 100) / 100;
  }
  // 'C4 E4:0.5 R:2' → [{ freq|null, beats }]
  function parseNotes(str) {
    const out = [];
    for (const tok of String(str || '').trim().split(/\s+/).filter(Boolean)) {
      const [n, b] = tok.split(':');
      const beats = b != null ? Number(b) : 1;
      if (!(beats > 0)) throw new Error('拍數錯誤：' + tok);
      if (/^r$/i.test(n)) { out.push({ freq: null, beats }); continue; }
      const f = noteFreq(n);
      if (!f) throw new Error('看不懂的音符：' + tok);
      out.push({ freq: f, beats });
    }
    return out;
  }

  function soundDuration(s) {
    if (!s) return 0;
    if (s.type === 'synth') return Math.max(0, ...(s.tones || []).map((t) => (t.t || 0) + (t.d || 0)));
    if (s.type === 'bgm') return Math.max(0, ...(s.tracks || []).map((tr) => parseNotes(tr.notes).reduce((a, n) => a + n.beats, 0) * 60 / (s.bpm || 120)));
    return 0;
  }

  // 武器 → 演出 id
  function animFor(c, w) {
    if (!w) return null;
    if (w.anim && c.animations[w.anim]) return w.anim;
    const d = DEFAULT_ANIM_BY_TYPE[w.type] || 'slash';
    return c.animations[d] ? d : Object.keys(c.animations)[0] || null;
  }

  // 演出時間軸：每步的開始時間（ms，未乘速度）與總長
  function timeline(anim) {
    let cursor = 0, prevStart = 0, end = 0;
    const out = [];
    for (const st of (anim && anim.steps) || []) {
      const ms = st.type === 'hit' ? 0 : st.type === 'sound' ? 0 : (st.ms || 0);
      const start = st.with ? prevStart : cursor;
      out.push({ step: st, start, ms });
      prevStart = start;
      if (!st.async) cursor = Math.max(cursor, start + ms);
      end = Math.max(end, start + ms);
    }
    return { steps: out, total: end };
  }

  function sceneFor(c, terrainKey) {
    const t = c.terrains[terrainKey] || {};
    const s = (c.scenes || {})[terrainKey] || {};
    return {
      sky: s.sky || ['#6a9ad8', '#cfe3f5'],
      ground: s.ground || t.color || '#8fbf5a',
      deco: s.deco || DEFAULT_SCENE_DECO[terrainKey] || 'none',
      image: s.image || null,
    };
  }

  SRPG.media = { BASE_SOUNDS, BASE_ANIMATIONS, DEFAULT_ANIM_BY_TYPE, DEFAULT_SCENE_DECO, noteFreq, parseNotes, soundDuration, animFor, timeline, sceneFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRPG;
})(typeof window !== 'undefined' ? window : globalThis);
