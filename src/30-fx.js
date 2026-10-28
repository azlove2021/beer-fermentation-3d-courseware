/* =========================================================
   30 · 动态效果
   蒸汽 / 气泡 / 酵母 / 管道流动 / 输送带
   粒子统一用「顶点色 × 寿命」做淡出：加色混合下黑色即透明，
   省掉自定义 shader，也不用逐粒子改 opacity。
   ========================================================= */
'use strict';

/* ---- 通用粒子场 ---- */
function makeParticles(count, opt) {
  opt = opt || {};
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const data = [];
  for (let i = 0; i < count; i++) {
    data.push({
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      life: Math.random(), max: 1, size: 1
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: opt.size || 0.3,
    map: opt.map || null,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    opacity: opt.opacity === undefined ? 1 : opt.opacity
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return { points: pts, pos: pos, col: col, data: data, geo: geo, count: count };
}

/* ---- 柔光点贴图 ---- */
function dotTex(power) {
  const { c, g } = make2D(64, 64);
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.28, 'rgba(255,255,255,' + (0.55 * (power || 1)) + ')');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const DOT = dotTex(1);
const PUFF = dotTex(0.42);

/* =========================================================
   蒸汽：煮沸锅排气筒
   ========================================================= */
const STEAM = (function () {
  const N = 46;
  const field = makeParticles(N, { size: 1.55, map: PUFF, opacity: 0.5 });
  const src = { x: -0.8, y: 3.36, z: -0.30 };
  for (let i = 0; i < N; i++) {
    const d = field.data[i];
    d.x = src.x + (Math.random() - 0.5) * 0.34;
    d.y = src.y + Math.random() * 0.4;
    d.z = src.z + (Math.random() - 0.5) * 0.34;
    d.vy = 0.55 + Math.random() * 0.55;
    d.vx = (Math.random() - 0.5) * 0.16;
    d.vz = (Math.random() - 0.5) * 0.16;
    d.max = 2.6 + Math.random() * 1.8;
    d.life = Math.random() * d.max;
  }
  function update(dt) {
    for (let i = 0; i < N; i++) {
      const d = field.data[i];
      d.life += dt;
      if (d.life > d.max) {
        d.life = 0;
        d.x = src.x + (Math.random() - 0.5) * 0.34;
        d.y = src.y + Math.random() * 0.3;
        d.z = src.z + (Math.random() - 0.5) * 0.34;
        d.vy = 0.55 + Math.random() * 0.55;
      }
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.vy *= (1 - 0.10 * dt);
      d.vx += (Math.random() - 0.5) * 0.10 * dt;
      d.vz += (Math.random() - 0.5) * 0.10 * dt;

      const t = d.life / d.max;
      const fade = Math.sin(Math.min(1, t) * Math.PI) * (1 - t * 0.55);
      field.pos[i * 3] = d.x;
      field.pos[i * 3 + 1] = d.y;
      field.pos[i * 3 + 2] = d.z;
      const v = fade * 0.62;
      field.col[i * 3] = v;
      field.col[i * 3 + 1] = v * 0.98;
      field.col[i * 3 + 2] = v * 0.92;
    }
    field.geo.attributes.position.needsUpdate = true;
    field.geo.attributes.color.needsUpdate = true;
  }
  return { update: update };
})();

/* =========================================================
   发酵罐内部：气泡 + 酵母
   ========================================================= */
const TANK_FX = FERMENTERS.map(function (rec) {
  const N = 56;
  /* 粒子在世界坐标里，必须自己乘上罐体缩放，否则小扩培罐会“漏气” */
  const S = rec.scale;
  const R = rec.R * S;
  const field = makeParticles(N, { size: 0.20 * S, map: DOT, opacity: 1.0 });
  field.points.visible = false;
  field.points.renderOrder = 4;

  for (let i = 0; i < N; i++) {
    const d = field.data[i];
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * R * 0.80;
    d.x = rec.x + Math.cos(a) * r;
    d.z = rec.z + Math.sin(a) * r;
    d.y = (0.70 + Math.random() * 2.0) * S;
    d.vy = 0.16 + Math.random() * 0.34;
    d.vx = (Math.random() - 0.5) * 0.04;
    d.vz = (Math.random() - 0.5) * 0.04;
    d.max = 46; d.life = Math.random() * d.max;
  }

  /* 酵母细胞：小球 + 微弱的出芽感 */
  const yeastGeo = new THREE.SphereGeometry(0.028 * S, 8, 6);
  const yeastMat = new THREE.MeshStandardMaterial({
    color: 0xffe0a8, emissive: 0xffb64a, emissiveIntensity: 0.5, roughness: 0.6
  });
  const YN = 42;
  const yeast = new THREE.InstancedMesh(yeastGeo, yeastMat, YN);
  yeast.visible = false;
  yeast.renderOrder = 4;
  yeast.frustumCulled = false;
  scene.add(yeast);
  const yd = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < YN; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * R * 0.86;
    yd.push({
      x: rec.x + Math.cos(a) * r, z: rec.z + Math.sin(a) * r,
      y: (0.75 + Math.random() * 2.0) * S,
      ph: Math.random() * Math.PI * 2, sp: 0.3 + Math.random() * 0.5
    });
  }

  function update(dt, t, active) {
    /* 只有被剖开的“教学罐”才需要内部粒子 */
    const on = active && rec.hero;
    field.points.visible = on;
    yeast.visible = on;
    if (!on) return;

    for (let i = 0; i < N; i++) {
      const d = field.data[i];
      d.y += d.vy * dt * 1.6 * S;
      if (d.y > 2.95 * S) {
        d.y = 0.72 * S;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * R * 0.78;
        d.x = rec.x + Math.cos(a) * r;
        d.z = rec.z + Math.sin(a) * r;
      }
      field.pos[i * 3] = d.x + Math.sin(t * 2.2 + i) * 0.012 * S;
      field.pos[i * 3 + 1] = d.y;
      field.pos[i * 3 + 2] = d.z;
      const v = 0.55 + 0.35 * Math.sin(t * 3 + i);
      field.col[i * 3] = v * 0.95;
      field.col[i * 3 + 1] = v * 0.62;
      field.col[i * 3 + 2] = v * 0.18;
    }
    field.geo.attributes.position.needsUpdate = true;
    field.geo.attributes.color.needsUpdate = true;

    for (let i = 0; i < YN; i++) {
      const p = yd[i];
      dummy.position.set(
        p.x + Math.sin(t * p.sp + p.ph) * 0.05 * S,
        p.y + Math.sin(t * p.sp * 0.8 + p.ph * 1.7) * 0.10 * S,
        p.z + Math.cos(t * p.sp * 0.9 + p.ph) * 0.05 * S
      );
      const sc = (0.85 + 0.25 * Math.sin(t * 2 + p.ph)) * S;
      dummy.scale.set(sc, sc * 0.92, sc);
      dummy.updateMatrix();
      yeast.setMatrixAt(i, dummy.matrix);
    }
    yeast.instanceMatrix.needsUpdate = true;
  }
  return { update: update, rec: rec, field: field, yeast: yeast };
});

/* =========================================================
   管道内流动
   ========================================================= */
const FLOW = (function () {
  if (!PIPE_CURVES.length) return { update: function () {} };
  const PER = 3;
  const total = PIPE_CURVES.length * PER;
  const field = makeParticles(total, { size: 0.16, map: DOT, opacity: 1 });
  const items = [];
  for (let c = 0; c < PIPE_CURVES.length; c++) {
    for (let k = 0; k < PER; k++) {
      items.push({ curve: PIPE_CURVES[c], t: (k / PER + Math.random() * 0.2) % 1, sp: 0.11 + Math.random() * 0.05 });
    }
  }
  const v = new THREE.Vector3();
  function update(dt, t) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      it.t += it.sp * dt;
      if (it.t > 1) it.t -= 1;
      it.curve.getPointAt(it.t, v);
      field.pos[i * 3] = v.x; field.pos[i * 3 + 1] = v.y; field.pos[i * 3 + 2] = v.z;
      const pulse = 0.55 + 0.45 * Math.sin(t * 4 + i);
      field.col[i * 3] = pulse * 1.0;
      field.col[i * 3 + 1] = pulse * 0.66;
      field.col[i * 3 + 2] = pulse * 0.22;
    }
    field.geo.attributes.position.needsUpdate = true;
    field.geo.attributes.color.needsUpdate = true;
  }
  return { update: update };
})();

/* =========================================================
   输送带
   ========================================================= */
function updateBottles(dt) {
  for (let i = 0; i < BOTTLES.length; i++) {
    const b = BOTTLES[i];
    b.position.x += dt * 0.42;
    if (b.position.x > 1.70) b.position.x -= 3.4;
    /* 经过灌装头时轻微下压 */
    const near = Math.abs(b.position.x + 0.35);
    b.position.y = 0.765 - Math.max(0, 0.012 * (1 - near / 0.4));
  }
}

/* =========================================================
   细节动画
   ========================================================= */
const KETTLE_LIGHT = new THREE.PointLight(0xff7d16, 1.2, 4.0, 2);

function updateDetails(dt, t) {
  /* 过滤槽耙臂 */
  if (RAKE_ARM) RAKE_ARM.rotation.y += dt * 0.35;

  /* 夹套与指示灯呼吸：共用材质，整体脉动即可 */
  MAT.teal.emissiveIntensity = 0.50 + 0.14 * Math.sin(t * 2.6);
  MAT.amberLamp.emissiveIntensity = 1.9 + 0.28 * Math.sin(t * 5.1);

  for (let i = 0; i < FERMENTERS.length; i++) {
    const rec = FERMENTERS[i];
    if (!rec.light) continue;
    rec.light.intensity = damp(rec.light.intensity, rec.cut ? 0.55 : 0.22, 4, dt);
  }
}
