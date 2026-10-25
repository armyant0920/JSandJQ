/* Canvas 繪製：地形（程序化或 ASCII 地形圖塊）、單位、範圍高亮、游標、特效
   遊戲與編輯器共用 */
(function (root) {
  'use strict';
  const SRPG = root.SRPG = root.SRPG || {};
  const SP = SRPG.sprites;

  const TS = 48; // 格子大小（px）

  const hash = (x, y, s) => {
    let h = (x * 374761393 + y * 668265263 + (s || 0) * 1442695041) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (h ^ (h >>> 16)) / 4294967296;
  };

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt)));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  // 依地形 key 畫出程序化圖樣
  function drawTerrain(ctx, campaign, tkey, x, y, ts, t) {
    const ter = campaign.terrains[tkey] || {};
    const px = x * ts, py = y * ts;
    if (ter.sprite && campaign.sprites[ter.sprite] && SP.draw(ctx, campaign.sprites[ter.sprite], 0, 'none', px, py, ts, ts)) return;
    const base = ter.color || '#777';
    ctx.fillStyle = base;
    ctx.fillRect(px, py, ts, ts);
    // 細微雜訊
    ctx.fillStyle = shade(base, 12);
    for (let i = 0; i < 4; i++) {
      const r = hash(x, y, i);
      ctx.fillRect(px + Math.floor(r * ts * 0.9), py + Math.floor(hash(y, x, i) * ts * 0.9), 3, 2);
    }
    const s = ts / 48;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(s, s);
    switch (tkey) {
      case 'forest':
        for (const [cx, cy, r] of [[14, 20, 11], [34, 16, 10], [24, 34, 12]]) {
          ctx.fillStyle = '#5a3a1e'; ctx.fillRect(cx - 2, cy + r - 4, 4, 8);
          ctx.fillStyle = shade(base, -25); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = shade(base, 15); ctx.beginPath(); ctx.arc(cx - 3, cy - 3, r * 0.5, 0, Math.PI * 2); ctx.fill();
        }
        break;
      case 'mountain':
        ctx.fillStyle = shade(base, -30);
        ctx.beginPath(); ctx.moveTo(2, 44); ctx.lineTo(20, 8); ctx.lineTo(38, 44); ctx.fill();
        ctx.fillStyle = shade(base, -10);
        ctx.beginPath(); ctx.moveTo(18, 44); ctx.lineTo(34, 16); ctx.lineTo(48, 44); ctx.fill();
        ctx.fillStyle = '#f2f2f2';
        ctx.beginPath(); ctx.moveTo(15, 18); ctx.lineTo(20, 8); ctx.lineTo(25, 18); ctx.fill();
        break;
      case 'water': {
        const ph = (t || 0) / 600;
        ctx.strokeStyle = shade(base, 40); ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const yy = 10 + i * 14, off = Math.sin(ph + i + x) * 4;
          ctx.beginPath(); ctx.moveTo(6 + off, yy); ctx.quadraticCurveTo(14 + off, yy - 5, 22 + off, yy); ctx.quadraticCurveTo(30 + off, yy + 5, 38 + off, yy); ctx.stroke();
        }
        break;
      }
      case 'wall':
        ctx.fillStyle = shade(base, -20);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) ctx.fillRect(c * 16 + (r % 2 ? 8 : 0) - 8 + 1, r * 12 + 1, 14, 10);
        ctx.strokeStyle = shade(base, 30); ctx.strokeRect(0.5, 0.5, 47, 47);
        break;
      case 'road':
        ctx.fillStyle = shade(base, -15);
        for (let i = 0; i < 5; i++) ctx.fillRect(Math.floor(hash(x, y, i + 9) * 40), Math.floor(hash(y, x, i + 9) * 40), 6, 4);
        break;
      case 'fort':
        ctx.fillStyle = '#7a6a5a'; ctx.fillRect(6, 14, 36, 30);
        ctx.fillStyle = '#5a4a3a'; for (let i = 0; i < 4; i++) ctx.fillRect(6 + i * 10, 8, 6, 8);
        ctx.fillStyle = '#2a1a10'; ctx.fillRect(19, 28, 10, 16);
        ctx.fillStyle = '#d83a3a'; ctx.fillRect(23, 0, 2, 10); ctx.fillRect(25, 0, 8, 5);
        break;
      case 'village':
        ctx.fillStyle = '#e8d8b0'; ctx.fillRect(10, 22, 28, 20);
        ctx.fillStyle = '#a03a2a'; ctx.beginPath(); ctx.moveTo(6, 24); ctx.lineTo(24, 8); ctx.lineTo(42, 24); ctx.fill();
        ctx.fillStyle = '#5a3a1e'; ctx.fillRect(20, 30, 8, 12);
        break;
      case 'throne':
        ctx.fillStyle = '#8a1a2a'; ctx.fillRect(4, 4, 40, 40);
        ctx.fillStyle = '#e8c040'; ctx.fillRect(14, 8, 20, 30); ctx.fillStyle = '#8a1a2a'; ctx.fillRect(18, 18, 12, 16);
        break;
      default: break;
    }
    ctx.restore();
  }

  function drawMap(ctx, campaign, map, t) {
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) drawTerrain(ctx, campaign, map.tiles[y][x], x, y, TS, t);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= map.w; x++) { ctx.beginPath(); ctx.moveTo(x * TS + 0.5, 0); ctx.lineTo(x * TS + 0.5, map.h * TS); ctx.stroke(); }
    for (let y = 0; y <= map.h; y++) { ctx.beginPath(); ctx.moveTo(0, y * TS + 0.5); ctx.lineTo(map.w * TS, y * TS + 0.5); ctx.stroke(); }
  }

  function spriteFor(campaign, u) {
    const id = u.sprite || (campaign.units[u.id || u.unit] || {}).sprite || ((campaign.classes[(campaign.units[u.id || u.unit] || {}).class] || {}).sprite);
    return id ? campaign.sprites[id] : null;
  }

  // 畫單位（px,py 為像素座標）。opts: { gray, still, hp, dir }
  function drawUnit(ctx, campaign, u, px, py, t, opts) {
    opts = opts || {};
    const sp = spriteFor(campaign, u);
    const n = SP.frameCount(sp);
    const isImg = sp && sp.image;
    const bob = opts.still || isImg ? 0 : Math.round(Math.sin((t || 0) / 300 + (u.uid || 0)) * 1.5);
    const fi = isImg ? (opts.still ? 1 : (n > 1 ? Math.floor((t || 0) / 220 + (u.uid || 0)) % n : 0))
      : (opts.still ? (SP.poseFrames(sp, 'idle') || [0])[0] : SP.pickFrame(sp, 'idle', t, 400, u.uid || 0));
    const tc = SP.TEAM_COLORS[u.team] || SP.TEAM_COLORS.none;
    ctx.save();
    if (opts.gray) ctx.filter = 'grayscale(1) brightness(0.8)';
    // 陣營底座（圖片角色不會換色，靠底座辨識敵我）
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(px + TS / 2, py + TS - 7, TS * 0.34, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = tc.team; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(px + TS / 2, py + TS - 7, TS * 0.34, 6, 0, 0, Math.PI * 2); ctx.stroke();
    const flip = !isImg && u.team === 'enemy';
    const s = TS - 4;
    ctx.translate(px + TS / 2, py + 1 + bob);
    if (flip) ctx.scale(-1, 1);
    const dir = opts.dir != null ? opts.dir : (u.dir != null ? u.dir : 0);
    const ok = sp && SP.draw(ctx, sp, fi, u.team, -s / 2, -2, s, s, dir);
    if (!ok) {
      ctx.fillStyle = tc.team; ctx.strokeStyle = tc.teamDark; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, s / 2, s * 0.36, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (flip) ctx.scale(-1, 1);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText((u.name || '?').slice(0, 1), 0, s / 2);
    }
    ctx.restore();
    if (opts.hp !== false && u.stats) {
      const w = TS - 12, ratio = Math.max(0, u.hp / u.stats.hp);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(px + 6, py + TS - 4, w, 4);
      ctx.fillStyle = ratio > 0.5 ? '#5ae07a' : ratio > 0.25 ? '#ffd24a' : '#ff5a5a';
      ctx.fillRect(px + 6, py + TS - 4, Math.round(w * ratio), 4);
    }
    if (u.boss) {
      ctx.fillStyle = '#ffd24a'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('★', px + 2, py + 1);
    }
    if (u.buffs && Object.keys(u.buffs).length) {
      ctx.fillStyle = '#ff9ae8'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('◆', px + TS - 2, py + 1);
    }
  }

  function tint(ctx, tiles, color) {
    ctx.fillStyle = color;
    for (const k of tiles) {
      const [x, y] = k.split(',').map(Number);
      ctx.fillRect(x * TS + 1, y * TS + 1, TS - 2, TS - 2);
    }
  }

  function drawCursor(ctx, x, y, t, color) {
    const p = 2 + Math.round(Math.sin((t || 0) / 150) * 2);
    const px = x * TS, py = y * TS, L = 12;
    ctx.strokeStyle = color || '#fff'; ctx.lineWidth = 3;
    const corners = [[px - p, py - p, 1, 1], [px + TS + p, py - p, -1, 1], [px - p, py + TS + p, 1, -1], [px + TS + p, py + TS + p, -1, -1]];
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath(); ctx.moveTo(cx + dx * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * L); ctx.stroke();
    }
  }

  function drawPath(ctx, path) {
    if (!path || path.length < 2) return;
    ctx.strokeStyle = 'rgba(255,240,120,0.9)'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    path.forEach((p, i) => { const cx = p.x * TS + TS / 2, cy = p.y * TS + TS / 2; if (i) ctx.lineTo(cx, cy); else ctx.moveTo(cx, cy); });
    ctx.stroke();
    const e = path[path.length - 1];
    ctx.fillStyle = 'rgba(255,240,120,0.95)';
    ctx.beginPath(); ctx.arc(e.x * TS + TS / 2, e.y * TS + TS / 2, 7, 0, Math.PI * 2); ctx.fill();
  }

  // 飄字特效：fx = [{x,y,text,color,t0}]
  function drawFx(ctx, fx, now) {
    for (const f of fx) {
      const age = (now - f.t0) / 900;
      if (age > 1) continue;
      ctx.globalAlpha = 1 - age;
      ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = '#000';
      const yy = f.y * TS + TS / 2 - age * 30;
      ctx.strokeText(f.text, f.x * TS + TS / 2, yy);
      ctx.fillStyle = f.color || '#fff';
      ctx.fillText(f.text, f.x * TS + TS / 2, yy);
      ctx.globalAlpha = 1;
    }
  }

  SRPG.renderer = { TS, drawTerrain, drawMap, drawUnit, spriteFor, tint, drawCursor, drawPath, drawFx };
})(typeof window !== 'undefined' ? window : globalThis);
