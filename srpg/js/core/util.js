/* SRPG 共用工具：命名空間、可序列化亂數、深拷貝 */
(function (root) {
  'use strict';
  const SRPG = root.SRPG = root.SRPG || {};

  // Mulberry32：狀態只有一個整數，可直接存進存檔
  function makeRng(seed) {
    const rng = { state: (seed >>> 0) || 1 };
    rng.next = function () {
      let t = (rng.state = (rng.state + 0x6D2B79F5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.int = (n) => Math.floor(rng.next() * n);   // 0..n-1
    rng.roll = (pct) => rng.int(100) < pct;          // pct% 成功
    return rng;
  }

  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const key = (x, y) => x + ',' + y;

  SRPG.util = { makeRng, clone, clamp, dist, key };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRPG;
})(typeof window !== 'undefined' ? window : globalThis);
