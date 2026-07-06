import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const pub = join(dirname(fileURLToPath(import.meta.url)), 'public');
const favicon = readFileSync(join(pub, 'favicon.svg'));   // transparent circle badge
const appIcon = readFileSync(join(pub, 'icon-app.svg'));  // white-bg full-bleed

const jobs = [
  [favicon, 16,  'favicon-16.png'],
  [favicon, 32,  'favicon-32.png'],
  [favicon, 48,  'favicon-48.png'],
  [appIcon, 180, 'apple-touch-icon.png'],
  [appIcon, 192, 'icon-192.png'],
  [appIcon, 512, 'icon-512.png'],
];

for (const [buf, size, name] of jobs) {
  await sharp(buf, { density: 384 }).resize(size, size).png().toFile(join(pub, name));
  console.log('wrote', name, size + 'px');
}
console.log('done');
