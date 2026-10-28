const { chromium } = require('playwright-core');
const { pathToFileURL } = require('url');
const EXE = 'C:/Users/azlove2112/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const HTML = 'D:/AAA-Workbudy/brewery-courseware/啤酒发酵工厂·生产流程课件.html';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--hide-scrollbars'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await p.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
  await p.waitForTimeout(4000);
  const r = await p.evaluate(() => {
    const w = glCanvas.clientWidth, h = glCanvas.clientHeight;
    const P = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); return [Math.round((v.x*0.5+0.5)*w), Math.round((-v.y*0.5+0.5)*h)]; };
    flyTo(VIEWS.overview, true); applyCamera();
    const ov = { lab8z0: P(4.70,4.25,0), fer8top: P(4.70,3.34,-0.55), lab10z0: P(9.25,1.75,0), pack10: P(9.25,1.2,-0.45) };
    flyTo(stationView(7), true); applyCamera();
    const s8 = { lab: P(4.70,4.25,0), tankTop: P(4.70,3.34,-0.55), heroTop: P(3.60,3.34,-0.55) };
    goTo(3, { force: true }); flyTo(stationView(3), true); applyCamera();
    const s4 = { lab4: P(-3.30,2.60,0), lab5: P(-0.45,3.75,0) };
    return { ov, s8, s4 };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
