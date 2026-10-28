/* =========================================================
   50 · 交互层
   ========================================================= */
'use strict';

const $ = function (s, r) { return (r || document).querySelector(s); };
const $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

const State = {
  idx: 0,
  playing: false,
  view: 'stage',
  cellMode: false,
  autoT: 0,
  time: 0
};

/* 各工段的产线读数：温度 / 糖度 / 酒精度 / pH */
const PROC = [
  { t: 18, s: null, a: 0.0, p: null },   /* 01 发芽 */
  { t: 95, s: null, a: 0.0, p: null },   /* 02 焙烤 */
  { t: 22, s: null, a: 0.0, p: null },   /* 03 碾磨 */
  { t: 65, s: 14.0, a: 0.0, p: 5.5 },    /* 04 糖化 */
  { t: 100, s: 13.2, a: 0.0, p: 5.1 },   /* 05 蒸煮 */
  { t: 12, s: 13.0, a: 0.0, p: 5.2 },    /* 06 冷却 */
  { t: 12, s: 13.0, a: 0.1, p: 5.2 },    /* 07 接种 */
  { t: 12, s: 8.4, a: 2.6, p: 4.6 },     /* 08 主发酵 */
  { t: 2, s: 2.3, a: 5.1, p: 4.3 },      /* 09 后发酵 */
  { t: 3, s: 2.2, a: 5.2, p: 4.3 }       /* 10 灌装 */
];

/* 每个工段对应的知识入口 */
const LINK = ['cell', 'cell', 'cell', 'cell', 'engine', 'cell', 'engine', 'cell', 'cell', 'engine'];

/* 标注锚点高度 */
const LABEL_Y = [5.35, 3.90, 2.85, 2.60, 3.75, 1.55, 2.20, 4.25, 1.62, 1.75];

/* ---------------------------------------------------------
   时间轴
   --------------------------------------------------------- */
(function buildTimeline() {
  const track = $('#tlTrack');
  track.innerHTML = '<div class="tl-line"></div><div class="tl-fill" id="tlFill"></div>';
  STATIONS.forEach(function (st, i) {
    const b = document.createElement('button');
    b.className = 'tl-node' + (i === 0 ? ' on' : '');
    b.dataset.i = i;
    b.innerHTML = '<span class="no">' + st.no + '</span><span class="dot"></span><span class="nm">' + st.name.replace(' · ', '·') + '</span>';
    b.addEventListener('click', function () { goTo(i); });
    track.appendChild(b);
  });
})();

/* ---------------------------------------------------------
   3D 标注
   --------------------------------------------------------- */
const LABELS = [];
(function buildLabels() {
  const box = $('#labels');
  STATIONS.forEach(function (st, i) {
    const el = document.createElement('button');
    el.className = 'lab';
    el.innerHTML = '<i>' + st.no + '</i><span>' + st.name.replace(' · ', '·') + '</span>';
    el.style.pointerEvents = 'auto';
    el.addEventListener('click', function () { goTo(i); });
    box.appendChild(el);
    LABELS.push({ el: el, x: st.x, y: LABEL_Y[i], z: 0 });
  });
})();

const _v = new THREE.Vector3();
function updateLabels() {
  const w = glCanvas.clientWidth, h = glCanvas.clientHeight;
  const overview = Orbit.dist > 16.5;
  for (let i = 0; i < LABELS.length; i++) {
    const L = LABELS[i];
    _v.set(L.x, L.y, L.z);
    _v.project(camera);
    const px = (_v.x * 0.5 + 0.5) * w;
    const py = (-_v.y * 0.5 + 0.5) * h;
    const outside = _v.z >= 1 || px < -70 || px > w + 70 || py < 42 || py > h - 16;

    if (outside) {
      if (L.shown !== false) { L.el.style.display = 'none'; L.shown = false; }
      continue;
    }
    if (L.shown !== true) { L.el.style.display = ''; L.shown = true; }

    /* 只在整数像素变化时写样式；用 transform 而非 left/top，不触发重排 */
    const rx = Math.round(px), ry = Math.round(py);
    if (rx !== L.lx || ry !== L.ly) {
      L.lx = rx; L.ly = ry;
      L.el.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0) translate(-50%,-100%)';
    }
    const d = Math.abs(i - State.idx);
    const wantOn = (i === State.idx) && !overview;
    const wantDim = d > 2 || (overview && i === State.idx);
    if (L.wasOn !== wantOn) { L.el.classList.toggle('on', wantOn); L.wasOn = wantOn; }
    if (L.wasDim !== wantDim) { L.el.classList.toggle('dim', wantDim); L.wasDim = wantDim; }
  }
}
function relayoutLabels() { updateLabels(); }

/* ---------------------------------------------------------
   HUD
   --------------------------------------------------------- */
function buildHUD() {
  $('#hudRow').innerHTML =
    cell('温度', 't', '℃', 0, 100) +
    cell('糖度', 's', '°P', 0, 16) +
    cell('酒精度', 'a', '%vol', 0, 6) +
    cell('pH', 'p', '', 0, 7);
  function cell(name, k, unit, mn, mx) {
    return '<div class="hcell" data-k="' + k + '">' +
      '<div class="hv"><span class="vn">—</span><small>' + unit + '</small></div>' +
      '<div class="hl">' + name + '</div>' +
      '<div class="hbar"><i style="width:0"></i></div></div>';
  }
}
function updateHUD() {
  const p = PROC[State.idx];
  const map = { t: p.t, s: p.s, a: p.a, p: p.p };
  const max = { t: 100, s: 16, a: 6, p: 7 };
  const col = {
    t: p.t > 90 ? '#ff5f4d' : (p.t > 40 ? '#ffb02e' : '#46d8c4'),
    s: '#ffb02e', a: '#ffb02e', p: '#46d8c4'
  };
  $$('#hudRow .hcell').forEach(function (el) {
    const k = el.dataset.k;
    const v = map[k];
    const vn = el.querySelector('.vn');
    const bar = el.querySelector('.hbar i');
    if (v === null || v === undefined) {
      vn.textContent = '—';
      bar.style.width = '0%';
    } else {
      vn.textContent = (k === 'a' || k === 'p') ? v.toFixed(1) : String(Math.round(v * 10) / 10);
      bar.style.width = clamp(v / max[k] * 100, 2, 100) + '%';
      bar.style.background = col[k];
    }
  });
}

/* ---------------------------------------------------------
   知识面板
   --------------------------------------------------------- */
const BOOK_ICON = '<svg viewBox="0 0 24 24"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14v16h4.5A1.5 1.5 0 0 0 20 18.5z"/></svg>';

function renderPanel() {
  const st = STATIONS[State.idx];
  const isTank = State.idx === 7;
  const target = LINK[State.idx];
  let html = '';
  html += '<div class="p-head"><span class="p-no">SECTION ' + st.no + '</span><span class="p-en">' + st.en + '</span></div>';
  html += '<div class="p-name">' + st.name + '</div>';
  html += '<div class="p-tag">' + st.tag + '</div>';
  const chParts = st.change.split('→');
  const chHtml = chParts.length > 1
    ? '<span>' + chParts[0].trim() + '</span><span class="arrow">→</span><span>' + chParts[1].trim() + '</span>'
    : '<span>' + st.change + '</span>';
  html += '<div class="p-change">' + chHtml + '</div>';
  html += '<ul class="p-bullets">' + st.bullets.map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul>';
  if (st.eq) html += '<div class="p-eq">' + st.eq + '</div>';
  html += '<div class="p-key"><span>要点</span>' + st.key + '</div>';
  if (st.note) html += '<div class="p-note"><span>注意</span> ' + st.note + '</div>';
  html += '<div class="p-book">' + BOOK_ICON + '<span>' + st.book + '</span></div>';
  html += '<div class="p-actions">';
  if (isTank) {
    html += '<button class="p-btn primary" data-act="cellmode">' + (State.cellMode ? '退出分子视角' : '进入发酵罐剖视') + '</button>';
  }
  html += '<button class="p-btn" data-act="know">' + (target === 'cell' ? '细胞呼吸' : '发酵工程') + '</button>';
  html += '</div>';
  $('#panelInner').innerHTML = html;

  $$('#panelInner [data-act]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.act === 'cellmode') toggleCellMode();
      else openOverlay(target);
    });
  });
}

/* ---------------------------------------------------------
   工段切换
   --------------------------------------------------------- */
const AZ_BY = [0.72, 0.62, 0.56, 0.50, 0.44, 0.56, 0.40, 0.32, 0.60, 0.50];
const DIST_BY = [10.2, 6.2, 6.0, 8.9, 7.8, 7.7, 5.6, 10.8, 7.0, 7.7];

function stationView(i) {
  const st = STATIONS[i];
  return { tx: st.x, ty: 1.55, tz: 0, az: AZ_BY[i], pol: 1.16, dist: DIST_BY[i] };
}

function goTo(i, opts) {
  opts = opts || {};
  i = clamp(i, 0, STATIONS.length - 1);
  /* 运行中手动跳站：让批次也跟着跳，不要停 */
  if (RUN.on && !opts.fromRun) { runSeek(i); return; }
  if (i === State.idx && !opts.force) { renderPanel(); updateHUD(); return; }

  State.idx = i;
  if (State.cellMode && i !== 7) setCellMode(false);

  flyTo(opts.overview ? VIEWS.overview : stationView(i));

  $$('.tl-node').forEach(function (n, k) {
    n.classList.toggle('on', k === i);
    n.classList.toggle('done', k < i);
  });
  const fill = $('#tlFill');
  if (fill) fill.style.width = (i / (STATIONS.length - 1) * 100) + '%';
  $('#tlNow').textContent = STATIONS[i].no;
  const tot = document.querySelector('.tl-count span');
  if (tot) tot.textContent = '/ ' + (STATIONS.length < 10 ? '0' : '') + STATIONS.length;

  /* 顶部信息带 */
  $('#stNo').textContent = STATIONS[i].no;
  $('#stName').textContent = STATIONS[i].name;
  $('#stLead').textContent = STATIONS[i].lead;
  $('#stChip').textContent = STATIONS[i].tag;

  renderPanel();
  updateHUD();

  const cb = $('#btnCellMode');
  cb.classList.toggle('ready', i === 7);
  if (i !== 7) cb.classList.remove('on');
  else cb.classList.toggle('on', State.cellMode);
}

/* ---------------------------------------------------------
   分子视角
   --------------------------------------------------------- */
function setCellMode(on) {
  State.cellMode = on;
  const hero = FERMENTERS.find(function (r) { return r.hero; });
  if (!hero) return;
  hero.front.visible = !on;
  if (hero.coneFront) hero.coneFront.visible = !on;
  hero.liquid.visible = on;
  hero.coneLiq.visible = on;
  hero.jackets.forEach(function (j) { j.visible = !on; });

  const card = $('#cellCard');
  if (on) {
    card.hidden = false;
    $('#ccEq').textContent = 'C₆H₁₂O₆ ——酶→ 2C₂H₅OH + 2CO₂ + 少量能量';
    $('#ccNote').innerHTML = '场所：<b style="color:#ffd79a">细胞质基质</b>。两个阶段都在细胞质基质中进行，第二阶段<b style="color:#ffd79a">不产生 ATP</b>。罐内上升的气泡就是 CO₂。';
    flyTo(VIEWS.cell);
  } else {
    card.hidden = true;
    if (State.idx === 7) flyTo(stationView(7));
  }
  $('#btnCellMode').classList.toggle('on', on);
  renderPanel();
}
function toggleCellMode() {
  if (State.idx !== 7 && !State.cellMode) {
    goTo(7);
    setTimeout(function () { setCellMode(true); }, 420);
    return;
  }
  setCellMode(!State.cellMode);
}

/* ---------------------------------------------------------
   弹层
   --------------------------------------------------------- */
const OV = { title: '', sub: '', body: '' };

function openOverlay(kind) {
  const ov = $('#overlay');
  if (kind === 'cell') { OV.title = '细胞呼吸：有氧与无氧'; OV.sub = '必修1 第5章第3节 · 酵母菌为什么既能繁殖又能产酒'; OV.body = viewCell(); }
  else if (kind === 'engine') { OV.title = '发酵工程的基本环节'; OV.sub = '选择性必修3 第1章第3节 · 教材七步'; OV.body = viewEngine(); }
  else if (kind === 'sim') { OV.title = '发酵条件控制'; OV.sub = '温度 · 溶氧 · 糖度 · pH 如何影响酵母菌'; OV.body = viewSim(); }
  else if (kind === 'quiz') { OV.title = '课堂检测'; OV.sub = '六道题 · 覆盖细胞呼吸与发酵工程'; OV.body = viewQuiz(); }
  else { OV.title = '使用说明'; OV.sub = '这是一个可以直接投到教室大屏的三维课件'; OV.body = viewHelp(); }

  $('#ovTitle').textContent = OV.title;
  $('#ovSub').textContent = OV.sub;
  $('#ovBody').innerHTML = OV.body;
  ov.hidden = false;
  $('#ovBody').scrollTop = 0;

  if (kind === 'sim') initSim();
  if (kind === 'quiz') initQuiz();
  setRail(kind === 'help' ? 'stage' : kind);
}
function closeOverlay() {
  $('#overlay').hidden = true;
  setRail('stage');
}
function setRail(k) {
  $$('.rail-btn[data-view]').forEach(function (b) {
    b.classList.toggle('on', b.dataset.view === k);
  });
}

/* ---- 细胞呼吸 ---- */
function physCard(P, cls) {
  let h = '<div class="phys ' + cls + '">';
  h += '<div class="phys-h"><b>' + P.title + '</b><span>' + (cls === 'aer' ? 'AEROBIC' : 'ANAEROBIC') + '</span></div>';
  h += '<div class="phys-site">场所：<em>' + P.site + '</em></div>';
  P.stages.forEach(function (s) {
    h += '<div class="stage-item"><div class="sn">' + s.n + '</div><div class="sb">' +
      '<div class="site">' + s.site + '</div>' +
      '<div class="eq">' + s.eq + '</div>' +
      '<div class="out">产物：<b>' + s.out + '</b></div></div></div>';
  });
  h += '<div class="phys-total">' + P.total + '</div>';
  h += '<div class="phys-energy">' + P.energy + '</div>';
  h += '</div>';
  return h;
}

function viewCell() {
  let h = '';
  h += '<div class="sec-cap">两种呼吸方式</div>';
  h += '<div class="split">' + physCard(AEROBIC, 'aer') + physCard(ANAEROBIC, 'ana') + '</div>';

  h += '<div class="sec-cap">能量去哪儿了</div>';
  h += '<div class="split">';
  h += '<div class="phys"><div class="phys-h"><b>同量葡萄糖的能量分配</b><span>kJ / mol</span></div>' +
    '<div class="ebar">' +
    '<div class="ebar-row"><span class="lbl">有氧呼吸</span><span class="tr"><i class="atp" style="width:40.5%"></i><i class="heat" style="width:59.5%"></i></span><span class="vv">2870</span></div>' +
    '<div class="ebar-row"><span class="lbl">酒精发酵</span><span class="tr"><i class="atp" style="width:2.1%"></i><i class="heat" style="width:5.7%"></i></span><span class="vv">225</span></div>' +
    '</div>' +
    '<div class="phys-energy" style="margin-top:14px">橙色为储存于 ATP 的能量（有氧 1161 kJ，酒精发酵 61 kJ），灰色为以热能散失的部分。' +
    '<b>同量葡萄糖，有氧呼吸释放的能量约为酒精发酵的 12.8 倍。</b></div></div>';
  h += '<div class="phys"><div class="phys-h"><b>为什么发酵“不划算”</b><span>WHY</span></div>' +
    '<ul class="p-bullets" style="margin-top:8px">' +
    '<li>无氧呼吸的产物（酒精）仍储存大量化学能，有机物<b>分解不彻底</b>。</li>' +
    '<li>只有第一阶段释放少量能量并生成 ATP，<b>第二阶段不产生 ATP</b>。</li>' +
    '<li>所以酵母菌在有氧时拼命繁殖，缺氧时才“退而求其次”产酒精。</li>' +
    '<li>这也解释了啤酒厂为什么<b>先通气扩培、后密闭发酵</b>。</li>' +
    '</ul></div>';
  h += '</div>';

  h += '<div class="sec-cap">逐项对比</div>';
  h += '<table class="cmp"><thead><tr>' + COMPARE[0].map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>';
  for (let i = 1; i < COMPARE.length; i++) {
    h += '<tr>' + COMPARE[i].map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
  }
  h += '</tbody></table>';

  h += '<div class="eng-note" style="margin-top:18px"><b style="color:#ffd79a">检测提示：</b>有氧呼吸与酒精发酵都产生 CO₂，因此“石灰水变浑浊”只能证明进行了细胞呼吸；要确认酒精，需用<b>酸性重铬酸钾</b>，橙色变灰绿色。</div>';
  return h;
}

/* ---- 发酵工程 ---- */
function viewEngine() {
  let h = '';
  h += '<div class="sec-cap">教材图示 · 啤酒的工业化生产流程</div>';
  h += '<div class="beerflow">';
  BEER_FLOW.forEach(function (f) {
    h += '<div class="bf"><span class="bfk">' + f[0] + '</span>' +
      '<b>' + f[1] + '</b><i>' + f[2] + '</i></div>';
  });
  h += '</div>';

  h += '<div class="sec-cap">发酵工程的基本环节</div><div class="eng">';
  ENGINEERING.forEach(function (e) {
    h += '<div class="eng-item"><div class="k">' + e.k + '</div><div class="t">' + e.t + '</div><div class="d">' + e.d + '</div></div>';
  });
  h += '</div>';
  h += '<div class="eng-note"><b style="color:#ffd79a">中心环节：</b>发酵罐内的发酵。大型发酵罐有计算机控制系统，能对温度、pH、溶解氧、罐压、通气量、搅拌、泡沫和营养等进行监测和控制——画面右侧的控制柜就是它的缩影。</div>';
  h += '<div class="sec-cap">与工厂产线对照</div>';
  h += '<div class="split">';
  h += '<div class="phys"><div class="phys-h"><b>灭菌 vs 消毒</b><span>STERILIZE</span></div>' +
    '<ul class="p-bullets" style="margin-top:8px">' +
    '<li><b>消毒</b>：杀死物体表面或内部的病原微生物，但不一定杀死芽孢。</li>' +
    '<li><b>灭菌</b>：杀死一切微生物，包括芽孢和孢子。</li>' +
    '<li>发酵工程用单一菌种，培养基和发酵设备必须<b>严格灭菌</b>。</li>' +
    '<li>煮沸麦汁、巴氏杀菌、高压蒸汽灭菌，手段不同，目的都是控制微生物。</li></ul></div>';
  h += '<div class="phys"><div class="phys-h"><b>产品是菌体还是代谢物</b><span>SEPARATE</span></div>' +
    '<ul class="p-bullets" style="margin-top:8px">' +
    '<li>产品是<b>微生物细胞本身</b>：过滤、沉淀分离后干燥。</li>' +
    '<li>产品是<b>代谢物</b>（酒精、CO₂、青霉素）：按产物性质提取、分离、纯化。</li>' +
    '<li>啤酒的最后一环是过滤除酵母 + 灌装杀菌，保留代谢产物。</li></ul></div>';
  h += '</div>';

  h += '<div class="sec-cap">教材 · 思考与讨论</div>';
  h += '<div class="disc">';
  DISCUSSION.forEach(function (d, i) {
    h += '<div class="di"><div class="dq"><span>Q' + (i + 1) + '</span>' + d.q + '</div>' +
      '<div class="da">' + d.a + '</div></div>';
  });
  h += '</div>';
  return h;
}

/* ---- 条件控制 ---- */
const SIM = { temp: 12, o2: 8, sugar: 12, ph: 5.2 };

function viewSim() {
  let h = '<div class="sim">';
  h += '<div class="sim-left">';
  h += sld('温度', 'simTemp', 2, 45, 1, SIM.temp, '℃', '2', '45');
  h += sld('溶氧', 'simO2', 0, 100, 1, SIM.o2, '%', '厌氧', '饱和');
  h += sld('麦汁糖度', 'simSugar', 6, 18, 0.5, SIM.sugar, '°P', '6', '18');
  h += sld('pH', 'simPh', 3.5, 6.5, 0.1, SIM.ph, '', '3.5', '6.5');
  h += '<div class="sim-warn" id="simWarn" hidden></div>';
  h += '<div class="sim-ok" id="simOk">拖动滑杆，观察酵母菌的“繁殖”与“产酒”此消彼长。</div>';
  h += '</div>';

  h += '<div class="sim-right">';
  h += '<div><div class="gauge-cap">产酒精速率（相对值）</div><div class="gauge-big"><span class="gv" id="simRate">0</span><span class="gu">%</span></div></div>';
  h += '<div class="curvewrap"><canvas id="simChart"></canvas></div>';
  h += '<div class="sim-read">' +
    '<div class="r"><div class="n">酵母增殖速率</div><div class="v" id="simGrow">—</div></div>' +
    '<div class="r"><div class="n">预计酒精度</div><div class="v" id="simAbv">—</div></div>' +
    '<div class="r"><div class="n">呼吸方式</div><div class="v" id="simMode" style="font-size:13px">—</div></div>' +
    '<div class="r"><div class="n">酶活性</div><div class="v" id="simEnz">—</div></div>' +
    '</div>';
  h += '<div style="font-size:10.5px;color:#72878b;line-height:1.6">模型用于呈现<b style="color:#a9bfc2">趋势</b>：低温变慢、高温变性失活、有氧偏向繁殖、无氧偏向产酒。数值为教学用相对值，非工业实测数据。</div>';
  h += '</div></div>';
  return h;
}
function sld(label, id, mn, mx, step, val, unit, s0, s1) {
  return '<div class="sld"><div class="sld-top"><label>' + label + '</label>' +
    '<output id="out_' + id + '">' + val + '<small>' + unit + '</small></output></div>' +
    '<input type="range" id="' + id + '" min="' + mn + '" max="' + mx + '" step="' + step + '" value="' + val + '">' +
    '<div class="sld-scale"><span>' + s0 + '</span><span>' + s1 + '</span></div></div>';
}

function simCalc(t, o2, sugar, ph) {
  /* 温度：钟形 + 高温变性 */
  let fT = Math.exp(-Math.pow(t - 28, 2) / (2 * 11 * 11));
  fT *= (1 - smoothstep(40, 47, t));
  fT = Math.max(0, fT);
  const doN = o2 / 100;
  const grow = fT * (0.12 + 0.88 * doN);
  const ferm = fT * (0.08 + 0.92 * Math.pow(1 - doN, 1.6));
  const sub = clamp(sugar / 14, 0.15, 1.15);
  const fPh = Math.exp(-Math.pow(ph - 5.0, 2) / (2 * 0.95 * 0.95));
  const rate = ferm * sub * fPh;
  const growR = grow * sub * fPh;
  const abv = sugar * 0.42 * (ferm / (ferm + grow + 0.06));
  return { rate: rate, grow: growR, abv: abv, fT: fT, fPh: fPh, ferm: ferm, grow0: grow };
}

function initSim() {
  const ids = ['simTemp', 'simO2', 'simSugar', 'simPh'];
  ids.forEach(function (id) {
    const el = $('#' + id);
    if (!el) return;
    el.addEventListener('input', function () { readSim(); paintSim(); });
  });
  readSim();
  paintSim();
  window.addEventListener('resize', function () { if (!$('#overlay').hidden) paintSim(); });
}
function readSim() {
  const g = function (id, d) { const e = $('#' + id); return e ? parseFloat(e.value) : d; };
  SIM.temp = g('simTemp', 12); SIM.o2 = g('simO2', 8);
  SIM.sugar = g('simSugar', 12); SIM.ph = g('simPh', 5.2);
}
function paintSim() {
  const r = simCalc(SIM.temp, SIM.o2, SIM.sugar, SIM.ph);
  const setTxt = function (id, v) { const e = $('#' + id); if (e) e.textContent = v; };

  setTxt('out_simTemp', SIM.temp + ' ℃');
  setTxt('out_simO2', SIM.o2 + ' %');
  setTxt('out_simSugar', SIM.sugar + ' °P');
  setTxt('out_simPh', SIM.ph.toFixed(1));

  const ratePct = Math.round(r.rate * 100);
  setTxt('simRate', String(ratePct));
  setTxt('simGrow', Math.round(r.grow * 100) + '%');
  setTxt('simAbv', r.abv.toFixed(1) + '%');
  setTxt('simEnz', Math.round(r.fT * 100) + '%');

  let mode = '兼性 · 两者并存';
  if (SIM.o2 >= 45) mode = '有氧呼吸为主';
  else if (SIM.o2 <= 10) mode = '无氧呼吸 · 酒精发酵';
  setTxt('simMode', mode);

  const warn = $('#simWarn'), ok = $('#simOk');
  if (SIM.temp >= 44) {
    warn.hidden = false; ok.hidden = true;
    warn.innerHTML = '<b>温度过高：</b>酶的空间结构被破坏，<b>变性失活</b>且不可逆，发酵停止。';
  } else if (SIM.temp <= 5) {
    warn.hidden = false; ok.hidden = true;
    warn.innerHTML = '<b>温度过低：</b>酶活性很低，代谢几乎停滞——发酵不会“死”，但会非常慢。';
  } else if (SIM.ph < 4.0 || SIM.ph > 6.2) {
    warn.hidden = false; ok.hidden = true;
    warn.innerHTML = '<b>pH 偏离最适范围：</b>过酸或过碱都会改变酶的空间结构，降低活性。';
  } else {
    warn.hidden = true; ok.hidden = false;
    ok.innerHTML = SIM.o2 <= 10
      ? '氧气耗尽，酵母菌转为<b>无氧呼吸</b>，糖被分解为酒精和 CO₂。'
      : (SIM.o2 >= 45
        ? '氧气充足，酵母菌进行<b>有氧呼吸</b>，释放大量能量用于繁殖，产酒很少。'
        : '溶氧处于中间水平，繁殖与产酒同时进行——这就是“兼性厌氧”的含义。');
  }
  drawSimChart(r);
}

function drawSimChart(r) {
  const cv = $('#simChart');
  if (!cv) return;
  const box = cv.parentNode;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = box.clientWidth, h = box.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const pad = { l: 30, r: 8, t: 12, b: 20 };
  const W = w - pad.l - pad.r, H = h - pad.t - pad.b;

  g.strokeStyle = 'rgba(150,196,196,.12)';
  g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + H * i / 4;
    g.beginPath(); g.moveTo(pad.l, y); g.lineTo(pad.l + W, y); g.stroke();
  }
  g.fillStyle = 'rgba(114,135,139,.9)';
  g.font = '9px "DIN Alternate",monospace';
  g.fillText('100%', 2, pad.t + 4);
  g.fillText('0', 2, pad.t + H + 3);
  g.fillText('2℃', pad.l, h - 5);
  g.fillText('45℃', pad.l + W - 22, h - 5);

  /* 产酒速率随温度变化（其余参数固定为当前值） */
  g.beginPath();
  for (let i = 0; i <= 100; i++) {
    const t = 2 + (45 - 2) * i / 100;
    const v = simCalc(t, SIM.o2, SIM.sugar, SIM.ph).rate;
    const x = pad.l + W * i / 100;
    const y = pad.t + H * (1 - clamp(v, 0, 1));
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.strokeStyle = '#ffb02e';
  g.lineWidth = 2;
  g.shadowColor = 'rgba(255,176,46,.6)'; g.shadowBlur = 8;
  g.stroke();
  g.shadowBlur = 0;

  /* 当前温度标记 */
  const cx = pad.l + W * (SIM.temp - 2) / 43;
  const cy = pad.t + H * (1 - clamp(r.rate, 0, 1));
  g.strokeStyle = 'rgba(255,176,46,.35)';
  g.setLineDash([3, 3]);
  g.beginPath(); g.moveTo(cx, pad.t); g.lineTo(cx, pad.t + H); g.stroke();
  g.setLineDash([]);
  g.fillStyle = '#ffb02e';
  g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill();
  g.fillStyle = '#050a0c';
  g.beginPath(); g.arc(cx, cy, 1.6, 0, 7); g.fill();

  g.fillStyle = 'rgba(169,191,194,.75)';
  g.font = '10px "Microsoft YaHei",sans-serif';
  g.fillText('产酒速率 — 温度曲线', pad.l + 4, pad.t + 10);
}

/* ---- 测验 ---- */
const QZ = { i: 0, picked: -1, score: 0, done: false };

function viewQuiz() {
  return '<div class="qz" id="qzWrap"></div>';
}
function initQuiz() {
  QZ.i = 0; QZ.picked = -1; QZ.score = 0; QZ.done = false;
  paintQuiz();
}
function paintQuiz() {
  const wrap = $('#qzWrap');
  if (!wrap) return;
  if (QZ.done) {
    const pct = Math.round(QZ.score / QUIZ.length * 100);
    let msg = '再回到产线上走一遍，注意每个工段“为什么这么做”。';
    if (pct >= 85) msg = '掌握得很扎实，可以去解释整条产线了。';
    else if (pct >= 60) msg = '基本概念清楚了，留意能量数值与灭菌/消毒的区别。';
    wrap.innerHTML =
      '<div style="text-align:center;padding:36px 0 10px">' +
      '<div class="gauge-cap">得分</div>' +
      '<div class="gauge-big" style="justify-content:center"><span class="gv">' + QZ.score + '</span><span class="gu">/ ' + QUIZ.length + '</span></div>' +
      '<div style="color:#a9bfc2;font-size:13px;margin-top:10px">' + msg + '</div>' +
      '</div>' +
      '<div class="qz-foot" style="justify-content:center;margin-top:18px"><button class="act primary" id="qzAgain">再做一次</button></div>';
    $('#qzAgain').addEventListener('click', initQuiz);
    return;
  }
  const q = QUIZ[QZ.i];
  let h = '<div class="qz-bar"><span class="qz-num">Q' + (QZ.i + 1) + ' / ' + QUIZ.length + '</span>' +
    '<span class="qz-prog"><i style="width:' + (QZ.i / QUIZ.length * 100) + '%"></i></span>' +
    '<span class="qz-score">已答对 <b>' + QZ.score + '</b></span></div>';
  h += '<div class="qz-q">' + q.q + '</div><div class="qz-opts">';
  q.o.forEach(function (o, k) {
    let cls = 'qz-opt';
    if (QZ.picked >= 0) {
      cls += ' lock';
      if (k === q.a) cls += ' right';
      else if (k === QZ.picked) cls += ' wrong';
    }
    h += '<button class="' + cls + '" data-k="' + k + '"><span class="k">' + 'ABCD'[k] + '</span><span>' + o + '</span></button>';
  });
  h += '</div>';
  if (QZ.picked >= 0) {
    h += '<div class="qz-exp"><b>' + (QZ.picked === q.a ? '正确。' : '正确答案：' + 'ABCD'[q.a] + '。') + '</b>' + q.e + '</div>';
    h += '<div class="qz-foot"><span class="qz-score">' + (QZ.i + 1 === QUIZ.length ? '最后一题' : '继续') + '</span>' +
      '<button class="act primary" id="qzNext">' + (QZ.i + 1 === QUIZ.length ? '查看结果' : '下一题') + '</button></div>';
  } else {
    h += '<div class="qz-foot"><span class="qz-score">选择一个答案</span></div>';
  }
  wrap.innerHTML = h;

  $$('.qz-opt').forEach(function (b) {
    b.addEventListener('click', function () {
      if (QZ.picked >= 0) return;
      QZ.picked = parseInt(b.dataset.k, 10);
      if (QZ.picked === q.a) QZ.score++;
      paintQuiz();
    });
  });
  const nx = $('#qzNext');
  if (nx) nx.addEventListener('click', function () {
    if (QZ.i + 1 >= QUIZ.length) { QZ.done = true; paintQuiz(); return; }
    QZ.i++; QZ.picked = -1; paintQuiz();
  });
}

/* ---- 说明 ---- */
function viewHelp() {
  return '<ul class="help-list">' +
    '<li><span class="hk">1</span><div><b>点底部的播放键「开产」。</b>一批麦汁会从第 1 站走到第 10 站：' +
    '当前设备的地面会亮起蓝环，罐内液位先涨后落，管道里有一颗琥珀色液滴流向下一站，' +
    '底部参数（温度/糖度/酒精度/pH）跟着变。再按一次暂停。</div></li>' +
    '<li><span class="hk">2</span><div><b>顶栏「透视」。</b>一键让所有罐壁变半透明，' +
    '能直接看到罐内液位、气泡与管道里的流动——讲“罐子里在发生什么”时用这个。' +
    '再点一次关闭。</div></li>' +
    '<li><span class="hk">3</span><div><b>点时间轴或画面上的标注</b>切换工段，镜头推到对应设备，' +
    '右侧换成该工段的生物学解释与教材出处。运行中跳站，批次也会跟着跳过去，不会中断。</div></li>' +
    '<li><span class="hk">4</span><div><b>第 8 工段「主发酵」</b>还能进入发酵罐剖视：' +
    '罐壁前半被切掉，看到酵母、气泡与液面。</div></li>' +
    '<li><span class="hk">5</span><div><b>左侧五个入口</b>：工厂全景、细胞呼吸对比、发酵工程七步、' +
    '条件控制模拟、课堂检测。条件控制里拖动滑杆，能直观看到“温度过高酶变性失活”“有氧偏繁殖、无氧偏产酒”。</div></li>' +
    '<li><span class="hk">6</span><div><b>顶栏「标注」「沉浸」。</b>标注控制设备标签显示；' +
    '沉浸收起右侧知识栏、让三维画面变宽。两个开关的偏好会记住。</div></li>' +
    '<li><span class="hk">7</span><div><b>键盘：</b>← → 切换工段，1–9 直达，空格开产/暂停，Esc 关闭弹层。</div></li>' +
    '<li><span class="hk">8</span><div><b>关于准确性：</b>文案与人教版（2019）必修1第5章、' +
    '选择性必修3第1章一致。能量数值中，2870 kJ / 1161 kJ 为教材数值；酒精发酵 225 kJ / 61 kJ ' +
    '为常用参考值，并已与乳酸发酵的 196.65 kJ 明确区分。</div></li>' +
    '</ul>';
}

/* ---------------------------------------------------------
   事件
   --------------------------------------------------------- */
$('#ovClose').addEventListener('click', closeOverlay);
$('#overlay').addEventListener('click', function (e) { if (e.target === $('#overlay')) closeOverlay(); });
$('#btnHelp').addEventListener('click', function () { openOverlay('help'); });
$('#btnReset').addEventListener('click', function () {
  if (State.cellMode) setCellMode(false);
  flyTo(VIEWS.overview);
  $('#viewSeg').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === 'factory'); });
});
$('#btnPrev').addEventListener('click', function () { goTo(State.idx - 1); });
$('#btnNext').addEventListener('click', function () { goTo(State.idx + 1); });
$('#btnPlay').addEventListener('click', function () { setPlaying(!State.playing); });
$('#btnCellMode').addEventListener('click', toggleCellMode);
$('#ccClose').addEventListener('click', function () { setCellMode(false); });

/* ---- 标注开关 / 沉浸模式（状态记住） ---- */
const PREF = (function () {
  try { return JSON.parse(localStorage.getItem('brewery.ui') || '{}'); } catch (e) { return {}; }
})();
function savePref() {
  try { localStorage.setItem('brewery.ui', JSON.stringify(PREF)); } catch (e) { }
}

function applyLabels(on) {
  PREF.labels = on;
  $('#labels').classList.toggle('off', !on);
  $('#btnLabels').classList.toggle('on', on);
  savePref();
}
function applyImmersive(on) {
  PREF.immersive = on;
  $('#app').classList.toggle('immersive', on);
  $('#btnImmersive').classList.toggle('on', on);
  savePref();
  setTimeout(function () { resize(); }, 60);
  setTimeout(function () { resize(); }, 540);
}
$('#btnLabels').addEventListener('click', function () { applyLabels(!PREF.labels); });
$('#btnXray').addEventListener('click', function () {
  const on = !XRAY.on;
  setXray(on);
  $('#btnXray').classList.toggle('on', on);
  PREF.xray = on; savePref();
});
$('#btnImmersive').addEventListener('click', function () { applyImmersive(!PREF.immersive); });

$('#viewSeg').addEventListener('click', function (e) {
  const b = e.target.closest('button');
  if (!b) return;
  $$('#viewSeg button').forEach(function (x) { x.classList.toggle('on', x === b); });
  if (b.dataset.v === 'factory') flyTo(VIEWS.overview);
  else flyTo(stationView(State.idx));
});

$$('.rail-btn[data-view]').forEach(function (b) {
  b.addEventListener('click', function () {
    const v = b.dataset.view;
    if (v === 'stage') { closeOverlay(); flyTo(VIEWS.overview); setRail('stage'); return; }
    openOverlay(v);
  });
});

function setPlayingUI(on) {
  $('#btnPlay').classList.toggle('on', on);
  $('#btnPlay .ico-play').style.display = on ? 'none' : '';
  $('#btnPlay .ico-pause').style.display = on ? '' : 'none';
}

function setPlaying(on) {
  State.playing = on;
  setPlayingUI(on);
  if (on) runStart(); else runStop();
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { closeOverlay(); return; }
  if ($('#overlay').hidden === false) return;
  if (e.key === 'ArrowRight') { goTo(State.idx + 1); e.preventDefault(); }
  else if (e.key === 'ArrowLeft') { goTo(State.idx - 1); e.preventDefault(); }
  else if (e.key === ' ') { setPlaying(!State.playing); e.preventDefault(); }
  else if (e.key >= '1' && e.key <= '9') { goTo(parseInt(e.key, 10) - 1); }
});

/* ---------------------------------------------------------
   主循环
   --------------------------------------------------------- */
let _last = performance.now();
let _firstFrame = true;

function frame(now) {
  const dt = Math.min(0.05, Math.max(0.0001, (now - _last) / 1000));
  _last = now;
  State.time += dt;
  const t = State.time;

  updateCamera(dt);

  /* 阴影每 12 帧刷新一次：瓶子在动，但这点延迟看不出来 */
  if (++shadowTick % 12 === 0) renderer.shadowMap.needsUpdate = true;

  STEAM.update(dt);
  for (let i = 0; i < TANK_FX.length; i++) TANK_FX[i].update(dt, t, State.cellMode);
  FLOW.update(dt, t);
  updateBottles(dt);
  updateDetails(dt, t);
  updateRun(dt, t);
  updateLabels();


  renderScene(dt);

  /* ?stats=1 时的实时读数：帧率 / 渲染倍率 / 绘制调用 */
  if (STATS) {
    STATS.n++;
    if (now - STATS.t0 > 500) {
      const fps = Math.round(STATS.n * 1000 / (now - STATS.t0));
      STATS.el.textContent = fps + ' fps · ' + dprNow.toFixed(2) + 'x · ' + renderer.info.render.calls + ' calls · ' + (QUALITY.perf ? '性能档' : '画质档');
      STATS.n = 0; STATS.t0 = now;
      STATS.el.style.color = fps >= 55 ? '#6ee7a8' : (fps >= 40 ? '#ffb02e' : '#ff5f4d');
    }
  }

  if (_firstFrame) {
    _firstFrame = false;
    const fill = $('#ldFill');
    if (fill) fill.style.width = '100%';
    setTimeout(function () {
      const ld = $('#loader');
      if (ld) { ld.classList.add('gone'); setTimeout(function () { ld.style.display = 'none'; }, 800); }
    }, 260);
    setTimeout(function () { flyTo(VIEWS.overview); }, 120);
  }
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------
   启动
   --------------------------------------------------------- */
/* 帧率读数（默认关闭，URL 加 ?stats=1 打开） */
const STATS = (function () {
  let on = false;
  try { on = /(^|[?&])stats=1/.test(String(location.search || '')); } catch (e) { }
  if (!on) return null;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;right:16px;bottom:144px;z-index:80;font:12px/1.5 "DIN Alternate",monospace;' +
    'color:#6ee7a8;background:rgba(4,10,12,.85);border:1px solid rgba(150,196,196,.25);' +
    'padding:5px 10px;border-radius:7px;pointer-events:none;letter-spacing:.03em';
  el.textContent = 'measuring…';
  document.body.appendChild(el);
  return { el: el, n: 0, t0: performance.now() };
})();

(function boot() {
  /* 开场：从更高更远处落进场 */
  Orbit.dist = 40; Orbit.pol = 0.62; Orbit.az = 1.15;
  Orbit.tdist = 40; Orbit.tpol = 0.62; Orbit.taz = 1.15;
  Orbit.target.set(0.2, 1.9, 0);
  Orbit.ttarget.set(0.2, 1.9, 0);
  applyCamera();

  buildHUD();

  /* 预热：剖切用的液体/内部粒子默认隐藏，先让它们编译一次着色器，
     否则第一次进“分子视角”会明显卡一下 */
  const heroRec = FERMENTERS.find(function (r) { return r.hero; });
  if (heroRec) { heroRec.liquid.visible = true; heroRec.coneLiq.visible = true; }
  try { renderer.compile(scene, camera); } catch (e) { }
  if (heroRec) { heroRec.liquid.visible = false; heroRec.coneLiq.visible = false; }

  goTo(0, { force: true });
  updateHUD();
  resize();
  applyCamera();

  /* 软件渲染：这是“卡”的根本原因，必须直接告诉使用者 */
  if (QUALITY.soft) {
    const b = document.createElement('div');
    b.id = 'softWarn';
    b.innerHTML = '<b>当前是软件渲染</b> · 浏览器未启用硬件加速，三维画面会严重卡顿。' +
      '请在浏览器设置中开启「使用硬件加速」，或改用 Chrome / Edge 打开。';
    document.body.appendChild(b);
    setTimeout(function () { b.classList.add('show'); }, 900);
  }

  applyLabels(PREF.labels !== false);
  if (PREF.xray) { setXray(true); $('#btnXray').classList.add('on'); }
  applyImmersive(!!PREF.immersive);

  const fill = $('#ldFill');
  if (fill) fill.style.width = '35%';

  requestAnimationFrame(frame);
})();
