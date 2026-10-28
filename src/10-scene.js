/* =========================================================
   10 · 渲染底座
   渲染器 / 程序化环境贴图 / 相机 / 灯光 / 台座
   ========================================================= */
'use strict';

const glCanvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({
  canvas: glCanvas, antialias: false, powerPreference: 'high-performance', alpha: false
});
/* 上限 1.75：再高对观感几乎没有增益，却成倍吃填充率 */
const DPR_MAX = Math.min(window.devicePixelRatio || 1, QUALITY.perf ? 1.0 : 1.75);
let dprNow = DPR_MAX;
renderer.setPixelRatio(dprNow);
/* 场景以线性 HDR 渲进浮点缓冲；曝光 / ACES / 编码统一由 15-post 负责。
   这里若再开 toneMapping，会二次压缩，高光全糊。 */
renderer.outputEncoding = THREE.LinearEncoding;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
/* 静态场景：阴影按需刷新，省掉每帧一次全场深度渲染 */
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
let shadowTick = 0;
renderer.setClearColor(0x04080a, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x050b0d, 24, 58);

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 220);

/* ---------------------------------------------------------
   程序化环境贴图
   金属没有环境贴图就是一块死黑。用一个小场景（渐变穹顶 +
   四块柔光板）烘成 PMREM，不锈钢才会有真实的高光走向。
   --------------------------------------------------------- */
function buildEnvironment() {
  const env = new THREE.Scene();

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(60, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: [
        'varying vec3 vP;',
        'void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vP;',
        'void main(){',
        '  float h = normalize(vP).y * 0.5 + 0.5;',
        '  vec3 low = vec3(0.004, 0.008, 0.010);',
        '  vec3 mid = vec3(0.016, 0.030, 0.034);',
        '  vec3 top = vec3(0.007, 0.012, 0.015);',
        '  vec3 c = mix(low, mid, smoothstep(0.0, 0.46, h));',
        '  c = mix(c, top, smoothstep(0.5, 1.0, h));',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n')
    })
  );
  env.add(dome);

  /* 柔光板：颜色值刻意超过 1，作为 HDR 高光源 */
  function softbox(w, h, pos, rot, rgb) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(rgb[0], rgb[1], rgb[2]), side: THREE.DoubleSide })
    );
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    env.add(m);
  }
  softbox(13, 8, [0, 22, 4], [Math.PI / 2, 0, 0], [3.4, 3.5, 3.6]);        /* 顶部主光板：小面高亮 */
  softbox(11, 7, [-20, 8, 6], [0, -Math.PI / 2.6, 0], [1.30, 2.90, 3.30]);  /* 左冷光 */
  softbox(10, 6, [18, 7, -9], [0, Math.PI / 2.4, 0], [3.00, 1.70, 0.70]);   /* 右暖光 */
  softbox(14, 4, [0, 5, -24], [0, 0, 0], [0.85, 1.00, 1.10]);               /* 背光条 */

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromScene(env, 0.035);
  scene.environment = rt.texture;
  pmrem.dispose();
  dome.geometry.dispose();
  dome.material.dispose();
}
buildEnvironment();

/* ---------------------------------------------------------
   灯光
   --------------------------------------------------------- */
const hemi = new THREE.HemisphereLight(0x8fc4d0, 0x060b0d, 0.34);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff0d8, 1.62);
key.position.set(9, 15, 10);
key.castShadow = true;
key.shadow.mapSize.set(QUALITY.perf ? 1024 : 2048, QUALITY.perf ? 1024 : 2048);
key.shadow.camera.left = -13;
key.shadow.camera.right = 13;
key.shadow.camera.top = 9;
key.shadow.camera.bottom = -9;
key.shadow.camera.near = 4;
key.shadow.camera.far = 46;
key.shadow.bias = -0.0006;
key.shadow.normalBias = 0.022;
scene.add(key);
scene.add(key.target);

const rimCool = new THREE.DirectionalLight(0x5fc8de, 0.46);
rimCool.position.set(-12, 7, -11);
scene.add(rimCool);

const rimWarm = new THREE.DirectionalLight(0xff8c3a, 0.22);
rimWarm.position.set(13, 4, -8);
scene.add(rimWarm);

const bounce = new THREE.PointLight(0x2b6a72, 0.26, 26, 2);
bounce.position.set(0, 0.6, 3.5);
scene.add(bounce);

const frontFill = new THREE.DirectionalLight(0xbfe6ea, 0.62);
frontFill.position.set(-4, 6, 14);
scene.add(frontFill);

/* ---------------------------------------------------------
   台座与地面
   --------------------------------------------------------- */
const FLOOR = { w: 22.4, d: 6.9 };

function concreteTexture() {
  const W = 2048, H = 748;
  const { c, g } = make2D(W, H);
  g.fillStyle = '#2c3b40';
  g.fillRect(0, 0, W, H);

  /* 斑驳：大量低对比径向渐变叠出水泥的脏感 */
  for (let i = 0; i < 420; i++) {
    const r = 18 + Math.random() * 110;
    const x = Math.random() * W, y = Math.random() * H;
    const a = 0.010 + Math.random() * 0.026;
    const light = Math.random() > 0.46;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, light ? 'rgba(190,215,215,' + a + ')' : 'rgba(0,0,0,' + (a * 1.5) + ')');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /* 网格：与设备排布同尺度，给画面一个“工程图纸”的底 */
  const step = 128;
  g.lineWidth = 1;
  for (let x = 0; x <= W; x += step) {
    g.strokeStyle = x % (step * 4) === 0 ? 'rgba(165,225,225,0.20)' : 'rgba(165,225,225,0.085)';
    g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke();
  }
  for (let y = 0; y <= H; y += step) {
    g.strokeStyle = y % (step * 4) === 0 ? 'rgba(165,225,225,0.20)' : 'rgba(165,225,225,0.085)';
    g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke();
  }

  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

(function buildStage() {
  /* 悬浮台座：先一块深色厚板，再盖一层地面 */
  const slabMat = new THREE.MeshStandardMaterial({
    color: 0x0d1518, roughness: 0.60, metalness: 0.22, envMapIntensity: 0.30
  });
  slabMat.name = 'slab';
  const slab = new THREE.Mesh(new THREE.BoxGeometry(FLOOR.w + 0.7, 0.72, FLOOR.d + 0.7), slabMat);
  slab.position.y = -0.37;
  slab.receiveShadow = true;
  slab.castShadow = true;
  scene.add(slab);

  /* 台座侧面的暖光条，让悬浮感成立 */
  const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.26, 0.06) });
  const edge = new THREE.Mesh(new THREE.BoxGeometry(FLOOR.w + 0.72, 0.035, FLOOR.d + 0.72), edgeMat);
  edge.position.y = -0.735;
  scene.add(edge);

  const floorTex = concreteTexture();
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex, color: 0xa6b4b8, roughness: 0.86, metalness: 0.0, envMapIntensity: 0.05
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR.w, FLOOR.d), floorMat);
  floorMat.name = 'floorMat';
  floor.name = 'floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.004;
  floor.receiveShadow = true;
  scene.add(floor);

  /* 台座金属包边：必须是四条边条。
     用整块薄板会盖住地面（只在掠射角露出一点点，极难排查）。 */
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x7c8c8f, roughness: 0.34, metalness: 1.0, envMapIntensity: 0.55
  });
  const TW = FLOOR.w + 0.74, TD = FLOOR.d + 0.74, TH = 0.055, TY = -0.02;
  const bx = new THREE.BoxGeometry(TW, TH, 0.10);
  const bz = new THREE.BoxGeometry(0.10, TH, TD);
  [[0, TD / 2], [0, -TD / 2]].forEach(function (p) {
    const m = new THREE.Mesh(bx, trimMat); m.position.set(p[0], TY, p[1]); scene.add(m);
  });
  [[TW / 2, 0], [-TW / 2, 0]].forEach(function (p) {
    const m = new THREE.Mesh(bz, trimMat); m.position.set(p[0], TY, p[1]); scene.add(m);
  });
})();

/* 地面光池：加色混合的径向渐变，模拟设备在地面的溢光 */
const glowTex = (function () {
  const { c, g } = make2D(256, 256);
  const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  rg.addColorStop(0.72, 'rgba(255,255,255,0.09)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();

function floorGlow(x, z, r, color, strength) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(r * 2, r * 2),
    new THREE.MeshBasicMaterial({
      map: glowTex, color: new THREE.Color(color),
      transparent: true, opacity: strength, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false
    })
  );
  m.name = 'glow';
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.016, z);
  m.renderOrder = 2;
  scene.add(m);
  return m;
}

/* ---------------------------------------------------------
   相机 + 自建轨道
   --------------------------------------------------------- */
const Orbit = {
  target: new THREE.Vector3(0.2, 1.9, 0),
  ttarget: new THREE.Vector3(0.2, 1.9, 0),
  az: 0.62, pol: 0.98, dist: 22.5,
  taz: 0.62, tpol: 0.98, tdist: 22.5,
  dragging: false, lastX: 0, lastY: 0, idle: 0, free: 0
};

function applyCamera() {
  const sp = Math.sin(Orbit.pol), cp = Math.cos(Orbit.pol);
  camera.position.set(
    Orbit.target.x + Orbit.dist * sp * Math.sin(Orbit.az),
    Orbit.target.y + Orbit.dist * cp,
    Orbit.target.z + Orbit.dist * sp * Math.cos(Orbit.az)
  );
  camera.lookAt(Orbit.target);
}

function updateCamera(dt) {
  const k = 4.2;
  Orbit.az = damp(Orbit.az, Orbit.taz, k, dt);
  Orbit.pol = damp(Orbit.pol, Orbit.tpol, k, dt);
  Orbit.dist = damp(Orbit.dist, Orbit.tdist, k, dt);
  Orbit.target.x = damp(Orbit.target.x, Orbit.ttarget.x, k, dt);
  Orbit.target.y = damp(Orbit.target.y, Orbit.ttarget.y, k, dt);
  Orbit.target.z = damp(Orbit.target.z, Orbit.ttarget.z, k, dt);
  applyCamera();
}

function flyTo(v, instant) {
  Orbit.ttarget.set(v.tx, v.ty, v.tz);
  Orbit.taz = v.az; Orbit.tpol = v.pol; Orbit.tdist = v.dist;
  if (instant) {
    Orbit.target.copy(Orbit.ttarget);
    Orbit.az = v.az; Orbit.pol = v.pol; Orbit.dist = v.dist;
    applyCamera();
  }
}

glCanvas.addEventListener('pointerdown', e => {
  Orbit.dragging = true; Orbit.lastX = e.clientX; Orbit.lastY = e.clientY;
  glCanvas.setPointerCapture(e.pointerId);
  document.body.classList.add('grabbing');
});
glCanvas.addEventListener('pointermove', e => {
  if (!Orbit.dragging) return;
  const dx = e.clientX - Orbit.lastX, dy = e.clientY - Orbit.lastY;
  Orbit.lastX = e.clientX; Orbit.lastY = e.clientY;
  Orbit.taz -= dx * 0.0055;
  Orbit.tpol = clamp(Orbit.tpol - dy * 0.0042, 0.30, 1.46);
});
['pointerup', 'pointercancel'].forEach(ev => glCanvas.addEventListener(ev, () => {
  Orbit.dragging = false;
  document.body.classList.remove('grabbing');
}));
glCanvas.addEventListener('wheel', e => {
  e.preventDefault();
  Orbit.tdist = clamp(Orbit.tdist * (1 + e.deltaY * 0.0011), 2.6, 34);
}, { passive: false });

/* ---------------------------------------------------------
   尺寸
   --------------------------------------------------------- */
function resize() {
  const stage = document.getElementById('stage');
  const w = Math.max(2, stage.clientWidth);
  const h = Math.max(2, stage.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  /* 竖屏 / 窄窗口时拉大视角，保证设备完整进画 */
  camera.fov = w / h < 1.15 ? 52 : 34;
  camera.updateProjectionMatrix();
  if (typeof resizePost === 'function') resizePost();
  if (typeof relayoutLabels === 'function') relayoutLabels();
}
window.addEventListener('resize', resize);
