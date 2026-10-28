/* node r_crop.js <src.png> <out.png> <x> <y> <w> <h> <scale> */
const { chromium } = require('playwright-core');
const fs = require('fs');
const EXE = 'C:/Users/azlove2112/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
(async () => {
  const [src, out, x, y, w, h, sc] = process.argv.slice(2);
  const S = parseFloat(sc || '2');
  const b64 = fs.readFileSync(src).toString('base64');
  const b = await chromium.launch({ executablePath: EXE, args:['--hide-scrollbars'] });
  const p = await b.newPage({ viewport: { width: Math.round(w*S), height: Math.round(h*S) }, deviceScaleFactor: 1 });
  const html = '<body style="margin:0;overflow:hidden;background:#fff"><div style="width:'+Math.round(w*S)+'px;height:'+Math.round(h*S)+'px;overflow:hidden;position:relative">'+
    '<img id=i src="data:image/png;base64,'+b64+'" style="position:absolute;left:0;top:0;transform-origin:0 0;transform:scale('+S+') translate('+(-x)+'px,'+(-y)+'px)"></div></body>';
  await p.setContent(html);
  await p.waitForTimeout(500);
  await p.screenshot({ path: out });
  await b.close();
})();
