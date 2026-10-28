const { chromium } = require('playwright-core');
const { pathToFileURL } = require('url');
const EXE = 'C:/Users/azlove2112/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const HTML = 'D:/AAA-Workbudy/brewery-courseware/啤酒发酵工厂·生产流程课件.html';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--hide-scrollbars'] });
  for (const vp of [[1600,900],[1366,768]]) {
    const p = await b.newPage({ viewport: { width: vp[0], height: vp[1] } });
    await p.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
    await p.waitForTimeout(4000);
    const rows = [];
    for (const i of [0,1,3,7,9]) {
      await p.evaluate(i => { goTo(i, { force: true }); flyTo(stationView(i), true); }, i);
      await p.waitForTimeout(350);
      const r = await p.evaluate(i => {
        const w = glCanvas.clientWidth, h = glCanvas.clientHeight;
        const L = LABELS[i];
        const v = new THREE.Vector3(L.x, L.y, L.z).project(camera);
        const px = (v.x*0.5+0.5)*w, py = (-v.y*0.5+0.5)*h;
        return { i, cls: L.el.className, shown: L.shown, px: Math.round(px), py: Math.round(py), w, h, disp: getComputedStyle(L.el).display };
      }, i);
      rows.push(r);
    }
    console.log(vp.join('x'));
    rows.forEach(r => console.log('  st' + r.i, 'px=' + r.px, 'py=' + r.py + '/' + r.h, 'shown=' + r.shown, 'disp=' + r.disp, 'cls=' + r.cls));
    await p.close();
  }
  await b.close();
})();
