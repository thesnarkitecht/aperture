#!/usr/bin/env node
/**
 * Offline renderer for the walkthrough video.
 *
 * Plays the in-app cinematic tour deterministically (fixed timestep) in headless
 * Chromium and pipes every frame into ffmpeg. Works on machines without a GPU
 * (SwiftShader) — slowly, but frame-perfect.
 *
 *   node scripts/render-video.mjs                     # full tour -> media/perihelion-walkthrough.mp4
 *   node scripts/render-video.mjs --segment 0/3       # render one third (for parallel runs)
 *   node scripts/render-video.mjs --concat 3          # join segments
 *   node scripts/render-video.mjs --stills 5,30,62    # PNG stills at given seconds
 *
 * Options: --url <app url> (default: builds and serves dist/), --width 1920 --height 1080 --fps 30
 *          --quality cinematic --crf 18 --out <file>
 * Env: CHROMIUM_PATH (browser binary), FFMPEG (ffmpeg binary).
 */
import { spawn, execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
  }, []),
);
const root = resolve(new URL('..', import.meta.url).pathname);
const width = +(args.width ?? 1920);
const height = +(args.height ?? 1080);
const fps = +(args.fps ?? 30);
const quality = args.quality ?? 'cinematic';
const crf = args.crf ?? '18';
const outDir = join(root, '.render');
const finalOut = args.out ?? join(root, 'media', 'perihelion-walkthrough.mp4');
mkdirSync(outDir, { recursive: true });
mkdirSync(join(root, 'media'), { recursive: true });

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const probe = spawnSync('ffmpeg', ['-version']);
  if (probe.status === 0) return 'ffmpeg';
  try {
    return execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
  } catch {
    throw new Error('ffmpeg not found: install ffmpeg, `pip install imageio-ffmpeg`, or set FFMPEG=/path/to/ffmpeg');
  }
}
const FFMPEG = findFfmpeg();

if (args.concat) {
  const n = +args.concat;
  const list = join(outDir, 'segments.txt');
  writeFileSync(list, Array.from({ length: n }, (_, i) => `file '${join(outDir, `segment-${i}.mp4`)}'`).join('\n'));
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', finalOut], { stdio: 'inherit' });
  console.log(`Wrote ${finalOut} (${(statSync(finalOut).size / 1e6).toFixed(1)} MB)`);
  process.exit(0);
}

// ---- Serve the production build unless a URL was given. ----
async function serveDist() {
  const dist = join(root, 'dist');
  if (!existsSync(join(dist, 'index.html')) || args.build === 'true') {
    console.log('Building app…');
    execFileSync('npx', ['vite', 'build', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
  }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const file = join(dist, path === '/' ? 'index.html' : path);
    if (!file.startsWith(dist) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

const served = args.url ? null : await serveDist();
const baseUrl = args.url ?? served.url;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
page.on('console', (m) => {
  const t = m.text();
  if (!t.includes('[vite]') && !t.startsWith('Sign atlas')) console.log('[page]', t);
});
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
const t0 = Date.now();
await page.goto(`${baseUrl}?capture&q=${quality}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 30 * 60 * 1000, polling: 500 });
console.log(`App ready in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const duration = await page.evaluate(() => window.__tour.duration);
await page.evaluate(([w, h]) => window.__tour.begin(w, h), [width, height]);
const total = Math.round(duration * fps);
const dt = 1 / fps;

if (args.stills) {
  const times = args.stills.split(',').map(Number).sort((a, b) => a - b);
  let frame = 0;
  for (const t of times) {
    const target = Math.round(t * fps);
    while (frame < target - 1) {
      await page.evaluate((d) => window.__tour.step(d, false), dt);
      frame++;
    }
    const data = await page.evaluate((d) => window.__tour.step(d, true, 'image/png'), dt);
    frame++;
    const file = join(outDir, `still-${String(t).replace('.', '_')}.png`);
    writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
    console.log(`still @${t}s -> ${file}`);
  }
  await browser.close();
  served?.close();
  process.exit(0);
}

let first = 0;
let last = total;
let out = finalOut;
if (args.segment) {
  const [k, n] = args.segment.split('/').map(Number);
  first = Math.floor((total * k) / n);
  last = Math.floor((total * (k + 1)) / n);
  out = join(outDir, `segment-${k}.mp4`);
}
if (args.frames) last = Math.min(last, first + +args.frames);

console.log(`Rendering frames ${first}–${last - 1} of ${total} (${width}x${height} @ ${fps} fps) -> ${out}`);
const ff = spawn(
  FFMPEG,
  ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-tune', 'film',
    '-movflags', '+faststart', out],
  { stdio: ['pipe', 'inherit', 'inherit'] },
);
const ffDone = new Promise((r) => ff.on('close', r));

// Fast-forward (simulate without rendering) to the segment start so state is identical.
for (let i = 0; i < first; i++) await page.evaluate((d) => window.__tour.step(d, false), dt);

const tStart = Date.now();
for (let i = first; i < last; i++) {
  const data = await page.evaluate((d) => window.__tour.step(d, true, 'image/jpeg', 0.96), dt);
  const buf = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  const done = i - first + 1;
  if (done % 10 === 0 || i === last - 1) {
    const per = (Date.now() - tStart) / 1000 / done;
    const eta = ((last - i - 1) * per) / 60;
    console.log(`frame ${i + 1}/${total}  ${per.toFixed(2)} s/frame  ETA ${eta.toFixed(1)} min`);
  }
}
ff.stdin.end();
await ffDone;
await browser.close();
served?.close();
console.log(`Wrote ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB)`);
