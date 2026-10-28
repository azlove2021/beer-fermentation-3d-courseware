/* =========================================================
   35 · 产线联动（按工序推进）
   一站之内按 PROCESS 的子工序走：液位、地环、液滴、工序条同步。
   演示时长按站内相对比例压缩，不是真实工艺时间。
   ========================================================= */
'use strict';

const RUN = {
  on: false,
  idx: -1,
  step: 0,
  t: 0,
  speed: 1,
  follow: true,
  done: false
};

/* ---- 工段地环 ---- */
const RING = new THREE.Mesh(
  new THREE.RingGeometry(1.38, 1.58, 72),
  new THREE.MeshBasicMaterial({
    color: 0x1f5fd0, transparent: true, opacity: 0, side: THREE.DoubleSide,
    depthWrite: false, fog: false
  })
);
RING.rotation.x = -Math.PI / 2;
RING.position.y = 0.045;
RING.renderOrder = 3;
scene.add(RING);

/* ---- 传输液滴 ---- */
const SLUG = new THREE.Mesh(
  new THREE.SphereGeometry(0.085, 16, 12),
  new THREE.MeshStandardMaterial({
    color: 0xf0a02a, emissive: 0xc4760a, emissiveIntensity: 0.35,
    roughness: 0.35, metalness: 0.0
  })
);
SLUG.visible = false;
scene.add(SLUG);

/* ---- 透视 ---- */
const XRAY = { on: false };

function setXray(on) {
  XRAY.on = on;
  [MAT.steelBody, MAT.copperBody].forEach(function (m) {
    m.transparent = on;
    m.opacity = on ? 0.44 : 1.0;
    m.depthWrite = !on;
    m.needsUpdate = true;
  });
  if (!RUN.on) {
    for (let i = 0; i < VESSELS.length; i++) {
      if (VESSELS[i].hero && typeof State !== 'undefined' && State.cellMode) continue;
      setVesselLevel(VESSELS[i], on ? 0.58 : 0);
    }
  }
}

function vesselsOf(i) {
  const out = [];
  for (let k = 0; k < VESSELS.length; k++) if (VESSELS[k].station === i) out.push(VESSELS[k]);
  return out;
}
function clearAllLevels() {
  for (let k = 0; k < VESSELS.length; k++) setVesselLevel(VESSELS[k], 0);
}

/* ---- 当前工序 ---- */
function currentStep(i, t) {
  const arr = PROCESS[i] || [];
  let acc = 0;
  for (let k = 0; k < arr.length; k++) {
    if (t < acc + arr[k].d || k === arr.length - 1) {
      return { k: k, s: arr[k], local: Math.max(0, t - acc) };
    }
    acc += arr[k].d;
  }
  return { k: 0, s: arr[0], local: 0 };
}

/* ---- 工序条 ---- */
function paintStepBar(i, t, total) {
  const chip = document.getElementById('stChip');
  const bar = document.querySelector('#stProg i');
  const arr = PROCESS[i] || [];
  const cur = currentStep(i, t);
  if (chip && cur.s) {
    chip.textContent = '工序 ' + (cur.k + 1) + '/' + arr.length + ' · ' + cur.s.n + ' ' + cur.s.temp;
  }
  if (bar) bar.style.width = clamp(t / total * 100, 0, 100) + '%';
}

function resetStepBar() {
  const bar = document.querySelector('#stProg i');
  if (bar) bar.style.width = '0%';
}

/* ---- 站切换 ---- */
function runGoto(i) {
  RUN.idx = i;
  RUN.step = 0;
  RUN.t = 0;
  RUN.done = false;
  const st = STATIONS[i];
  RING.position.set(st.x, 0.045, 0);
  if (RUN.follow && typeof goTo === 'function') goTo(i, { fromRun: true, force: true });
  paintStepBar(i, 0, stationDemo(i));
}

function runStart() {
  RUN.on = true;
  RUN.speed = 1;
  /* 不透视就看不到液位，"开产"会显得什么都没发生 */
  if (!XRAY.on) {
    setXray(true);
    const b = document.getElementById('btnXray');
    if (b) b.classList.add('on');
  }
  clearAllLevels();
  runGoto(0);
  setRunLabel(true);
  if (typeof setPlayingUI === 'function') setPlayingUI(true);
}

function runStop() {
  RUN.on = false;
  RING.material.opacity = 0;
  SLUG.visible = false;
  resetStepBar();
  if (!XRAY.on) clearAllLevels();
  setRunLabel(false);
  if (typeof setPlayingUI === 'function') setPlayingUI(false);
}

function runSeek(i) {
  if (!RUN.on) return;
  clearAllLevels();
  runGoto(i);
}

/* ---- 顶部状态 ---- */
function setRunLabel(on) {
  const el = document.getElementById('hudNote');
  if (!el) return;
  if (on) { el.textContent = '● 产线运行中'; el.style.color = '#1f5fd0'; }
  else { el.textContent = '当前工段读数'; el.style.color = ''; }
}

/* ---- 每帧 ---- */
function updateRun(dt, t) {
  if (!RUN.on) {
    RING.material.opacity = 0;
    SLUG.visible = false;
    return;
  }

  const total = stationDemo(RUN.idx);
  RUN.t += dt * RUN.speed;
  const sp = clamp(RUN.t / total, 0, 1);

  /* 地环呼吸 */
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
  RING.material.opacity = 0.26 + 0.18 * pulse;
  const rs = 1 + 0.05 * pulse;
  RING.scale.set(rs, rs, 1);

  /* 液位：前 18% 进料，中段保持，最后 14% 排空 */
  let lv;
  if (sp < 0.18) lv = sp / 0.18 * 0.72;
  else if (sp < 0.86) lv = 0.72;
  else lv = (1 - (sp - 0.86) / 0.14) * 0.72;

  const vs = vesselsOf(RUN.idx);
  for (let i = 0; i < vs.length; i++) setVesselLevel(vs[i], lv);

  /* 末段输送：液滴飞向下一站 */
  if (sp > 0.88 && RUN.idx < STATIONS.length - 1) {
    const a = STATIONS[RUN.idx], b = STATIONS[RUN.idx + 1];
    const q = clamp((sp - 0.88) / 0.12, 0, 1);
    SLUG.visible = true;
    SLUG.position.set(lerp(a.x, b.x, easeInOutCubic(q)), 0.95 + Math.sin(q * Math.PI) * 0.35, 0.55);
    SLUG.scale.setScalar(0.9 + 0.25 * Math.sin(q * Math.PI * 3));
  } else {
    SLUG.visible = false;
  }

  const cur = currentStep(RUN.idx, RUN.t);
  RUN.step = cur.k;
  paintStepBar(RUN.idx, RUN.t, total);

  /* 推进 */
  if (RUN.t >= total) {
    if (RUN.idx >= STATIONS.length - 1) {
      RUN.done = true;
      setRunLabel(false);
      const el = document.getElementById('hudNote');
      if (el) { el.textContent = '● 本轮完成'; el.style.color = '#18874d'; }
      const chip = document.getElementById('stChip');
      if (chip) chip.textContent = '成品 · 装瓶待运';
      RUN.on = false;
      SLUG.visible = false;
      if (typeof State !== 'undefined') State.playing = false;   /* 否则第一次点击播放无反应 */
      if (typeof setPlayingUI === 'function') setPlayingUI(false);
    } else {
      runGoto(RUN.idx + 1);
    }
  }
}
