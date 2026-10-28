/* =========================================================
   35 · 产线联动
   一条"批次"沿十个工段推进：进料 → 反应 → 输送到下一站。
   液位、地环、传输液滴、HUD 读数都由同一个状态机驱动。
   ========================================================= */
'use strict';

const RUN = {
  on: false,
  idx: -1,
  phase: 'idle',      /* idle | fill | process | transfer | done */
  t: 0,
  speed: 1,
  follow: true
};

const PHASE_DUR = { fill: 0.9, process: 2.6, transfer: 1.1 };

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
    color: 0xf0a02a, emissive: 0xc4760a, emissiveIntensity: 0.45,
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
  /* 不运行时也把液位摆出来，方便讲解 */
  if (!RUN.on) {
    for (let i = 0; i < VESSELS.length; i++) {
      if (VESSELS[i].hero && State.cellMode) continue;
      setVesselLevel(VESSELS[i], on ? 0.58 : 0);
    }
  }
}

/* ---- 每个工段的容器 ---- */
function vesselsOf(i) {
  const out = [];
  for (let k = 0; k < VESSELS.length; k++) if (VESSELS[k].station === i) out.push(VESSELS[k]);
  return out;
}

function clearAllLevels() {
  for (let k = 0; k < VESSELS.length; k++) setVesselLevel(VESSELS[k], 0);
}

/* ---- 状态切换 ---- */
function runGoto(i, phase) {
  RUN.idx = i;
  RUN.phase = phase || 'fill';
  RUN.t = 0;

  const st = STATIONS[i];
  RING.position.set(st.x, 0.045, 0);

  if (RUN.follow && typeof goTo === 'function') goTo(i, { fromRun: true, force: true });
}

function runStart() {
  RUN.on = true;
  RUN.speed = 1;
  clearAllLevels();
  runGoto(0, 'fill');
  setRunLabel(true);
  if (typeof setPlayingUI === 'function') setPlayingUI(true);
}

function runStop() {
  RUN.on = false;
  RUN.phase = 'idle';
  RING.material.opacity = 0;
  SLUG.visible = false;
  if (!XRAY.on) clearAllLevels();
  setRunLabel(false);
  if (typeof setPlayingUI === 'function') setPlayingUI(false);
}

function runReset() {
  runStop();
  RUN.idx = -1;
}

/* ---- 顶部状态文字 ---- */
function setRunLabel(on) {
  const el = document.getElementById('hudNote');
  if (!el) return;
  if (on) {
    el.textContent = '● 产线运行中';
    el.style.color = '#1f5fd0';
  } else {
    el.textContent = '当前工段读数';
    el.style.color = '';
  }
}

/* ---- 每帧 ---- */
function updateRun(dt, t) {
  if (!RUN.on) {
    RING.material.opacity = 0;
    SLUG.visible = false;
    return;
  }

  const st = STATIONS[RUN.idx];
  const dur = PHASE_DUR[RUN.phase] || 1;
  RUN.t += dt * RUN.speed;
  const p = clamp(RUN.t / dur, 0, 1);

  /* 地环呼吸 */
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
  RING.material.opacity = 0.26 + 0.18 * pulse;
  const rs = 1 + 0.05 * pulse;
  RING.scale.set(rs, rs, 1);

  const vs = vesselsOf(RUN.idx);

  if (RUN.phase === 'fill') {
    for (let i = 0; i < vs.length; i++) setVesselLevel(vs[i], easeOutCubic(p));
    SLUG.visible = false;
  } else if (RUN.phase === 'process') {
    /* 七成满：留出液面，才像"罐里有液体"而不是塞了一块固体 */
    for (let i = 0; i < vs.length; i++) setVesselLevel(vs[i], 0.72);
    SLUG.visible = false;
  } else if (RUN.phase === 'transfer') {
    for (let i = 0; i < vs.length; i++) setVesselLevel(vs[i], 1 - easeInOutCubic(p));
    /* 液滴沿产线流向下一站 */
    const next = STATIONS[Math.min(RUN.idx + 1, STATIONS.length - 1)];
    const x0 = st.x, x1 = next.x;
    SLUG.visible = true;
    SLUG.position.set(
      lerp(x0, x1, easeInOutCubic(p)),
      0.95 + Math.sin(p * Math.PI) * 0.35,
      0.55
    );
    const ss = 0.9 + 0.25 * Math.sin(p * Math.PI * 3);
    SLUG.scale.setScalar(ss);
  }

  /* 进度推进 */
  if (RUN.t >= dur) {
    if (RUN.phase === 'fill') { RUN.phase = 'process'; RUN.t = 0; }
    else if (RUN.phase === 'process') { RUN.phase = 'transfer'; RUN.t = 0; }
    else if (RUN.phase === 'transfer') {
      if (RUN.idx >= STATIONS.length - 1) {
        RUN.phase = 'done';
        RUN.t = 0;
        setRunLabel(false);
        const el = document.getElementById('hudNote');
        if (el) { el.textContent = '● 本轮完成'; el.style.color = '#18874d'; }
      } else {
        runGoto(RUN.idx + 1, 'fill');
      }
    }
  }
}

/* 运行中手动点工段：跳到那一段继续跑 */
function runSeek(i) {
  if (!RUN.on) return;
  clearAllLevels();
  runGoto(i, 'fill');
}
