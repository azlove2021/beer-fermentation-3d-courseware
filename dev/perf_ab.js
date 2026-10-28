const { chromium } = require('playwright-core');
const { pathToFileURL } = require('url');
const EXE = 'C:/Users/azlove2112/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const HTML = 'D:/AAA-Workbudy/brewery-courseware/啤酒发酵工厂·生产流程课件.html';
(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.evaluate('flyTo(VIEWS.overview, true)');
  await page.waitForTimeout(500);
  const r = await page.evaluate(async () => {
    async function measure(n) {
      const t = [];
      await new Promise(function (res) {
        let k = 0, last = performance.now();
        (function tick(now) { t.push(now - last); last = now; if (++k >= n) return res(); requestAnimationFrame(tick); })(performance.now());
      });
      t.shift();
      const s = t.slice().sort((a, b) => a - b);
      return { avg: t.reduce((a, b) => a + b, 0) / t.length, p95: s[Math.floor(s.length * .95)] };
    }
    const on = await measure(90);
    renderer.shadowMap.autoUpdate = true;      // 回到“每帧重算阴影”
    renderer.shadowMap.needsUpdate = true;
    const off = await measure(90);
    renderer.shadowMap.autoUpdate = false;
    return { throttled: on, everyFrame: off };
  });
  const ms = v => v.toFixed(1);
  console.log('软件渲染 1280x720:');
  console.log('  阴影节流    avg ' + ms(r.throttled.avg) + 'ms  p95 ' + ms(r.throttled.p95) + 'ms');
  console.log('  阴影每帧    avg ' + ms(r.everyFrame.avg) + 'ms  p95 ' + ms(r.everyFrame.p95) + 'ms');
  console.log('  提升        ' + Math.round((1 - r.throttled.avg / r.everyFrame.avg) * 100) + '%');
  await browser.close();
})();
