// Produces dist-single/index.html: the production build with all JS/CSS inlined (for single-file hosting).
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');
html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g, (_, f) => {
  const js = readFileSync(join(dist, f), 'utf8').replace(/<\/script>/g, '<\\/script>');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/g, (_, f) => `<style>${readFileSync(join(dist, f), 'utf8')}</style>`);
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
mkdirSync('dist-single', { recursive: true });
writeFileSync('dist-single/index.html', html);
console.log('dist-single/index.html', (html.length / 1024).toFixed(0) + ' KB', 'assets:', readdirSync(join(dist, 'assets')).length);
// Fragment variant for hosts that supply their own <html>/<head>/<body> skeleton.
const frag = html
  .replace(/<!doctype html>/i, '')
  .replace(/<\/?html[^>]*>/g, '')
  .replace(/<\/?head>/g, '')
  .replace(/<\/?body>/g, '')
  .replace(/<meta charset[^>]*>/, '')
  .replace(/<meta name="viewport"[^>]*>/, '');
writeFileSync('dist-single/aperture.html', frag.trim() + '\n');
