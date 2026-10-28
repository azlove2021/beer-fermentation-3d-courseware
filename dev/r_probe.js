const { chromium } = require('playwright-core');
const { pathToFileURL } = require('url');
const EXE = 'C:/Users/azlove2112/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const HTML = 'D:/AAA-Workbudy/brewery-courseware/啤酒发酵工厂·生产流程课件.html';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--hide-scrollbars','--mute-audio'] });
  const vp = (process.env.VP || '1600x900').split('x').map(Number);
  const p = await b.newPage({ viewport: { width: vp[0], height: vp[1] } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
  await p.waitForTimeout(4500);
  const r = await p.evaluate(() => {
    const st = document.getElementById('stage');
    const c = document.getElementById('gl');
    const sc = document.getElementById('stageCanvas');
    return {
      stage: st.clientWidth + 'x' + st.clientHeight,
      stageCanvas: sc.clientWidth + 'x' + sc.clientHeight,
      canvasCSS: c.clientWidth + 'x' + c.clientHeight,
      canvasBuf: c.width + 'x' + c.height,
      cameraAspect: camera.aspect.toFixed(3),
      cssAspect: (c.clientWidth / c.clientHeight).toFixed(3),
      bufAspect: (c.width / c.height).toFixed(3),
      dpr: window.devicePixelRatio,
      rendererSize: renderer.getSize(new THREE.Vector2()).x + 'x' + renderer.getSize(new THREE.Vector2()).y
    };
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('ERRS', errs.join(' || ') || 'none');
  await b.close();
})();
