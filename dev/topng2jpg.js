const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const EXE = 'C:/Users/azlove2112/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const DIR = "D:/AAA-Workbudy/brewery-courseware/concept";
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const p = await b.newPage();
  await p.setContent('<canvas id=c></canvas>');
  for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.png'))) {
    const src = 'data:image/png;base64,' + fs.readFileSync(path.join(DIR, f)).toString('base64');
    const out = await p.evaluate(async (s) => {
      const img = new Image(); img.src = s; await img.decode();
      const c = document.getElementById('c');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/jpeg', 0.86).split(',')[1];
    }, src);
    const jf = path.join(DIR, f.replace(/\.png$/, '.jpg'));
    fs.writeFileSync(jf, Buffer.from(out, 'base64'));
    fs.unlinkSync(path.join(DIR, f));
    console.log(f, '->', path.basename(jf), (fs.statSync(jf).size / 1024).toFixed(0) + ' KB');
  }
  await b.close();
})();
