const { chromium } = require('playwright-core');
const { pathToFileURL } = require('url');
const EXE = 'C:/Users/azlove2112/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const HTML = 'D:/AAA-Workbudy/brewery-courseware/啤酒发酵工厂·生产流程课件.html';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--hide-scrollbars','--mute-audio'] });
  for (const vp of [[1600,900],[1366,768]]) {
    const p = await b.newPage({ viewport: { width: vp[0], height: vp[1] } });
    await p.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
    await p.waitForTimeout(4200);
    const r = await p.evaluate(() => {
      const rect = e => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) }; };
      const sw = document.getElementById('softWarn');
      const tb = document.querySelector('.tb-right');
      const tl = Array.from(document.querySelectorAll('.tl-node')).map(n => {
        const nm = n.querySelector('.nm');
        return { t: nm.textContent, clipped: nm.scrollWidth > nm.clientWidth + 1, sw: nm.scrollWidth, cw: nm.clientWidth };
      });
      const pin = document.getElementById('panelInner');
      const c = document.getElementById('gl');
      return {
        softWarn: sw ? rect(sw) : null,
        tbRight: rect(tb),
        viewSeg: rect(document.getElementById('viewSeg')),
        bannerCovers: ['.tb-right buttons'],
        tlClipped: tl.filter(x => x.clipped),
        tlFull: tl.map(x => x.t + (x.clipped ? '*' : '')),
        panel: { sh: pin.scrollHeight, ch: pin.clientHeight, canScroll: pin.scrollHeight > pin.clientHeight + 1 },
        canvas: { css: c.clientWidth + 'x' + c.clientHeight, buf: c.width + 'x' + c.height, squash: (c.clientHeight / c.height).toFixed(3) },
        stage: rect(document.getElementById('stage')),
        hudRow: document.getElementById('hudRow').textContent.replace(/\s+/g, ' ').trim(),
        labelsVisible: document.querySelectorAll('.lab').length
      };
    });
    console.log(vp.join('x'), JSON.stringify(r, null, 1));
    await p.close();
  }
  await b.close();
})();
