/* 性能诊断：渲染开销 + 帧时间分布 */
const { chromium } = require('playwright-core');
const { pathToFileURL } = require('url');
const fs = require('fs');

const EXE = 'C:/Users/azlove2112/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const HTML = 'D:/AAA-Workbudy/brewery-courseware/啤酒发酵工厂·生产流程课件.html';

(async () => {
  const gpu = process.env.GPU === '1';
  const args = gpu
    ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']
    : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'];

  const browser = await chromium.launch({ executablePath: EXE, args });
  const vp = (process.env.VP || '1600x900').split('x').map(Number);
  const page = await browser.newPage({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: Number(process.env.DPR || 1) });
  await page.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  await page.evaluate('flyTo(VIEWS.overview, true)');
  await page.waitForTimeout(600);

  const r = await page.evaluate(async () => {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const info = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/a';

    /* 固定 180 帧计时 */
    const times = [];
    await new Promise(function (res) {
      let n = 0, last = performance.now();
      function tick(now) {
        times.push(now - last); last = now;
        if (++n >= 180) return res();
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    times.shift();
    const sorted = times.slice().sort(function (a, b) { return a - b; });
    const avg = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
    let lights = 0, meshes = 0, points = 0, tris = 0;
    scene.traverse(function (o) {
      if (o.isLight) lights++;
      if (o.isPoints) points++;
      if (o.isMesh) {
        meshes++;
        const g = o.geometry;
        if (g && g.index) tris += g.index.count / 3;
        else if (g && g.attributes.position) tris += g.attributes.position.count / 3;
      }
    });
    return {
      gpu: info,
      buffer: renderer.domElement.width + 'x' + renderer.domElement.height,
      cssSize: renderer.domElement.clientWidth + 'x' + renderer.domElement.clientHeight,
      pixelRatio: renderer.getPixelRatio(),
      drawCalls: renderer.info.render.calls,
      trianglesDrawn: renderer.info.render.triangles,
      meshes: meshes, points: points, lights: lights, sceneTris: Math.round(tris),
      avgMs: +avg.toFixed(2),
      p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
      fps: Math.round(1000 / avg),
      programs: renderer.info.programs.length
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
