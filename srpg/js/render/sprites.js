/* 精靈圖：ASCII 像素網格 / 圖片(含 RPG Maker 行走圖切格) → canvas，依陣營自動換色並快取
   ASCII 精靈：{ w, h, palette:{字元:"#rrggbb" | "team" | "teamDark" | "teamLight"}, frames:[[列字串...], ...] }
   圖片精靈：  { image:"data:..." 或網址, frameW, frameH, frames:[[col,row], ...] }
   RPG Maker：{ image, sheet:"rpgmaker", frameW, frameH, index:0..7 }（3×4 動作格、4×2 角色） */
(function (root) {
  'use strict';
  const SRPG = root.SRPG = root.SRPG || {};

  const TEAM_COLORS = {
    player: { team: '#3a6fd8', teamDark: '#22417e', teamLight: '#8fb4ff' },
    enemy: { team: '#d23c3c', teamDark: '#7a1f1f', teamLight: '#ff9a9a' },
    ally: { team: '#2fa65a', teamDark: '#1a5e33', teamLight: '#8ee6a8' },
    none: { team: '#9a8f7a', teamDark: '#5a5244', teamLight: '#d8cfba' },
  };

  const cache = new Map();
  const images = new Map();

  function loadImage(src) {
    if (images.has(src)) return images.get(src);
    const img = new Image();
    const rec = { img, ready: false, error: false };
    img.onload = () => { rec.ready = true; cache.clear(); if (SRPG.sprites.onload) SRPG.sprites.onload(); };
    img.onerror = () => { rec.error = true; };
    img.src = src;
    images.set(src, rec);
    return rec;
  }

  function resolveColor(c, team) {
    if (!c) return null;
    const tc = TEAM_COLORS[team] || TEAM_COLORS.none;
    return tc[c] || c;
  }

  // ASCII 網格 → canvas
  function gridToCanvas(sp, grid, team) {
    const w = sp.w || (grid[0] || '').length, h = sp.h || grid.length;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    for (let y = 0; y < h; y++) {
      const row = grid[y] || '';
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (!ch || ch === '.' || ch === ' ') continue;
        const col = resolveColor(sp.palette && sp.palette[ch], team);
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return cv;
  }

  function frameCount(sp) {
    if (!sp) return 0;
    if (sp.sheet === 'rpgmaker') return 4; // 0,1,2,1 踏步循環
    if (sp.image && !(sp.frames && sp.frames.length)) return 1;
    return (sp.frames || []).length;
  }

  // 取得某影格的 canvas/image 與來源矩形
  function getFrame(sp, i, team, dir) {
    if (!sp) return null;
    const n = frameCount(sp);
    if (!n) return null;
    i = ((i % n) + n) % n;
    if (sp.image) {
      const rec = loadImage(sp.image);
      if (!rec.ready) return null;
      if (sp.sheet === 'rpgmaker') {
        const fw = sp.frameW || rec.img.width / 12, fh = sp.frameH || rec.img.height / 8;
        const idx = sp.index || 0;
        const bx = (idx % 4) * 3, by = Math.floor(idx / 4) * 4;
        const col = [0, 1, 2, 1][i];
        return { src: rec.img, sx: (bx + col) * fw, sy: (by + (dir || 0)) * fh, sw: fw, sh: fh };
      }
      const fw = sp.frameW || rec.img.width, fh = sp.frameH || rec.img.height;
      const f = (sp.frames && sp.frames[i]) || [0, 0];
      return { src: rec.img, sx: f[0] * fw, sy: f[1] * fh, sw: fw, sh: fh };
    }
    const k = (sp.__id || '') + '|' + i + '|' + team + '|' + (sp.__rev || 0);
    let cv = cache.get(k);
    if (!cv) { cv = gridToCanvas(sp, sp.frames[i], team); cache.set(k, cv); }
    return { src: cv, sx: 0, sy: 0, sw: cv.width, sh: cv.height };
  }

  function draw(ctx, sp, i, team, x, y, w, h, dir) {
    const f = getFrame(sp, i, team, dir);
    if (!f) return false;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(f.src, f.sx, f.sy, f.sw, f.sh, x, y, w, h);
    return true;
  }

  /* 圖示：icons.png 為 16 欄 × 32px 的圖示表，index = 列 × 16 + 欄 */
  const ICON_SHEET = 'assets/icons.png', ICON_SIZE = 32, ICON_COLS = 16;
  function drawIcon(ctx, index, x, y, size) {
    if (index == null) return false;
    const rec = loadImage(ICON_SHEET);
    if (!rec.ready) return false;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(rec.img, (index % ICON_COLS) * ICON_SIZE, Math.floor(index / ICON_COLS) * ICON_SIZE, ICON_SIZE, ICON_SIZE, x, y, size, size);
    return true;
  }
  // HTML 用：回傳 <span> 的 style 字串
  function iconStyle(index, size) {
    if (index == null) return '';
    const s = size || 20;
    return `display:inline-block;width:${s}px;height:${s}px;vertical-align:middle;image-rendering:pixelated;` +
      `background:url(${ICON_SHEET}) -${(index % ICON_COLS) * s}px -${Math.floor(index / ICON_COLS) * s}px / ${ICON_COLS * s}px auto no-repeat;`;
  }

  // 預先載入劇本用到的所有圖片
  function preload(campaign) {
    const srcs = new Set([ICON_SHEET]);
    for (const g of ['sprites', 'portraits']) for (const sp of Object.values(campaign[g] || {})) if (sp.image) srcs.add(sp.image);
    return Promise.all([...srcs].map((src) => new Promise((resolve) => {
      const rec = loadImage(src);
      if (rec.ready || rec.error) return resolve();
      rec.img.addEventListener('load', resolve); rec.img.addEventListener('error', resolve);
    })));
  }

  // 頭像：圖片類精靈只取上半身放大
  function drawBust(ctx, sp, team, x, y, w, h) {
    const f = getFrame(sp, 1, team, 0);
    if (!f) return false;
    ctx.imageSmoothingEnabled = false;
    if (sp.image) {
      const sh = Math.round(f.sh * 0.62), sw = Math.round(f.sw * 0.8);
      ctx.drawImage(f.src, f.sx + (f.sw - sw) / 2, f.sy + 1, sw, sh, x, y, w, h);
    } else ctx.drawImage(f.src, f.sx, f.sy, f.sw, f.sh, x, y, w, h);
    return true;
  }

  // 讓同一份精靈物件有穩定的快取 key
  function tag(campaign) {
    for (const group of ['sprites', 'portraits']) {
      for (const [id, sp] of Object.entries(campaign[group] || {})) {
        Object.defineProperty(sp, '__id', { value: group + ':' + id, enumerable: false, configurable: true, writable: true });
      }
    }
  }

  function invalidate(sp) {
    if (sp) Object.defineProperty(sp, '__rev', { value: (sp.__rev || 0) + 1, enumerable: false, configurable: true, writable: true });
    else cache.clear();
  }

  // 沒有頭像時的程序化頭像（依名字決定顏色）
  function fallbackPortrait(ctx, name, team, x, y, s) {
    let hsh = 0;
    for (const ch of name || '?') hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
    const hue = hsh % 360;
    const tc = TEAM_COLORS[team] || TEAM_COLORS.none;
    ctx.fillStyle = `hsl(${hue},35%,22%)`; ctx.fillRect(x, y, s, s);
    ctx.fillStyle = tc.team;
    ctx.beginPath(); ctx.ellipse(x + s / 2, y + s * 1.02, s * 0.42, s * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c79a';
    ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.45, s * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `hsl(${hue},55%,35%)`;
    ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.4, s * 0.23, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(s * 0.22)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText((name || '?').slice(0, 1), x + s / 2, y + s - 2);
  }

  SRPG.sprites = { TEAM_COLORS, gridToCanvas, getFrame, frameCount, draw, drawIcon, iconStyle, preload, drawBust, tag, invalidate, loadImage, fallbackPortrait, onload: null };
})(typeof window !== 'undefined' ? window : globalThis);
