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
    const r = await p.evaluate(() => {
      const out = {};
      [0,3,7,9].forEach(function(i){
        goTo(i,{force:true}); flyTo(stationView(i), true); updateLabels();
        const lab = LABELS[i];
        const vis = getComputedStyle(lab.el).display !== 'none';
        out[i] = { visible: vis, x: lab.lx, y: lab.ly, cw: glCanvas.clientWidth, ch: glCanvas.clientHeight };
      });
      return out;
    });
    console.log(vp.join('x'), JSON.stringify(r));
    await p.close();
  }
  await b.close();
})();
