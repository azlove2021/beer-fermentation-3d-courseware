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
renderer.setClearColor(0xd9e5f0, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdde8f2, 58, 135);

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
        '  vec3 low = vec3(0.05, 0.06, 0.075);',
        '  vec3 mid = vec3(0.26, 0.29, 0.33);',
        '  vec3 top = vec3(0.50, 0.53, 0.57);',
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
  softbox(15, 10, [0, 22, 4], [Math.PI / 2, 0, 0], [1.05, 1.07, 1.10]);        /* 顶部主光板：小面高亮 */
  softbox(12, 8, [-20, 8, 6], [0, -Math.PI / 2.6, 0], [0.50, 0.62, 0.74]);  /* 左冷光 */
  softbox(11, 7, [18, 7, -9], [0, Math.PI / 2.4, 0], [0.78, 0.64, 0.48]);   /* 右暖光 */
  softbox(14, 5, [0, 6, -24], [0, 0, 0], [0.85, 0.90, 0.95]);               /* 背光条 */

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
const hemi = new THREE.HemisphereLight(0xffffff, 0x93a5b6, 0.34);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfffaf2, 1.85);
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

const rimCool = new THREE.DirectionalLight(0x9fc4e8, 0.42);
rimCool.position.set(-12, 7, -11);
scene.add(rimCool);

const rimWarm = new THREE.DirectionalLight(0xffd9b0, 0.30);
rimWarm.position.set(13, 4, -8);
scene.add(rimWarm);

const bounce = new THREE.PointLight(0xdfe9f4, 0.30, 26, 2);
bounce.position.set(0, 0.6, 3.5);
scene.add(bounce);

const frontFill = new THREE.DirectionalLight(0xffffff, 0.55);
frontFill.position.set(-4, 6, 14);
scene.add(frontFill);

/* ---------------------------------------------------------
   台座与地面
   --------------------------------------------------------- */
const FLOOR = { w: 22.4, d: 6.9 };

function concreteTexture() {
  const W = 2048, H = 748;
  const { c, g } = make2D(W, H);
  g.fillStyle = '#5c6d7b';
  g.fillRect(0, 0, W, H);

  /* 斑驳：大量低对比径向渐变叠出水泥的脏感 */
  for (let i = 0; i < 420; i++) {
    const r = 18 + Math.random() * 110;
    const x = Math.random() * W, y = Math.random() * H;
    const a = 0.010 + Math.random() * 0.026;
    const light = Math.random() > 0.46;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, light ? 'rgba(255,255,255,' + a + ')' : 'rgba(58,78,96,' + (a * 1.6) + ')');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /* 网格：与设备排布同尺度，给画面一个“工程图纸”的底 */
  const step = 128;
  g.lineWidth = 1;
  for (let x = 0; x <= W; x += step) {
    g.strokeStyle = x % (step * 4) === 0 ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.18)';
    g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke();
  }
  for (let y = 0; y <= H; y += step) {
    g.strokeStyle = y % (step * 4) === 0 ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.18)';
    g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke();
  }

  /* 边缘压暗：整块地面在亮环境里容易"飘起来" */
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22, W / 2, H / 2, Math.max(W, H) * 0.62);
  vg.addColorStop(0, 'rgba(38,56,74,0)');
  vg.addColorStop(0.62, 'rgba(38,56,74,0.10)');
  vg.addColorStop(1, 'rgba(30,46,62,0.30)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);

  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

(function buildStage() {
  /* 悬浮台座：先一块深色厚板，再盖一层地面 */
  const slabMat = new THREE.MeshStandardMaterial({
    color: 0x8d9dab, roughness: 0.76, metalness: 0.06, envMapIntensity: 0.26
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
    map: floorTex, color: 0xffffff, roughness: 0.90, metalness: 0.02, envMapIntensity: 0.30
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
    color: 0xb9c6d2, roughness: 0.30, metalness: 1.0, envMapIntensity: 1.1
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
      transparent: true, opacity: Math.min(0.55, strength * 1.6), blending: THREE.NormalBlending,
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
