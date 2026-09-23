// Packs .gltf files (+ external .bin and textures) into self-contained .glb files.
// Usage: node scripts/pack-glb.mjs <dir>   → writes <dir>/<name>.glb for each <name>.gltf
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
const pad = (n) => (4 - (n % 4)) % 4;
for (const f of readdirSync(dir).filter((f) => f.endsWith('.gltf'))) {
  const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const chunks = [];
  let offset = 0;
  const push = (buf) => {
    const start = offset;
    chunks.push(buf, Buffer.alloc(pad(buf.length)));
    offset += buf.length + pad(buf.length);
    return start;
  };
  const bufStarts = (j.buffers || []).map((b) => push(readFileSync(join(dir, b.uri))));
  for (const bv of j.bufferViews || []) bv.byteOffset = (bv.byteOffset || 0) + bufStarts[bv.buffer], (bv.buffer = 0);
  for (const img of j.images || []) {
    if (!img.uri) continue;
    const data = readFileSync(join(dir, img.uri));
    const start = push(data);
    j.bufferViews.push({ buffer: 0, byteOffset: start, byteLength: data.length });
    img.bufferView = j.bufferViews.length - 1;
    img.mimeType = img.uri.endsWith('.png') ? 'image/png' : 'image/jpeg';
    delete img.uri;
  }
  j.buffers = [{ byteLength: offset }];
  let json = Buffer.from(JSON.stringify(j));
  json = Buffer.concat([json, Buffer.alloc(pad(json.length), 0x20)]);
  const bin = Buffer.concat(chunks);
  const total = 12 + 8 + json.length + 8 + bin.length;
  const h = Buffer.alloc(12);
  h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  writeFileSync(join(dir, f.replace('.gltf', '.glb')), Buffer.concat([h, jh, json, bh, bin]));
}
console.log('packed');
