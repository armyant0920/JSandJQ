/* 戰鬥演出畫面：依「演出時間軸」（campaign.animations）播放每一次攻擊
   SRPG.scene.play({ campaign, att, def, fc, strikes, terrain, host?, speed? }) → Promise
   - 我方/友軍在右、敵方在左（火焰之紋章慣例）
   - 點擊或按鍵可快轉 */
(function () {
  'use strict';
  const SRPG = window.SRPG = window.SRPG || {};
  const M = SRPG.media, SP = SRPG.sprites;
  const W = 960, H = 540, GROUND = 380, SIZE = 168;

  /* ---------- 背景 ---------- */
  const bgImages = new Map();
  function drawBackground(ctx, sc, t) {
    if (sc.image) {
      let img = bgImages.get(sc.image);
      if (!img) { img = new Image(); img.src = sc.image; bgImages.set(sc.image, img); }
      if (img.complete && img.naturalWidth) {
        const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        ctx.drawImage(img, (W - img.naturalWidth * k) / 2, (H - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
        return;
      }
    }
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, sc.sky[0]); g.addColorStop(1, sc.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);
    const shade = (hex, k) => { const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16) || 0x888888; const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
    switch (sc.deco) {
      case 'mountain':
        ctx.fillStyle = shade(sc.ground, 0.7);
        for (let i = 0; i < 5; i++) { const x = i * 240 - 60; ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x + 140, GROUND - 200 - (i % 2) * 60); ctx.lineTo(x + 300, GROUND); ctx.fill(); }
        ctx.fillStyle = '#f4f4f4';
        for (let i = 0; i < 5; i++) { const x = i * 240 - 60, top = GROUND - 200 - (i % 2) * 60; ctx.beginPath(); ctx.moveTo(x + 110, top + 50); ctx.lineTo(x + 140, top); ctx.lineTo(x + 175, top + 55); ctx.fill(); }
        break;
      case 'trees':
        for (let i = 0; i < 14; i++) {
          const x = i * 74 + (i % 3) * 9, r = 46 + (i % 4) * 8;
          ctx.fillStyle = '#4a3220'; ctx.fillRect(x - 6, GROUND - 60, 12, 60);
          ctx.fillStyle = shade(sc.ground, 0.55 + (i % 3) * 0.12); ctx.beginPath(); ctx.arc(x, GROUND - 70 - (i % 2) * 20, r, 0, Math.PI * 2); ctx.fill();
        }
        break;
      case 'water': {
        ctx.fillStyle = '#3a78c2'; ctx.fillRect(0, GROUND - 60, W, 60);
        ctx.strokeStyle = '#8ab8ec'; ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) { const x = (i * 90 + t / 20) % (W + 60) - 30; ctx.beginPath(); ctx.moveTo(x, GROUND - 30); ctx.quadraticCurveTo(x + 15, GROUND - 38, x + 30, GROUND - 30); ctx.stroke(); }
        break;
      }
      case 'wall':
        ctx.fillStyle = '#5a5a66'; ctx.fillRect(0, 60, W, GROUND - 60);
        ctx.fillStyle = '#4a4a56';
        for (let r = 0; r < 9; r++) for (let c = 0; c < 14; c++) ctx.fillRect(c * 72 + (r % 2) * 36, 64 + r * 36, 68, 32);
        break;
      case 'castle':
        ctx.fillStyle = shade('#8a7a6a', 1);
        ctx.fillRect(560, GROUND - 210, 260, 210);
        for (let i = 0; i < 6; i++) ctx.fillRect(560 + i * 46, GROUND - 236, 26, 30);
        ctx.fillRect(620, GROUND - 300, 70, 90);
        ctx.fillStyle = '#2a1a10'; ctx.fillRect(670, GROUND - 90, 50, 90);
        ctx.fillStyle = '#d83a3a'; ctx.fillRect(652, GROUND - 340, 4, 40); ctx.fillRect(656, GROUND - 340, 26, 14);
        break;
      case 'road': case 'grass': default:
        ctx.fillStyle = shade(sc.ground, 0.8);
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(i * 200 + 60, GROUND, 160, 50, 0, Math.PI, 0); ctx.fill(); }
    }
    ctx.fillStyle = sc.ground; ctx.fillRect(0, GROUND, W, H - GROUND);
    if (sc.deco === 'road') { ctx.fillStyle = '#c9b27a'; ctx.fillRect(0, GROUND + 20, W, 50); }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % W, GROUND + 8 + (i * 37) % 120, 6, 3);
  }

  /* ---------- 角色 ---------- */
  function drawActor(ctx, c, a, t) {
    if (a.alpha <= 0) return;
    const sp = SRPG.renderer.spriteFor(c, a.u);
    const isImg = sp && sp.image;
    ctx.save();
    ctx.globalAlpha = a.alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(a.x, GROUND + 6, SIZE * 0.32, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(a.x, GROUND - SIZE + 10 + (a.dy || 0));
    if (!isImg && a.side === 'right') ctx.scale(-1, 1);
    // 圖片角色沒有動作影格：攻擊時前傾、受擊時後仰
    if (isImg && a.pose === 'attack') { ctx.translate(0, SIZE * 0.8); ctx.rotate((a.side === 'left' ? 1 : -1) * 0.18); ctx.translate(0, -SIZE * 0.8); }
    if (isImg && a.hurtUntil > t) { ctx.translate(0, SIZE * 0.8); ctx.rotate((a.side === 'left' ? -1 : 1) * 0.15); ctx.translate(0, -SIZE * 0.8); }
    const pose = a.hurtUntil > t ? 'hurt' : a.pose || 'idle';
    const fi = isImg ? [0, 1, 2, 1][Math.floor(t / 180) % 4] : SP.pickFrame(sp, pose, t, pose === 'idle' ? 400 : 120);
    const dir = a.side === 'left' ? 2 : 1;
    if (a.flash > 0) ctx.filter = `brightness(${1 + a.flash * 2})`;
    const ok = sp && SP.draw(ctx, sp, isImg && !a.moving ? 1 : fi, a.u.team, -SIZE / 2, 0, SIZE, SIZE, dir);
    if (!ok) { const tc = SP.TEAM_COLORS[a.u.team] || SP.TEAM_COLORS.none; ctx.fillStyle = tc.team; ctx.beginPath(); ctx.arc(0, SIZE / 2, SIZE * 0.3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  function drawPanel(ctx, a, x, fcSide) {
    const y = H - 92, w = 440;
    ctx.fillStyle = 'rgba(12,16,30,0.88)'; ctx.fillRect(x, y, w, 82);
    const tc = SP.TEAM_COLORS[a.u.team] || SP.TEAM_COLORS.none;
    ctx.fillStyle = tc.team; ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(a.u.name, x + 14, y + 10);
    ctx.font = '14px sans-serif'; ctx.fillStyle = '#c8cfe0';
    const wpn = fcSide ? fcSide.weapon : '—';
    if (fcSide && fcSide.icon != null) SP.drawIcon(ctx, fcSide.icon, x + 150, y + 8, 22);
    ctx.fillText(wpn, x + 176, y + 12);
    ctx.textAlign = 'right';
    ctx.fillText(fcSide ? `傷 ${fcSide.dmg}  命 ${fcSide.hit}  殺 ${fcSide.crit}` : '無法反擊', x + w - 12, y + 12);
    // HP
    const max = a.u.stats.hp, ratio = Math.max(0, a.hpShown / max);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif';
    ctx.fillText(String(Math.round(a.hpShown)), x + 14, y + 44);
    ctx.fillStyle = '#000a'; ctx.fillRect(x + 64, y + 50, w - 80, 14);
    ctx.fillStyle = ratio > 0.5 ? '#5ae07a' : ratio > 0.25 ? '#ffd24a' : '#ff5a5a';
    ctx.fillRect(x + 64, y + 50, (w - 80) * ratio, 14);
  }

  /* ---------- 特效 ---------- */
  function drawEffect(ctx, e, now) {
    const p = Math.min(1, Math.max(0, (now - e.t0) / Math.max(1, e.ms)));
    ctx.save();
    switch (e.kind) {
      case 'slash': {
        ctx.strokeStyle = e.color; ctx.lineWidth = 8 * (1 - p) + 2; ctx.globalAlpha = 1 - p * 0.8;
        for (let i = 0; i < (e.count || 1); i++) {
          const off = (i - (e.count - 1) / 2) * 30;
          ctx.beginPath(); ctx.moveTo(e.x - 70 + off, e.y - 80 + p * 10); ctx.lineTo(e.x - 70 + off + 140 * Math.min(1, p * 2), e.y - 80 + 140 * Math.min(1, p * 2)); ctx.stroke();
        }
        break;
      }
      case 'burst': case 'spark': case 'heal': {
        ctx.fillStyle = e.color; ctx.globalAlpha = 1 - p;
        for (let i = 0; i < (e.count || 10); i++) {
          const ang = (i / e.count) * Math.PI * 2 + (e.seed || 0);
          const r = (e.kind === 'spark' ? 120 : 80) * p + 6;
          const px = e.x + Math.cos(ang) * r, py = e.kind === 'heal' ? e.y - p * 120 + Math.sin(ang) * 30 : e.y + Math.sin(ang) * r;
          const s = e.kind === 'spark' ? 4 : 10 * (1 - p) + 3;
          ctx.fillRect(px - s / 2, py - s / 2, s, s);
        }
        break;
      }
      case 'ring':
        ctx.strokeStyle = e.color; ctx.lineWidth = 4; ctx.globalAlpha = 1 - p;
        ctx.beginPath(); ctx.arc(e.x, e.y, 20 + 90 * (1 - p), 0, Math.PI * 2); ctx.stroke();
        break;
      case 'orb': case 'arrow': case 'bolt': {
        const x = e.x + (e.x2 - e.x) * p, y = e.y + (e.y2 - e.y) * p;
        ctx.fillStyle = e.color; ctx.strokeStyle = e.color;
        if (e.kind === 'orb') { ctx.shadowColor = e.color; ctx.shadowBlur = 20; ctx.beginPath(); ctx.arc(x, y, e.size || 10, 0, Math.PI * 2); ctx.fill(); }
        else if (e.kind === 'arrow') { ctx.lineWidth = e.size || 3; ctx.beginPath(); ctx.moveTo(x - 30 * Math.sign(e.x2 - e.x), y); ctx.lineTo(x, y); ctx.stroke(); }
        else { ctx.lineWidth = e.size || 4; ctx.beginPath(); ctx.moveTo(e.x2, 0); for (let i = 1; i <= 6; i++) ctx.lineTo(e.x2 + (i % 2 ? 18 : -18), (e.y2 / 6) * i); ctx.stroke(); }
        break;
      }
      case 'popup':
        ctx.globalAlpha = p < 0.8 ? 1 : (1 - p) * 5;
        ctx.font = `bold ${e.size || 34}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 6; ctx.strokeStyle = '#000';
        ctx.strokeText(e.text, e.x, e.y - p * 40); ctx.fillStyle = e.color; ctx.fillText(e.text, e.x, e.y - p * 40);
        break;
      default: break;
    }
    ctx.restore();
  }

  /* ---------- 播放 ---------- */
  function play(opts) {
    const c = opts.campaign;
    const host = opts.host || document.body;
    const own = !opts.canvas;
    let wrap = null, cv = opts.canvas;
    if (own) {
      wrap = document.createElement('div');
      wrap.className = 'scene-wrap';
      cv = document.createElement('canvas');
      wrap.appendChild(cv);
      const hint = document.createElement('div'); hint.className = 'scene-hint'; hint.textContent = '點擊快轉';
      wrap.appendChild(hint);
      host.appendChild(wrap);
    }
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const sc = M.sceneFor(c, opts.terrain || 'plain');
    const mk = (u, side, hpStart) => ({ u, side, homeX: side === 'left' ? 260 : 700, x: side === 'left' ? 260 : 700, alpha: 1, flash: 0, dy: 0, hpShown: hpStart, hp: hpStart, moving: false });
    const attSide = opts.att.team === 'enemy' ? 'left' : 'right';
    const A = mk(opts.att, attSide, opts.attHp != null ? opts.attHp : opts.att.hp);
    const D = mk(opts.def, attSide === 'left' ? 'right' : 'left', opts.defHp != null ? opts.defHp : opts.def.hp);
    const actorOf = (uid) => (uid === opts.att.uid ? A : D);
    const effects = [];
    const overlays = { flash: null, tint: null, text: null, cutin: null, shake: null };
    const tweens = [];
    let speed = (opts.speed || (SRPG.settings ? SRPG.settings.get('speed') : 1)) || 1;
    let fast = 1;
    const skip = () => { fast = 4; };
    if (own) { wrap.addEventListener('pointerdown', skip); }
    const onKey = () => { if (own) skip(); };
    window.addEventListener('keydown', onKey, true);
    let clock = 0, last = performance.now();
    let alive = true;

    function frame(now) {
      if (!alive) return;
      const dt = (now - last) * speed * fast; last = now;
      clock += dt;
      // 補間
      for (const tw of tweens) {
        const p = Math.min(1, (clock - tw.t0) / Math.max(1, tw.ms));
        tw.apply(p < 0 ? 0 : p);
      }
      for (let i = tweens.length - 1; i >= 0; i--) if (clock - tweens[i].t0 >= tweens[i].ms) tweens.splice(i, 1);
      for (const a of [A, D]) { a.hpShown += (a.hp - a.hpShown) * Math.min(1, dt / 120); a.flash = Math.max(0, a.flash - dt / 200); }
      // 畫面
      ctx.save();
      const sh = overlays.shake && clock - overlays.shake.t0 < overlays.shake.ms ? overlays.shake.power * (1 - (clock - overlays.shake.t0) / overlays.shake.ms) : 0;
      if (sh) ctx.translate((Math.random() - 0.5) * sh * 2, (Math.random() - 0.5) * sh * 2);
      drawBackground(ctx, sc, clock);
      const tn = overlays.tint && clock - overlays.tint.t0 < overlays.tint.ms ? overlays.tint : null;
      if (tn) { const p = (clock - tn.t0) / tn.ms; ctx.globalAlpha = p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1; ctx.fillStyle = tn.color; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
      for (const a of [D, A]) drawActor(ctx, c, a, clock);
      for (let i = effects.length - 1; i >= 0; i--) { if (clock - effects[i].t0 > effects[i].ms) effects.splice(i, 1); else drawEffect(ctx, effects[i], clock); }
      ctx.restore();
      const cu = overlays.cutin && clock - overlays.cutin.t0 < overlays.cutin.ms ? overlays.cutin : null;
      if (cu) drawCutin(ctx, c, cu, clock);
      const tx = overlays.text && clock - overlays.text.t0 < overlays.text.ms ? overlays.text : null;
      if (tx) {
        ctx.font = `bold ${tx.size || 44}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.strokeText(tx.text, W / 2, 90); ctx.fillStyle = tx.color || '#fff'; ctx.fillText(tx.text, W / 2, 90);
      }
      const fl = overlays.flash && clock - overlays.flash.t0 < overlays.flash.ms ? overlays.flash : null;
      if (fl) { ctx.globalAlpha = 1 - (clock - fl.t0) / fl.ms; ctx.fillStyle = fl.color; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
      const left = A.side === 'left' ? A : D, right = left === A ? D : A;
      const fcL = left === A ? (opts.fc && opts.fc.att) : (opts.fc && opts.fc.def);
      const fcR = right === A ? (opts.fc && opts.fc.att) : (opts.fc && opts.fc.def);
      drawPanel(ctx, left, 30, fcL); drawPanel(ctx, right, W - 470, fcR);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    const waitUntil = (t) => new Promise((resolve) => { const chk = () => (!alive || clock >= t ? resolve() : requestAnimationFrame(chk)); chk(); });

    function fmt(text, actor) { return String(text || '').replace('{weapon}', (opts.fc && (actor === A ? opts.fc.att : opts.fc.def) || {}).weapon || '').replace('{name}', actor.u.name); }

    function posOf(a, at) { return { x: a.x, y: GROUND - SIZE / 2 - (at === 'top' ? 40 : 0) }; }

    function begin(st, me, tg, strike) {
      const t0 = clock;
      switch (st.type) {
        case 'move': {
          const who = st.who === 'target' ? tg : me;
          const other = who === me ? tg : me;
          const from = who.x;
          const dirSign = who.side === 'left' ? 1 : -1;
          const to = st.to === 'home' ? who.homeX : st.to === 'back' ? who.homeX - dirSign * 50 : other.x - dirSign * 120;
          who.moving = true;
          if (st.to === 'target' && who === me) who.pose = 'attack';
          tweens.push({ t0, ms: st.ms || 200, apply: (p) => { who.x = from + (to - from) * p; if (p >= 1) { who.moving = false; if (st.to === 'home') who.pose = 'idle'; } } });
          break;
        }
        case 'particles': {
          const a = st.at === 'self' ? me : tg;
          const p = posOf(a);
          effects.push({ kind: st.kind || 'burst', color: st.color || '#fff', count: st.count || 10, x: p.x, y: p.y, ms: st.ms || 300, t0, seed: Math.random() * 6 });
          break;
        }
        case 'projectile': {
          const p1 = posOf(me), p2 = posOf(tg);
          effects.push({ kind: st.kind || 'orb', color: st.color || '#fff', size: st.size, x: p1.x, y: p1.y, x2: p2.x, y2: p2.y, ms: st.ms || 300, t0 });
          break;
        }
        case 'flash': overlays.flash = { color: st.color || '#fff', ms: st.ms || 150, t0 }; break;
        case 'shake': overlays.shake = { power: st.power || 6, ms: st.ms || 200, t0 }; break;
        case 'tint': overlays.tint = { color: st.color || 'rgba(0,0,0,0.5)', ms: st.ms || 1000, t0 }; break;
        case 'text': overlays.text = { text: fmt(st.text, me), color: st.color, size: st.size, ms: st.ms || 800, t0 }; break;
        case 'cutin': overlays.cutin = { actor: me, text: fmt(st.text, me), color: st.color || '#ffd24a', ms: st.ms || 900, t0 }; break;
        case 'sound': if (SRPG.sound && st.id) SRPG.sound.play(st.id); break;
        case 'hit': applyHit(me, tg, strike, t0); break;
        default: break;
      }
    }

    function applyHit(me, tg, s, t0) {
      if (!s) return;
      me.pose = 'attack';
      const p = posOf(tg, 'top');
      if (s.skills && s.skills.length) effects.push({ kind: 'popup', text: s.skills.join('・') + '！', color: '#9fd8ff', size: 26, x: posOf(me, 'top').x, y: 150, ms: 900, t0 });
      if (!s.hit) {
        const from = tg.x, dirSign = tg.side === 'left' ? -1 : 1;
        tweens.push({ t0, ms: 160, apply: (q) => { tg.x = from + dirSign * 60 * Math.sin(q * Math.PI); } });
        effects.push({ kind: 'popup', text: s.evaded ? '閃避！' : 'MISS', color: s.evaded ? '#ff9ae8' : '#cfd6e0', x: p.x, y: p.y - 40, ms: 700, t0 });
        if (SRPG.sound) SRPG.sound.play('miss');
        return;
      }
      tg.hp = s.hpAfter; tg.flash = 1; tg.hurtUntil = t0 + 350;
      if (s.drain) me.hp = s.hpSelf != null ? s.hpSelf : me.hp + s.drain;
      effects.push({ kind: 'popup', text: (s.crit ? '必殺 ' : '') + s.dmg, color: s.crit ? '#ffd24a' : '#ff6464', size: s.crit ? 48 : 36, x: p.x, y: p.y - 40, ms: 800, t0 });
      if (s.drain) effects.push({ kind: 'popup', text: '+' + s.drain, color: '#5ae07a', x: posOf(me, 'top').x, y: p.y - 10, ms: 800, t0 });
      if (s.crit) { overlays.flash = { color: '#fff', ms: 160, t0 }; overlays.shake = { power: 12, ms: 300, t0 }; }
      if (SRPG.sound) SRPG.sound.play(s.crit ? 'crit' : 'hit');
    }

    async function playStrike(s) {
      const me = actorOf(s.by), tg = actorOf(s.target);
      const w = SRPG.rules.weaponDef({ campaign: c }, (me === A ? opts.fc.att : opts.fc.def) && (me === A ? opts.fc.att : opts.fc.def).weaponId);
      const animId = me === A && opts.anim ? opts.anim : M.animFor(c, w || { type: 'sword' });
      const anim = (opts.animDef && me === A ? opts.animDef : c.animations[animId]) || { steps: [{ type: 'hit' }] };
      const tl = M.timeline(anim);
      const base = clock;
      let hitDone = false;
      for (const item of tl.steps) {
        await waitUntil(base + item.start);
        if (item.step.type === 'hit') { if (hitDone) continue; hitDone = true; }
        begin(item.step, me, tg, item.step.type === 'hit' ? s : null);
      }
      if (!hitDone) begin({ type: 'hit' }, me, tg, s);
      await waitUntil(base + tl.total + 150);
      me.x = me.homeX; tg.x = tg.homeX; me.pose = 'idle'; tg.pose = 'idle';
    }

    const api = { stop() { alive = false; window.removeEventListener('keydown', onKey, true); if (own && wrap) wrap.remove(); } };
    const done = (async () => {
      await waitUntil(clock + 350);
      for (const s of opts.strikes || []) await playStrike(s);
      for (const a of [A, D]) if (a.hp <= 0) { tweens.push({ t0: clock, ms: 500, apply: (p) => { a.alpha = 1 - p; } }); if (SRPG.sound) SRPG.sound.play('death'); }
      await waitUntil(clock + 650);
      api.stop();
    })();
    done.stop = api.stop;
    return done;
  }

  function drawCutin(ctx, c, cu, clock) {
    const p = (clock - cu.t0) / cu.ms;
    const slide = p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;
    const left = cu.actor.side === 'left';
    const bw = 520, bh = 170, y = 60;
    const x = left ? -bw + bw * slide : W - bw * slide;
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,24,0.92)';
    ctx.beginPath();
    if (left) { ctx.moveTo(x, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw - 40, y + bh); ctx.lineTo(x, y + bh); }
    else { ctx.moveTo(x + 40, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw, y + bh); ctx.lineTo(x, y + bh); }
    ctx.fill();
    ctx.strokeStyle = cu.color; ctx.lineWidth = 4; ctx.stroke();
    ctx.clip();
    const sp = cu.actor.u.portrait && c.portraits[cu.actor.u.portrait] ? c.portraits[cu.actor.u.portrait] : SRPG.renderer.spriteFor(c, cu.actor.u);
    const px = left ? x + 20 : x + bw - 170;
    if (sp) SP.drawBust(ctx, sp, cu.actor.u.team, px, y + 10, 150, 150);
    ctx.font = 'bold 44px sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = left ? 'left' : 'right';
    ctx.lineWidth = 6; ctx.strokeStyle = '#000';
    const tx = left ? x + 190 : x + bw - 190;
    ctx.strokeText(cu.text, tx, y + bh / 2); ctx.fillStyle = cu.color; ctx.fillText(cu.text, tx, y + bh / 2);
    ctx.restore();
  }

  /* 地圖上的疊加演出（地圖兵器用）：只播放 cutin / text / flash / tint / shake / sound 步驟，背景透明 */
  function overlay(opts) {
    const c = opts.campaign, anim = opts.animDef || c.animations[opts.anim];
    if (!anim) return Promise.resolve();
    const wrap = document.createElement('div');
    wrap.className = 'scene-wrap overlay';
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    wrap.appendChild(cv);
    (opts.host || document.body).appendChild(wrap);
    const ctx = cv.getContext('2d');
    const tl = M.timeline(anim);
    const speed = opts.speed || 1;
    const ov = {};
    const actor = { u: opts.unit, side: opts.unit.team === 'enemy' ? 'left' : 'right' };
    const fmt = (t) => String(t || '').replace('{weapon}', opts.weaponName || '').replace('{name}', opts.unit.name);
    const t0 = performance.now();
    let fired = 0;
    const total = Math.min(tl.total, 2500);
    return new Promise((resolve) => {
      const frame = (now) => {
        const clock = (now - t0) * speed;
        while (fired < tl.steps.length && tl.steps[fired].start <= clock) {
          const st = tl.steps[fired++].step;
          const s0 = tl.steps[fired - 1].start;
          if (st.type === 'cutin') ov.cutin = { actor, text: fmt(st.text), color: st.color || '#ffd24a', ms: st.ms || 900, t0: s0 };
          else if (st.type === 'text') ov.text = { text: fmt(st.text), color: st.color, size: st.size, ms: st.ms || 800, t0: s0 };
          else if (st.type === 'flash') ov.flash = { color: st.color || '#fff', ms: st.ms || 150, t0: s0 };
          else if (st.type === 'tint') ov.tint = { color: st.color, ms: st.ms || 800, t0: s0 };
          else if (st.type === 'shake') { const host = document.getElementById('stage'); if (host) { host.classList.add('shake'); setTimeout(() => host.classList.remove('shake'), st.ms || 250); } }
          else if (st.type === 'sound' && SRPG.sound) SRPG.sound.play(st.id);
        }
        ctx.clearRect(0, 0, W, H);
        const live = (o) => o && clock - o.t0 < o.ms;
        if (live(ov.tint)) { ctx.globalAlpha = 0.8; ctx.fillStyle = ov.tint.color; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
        if (live(ov.cutin)) drawCutin(ctx, c, ov.cutin, clock);
        if (live(ov.text)) { ctx.font = `bold ${ov.text.size || 44}px sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.strokeText(ov.text.text, W / 2, H / 2); ctx.fillStyle = ov.text.color || '#fff'; ctx.fillText(ov.text.text, W / 2, H / 2); }
        if (live(ov.flash)) { ctx.globalAlpha = 1 - (clock - ov.flash.t0) / ov.flash.ms; ctx.fillStyle = ov.flash.color; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
        if (clock >= total + 100) { wrap.remove(); resolve(); } else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  SRPG.scene = { play, overlay, drawBackground, W, H };
})();
