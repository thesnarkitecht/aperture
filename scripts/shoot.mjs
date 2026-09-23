// Headless screenshot helper: node scripts/shoot.mjs <url-query> <out.png> [w] [h]
import { chromium } from 'playwright';
const [q = '', out = 'shot.png', w = '960', h = '540'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
p.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
p.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await p.goto('http://localhost:4173/?' + q, { timeout: 120000 });
try { await p.waitForFunction(() => window.__ready === true, null, { timeout: 240000 }); } catch (e) { logs.push('timeout waiting ready'); }
await p.waitForTimeout(+(process.env.WAIT || 2500));
await p.screenshot({ path: out });
console.log(logs.filter((l) => !l.includes('GPU stall')).slice(0, 30).join('\n'));
await b.close();
