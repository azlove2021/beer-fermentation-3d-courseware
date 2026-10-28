/* =========================================================
   01 · 通用工具
   ========================================================= */
'use strict';

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}
/* 帧率无关的指数逼近：k 越大越快 */
function damp(cur, target, k, dt) {
  return lerp(cur, target, 1 - Math.exp(-k * Math.max(0, dt)));
}
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

function make2D(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c: c, g: c.getContext('2d') };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* 设备铭牌：白字黑底、带上边一道琥珀色高光 */
function makePlate(text, sub, w, h) {
  w = w || 256; h = h || 64;
  const { c, g } = make2D(w, h);
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(6,12,14,0.88)';
  roundRect(g, 0, 0, w, h, 8); g.fill();
  g.strokeStyle = 'rgba(120,200,190,0.35)'; g.lineWidth = 2;
  roundRect(g, 1, 1, w - 2, h - 2, 8); g.stroke();
  g.fillStyle = '#ffb02e';
  g.fillRect(10, 8, 26, 3);
  g.fillStyle = '#eaf5f4';
  g.font = '600 22px "Microsoft YaHei",sans-serif';
  g.textBaseline = 'middle';
  g.fillText(text, 10, sub ? h * 0.40 : h * 0.52);
  if (sub) {
    g.fillStyle = 'rgba(160,196,196,0.85)';
    g.font = '400 14px "DIN Alternate","Microsoft YaHei",sans-serif';
    g.fillText(sub, 10, h * 0.74);
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

/* 参数格式化 */
function fmt(v, d) {
  return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
}


/* ---------------------------------------------------------
   渲染档次探测
   在创建 renderer 之前先问一次显卡：集成显卡 / 软件渲染要降档，
   否则同样的场景在核显上会明显卡。独显一律全开。
   可用 ?q=high / ?q=perf 强制指定。
   --------------------------------------------------------- */
const QUALITY = (function () {
  let name = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) name = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    const lose = gl && gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  } catch (e) { name = ''; }

  let forced = '';
  try {
    String(location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      const i = kv.indexOf('=');
      if (i > 0 && kv.slice(0, i) === 'q') forced = kv.slice(i + 1);
    });
  } catch (e) { }

  const softRe = /SwiftShader|llvmpipe|Software|Microsoft Basic/i;
  const weakRe = /Intel|Microsoft Basic|SwiftShader|llvmpipe|Software|Mali-4|Adreno [23]|PowerVR/i;
  const weak = weakRe.test(name);
  const mode = forced === 'high' ? 'high' : (forced === 'perf' ? 'perf' : (weak ? 'perf' : 'high'));
  return { name: name, weak: weak, mode: mode, perf: mode === 'perf', soft: softRe.test(name) };
})();
