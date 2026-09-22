// Dev helper: render several named viewpoints in one page load.
// Usage: node scripts/views.mjs <outDir> <viewsJsonFile> [query]
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const [outDir, viewsFile, query = 'capture&q=high'] = process.argv.slice(2);
const views = JSON.parse(readFileSync(viewsFile, 'utf8'));
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (!m.text().includes('[vite]')) console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
await page.goto(`http://localhost:5173/?${query}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 900000, polling: 500 });
console.log('ready in', ((Date.now() - t0) / 1000).toFixed(1), 's');
for (const v of views) {
  const t1 = Date.now();
  const data = await page.evaluate((v) => window.__renderView(v.pos, v.look, v.fov ?? 72, v.settle ?? 20, v.w ?? 0, v.h ?? 0), v);
  writeFileSync(`${outDir}/${v.name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log(v.name, ((Date.now() - t1) / 1000).toFixed(1), 's');
}
const stats = await page.evaluate(() => JSON.stringify(window.__app.stats));
console.log(stats);
await browser.close();
