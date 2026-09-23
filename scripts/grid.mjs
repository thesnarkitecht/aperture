// Tile several screenshots into one image (uses the headless browser as the compositor).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const files = process.argv.slice(3);
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const imgs = files.map((f) => `<img src="data:image/png;base64,${readFileSync(f).toString('base64')}" style="width:480px;height:270px;display:block;float:left">`).join('');
await p.setContent(`<body style="margin:0">${imgs}</body>`);
await p.screenshot({ path: out });
await b.close();
