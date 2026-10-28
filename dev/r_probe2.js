const { chromium } = require('playwright-core');
const { pathToFileURL } = require('url');
const EXE = 'C:/Users/azlove2112/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const HTML = 'D:/AAA-Workbudy/brewery-courseware/啤酒发酵工厂·生产流程课件.html';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--hide-scrollbars','--mute-audio'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await p.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
  await p.waitForTimeout(4000);
  const out = {};

  /* --- 1. 三个开关真实点击 --- */
  out.labels = await p.evaluate(() => {
    const b = document.getElementById('btnLabels');
    const before = getComputedStyle(document.getElementById('labels')).display;
    b.click();
    const after = getComputedStyle(document.getElementById('labels')).display;
    b.click();
    return { before, after, restored: getComputedStyle(document.getElementById('labels')).display };
  });
  out.xray = await p.evaluate(() => {
    const b = document.getElementById('btnXray');
    b.click();
    const on = { x: XRAY.on, op: MAT.steelBody.opacity, btn: b.className };
    b.click();
    return { on, off: { x: XRAY.on, op: MAT.steelBody.opacity, btn: b.className } };
  });
  out.immersive = await p.evaluate(() => {
    const b = document.getElementById('btnImmersive');
    b.click();
    const on = { cls: document.getElementById('app').className, panel: getComputedStyle(document.getElementById('panel')).opacity };
    b.click();
    return { on, off: { cls: document.getElementById('app').className, panel: getComputedStyle(document.getElementById('panel')).opacity } };
  });

  /* --- 2. 空格键 + 按钮焦点：是否双触发 --- */
  out.spaceBug = await p.evaluate(async () => {
    State.playing = false; RUN.on = false;
    document.getElementById('btnPlay').focus();
    return { playingBefore: State.playing, active: document.activeElement.id };
  });
  await p.keyboard.press(' ');
  await p.waitForTimeout(300);
  out.spaceBugAfter = await p.evaluate(() => ({ playing: State.playing, run: RUN.on, btn: document.getElementById('btnPlay').className }));
  await p.evaluate(() => { setPlaying(false); document.body.focus(); });

  /* --- 3. 跑完一整轮后按钮状态是否复位 --- */
  out.runEnd = await p.evaluate(() => {
    State.playing = true; setPlayingUI(true);
    runStart();
    let n = 0;
    for (let i = 0; i < 4000; i++) { updateRun(1 / 30, i / 30); if (RUN.done) { n = i; break; } }
    return { done: RUN.done, runOn: RUN.on, statePlaying: State.playing,
             btnClass: document.getElementById('btnPlay').className,
             iconPlay: document.querySelector('#btnPlay .ico-play').style.display,
             chip: document.getElementById('stChip').textContent };
  });
  /* 跑完后再点一次播放 */
  out.runEndClick = await p.evaluate(() => {
    document.getElementById('btnPlay').click();
    return { after1: { playing: State.playing, run: RUN.on } };
  });
  out.runEndClick2 = await p.evaluate(() => {
    document.getElementById('btnPlay').click();
    return { after2: { playing: State.playing, run: RUN.on } };
  });
  await p.evaluate(() => { setPlaying(false); State.playing = false; setPlayingUI(false); });

  /* --- 4. 模拟弹层重复打开 → resize 监听累积 --- */
  out.simListener = await p.evaluate(async () => {
    openOverlay('sim'); closeOverlay();
    openOverlay('sim'); closeOverlay();
    openOverlay('sim');
    let calls = 0;
    const orig = window.paintSim;
    window.paintSim = function () { calls++; return orig.apply(this, arguments); };
    window.dispatchEvent(new Event('resize'));
    window.paintSim = orig;
    const before = calls;
    closeOverlay(); openOverlay('sim');
    calls = 0;
    window.dispatchEvent(new Event('resize'));
    return { firstOpenCalls: before, thirdOpenCalls: calls };
  });
  await p.evaluate(() => closeOverlay());

  /* --- 5. 面板溢出 / 横向滚动条 --- */
  out.overflow = await p.evaluate(() => {
    goTo(3, { force: true });
    const pin = document.getElementById('panelInner');
    const eq = document.querySelector('.p-eq');
    const r = { panelScrollW: pin.scrollWidth, panelClientW: pin.clientWidth };
    if (eq) r.eq = { scrollW: eq.scrollWidth, clientW: eq.clientWidth, text: eq.textContent.trim().slice(0, 40) };
    return r;
  });

  /* --- 6. 标注包围盒重叠检测 --- */
  await p.evaluate(() => { goTo(0, { force: true }); flyTo(VIEWS.overview, true); });
  await p.waitForTimeout(400);
  out.labelOverlap = await p.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.lab')).filter(e => getComputedStyle(e).display !== 'none');
    const rects = els.map(e => ({ t: e.textContent, r: e.getBoundingClientRect() }));
    const hits = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i].r, c = rects[j].r;
      const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
      const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
      if (ox > 0 && oy > 0) hits.push(rects[i].t.trim() + ' X ' + rects[j].t.trim() + ' = ' + Math.round(ox) + 'x' + Math.round(oy));
    }
    return { visible: rects.length, hits: hits };
  });

  console.log(JSON.stringify(out, null, 1));
  console.log('ERRS', errs.join(' | ') || 'none');
  await b.close();
})();
