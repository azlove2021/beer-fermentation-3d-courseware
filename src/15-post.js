/* =========================================================
   15 · 合成管线
   HDR 场景 → 亮部提取 → 三级分离高斯 → 曝光 → ACES → 调色 → sRGB

   顺序是硬约束：泛光必须发生在色调映射之前。
   ========================================================= */
'use strict';

const LOOK = {
  exposure: 0.86,
  bloomOn: true,
  bloomThreshold: 1.30,
  bloomKnee: 0.52,
  bloomStrength: 0.12,
  bloomRadius: 1.0,
  bloomLevels: QUALITY.perf ? 2 : 3,
  gradeOn: true,
  contrast: 1.10,
  saturation: 1.04,
  lift: [0.004, 0.006, 0.010],
  gain: [0.995, 1.000, 1.010],
  vignette: 0.07,
  bgGlow: 0.0,
  debug: 0
};

(function readURLLook() {
  let q = '';
  try { q = String(location.search || '').replace(/^\?/, ''); } catch (e) { q = ''; }
  if (!q) return;
  const kv = {};
  q.split('&').forEach(function (pair) {
    const i = pair.indexOf('=');
    if (i > 0) kv[pair.slice(0, i)] = pair.slice(i + 1);
  });
  if (kv.post === '0') { LOOK.bloomOn = false; LOOK.gradeOn = false; }
  if (kv.bloom === '0') LOOK.bloomOn = false;
  if (kv.bloom) LOOK.bloomStrength = parseFloat(kv.bloom);
  if (kv.exp) LOOK.exposure = parseFloat(kv.exp);
  if (kv.debug) LOOK.debug = parseInt(kv.debug, 10) || 0;
})();

const POST = {
  rtScene: null, lv0a: null, lv0b: null, lv1a: null, lv1b: null, lv2a: null, lv2b: null,
  w: 2, h: 2, hw: 2, hh: 2, qw: 2, qh: 2, ew: 2, eh: 2,
  exposure: LOOK.exposure
};

const IS_GL2 = renderer.capabilities.isWebGL2;

function makeRT(w, h, withDepth) {
  const opts = {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat, type: THREE.HalfFloatType,
    depthBuffer: !!withDepth, stencilBuffer: false
  };
  if (withDepth && IS_GL2) opts.samples = QUALITY.perf ? 2 : 4;
  return new THREE.WebGLRenderTarget(Math.max(2, w | 0), Math.max(2, h | 0), opts);
}

POST.rtScene = makeRT(2, 2, true);
POST.lv0a = makeRT(2, 2, false); POST.lv0b = makeRT(2, 2, false);
POST.lv1a = makeRT(2, 2, false); POST.lv1b = makeRT(2, 2, false);
POST.lv2a = makeRT(2, 2, false); POST.lv2b = makeRT(2, 2, false);

const FS_VERT = [
  'varying vec2 vUv;',
  'void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
].join('\n');

const fsScene = new THREE.Scene();
const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
fsQuad.frustumCulled = false;
fsScene.add(fsQuad);

function renderQuad(mat, target) {
  fsQuad.material = mat;
  renderer.setRenderTarget(target);
  renderer.render(fsScene, fsCam);
}

function passMat(frag, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms: uniforms, vertexShader: FS_VERT, fragmentShader: frag,
    depthTest: false, depthWrite: false, transparent: false, blending: THREE.NoBlending
  });
}

/* 亮部提取：软膝避免光晕边缘出现硬切 */
const brightMat = passMat([
  'uniform sampler2D tSrc;',
  'uniform float uThresh;',
  'uniform float uKnee;',
  'varying vec2 vUv;',
  'void main(){',
  '  vec3 c = texture2D(tSrc, vUv).rgb;',
  '  float br = max(c.r, max(c.g, c.b));',
  '  float knee = uThresh * uKnee + 1e-4;',
  '  float soft = clamp(br - uThresh + knee, 0.0, 2.0 * knee);',
  '  soft = soft * soft / (4.0 * knee + 1e-4);',
  '  float w = max(soft, br - uThresh) / max(br, 1e-4);',
  '  gl_FragColor = vec4(max(c * w, vec3(0.0)), 1.0);',
  '}'
].join('\n'), {
  tSrc: { value: null },
  uThresh: { value: LOOK.bloomThreshold },
  uKnee: { value: LOOK.bloomKnee }
});

const blurMat = passMat([
  'uniform sampler2D tSrc;',
  'uniform vec2 uDir;',
  'varying vec2 vUv;',
  'void main(){',
  '  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;',
  '  c += texture2D(tSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162;',
  '  c += texture2D(tSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;',
  '  c += texture2D(tSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703;',
  '  c += texture2D(tSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;',
  '  gl_FragColor = vec4(c, 1.0);',
  '}'
].join('\n'), {
  tSrc: { value: null },
  uDir: { value: new THREE.Vector2(0, 0) }
});

const finalMat = passMat([
  'uniform sampler2D tScene;',
  'uniform sampler2D tB0;',
  'uniform sampler2D tB1;',
  'uniform sampler2D tB2;',
  'uniform float uExposure;',
  'uniform float uBloom;',
  'uniform float uContrast;',
  'uniform float uSat;',
  'uniform float uVig;',
  'uniform float uBg;',
  'uniform float uGrade;',
  'uniform float uDebug;',
  'uniform vec3 uLift;',
  'uniform vec3 uGain;',
  'uniform vec3 uW;',
  'varying vec2 vUv;',

  'vec3 rrtOdt(vec3 v){',
  '  vec3 a = v * (v + 0.0245786) - 0.000090537;',
  '  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;',
  '  return a / b;',
  '}',
  'vec3 aces(vec3 c){',
  '  mat3 IN = mat3(0.59719,0.07600,0.02840, 0.35458,0.90834,0.13383, 0.04823,0.01566,0.83777);',
  '  mat3 OUT = mat3(1.60475,-0.10208,-0.00327, -0.53108,1.10813,-0.07276, -0.07367,-0.00605,1.07602);',
  '  c = IN * c; c = rrtOdt(c); c = OUT * c;',
  '  return clamp(c, 0.0, 1.0);',
  '}',
  'vec3 toSRGB(vec3 c){',
  '  c = clamp(c, 0.0, 1.0);',
  '  vec3 hi = 1.055 * pow(c, vec3(1.0/2.4)) - 0.055;',
  '  return mix(c * 12.92, hi, step(vec3(0.0031308), c));',
  '}',

  'void main(){',
  '  vec3 c = texture2D(tScene, vUv).rgb;',

  /* 背景底光：中心偏上，向下压暗，避免纯黑死板 */
  '  vec2 p = vUv - vec2(0.5, 0.46);',
  '  float d = length(p * vec2(1.0, 1.30));',
  '  c += mix(vec3(0.020, 0.043, 0.048), vec3(0.0), smoothstep(0.0, 0.86, d)) * uBg;',

  '  vec3 bl = (texture2D(tB0, vUv).rgb * uW.x',
  '           + texture2D(tB1, vUv).rgb * uW.y',
  '           + texture2D(tB2, vUv).rgb * uW.z) / max(0.0001, uW.x + uW.y + uW.z);',
  '  c += bl * uBloom;',

  '  if (uDebug > 0.5 && uDebug < 1.5) { gl_FragColor = vec4(toSRGB(aces(bl * 4.0 / 0.6)), 1.0); return; }',
  '  if (uDebug > 1.5 && uDebug < 2.5) { gl_FragColor = vec4(toSRGB(aces(texture2D(tScene, vUv).rgb * uExposure / 0.6)), 1.0); return; }',

  '  c = aces(c * uExposure / 0.6);',
  '  c = c * uGain + uLift * (1.0 - c);',
  '  c = (c - 0.5) * mix(1.0, uContrast, uGrade) + 0.5;',
  '  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));',
  '  c = mix(vec3(luma), c, mix(1.0, uSat, uGrade));',
  '  float vg = 1.0 - uVig * pow(clamp(length(vUv - 0.5) * 1.32, 0.0, 1.0), 2.2);',
  '  c *= vg;',
  '  gl_FragColor = vec4(toSRGB(c), 1.0);',
  '}'
].join('\n'), {
  tScene: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null },
  uExposure: { value: LOOK.exposure }, uBloom: { value: LOOK.bloomStrength },
  uContrast: { value: LOOK.contrast }, uSat: { value: LOOK.saturation },
  uVig: { value: LOOK.vignette }, uBg: { value: LOOK.bgGlow },
  uGrade: { value: LOOK.gradeOn ? 1 : 0 }, uDebug: { value: LOOK.debug },
  uLift: { value: new THREE.Vector3(LOOK.lift[0], LOOK.lift[1], LOOK.lift[2]) },
  uGain: { value: new THREE.Vector3(LOOK.gain[0], LOOK.gain[1], LOOK.gain[2]) },
  uW: { value: new THREE.Vector3(0.50, 0.32, 0.18) }
});

function resizePost() {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const w = Math.max(4, Math.floor(size.x));
  const h = Math.max(4, Math.floor(size.y));
  if (w === POST.w && h === POST.h) return;
  POST.w = w; POST.h = h;
  POST.hw = Math.max(2, w >> 1); POST.hh = Math.max(2, h >> 1);
  POST.qw = Math.max(2, w >> 2); POST.qh = Math.max(2, h >> 2);
  POST.ew = Math.max(2, w >> 3); POST.eh = Math.max(2, h >> 3);
  POST.rtScene.setSize(w, h);
  POST.lv0a.setSize(POST.hw, POST.hh); POST.lv0b.setSize(POST.hw, POST.hh);
  POST.lv1a.setSize(POST.qw, POST.qh); POST.lv1b.setSize(POST.qw, POST.qh);
  POST.lv2a.setSize(POST.ew, POST.eh); POST.lv2b.setSize(POST.ew, POST.eh);
}

/* 自适应分辨率
   先保帧率、再保清晰度：只在明显掉帧时降 pixelRatio，所有视觉特性
   （泛光、阴影、材质、AA 采样）一律不动。缓升缓降，避免来回抖。 */
const PERF = { acc: 0, n: 0, tier: 0, fps: 0, hold: 0, samples: 0 };

function updateQuality(dt) {
  if (!isFinite(dt) || dt <= 0 || dt > 0.25) return;   /* 切后台/首帧不计 */
  PERF.acc += dt; PERF.n++;
  if (PERF.n < 48) return;

  const avg = PERF.acc / PERF.n;
  PERF.acc = 0; PERF.n = 0;
  PERF.fps = 1 / avg;
  PERF.samples++;

  if (PERF.hold > 0) { PERF.hold--; return; }

  if (avg > 0.0215 && dprNow > 1.0) {          /* 低于约 46 fps：降一档 */
    dprNow = Math.max(1.0, Math.round((dprNow - 0.25) * 100) / 100);
    renderer.setPixelRatio(dprNow);
    if (typeof resize === 'function') resize();
    PERF.hold = 3; PERF.tier = 1;
  } else if (avg < 0.0155 && dprNow < DPR_MAX) { /* 稳定 60 fps 以上：缓慢回升 */
    dprNow = Math.min(DPR_MAX, Math.round((dprNow + 0.15) * 100) / 100);
    renderer.setPixelRatio(dprNow);
    if (typeof resize === 'function') resize();
    PERF.hold = 6;
  }
}

function blurPass(src, dst, dirX, dirY, srcW, srcH) {
  blurMat.uniforms.tSrc.value = src.texture;
  const r = LOOK.bloomRadius;
  blurMat.uniforms.uDir.value.set((dirX * r) / srcW, (dirY * r) / srcH);
  renderQuad(blurMat, dst);
}

function renderScene(dt) {
  updateQuality(dt);

  renderer.setRenderTarget(POST.rtScene);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);

  POST.exposure = damp(POST.exposure, LOOK.exposure, 3, dt || 0.016);

  if (LOOK.bloomOn) {
    brightMat.uniforms.tSrc.value = POST.rtScene.texture;
    brightMat.uniforms.uThresh.value = LOOK.bloomThreshold;
    brightMat.uniforms.uKnee.value = LOOK.bloomKnee;
    renderQuad(brightMat, POST.lv0a);

    blurPass(POST.lv0a, POST.lv0b, 1, 0, POST.hw, POST.hh);
    blurPass(POST.lv0b, POST.lv0a, 0, 1, POST.hw, POST.hh);
    blurPass(POST.lv0a, POST.lv1a, 1, 0, POST.hw, POST.hh);
    blurPass(POST.lv1a, POST.lv1b, 0, 1, POST.qw, POST.qh);
    if (LOOK.bloomLevels >= 3) {
      blurPass(POST.lv1b, POST.lv2a, 1, 0, POST.qw, POST.qh);
      blurPass(POST.lv2a, POST.lv2b, 0, 1, POST.ew, POST.eh);
    }
  }

  finalMat.uniforms.tScene.value = POST.rtScene.texture;
  finalMat.uniforms.tB0.value = POST.lv0a.texture;
  finalMat.uniforms.tB1.value = POST.lv1b.texture;
  finalMat.uniforms.tB2.value = POST.lv2b.texture;
  finalMat.uniforms.uExposure.value = POST.exposure;
  finalMat.uniforms.uBloom.value = LOOK.bloomOn ? LOOK.bloomStrength : 0;
  finalMat.uniforms.uGrade.value = LOOK.gradeOn ? 1 : 0;
  finalMat.uniforms.uDebug.value = LOOK.debug;
  const lv = LOOK.bloomOn ? LOOK.bloomLevels : 3;
  finalMat.uniforms.uW.value.set(0.50, 0.32, lv >= 3 ? 0.18 : 0.0);
  renderQuad(finalMat, null);
}

window.__look = LOOK;
window.__post = POST;
window.__perf = PERF;

/* 调参用像素采样：强制出图后立刻读默认帧缓冲 */
window.__sample = function (pts) {
  renderScene(0.016);
  const gl = renderer.getContext();
  const dpr = renderer.getPixelRatio();
  const W = glCanvas.clientHeight;
  const out = [];
  const buf = new Uint8Array(4);
  for (let i = 0; i < pts.length; i++) {
    const x = Math.round(pts[i][0] * dpr);
    const y = Math.round((W - pts[i][1]) * dpr);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    out.push([pts[i][0], pts[i][1], buf[0], buf[1], buf[2]]);
  }
  return out;
};
