/* =========================================================
   20 · 工厂建模
   全部程序化生成，不加载任何外部模型。
   罐体用 LatheGeometry 车削：一张连续曲面，高光不断裂，
   这是拼圆柱+圆锥做不出来的。
   ========================================================= */
'use strict';

/* ---- 材质 ---- */
function brushedTex() {
  const { c, g } = make2D(256, 256);
  g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const y = Math.random() * 256;
    const v = 120 + Math.random() * 135;
    g.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.10)';
    g.lineWidth = 0.6 + Math.random() * 1.6;
    g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}
const BRUSH = brushedTex();

const MAT = {
  steel: new THREE.MeshStandardMaterial({ 
    color: 0xdae4ee, metalness: 1.0, roughness: 0.20, envMapIntensity: 1.45
  }),
  steelBody: new THREE.MeshStandardMaterial({ 
    color: 0xccd8e3, metalness: 0.98, roughness: 0.26,
    roughnessMap: BRUSH, envMapIntensity: 1.30, side: THREE.DoubleSide
  }),
  steelDark: new THREE.MeshStandardMaterial({ 
    color: 0xb0bfcb, metalness: 1.0, roughness: 0.38, envMapIntensity: 1.1
  }),
  copper: new THREE.MeshStandardMaterial({ 
    color: 0xc47843, metalness: 1.0, roughness: 0.28, envMapIntensity: 1.10
  }),
  copperBody: new THREE.MeshStandardMaterial({ 
    color: 0xb86f3e, metalness: 1.0, roughness: 0.33, roughnessMap: BRUSH,
    envMapIntensity: 1.05, side: THREE.DoubleSide
  }),
  paint: new THREE.MeshStandardMaterial({  color: 0x44586b, roughness: 0.55, metalness: 0.30 }),
  paintLite: new THREE.MeshStandardMaterial({  color: 0x5a7086, roughness: 0.50, metalness: 0.35 }),
  rubber: new THREE.MeshStandardMaterial({  color: 0x2c3a46, roughness: 0.85, metalness: 0.0 }),
  brass: new THREE.MeshStandardMaterial({  color: 0xd8a45a, metalness: 1.0, roughness: 0.30, envMapIntensity: 1.4 }),
  glass: new THREE.MeshPhysicalMaterial({ 
    color: 0xa8e4ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.15,
    envMapIntensity: 2.4, side: THREE.DoubleSide, depthWrite: false
  }),
  /* 发光液体：基色 + 自发光，交给泛光去晕开 */
  wort: new THREE.MeshStandardMaterial({ 
    color: 0xff9d1e, emissive: 0xff7a10, emissiveIntensity: 1.15,
    roughness: 0.18, metalness: 0.0, transparent: true, opacity: 0.88
  }),
  beer: new THREE.MeshStandardMaterial({ 
    color: 0xf0a02a, emissive: 0xc96f05, emissiveIntensity: 0.16,
    roughness: 0.10, metalness: 0.0, transparent: true, opacity: 0.78,
    depthWrite: false, side: THREE.DoubleSide
  }),
  teal: new THREE.MeshStandardMaterial({ 
    color: 0x2fd7c0, emissive: 0x14b9a4, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.2
  }),
  amberLamp: new THREE.MeshStandardMaterial({ 
    color: 0xffb02e, emissive: 0xff8a12, emissiveIntensity: 2.0, roughness: 0.4
  }),
  screen: new THREE.MeshBasicMaterial({  color: 0x0b2a2a })
};

Object.keys(MAT).forEach(function (k) { MAT[k].name = k; });


/* =========================================================
   液位容器
   每台"装液体的"设备挂一只可升降的液柱，供产线联动与透视模式驱动。
   ========================================================= */
const VESSELS = [];

function vesselLiquid(parent, r, y0, y1, station) {
  const full = y1 - y0;
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, full, 32, 1, false),
    MAT.beer
  );
  m.position.y = y0 + full / 2;
  m.scale.y = 0.001;
  m.visible = false;
  m.renderOrder = 1;
  parent.add(m);
  VESSELS.push({ mesh: m, baseY: y0, full: full, station: station });
  return m;
}

/* 设置液位 0..1 */
function setVesselLevel(v, lv) {
  lv = clamp(lv, 0, 1);
  const h = Math.max(0.001, v.full * lv);
  v.mesh.scale.y = h / v.full;
  v.mesh.position.y = v.baseY + h / 2;
  v.mesh.visible = lv > 0.02;
}

/* ---- 基础构件 ---- */
const FACTORY = new THREE.Group();
scene.add(FACTORY);

function addMesh(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  (parent || FACTORY).add(m);
  return m;
}

/* 车削：pts 为 [半径, 高度] 数组 */
function latheGeo(pts, seg, phiStart, phiLen) {
  const v = pts.map(p => new THREE.Vector2(Math.max(0.0006, p[0]), p[1]));
  return new THREE.LatheGeometry(v, seg || 44, phiStart || 0, phiLen || Math.PI * 2);
}

/* 记录管道曲线，供 30-fx 的流动粒子采样 */
const PIPE_CURVES = [];

function pipe(pts, r, mat, parent) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const geo = new THREE.TubeGeometry(curve, Math.max(12, pts.length * 6), r, 10, false);
  const m = new THREE.Mesh(geo, mat || MAT.steel);
  (parent || FACTORY).add(m);
  if (!parent) PIPE_CURVES.push(curve);
  return m;
}

/* 管道法兰：一圈螺栓，工业感的来源 */
function flange(x, y, z, r, rot, parent) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 0.34, 20), MAT.steel);
  g.add(disc);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.09, r * 0.09, r * 0.42, 6), MAT.steelDark);
    b.position.set(Math.cos(a) * r * 0.72, 0, Math.sin(a) * r * 0.72);
    g.add(b);
  }
  (parent || FACTORY).add(g);
  return g;
}

/* 人孔 / 视镜 */
function sightGlass(x, y, z, r, parent, glow) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.14, 10, 26), MAT.steel);
  g.add(ring);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(r * 0.94, 26),
    glow ? MAT.amberLamp : MAT.glass);
  lens.position.z = 0.004;
  g.add(lens);
  (parent || FACTORY).add(g);
  return g;
}

/* 支腿 */
function legs(group, r, h, count, y0, inset) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.PI / count;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.045, r * 0.045, h, 8), MAT.steelDark);
    leg.position.set(Math.cos(a) * inset, y0 + h / 2, Math.sin(a) * inset);
    leg.castShadow = true;
    group.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.10, r * 0.11, 0.05, 10), MAT.paint);
    foot.position.set(Math.cos(a) * inset, y0 + 0.025, Math.sin(a) * inset);
    group.add(foot);
  }
}

/* 仪表盘 */
function gaugeTex() {
  const { c, g } = make2D(128, 128);
  g.fillStyle = '#0b1517'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  g.strokeStyle = '#7fb4b4'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.stroke();
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    g.strokeStyle = i > 7 ? '#ff6b4a' : '#9fd6d0';
    g.lineWidth = i % 5 === 0 ? 3 : 1.5;
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44);
    g.lineTo(64 + Math.cos(a) * 53, 64 + Math.sin(a) * 53);
    g.stroke();
  }
  g.strokeStyle = '#ffb02e'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(64, 64);
  g.lineTo(64 + Math.cos(-Math.PI * 0.22) * 42, 64 + Math.sin(-Math.PI * 0.22) * 42);
  g.stroke();
  g.fillStyle = '#ffb02e'; g.beginPath(); g.arc(64, 64, 4, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}
const GAUGE_TEX = gaugeTex();
function gauge(x, y, z, s, faceZ) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(0.13 * s, 24),
    new THREE.MeshBasicMaterial({ map: GAUGE_TEX, transparent: true })
  );
  m.position.set(x, y, z);
  if (faceZ !== false) m.rotation.y = 0;
  FACTORY.add(m);
  return m;
}

/* =========================================================
   01 · 原料仓 + 发芽鼓
   ========================================================= */
(function silos() {
  const g = new THREE.Group();
  g.position.set(-10.2, 0, -0.3);
  FACTORY.add(g);

  function oneSilo(dx, dz, h, r) {
    const s = new THREE.Group();
    s.position.set(dx, 0, dz);
    /* 锥底 + 筒身 + 穹顶，一次车削成形 */
    const body = new THREE.Mesh(latheGeo([
      [0.06, 0.62], [r * 0.30, 0.70], [r, 1.55], [r, h - 0.55],
      [r * 0.98, h - 0.28], [r * 0.80, h - 0.10], [r * 0.44, h],
      [0.22, h + 0.06], [0.06, h + 0.07]
    ], 44), MAT.steelBody);
    body.castShadow = true; body.receiveShadow = true;
    s.add(body);

    /* 加强环 */
    for (let i = 0; i < 4; i++) {
      const y = 1.7 + i * (h - 2.4) / 3.4;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.012, 0.022, 8, 40), MAT.steel);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      s.add(ring);
    }
    /* 顶部进料管 + 除尘器 */
    pipe([[0, h + 0.07, 0], [0, h + 0.55, 0], [-0.45, h + 0.72, 0.3]], 0.055, MAT.steel, s);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.14, 14), MAT.steelDark);
    cap.position.set(0, h + 0.62, 0);
    s.add(cap);

    /* 支腿 */
    legs(s, r, 1.62, 4, 0, r * 0.92);
    /* 锥底卸料管 */
    pipe([[0, 0.62, 0], [0, 0.30, 0], [0, 0.22, 0.35]], 0.05, MAT.steel, s);

    /* 侧梯 */
    for (let i = 0; i < 14; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.022, 0.03), MAT.steelDark);
      st.position.set(r * 0.55, 0.75 + i * 0.28, r * 0.95);
      s.add(st);
    }
    const rail1 = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 3.9, 6), MAT.steelDark);
    rail1.position.set(r * 0.55, 2.6, r * 0.95 - 0.15);
    s.add(rail1);
    const rail2 = rail1.clone(); rail2.position.z = r * 0.95 + 0.15; s.add(rail2);

    g.add(s);
    return s;
  }
  oneSilo(-0.55, -1.25, 4.5, 0.72);
  oneSilo(0.95, 0.55, 3.9, 0.64);

  /* 发芽鼓：卧式转鼓，麦粒在里面翻滚 */
  const drum = new THREE.Group();
  drum.position.set(2.05, 1.32, 0.72);
  drum.rotation.z = Math.PI / 2;
  const drumBody = new THREE.Mesh(latheGeo([
    [0.02, -0.95], [0.52, -0.95], [0.56, -0.86], [0.56, 0.86], [0.52, 0.95], [0.02, 0.95]
  ], 36), MAT.steelBody);
  drumBody.castShadow = true;
  drum.add(drumBody);
  /* 齿圈 */
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.575, 0.035, 8, 36), MAT.steelDark);
  ring.rotation.x = Math.PI / 2; ring.rotation.z = 0;
  drum.add(ring);
  FACTORY.add(drum);

  /* 转鼓机架 */
  const frame = new THREE.Group();
  frame.position.set(2.05, 0, 0.72);
  for (const dz of [-0.55, 0.55]) {
    for (const dx of [-0.55, 0.55]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.10, 0.09), MAT.paint);
      p.position.set(dx, 0.55, dz);
      frame.add(p);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.07, 0.07), MAT.paint);
    cross.position.set(0, 1.06, dz);
    frame.add(cross);
  }
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 16), MAT.paintLite);
  motor.rotation.z = Math.PI / 2;
  motor.position.set(-0.95, 1.05, 0.72);
  frame.add(motor);
  FACTORY.add(frame);

  /* 麦芽输送斜管：从转鼓到粉碎机（世界坐标，故不挂父级） */
  pipe([[-8.10, 1.30, 0.35], [-7.70, 1.25, 0.10], [-7.05, 1.55, -0.35]], 0.070, MAT.steel);

  floorGlow(-9.9, -0.4, 3.8, 0xffa63a, 0.10);
})();

/* =========================================================
   02 · 焙烤炉
   教材：加热杀死种子胚，但不使淀粉酶失活。
   立式炉体 + 燃烧室 + 烟囱，与卧式发芽鼓形成明确区分。
   ========================================================= */
(function kiln() {
  const g = new THREE.Group();
  g.position.set(-7.05, 0, -0.60);
  FACTORY.add(g);

  const R = 0.50;
  /* 燃烧室 */
  const fire = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.50, 0.78), MAT.paint);
  fire.position.y = 0.25;
  fire.castShadow = true;
  g.add(fire);
  /* 炉门：一条橙红的光缝 */
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.26, 0.05), MAT.steelDark);
  doorFrame.position.set(0, 0.25, 0.40);
  g.add(doorFrame);
  const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.16), MAT.amberLamp);
  doorGlow.position.set(0, 0.25, 0.428);
  g.add(doorGlow);

  /* 炉体 */
  const body = new THREE.Mesh(latheGeo([
    [0.05, 0.50], [R * 0.70, 0.52], [R, 0.78], [R, 1.98],
    [R * 0.96, 2.14], [R * 0.70, 2.34], [R * 0.34, 2.46], [0.14, 2.50], [0.05, 2.50]
  ], 40), MAT.steelBody);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  for (const y of [0.86, 1.40, 1.92]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.012, 0.024, 8, 40), MAT.steel);
    ring.rotation.x = Math.PI / 2; ring.position.y = y;
    g.add(ring);
  }

  /* 烟囱 */
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 1.00, 16), MAT.steelDark);
  stack.position.y = 3.00;
  g.add(stack);
  const stackCap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.07, 16), MAT.steel);
  stackCap.position.y = 3.52;
  g.add(stackCap);

  /* 温度表 */
  const gg = new THREE.Mesh(new THREE.CircleGeometry(0.10, 20),
    new THREE.MeshBasicMaterial({ map: GAUGE_TEX, transparent: true }));
  gg.position.set(0.26, 1.62, R * 0.96);
  g.add(gg);

  /* 支腿 */
  legs(g, R, 0.05, 4, 0, R * 0.95);

  /* 出料滑管 */
  pipe([[0.30, 0.60, 0.00], [0.72, 0.50, 0.28], [1.05, 0.80, 0.30]], 0.05, MAT.steel, g);

  floorGlow(-7.05, -0.60, 2.6, 0xff7a12, 0.22);
  const pl = new THREE.PointLight(0xff7412, 0.9, 2.6, 2);
  pl.position.set(0, 0.30, 0.55);
  g.add(pl);
})();

/* =========================================================
   03 · 碾磨机
   ========================================================= */
(function mill() {
  const g = new THREE.Group();
  g.position.set(-5.95, 0, 0.15);
  FACTORY.add(g);

  /* 料斗 */
  const hopper = new THREE.Mesh(latheGeo([
    [0.05, 1.62], [0.62, 1.62], [0.34, 2.24], [0.30, 2.30], [0.05, 2.30]
  ], 4, Math.PI / 4, Math.PI * 2), MAT.steelBody);
  hopper.castShadow = true;
  g.add(hopper);
  /* 料斗上的麦芽面 */
  const heap = new THREE.Mesh(new THREE.ConeGeometry(0.30, 0.10, 4, 1, true), MAT.brass);
  heap.rotation.y = Math.PI / 4;
  heap.position.y = 2.28;
  g.add(heap);

  /* 机壳 */
  const casing = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.62, 0.62), MAT.paint);
  casing.position.y = 1.32;
  casing.castShadow = true;
  g.add(casing);
  const casingTrim = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.06, 0.64), MAT.steel);
  casingTrim.position.y = 1.60;
  g.add(casingTrim);

  /* 轧辊轴 */
  for (const dz of [-0.22, 0.22]) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.78, 18), MAT.steel);
    roller.rotation.z = Math.PI / 2;
    roller.position.set(0, 1.28, dz);
    g.add(roller);
  }
  /* 皮带轮 */
  const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.07, 18), MAT.steelDark);
  pulley.rotation.z = Math.PI / 2;
  pulley.position.set(0.47, 1.28, -0.30);
  g.add(pulley);

  /* 支腿 */
  for (const dx of [-0.34, 0.34]) {
    for (const dz of [-0.24, 0.24]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.02, 0.08), MAT.paint);
      p.position.set(dx, 0.51, dz);
      g.add(p);
    }
  }
  /* 出料管 */
  pipe([[0, 1.00, 0], [0.10, 0.72, 0.05], [0.35, 0.55, 0.20]], 0.055, MAT.steel, g);

  floorGlow(-5.95, 0.2, 2.2, 0xffa63a, 0.06);
})();

/* =========================================================
   04 · 糖化锅（铜）
   ========================================================= */
(function mashTun() {
  const g = new THREE.Group();
  g.position.set(-4.25, 0, -0.15);
  FACTORY.add(g);

  const R = 1.02;
  /* 铜制锅体：宽浅，带穹顶 */
  const body = new THREE.Mesh(latheGeo([
    [0.05, 0.30], [R * 0.55, 0.34], [R, 0.72], [R, 1.52],
    [R * 0.97, 1.70], [R * 0.84, 1.90], [R * 0.58, 2.04],
    [R * 0.28, 2.10], [0.05, 2.11]
  ], 48), MAT.copperBody);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  /* 铜箍 */
  for (const y of [0.80, 1.30, 1.62]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.014, 0.026, 8, 48), MAT.brass);
    ring.rotation.x = Math.PI / 2; ring.position.y = y;
    g.add(ring);
  }

  /* 大观察窗：琥珀色液面在里面 */
  const win = sightGlass(0, 1.16, R * 0.985, 0.30, g, false);
  win.rotation.x = 0;
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.27, 26), MAT.wort);
  inner.position.set(0, 1.16, R * 0.96);
  g.add(inner);

  /* 顶部搅拌驱动 + 电机 */
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.30, 16), MAT.paintLite);
  motor.position.y = 2.26;
  g.add(motor);
  const motorCap = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.10, 14), MAT.steel);
  motorCap.position.y = 2.46;
  g.add(motorCap);

  /* 进料管 */
  pipe([[-0.55, 1.95, -0.35], [-0.55, 2.55, -0.35], [-0.20, 2.62, -0.30], [0.02, 2.35, -0.10]], 0.06, MAT.steel, g);

  legs(g, R, 0.34, 6, 0, R * 0.86);

  /* 蒸汽夹套接口 */
  const j1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 10), MAT.steelDark);
  j1.rotation.z = Math.PI / 2;
  j1.position.set(-R - 0.08, 1.20, 0);
  g.add(j1);

  vesselLiquid(g, 0.86, 0.42, 1.84, 3);
  floorGlow(-4.25, -0.15, 3.4, 0xff8f1f, 0.24);
  const pl = new THREE.PointLight(0xff8a12, 1.5, 4.2, 2);
  pl.position.set(0, 1.15, 1.1);
  g.add(pl);
})();

/* 耙臂引用，30-fx 里转动 */
let RAKE_ARM = null;

/* =========================================================
   05 · 过滤槽
   ========================================================= */
(function lauter() {
  const g = new THREE.Group();
  g.position.set(-2.30, 0, 0.55);
  FACTORY.add(g);

  const R = 1.10;
  const body = new THREE.Mesh(latheGeo([
    [0.05, 0.34], [R * 0.62, 0.36], [R, 0.66], [R, 1.06],
    [R * 0.96, 1.14], [R * 0.80, 1.20], [0.05, 1.21]
  ], 48), MAT.steelBody);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  /* 敞口：只留一圈钢边，让耙臂露出来（加玻璃盖会变成一面白镜） */
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.90, 0.035, 8, 48), MAT.steel);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.19;
  g.add(rim);

  /* 槽内麦汁液位 */
  vesselLiquid(g, R * 0.88, 0.48, 0.98, 3);

  /* 耙臂（玻璃盖下可见） */
  const rake = new THREE.Group();
  rake.position.y = 1.04;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12), MAT.steelDark);
  rake.add(hub);
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(R * 0.78, 0.035, 0.05), MAT.steelDark);
    arm.position.x = R * 0.40;
    const holder = new THREE.Group();
    holder.rotation.y = (i / 3) * Math.PI * 2;
    holder.add(arm);
    rake.add(holder);
  }
  g.add(rake);
  RAKE_ARM = rake;

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 10), MAT.steel);
  shaft.position.y = 1.30;
  g.add(shaft);
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.24, 14), MAT.paintLite);
  motor.position.y = 1.56;
  g.add(motor);

  legs(g, R, 0.35, 6, 0, R * 0.90);

  /* 麦汁出口 */
  pipe([[R * 0.7, 0.42, 0], [R + 0.35, 0.36, 0.10], [R + 0.55, 0.75, 0.12]], 0.045, MAT.steel, g);

  floorGlow(-2.30, 0.55, 2.8, 0xffa63a, 0.10);
})();

/* =========================================================
   06 · 煮沸锅
   ========================================================= */
(function kettle() {
  const g = new THREE.Group();
  g.position.set(-0.45, 0, -0.30);
  FACTORY.add(g);

  const R = 0.92;
  const body = new THREE.Mesh(latheGeo([
    [0.05, 0.26], [R * 0.60, 0.28], [R, 0.62], [R, 2.28],
    [R * 0.97, 2.48], [R * 0.86, 2.66], [R * 0.52, 2.78],
    [0.05, 2.80]
  ], 48), MAT.steelBody);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  /* 铜色腰线 */
  const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.008, 0.05, 10, 48), MAT.copper);
  band.rotation.x = Math.PI / 2; band.position.y = 2.10;
  g.add(band);
  for (const y of [0.70, 1.45]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.012, 0.024, 8, 48), MAT.steel);
    ring.rotation.x = Math.PI / 2; ring.position.y = y;
    g.add(ring);
  }

  /* 视镜 + 液位 */
  sightGlass(0, 1.55, R * 0.99, 0.22, g, false);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.20, 22), MAT.wort);
  inner.position.set(0, 1.55, R * 0.965);
  g.add(inner);

  /* 排气筒 */
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.22, 0.52, 18), MAT.steelDark);
  stack.position.y = 3.02;
  g.add(stack);
  const stackLip = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.02, 8, 20), MAT.steel);
  stackLip.rotation.x = Math.PI / 2; stackLip.position.y = 3.28;
  g.add(stackLip);

  /* 酒花添加口 */
  const hop = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.16, 12), MAT.brass);
  hop.position.set(0.42, 2.86, 0.30);
  g.add(hop);

  vesselLiquid(g, R * 0.80, 0.40, 2.42, 4);

  legs(g, R, 0.27, 6, 0, R * 0.88);

  /* 加热蒸汽管 */
  pipe([[-R - 0.05, 0.55, 0], [-R - 0.45, 0.55, 0.25], [-R - 0.45, 1.55, 0.25]], 0.055, MAT.steel, g);

  floorGlow(-0.45, -0.30, 3.2, 0xff7a12, 0.30);
  const pl = new THREE.PointLight(0xff7d16, 1.2, 3.8, 2);
  pl.position.set(0, 1.6, 0.9);
  g.add(pl);
})();

/* =========================================================
   07 · 回旋沉淀槽 + 板式换热器
   ========================================================= */
(function whirlpool() {
  const g = new THREE.Group();
  g.position.set(1.20, 0, 0.45);
  FACTORY.add(g);

  const R = 1.12;
  const body = new THREE.Mesh(latheGeo([
    [0.05, 0.45], [R * 0.70, 0.47], [R, 0.78], [R, 0.98],
    [R * 0.95, 1.04], [R * 0.72, 1.08], [0.05, 1.09]
  ], 48), MAT.steelBody);
  body.castShadow = true;
  g.add(body);

  /* 切向进料管——回旋沉淀的关键结构 */
  pipe([[R + 0.55, 1.20, -0.30], [R + 0.20, 1.05, -0.15], [R * 0.92, 0.95, 0.10], [R * 0.86, 0.95, 0.55]], 0.055, MAT.steel, g);

  vesselLiquid(g, R * 0.92, 0.55, 1.00, 5);

  legs(g, R, 0.46, 6, 0, R * 0.92);
  floorGlow(1.20, 0.45, 2.6, 0xffa63a, 0.10);

  /* 板式换热器 */
  const hx = new THREE.Group();
  hx.position.set(1.92, 0, -0.95);
  FACTORY.add(hx);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.55, 0.62), MAT.steelDark);
  frame.position.y = 0.86;
  hx.add(frame);
  /* 板片堆：一排竖直薄板 */
  for (let i = 0; i < 16; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.26, 0.50), i % 2 ? MAT.steel : MAT.steelBody);
    p.position.set(-0.28 + i * 0.037, 0.92, 0);
    hx.add(p);
  }
  /* 压紧螺杆 */
  for (const dz of [-0.34, 0.34]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.5, 8), MAT.steel);
    rod.position.set(0, 0.92, dz);
    hx.add(rod);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.10, 0.70), MAT.paint);
  base.position.y = 0.05;
  hx.add(base);
})();

/* =========================================================
   07 · 发酵罐（可剖切）+ 酵母扩培罐
   ========================================================= */
const FERMENTERS = [];

function buildFermenter(x, z, scale, hero) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const s = scale || 1;
  g.scale.setScalar(s);
  FACTORY.add(g);

  const R = 0.60;
  const pts = [
    [0.05, 0.90], [0.14, 0.86], [R * 0.70, 0.34], [R, 0.02], [R, 0.04],
    [R, 2.56], [R * 0.98, 2.74], [R * 0.88, 2.94], [R * 0.62, 3.08],
    [R * 0.30, 3.14], [0.05, 3.16]
  ];
  /* 修正：从锥底尖到罐顶，半径单调合理 */
  const profile = [
    [0.06, 0.00], [0.12, 0.06], [R * 0.55, 0.55], [R * 0.92, 0.92],
    [R, 1.00], [R, 2.56], [R * 0.985, 2.74], [R * 0.90, 2.94],
    [R * 0.66, 3.07], [R * 0.32, 3.14], [0.06, 3.16]
  ];

  /* 前后两半：剖切时藏掉前半 */
  const matBack = MAT.steelBody;
  const back = new THREE.Mesh(latheGeo(profile, 48, Math.PI * 0.5, Math.PI), matBack);
  const front = new THREE.Mesh(latheGeo(profile, 48, -Math.PI * 0.5, Math.PI), matBack);
  back.castShadow = true; front.castShadow = true;
  back.receiveShadow = true; front.receiveShadow = true;
  g.add(back); g.add(front);

  /* 冷却夹套：三段青色环带 */
  const jackets = [];
  for (let i = 0; i < 3; i++) {
    const y = 1.15 + i * 0.52;
    const j = new THREE.Mesh(new THREE.TorusGeometry(R * 1.005, 0.030, 8, 44), MAT.teal);
    j.rotation.x = Math.PI / 2;
    j.position.y = y;
    g.add(j); jackets.push(j);
  }

  /* 顶部锥形封头：同样切前后两半，否则剖开后上面盖着一顶帽子 */
  const conePts = [[0.06, 3.16], [R * 0.30, 3.20], [R * 0.42, 3.30], [0.10, 3.34]];
  const coneBack = new THREE.Mesh(latheGeo(conePts, 44, Math.PI * 0.5, Math.PI), MAT.steelBody);
  const coneFront = new THREE.Mesh(latheGeo(conePts, 44, -Math.PI * 0.5, Math.PI), MAT.steelBody);
  coneBack.castShadow = true; coneFront.castShadow = true;
  g.add(coneBack); g.add(coneFront);

  const manway = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.10, 18), MAT.steel);
  manway.position.y = 3.38;
  g.add(manway);

  pipe([[0.0, 3.36, 0], [0.0, 3.72, 0], [0.22, 3.88, 0.10]], 0.035, MAT.steel, g);

  /* 支腿 + 裙座 */
  legs(g, R, 1.02, 4, 0, R * 0.86);

  /* 侧视镜与取样阀挂在"前半壳"上：剖切时一起收掉，
     否则会留下悬空的金属环和小圆点浮在液面上 */
  const frontParts = new THREE.Group();
  g.add(frontParts);
  sightGlass(0, 1.40, R * 0.995, 0.13, frontParts, false);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10), MAT.brass);
  valve.rotation.x = Math.PI / 2;
  valve.position.set(0, 0.95, R * 0.95);
  frontParts.add(valve);

  /* 内部：液体 / 气泡 / 酵母 */
  const liquidH = 1.62;
  const liquid = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.955, R * 0.955, liquidH, 40, 1, false),
    MAT.beer
  );
  liquid.position.y = 1.02 + liquidH / 2;
  liquid.visible = false;
  liquid.renderOrder = -1;
  g.add(liquid);
  VESSELS.push({ mesh: liquid, baseY: 1.02, full: liquidH, station: 7, hero: !!hero });

  /* 锥底积液 */
  const coneLiq = new THREE.Mesh(latheGeo([
    [0.06, 0.10], [0.30, 0.32], [R * 0.62, 0.68], [R * 0.93, 0.99], [R * 0.93, 1.02]
  ], 40), MAT.beer);
  coneLiq.visible = false;
  coneLiq.renderOrder = -1;
  g.add(coneLiq);

  /* 只有会被剖开的教学罐才需要内部光源；其余罐体的光完全被罐壁挡住 */
  let innerLight = null;
  if (hero) {
    innerLight = new THREE.PointLight(0xffb35a, 0, 3.0, 2);
    innerLight.position.y = 1.7;
    g.add(innerLight);
  }

  const rec = {
    group: g, x: x, z: z, scale: s, R: R,
    front: front, back: back, coneFront: coneFront, coneBack: coneBack, frontParts: frontParts,
    liquid: liquid, coneLiq: coneLiq,
    jackets: jackets, light: innerLight, hero: !!hero,
    liquidH: liquidH, cut: false
  };
  FERMENTERS.push(rec);
  floorGlow(x, z, 2.4 * s, 0xff9414, 0.26);
  return rec;
}

/* 三只主发酵罐 + 一只酵母扩培罐 */
buildFermenter(3.60, -0.55, 1.00, false);
buildFermenter(4.70, -0.55, 1.00, true);
buildFermenter(5.80, -0.55, 1.00, false);
buildFermenter(2.55, 1.42, 0.46, false);

/* 发酵罐之间的连通管 */
pipe([[3.60, 3.55, -0.55], [4.70, 3.62, -0.55], [5.80, 3.55, -0.55]], 0.05, MAT.steel);
pipe([[3.60, 3.55, -0.55], [3.60, 4.05, -0.55], [2.20, 4.10, -0.30], [1.20, 3.60, 0.10]], 0.048, MAT.steel);

/* =========================================================
   08 · 贮酒罐（卧式）
   ========================================================= */
(function brightTanks() {
  const g = new THREE.Group();
  g.position.set(7.10, 0, -0.45);
  FACTORY.add(g);

  function tank(dz, len, r) {
    const t = new THREE.Group();
    t.position.set(0, 0, dz);
    t.rotation.z = Math.PI / 2;
    const body = new THREE.Mesh(latheGeo([
      [0.03, -len / 2], [r * 0.55, -len / 2 - 0.02], [r * 0.92, -len / 2 + 0.12],
      [r, -len / 2 + 0.30], [r, len / 2 - 0.30], [r * 0.92, len / 2 - 0.12],
      [r * 0.55, len / 2 + 0.02], [0.03, len / 2]
    ], 40), MAT.steelBody);
    body.castShadow = true; body.receiveShadow = true;
    t.add(body);
    g.add(t);
    return t;
  }
  tank(-0.75, 1.9, 0.50);
  tank(0.55, 1.9, 0.50);

  /* 鞍座 */
  for (const dz of [-0.75, 0.55]) {
    for (const dx of [-0.55, 0.55]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.62), MAT.paint);
      s.position.set(dx, 0.31, dz);
      g.add(s);
    }
  }
  /* 顶部连通管 */
  pipe([[-0.9, 1.05, -0.75], [0, 1.18, -0.10], [0.9, 1.05, 0.55]], 0.045, MAT.steel, g);

  /* 液位视镜 */
  for (const dz of [-0.75, 0.55]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.60), MAT.teal);
    w.position.set(0.05, 0.55, dz + 0.505);
    g.add(w);
  }
  floorGlow(7.10, -0.45, 3.0, 0x2fd7c0, 0.14);
})();

/* =========================================================
   09 · 灌装线
   ========================================================= */
const BOTTLES = [];
(function packaging() {
  const g = new THREE.Group();
  g.position.set(9.25, 0, 1.25);
  FACTORY.add(g);

  /* 输送带 */
  const belt = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.09, 0.62), MAT.rubber);
  belt.position.y = 0.72;
  belt.castShadow = true;
  g.add(belt);
  const railA = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 0.045), MAT.steel);
  railA.position.set(0, 0.80, 0.30); g.add(railA);
  const railB = railA.clone(); railB.position.z = -0.30; g.add(railB);

  /* 支腿 + 滚筒 */
  for (let i = 0; i < 9; i++) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.58, 10), MAT.steelDark);
    roller.rotation.x = Math.PI / 2;
    roller.position.set(-1.6 + i * 0.4, 0.70, 0);
    g.add(roller);
  }
  for (const dx of [-1.55, 1.55]) {
    for (const dz of [-0.26, 0.26]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.66, 0.07), MAT.paint);
      l.position.set(dx, 0.33, dz);
      g.add(l);
    }
  }
  /* 灌装机 */
  const filler = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.05, 0.78), MAT.paintLite);
  filler.position.set(-0.35, 1.30, 0);
  filler.castShadow = true;
  g.add(filler);
  const fillerHead = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.72), MAT.steel);
  fillerHead.position.set(-0.35, 1.92, 0);
  g.add(fillerHead);
  for (let i = 0; i < 4; i++) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.30, 8), MAT.brass);
    nozzle.position.set(-0.55 + i * 0.14, 1.70, 0);
    g.add(nozzle);
  }
  /* 贴标机 */
  const labeler = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.70), MAT.paintLite);
  labeler.position.set(1.05, 1.05, 0);
  g.add(labeler);
  /* 灯检箱 */
  const lightBox = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.40, 0.66), MAT.amberLamp);
  lightBox.position.set(1.55, 0.95, 0);
  g.add(lightBox);

  /* 瓶子：车削成形，沿带面排列 */
  const bottleProfile = [
    [0.002, 0.00], [0.048, 0.00], [0.052, 0.03], [0.052, 0.20],
    [0.048, 0.245], [0.028, 0.285], [0.024, 0.355], [0.030, 0.375], [0.024, 0.385], [0.002, 0.386]
  ];
  const bGeo = latheGeo(bottleProfile, 20);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x8a4a12, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.72,
    envMapIntensity: 2.0, side: THREE.DoubleSide
  });
  for (let i = 0; i < 13; i++) {
    const b = new THREE.Mesh(bGeo, glassMat);
    b.scale.setScalar(1.0);
    b.position.set(-1.62 + i * 0.26, 0.765, 0);
    b.castShadow = true;
    g.add(b);
    BOTTLES.push(b);
  }
  /* 成品托盘 */
  const pallet = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.7), MAT.steelDark);
  pallet.position.set(1.75, 0.06, 0.95);
  g.add(pallet);
  for (let i = 0; i < 12; i++) {
    const b = new THREE.Mesh(bGeo, glassMat);
    b.position.set(1.42 + (i % 4) * 0.17, 0.18 + Math.floor(i / 4) * 0.0, 0.78 + Math.floor(i / 4) * 0.14);
    g.add(b);
  }

  floorGlow(9.25, 1.25, 3.0, 0xffb02e, 0.18);
})();

/* =========================================================
   管道网络（把九个工段串成一条线）
   ========================================================= */
(function mainPipes() {
  const P = [
    [[-5.6, 0.95, 0.30], [-4.9, 0.85, 0.10], [-4.25, 1.95, -0.15]],
    [[-4.25, 1.35, 0.85], [-3.3, 1.15, 0.80], [-2.55, 0.85, 0.55]],
    [[-2.30, 0.75, 1.55], [-1.4, 0.70, 1.30], [-0.45, 1.35, 0.62]],
    [[-0.45, 2.30, 0.45], [0.35, 2.45, 0.55], [1.20, 1.05, 0.45]],
    [[1.98, 0.60, -0.60], [2.85, 0.95, -0.55], [3.60, 1.30, -0.55]],
    [[5.80, 1.30, -0.55], [6.45, 1.15, -0.40], [7.10, 0.90, -0.45]],
    [[7.10, 0.70, 0.10], [8.10, 0.75, 0.60], [9.25, 0.72, 0.95]]
  ];
  P.forEach(p => pipe(p, 0.058, MAT.steel));

  /* 管道支架 */
  for (const x of [-5.0, -3.0, -0.8, 2.0, 5.4, 8.2]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.05, 0.07), MAT.paint);
    st.position.set(x, 0.52, 1.05);
    FACTORY.add(st);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.10), MAT.steelDark);
    cap.position.set(x, 1.03, 1.05);
    FACTORY.add(cap);
  }

  /* 几处法兰，破掉管道的塑料感 */
  flange(-4.9, 0.86, 0.10, 0.10, [0, 0, Math.PI / 5]);
  flange(0.35, 2.45, 0.55, 0.10, [0, 0, Math.PI / 2]);
  flange(6.45, 1.15, -0.40, 0.10, [0, 0, Math.PI / 6]);
})();

/* =========================================================
   控制柜（对应教材：计算机控制系统监测温度、pH、溶氧）
   ========================================================= */
(function controlCabinet() {
  const g = new THREE.Group();
  g.position.set(2.15, 0, 2.45);
  g.rotation.y = -0.42;
  FACTORY.add(g);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.08, 0.42), MAT.paint);
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);

  const scr = make2D(512, 300);
  const gg = scr.g;
  gg.fillStyle = '#06181a'; gg.fillRect(0, 0, 512, 300);
  gg.strokeStyle = 'rgba(70,216,196,0.22)'; gg.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    gg.beginPath(); gg.moveTo(0, 40 + i * 44); gg.lineTo(512, 40 + i * 44); gg.stroke();
  }
  gg.strokeStyle = '#46d8c4'; gg.lineWidth = 3; gg.beginPath();
  gg.moveTo(24, 210);
  for (let i = 0; i < 22; i++) {
    gg.lineTo(24 + i * 22, 210 - Math.sin(i * 0.55) * 62 - i * 2.4);
  }
  gg.stroke();
  gg.strokeStyle = '#ffb02e'; gg.lineWidth = 2; gg.beginPath();
  gg.moveTo(24, 150);
  for (let i = 0; i < 22; i++) {
    gg.lineTo(24 + i * 22, 150 - Math.cos(i * 0.42) * 34 + i * 1.6);
  }
  gg.stroke();
  gg.fillStyle = '#9fe8dd'; gg.font = '20px "DIN Alternate",monospace';
  gg.fillText('TEMP 12.4C   pH 5.18   DO 6%', 24, 34);
  gg.fillStyle = 'rgba(70,216,196,0.55)'; gg.font = '15px monospace';
  gg.fillText('FERMENTATION  TANK 01-03', 24, 282);
  const tex = new THREE.CanvasTexture(scr.c);
  tex.encoding = THREE.sRGBEncoding;

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.42),
    new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.set(0, 0.85, 0.213);
  g.add(screen);

  const glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.80, 0.50),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.10, 0.55, 0.50), transparent: true, opacity: 0.30,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
  glowPlane.position.set(0, 0.85, 0.215);
  g.add(glowPlane);

  /* 支腿 */
  for (const dx of [-0.32, 0.32]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.07), MAT.steelDark);
    l.position.set(dx, 0.08, 0);
    g.add(l);
  }
  floorGlow(2.15, 2.45, 1.4, 0x2fd7c0, 0.10);
})();

/* =========================================================
   背景护栏（增加纵深，不抢主体）
   ========================================================= */
(function railing() {
  const g = new THREE.Group();
  g.position.set(0, 0, -3.45);
  FACTORY.add(g);
  const mat = new THREE.MeshStandardMaterial({ color: 0x9aa8ac, metalness: 1, roughness: 0.42 });
  for (let x = -10.2; x <= 10.2; x += 1.7) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.95, 8), mat);
    p.position.set(x, 0.475, 0);
    g.add(p);
  }
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 20.8, 10), mat);
  top.rotation.z = Math.PI / 2; top.position.y = 0.95;
  g.add(top);
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 20.8, 8), mat);
  mid.rotation.z = Math.PI / 2; mid.position.y = 0.52;
  g.add(mid);
})();

/* 让主光跟随场景中心，保证阴影覆盖整条产线 */
key.target.position.set(0, 1.2, 0);
key.shadow.camera.updateProjectionMatrix();

/* =========================================================
   前场道具：填掉台座左前方的空地，同时交代物料
   ========================================================= */
(function props() {
  const burlap = new THREE.MeshStandardMaterial({ color: 0x9c8862, roughness: 0.96, metalness: 0.0 });
  const burlapD = new THREE.MeshStandardMaterial({ color: 0x7a6847, roughness: 0.97, metalness: 0.0 });

  /* 麻袋：压扁的球，堆成金字塔 */
  const sackGeo = new THREE.SphereGeometry(0.30, 14, 10);
  function sack(x, y, z, rotY, mat) {
    const m = new THREE.Mesh(sackGeo, mat || burlap);
    m.position.set(x, y, z);
    m.scale.set(1.0, 0.62, 0.78);
    m.rotation.y = rotY;
    m.castShadow = true;
    m.receiveShadow = true;
    FACTORY.add(m);
    return m;
  }
  sack(-11.05, 0.19, 1.45, 0.3);
  sack(-10.55, 0.19, 1.68, -0.5, burlapD);
  sack(-10.80, 0.55, 1.54, 1.1);
  sack(-10.10, 0.19, 1.30, 0.9, burlapD);

  /* 木托盘 */
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b5233, roughness: 0.85 });
  const pallet = new THREE.Group();
  pallet.position.set(-9.30, 0, 2.05);
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.035, 0.11), wood);
    p.position.set(0, 0.11, -0.28 + i * 0.14);
    pallet.add(p);
  }
  for (const dx of [-0.4, 0, 0.4]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.72), wood);
    b.position.set(dx, 0.05, 0);
    pallet.add(b);
  }
  FACTORY.add(pallet);
  sack(-9.43, 0.24, 1.98, 0.2);
  sack(-9.17, 0.24, 2.12, -0.7, burlapD);
  sack(-9.30, 0.60, 2.05, 1.4);

  /* 成品木桶，放在灌装线一侧 */
  const kegMat = new THREE.MeshStandardMaterial({
    color: 0xa8b3b7, metalness: 1.0, roughness: 0.30, envMapIntensity: 0.9
  });
  function keg(x, z, r) {
    const g = new THREE.Group();
    g.position.set(x, 0.34, z);
    const body = new THREE.Mesh(latheGeo([
      [0.05, -0.34], [r * 0.86, -0.33], [r, -0.16], [r, 0.16], [r * 0.86, 0.33], [0.05, 0.34]
    ], 28), kegMat);
    body.castShadow = true;
    g.add(body);
    for (const y of [-0.20, 0.20]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.99, 0.018, 8, 28), MAT.steelDark);
      ring.rotation.x = Math.PI / 2; ring.position.y = y;
      g.add(ring);
    }
    FACTORY.add(g);
  }
  keg(10.35, -0.55, 0.28);
  keg(9.75, -0.75, 0.26);
  keg(10.10, 0.05, 0.25);

  /* 地面导向线：让“由左到右”的流程方向可读 */
  const lineMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.42, 0.20, 0.03), transparent: true, opacity: 0.75, fog: false
  });
  for (const z of [0, 2.45]) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(20.6, 0.035), lineMat);
    l.rotation.x = -Math.PI / 2;
    l.position.set(0, 0.02, z);
    FACTORY.add(l);
  }
})();

/* =========================================================
   后方高架管廊
   工业车间的典型结构：主管沿产线架高，A 形支架落地。
   放在 z 后方，只为补纵深，不遮挡任何设备。
   ========================================================= */
(function pipeRack() {
  const Z = -2.55;
  const rackMat = new THREE.MeshStandardMaterial({
    color: 0x93a1a6, metalness: 1.0, roughness: 0.42, envMapIntensity: 0.85
  });

  /* A 形支架 */
  for (const x of [-6.4, -2.2, 2.4, 6.6]) {
    for (const dz of [-0.42, 0.42]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.085, 4.35, 0.085), MAT.paint);
      leg.position.set(x + dz * 0.30, 2.17, Z + dz);
      FACTORY.add(leg);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 1.30), MAT.paint);
    beam.position.set(x, 4.28, Z);
    FACTORY.add(beam);
    for (const dz of [-0.30, 0.30]) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.95), MAT.paint);
      cross.position.set(x, 3.35, Z + dz * 0.35);
      cross.rotation.x = dz > 0 ? 0.55 : -0.55;
      FACTORY.add(cross);
    }
  }

  /* 三根主管 */
  const specs = [
    { y: 4.06, r: 0.085, z: Z - 0.22, mat: rackMat },
    { y: 4.06, r: 0.055, z: Z + 0.20, mat: rackMat },
    { y: 3.72, r: 0.070, z: Z + 0.02, mat: MAT.copper }
  ];
  specs.forEach(function (sp) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(sp.r, sp.r, 20.2, 14), sp.mat);
    p.rotation.z = Math.PI / 2;
    p.position.set(0, sp.y, sp.z);
    p.castShadow = true;
    FACTORY.add(p);
    /* 沿线的法兰 */
    for (let x = -8.4; x <= 8.6; x += 2.4) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(sp.r * 1.42, sp.r * 1.42, 0.05, 14), MAT.steelDark);
      f.rotation.z = Math.PI / 2;
      f.position.set(x, sp.y, sp.z);
      FACTORY.add(f);
    }
  });

  /* 从主管下到设备的几根支管 */
  const drops = [
    [-4.25, 3.98, -2.33, 2.30, -1.10],
    [1.20, 3.98, -2.33, 1.45, -0.40],
    [3.60, 3.98, -2.33, 3.85, -0.95],
    [7.10, 3.98, -2.33, 7.15, -1.10]
  ];
  drops.forEach(function (d) {
    pipe([[d[0], d[1], d[2]], [d[0], d[1] - 0.55, d[2] + 0.30], [d[3], d[4], d[5]]], 0.045, MAT.steel);
  });
})();
