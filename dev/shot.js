/* 截图 + 真实图像分析
   用法: node shot.js <outName> [waitMs] [scriptFile] [query]
   分析：把 PNG 丢回浏览器解码，保证测的是最终合成结果。 */
const { chromium } = require('playwright-core');
const { pathToFileURL } = require('url');
const fs = require('fs');
const path = require('path');

const EXE = 'C:/Users/azlove2112/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const HTML = 'D:/AAA-Workbudy/brewery-courseware/啤酒发酵工厂·生产流程课件.html';

const PROBES = [
  ['地面左前', 640, 620], ['地面中', 820, 660], ['地面右后', 1000, 520],
  ['背景左上', 120, 210], ['背景右', 1120, 240], ['发酵罐', 1010, 400],
  ['铜锅', 545, 330], ['原料仓', 300, 200]
];

(async () => {
  const out = process.argv[2] || 'shot';
  const wait = parseInt(process.argv[3] || '5500', 10);
  const scriptFile = process.argv[4];
  const query = process.argv[5] || '';

  const browser = await chromium.launch({
    executablePath: EXE,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', '--mute-audio']
  });
  const vp = (process.env.VP || '1600x900').split('x').map(Number);
  const page = await browser.newPage({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', m => { if (m.type() !== 'warning') logs.push('[' + m.type() + '] ' + m.text()); });
  page.on('pageerror', e => logs.push('[PAGEERROR] ' + e.message));

  await page.goto(pathToFileURL(HTML).href + query, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(wait);

  /* 诊断相机固定到全景，消除阻尼带来的随机性 */
  try { await page.evaluate('flyTo(VIEWS.overview, true)'); } catch (e) { }
  await page.waitForTimeout(120);

  if (scriptFile) {
    try {
      const r = await page.evaluate(fs.readFileSync(scriptFile, 'utf8'));
      if (r !== undefined) console.log('EVAL:', typeof r === 'string' ? r : JSON.stringify(r));
    } catch (e) { console.log('EVAL ERROR:', e.message); }
    await page.waitForTimeout(1600);
  }

  const dir = 'D:/AAA-Workbudy/brewery-courseware/shots';
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, out + '.png');
  const buf = await page.screenshot({ path: file });
  if (logs.length) console.log(logs.slice(0, 20).join('\n'));

  /* ---- 用浏览器解码 PNG 后测量 ---- */
  const an = await browser.newPage();
  await an.setContent('<body style="margin:0"><canvas id="c"></canvas></body>');
  const res = await an.evaluate(async (arg) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + arg.b64;
    await img.decode();
    const c = document.getElementById('c');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    const at = (x, y) => {
      const i = ((y | 0) * img.width + (x | 0)) * 4;
      return [d[i], d[i + 1], d[i + 2]];
    };
    const lum = (p) => Math.round(p[0] * 0.2126 + p[1] * 0.7152 + p[2] * 0.0722);

    const probes = arg.probes.map(p => {
      const c0 = at(p[1], p[2]);
      return p[0] + '(' + p[1] + ',' + p[2] + ')=' + c0.join(',') + ' L' + lum(c0);
    });

    let sum = 0, n = 0, blown = 0, dark = 0;
    for (let y = 70; y < img.height - 140; y += 4) {
      for (let x = 90; x < img.width - 20; x += 4) {
        const p = at(x, y); const L = lum(p);
        sum += L; n++;
        if (L > 235) blown++;
        if (L < 8) dark++;
      }
    }
    const ch = ' .:-=+*#%@';
    let map = '';
    for (let r = 0; r < 12; r++) {
      let line = '';
      for (let c = 0; c < 22; c++) {
        const L = lum(at(img.width * c / 22 + 8, img.height * r / 12 + 8));
        line += ch[Math.min(9, Math.floor(L / 25.6))];
      }
      map += line + '\n';
    }
    return {
      size: img.width + 'x' + img.height,
      avg: (sum / n / 255).toFixed(3),
      blownPct: (blown / n * 100).toFixed(1),
      darkPct: (dark / n * 100).toFixed(1),
      probes: probes,
      map: map
    };
  }, { b64: buf.toString('base64'), probes: PROBES });

  console.log('AVG ' + res.avg + '  blown ' + res.blownPct + '%  dark ' + res.darkPct + '%');
  console.log(res.probes.join(' | '));
  console.log(res.map);

  await browser.close();
})();
