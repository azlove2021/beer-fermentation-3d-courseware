const { chromium } = require('playwright-core');
const { pathToFileURL } = require('url');
const EXE = 'C:/Users/azlove2112/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const HTML = 'D:/AAA-Workbudy/brewery-courseware/啤酒发酵工厂·生产流程课件.html';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--hide-scrollbars'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await p.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
  await p.waitForTimeout(4000);
  const r = await p.evaluate(async () => {
    goTo(7, { force: true }); flyTo(stationView(7), true);
    await new Promise(r => setTimeout(r, 500));
    const w = glCanvas.clientWidth, h = glCanvas.clientHeight;
    const L = LABELS[7];
    const v = new THREE.Vector3(L.x, L.y, L.z).project(camera);
    const px = (v.x*0.5+0.5)*w, py = (-v.y*0.5+0.5)*h;
    const before = L.el.style.display;
    updateLabels();
    return { px: Math.round(px), py: Math.round(py), w, h, ndcz: +v.z.toFixed(3),
             before, after: L.el.style.display, cls: L.el.className,
             rect: (function(){const r=L.el.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];})(),
             canvasRect: (function(){const r=glCanvas.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y)];})(),
             dist: Orbit.dist.toFixed(2), pol: Orbit.pol.toFixed(3) };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
