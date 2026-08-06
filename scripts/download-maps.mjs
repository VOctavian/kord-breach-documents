// Скачивает базовые изображения карт с EFT Wiki и обновляет размеры в data/maps.json.
import { writeFile, readFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const outDir = new URL('assets/maps/', root);
await mkdir(outDir, { recursive: true });

// Обрезка пустого поля снизу: доля высоты оригинала, которую оставляем.
const CROP = { factory: 0.63 };

const WIKI_FILES = {
  customs: 'Customs_Interactive_Map_Base.png',
  factory: 'Factory2DMapbyRe3mr.jpg',
  groundzero: 'Ground_Zero_Interactive_Map_Base.png',
  interchange: 'Interchange_Interactive_Map_Base.webp',
  lab: 'The_Lab_Interactive_Map_Base.png',
  lighthouse: 'Lighthouse_Interactive_Map_Base.png',
  reserve: 'Reserve_Interactive_Map_Base.png',
  shoreline: 'Shoreline_Interactive_Map_Base.png',
  streets: 'Streets_of_Tarkov_Interactive_Map_Base.png',
  woods: 'Woods_Interactive_Map_Base.png',
  labyrinth: 'The_Labyrinth_Interactive_Map_Base.png',
  icebreaker: 'Icebreaker_Interactive_Map_Base.png',
};

const MAX_WIDTH = 2600;
const API = 'https://escapefromtarkov.fandom.com/api.php';
const UA = { 'User-Agent': 'Mozilla/5.0 (kord-breach-spawns/1.0)' };

const titles = Object.values(WIKI_FILES).map((f) => 'File:' + f).join('|');
const info = await fetch(
  `${API}?format=json&action=query&prop=imageinfo&iiprop=url|size&titles=${encodeURIComponent(titles)}`,
  { headers: UA }
).then((r) => r.json());

const byTitle = {};
for (const page of Object.values(info.query.pages)) {
  byTitle[page.title.replace('File:', '').replace(/ /g, '_')] = page.imageinfo?.[0];
}

/** Размеры WebP из заголовка RIFF (VP8 / VP8L / VP8X). */
function webpSize(buf) {
  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8 ') return { width: (buf.readUInt16LE(26) & 0x3fff), height: (buf.readUInt16LE(28) & 0x3fff) };
  if (fourcc === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (fourcc === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  throw new Error('не WebP: ' + fourcc);
}

const maps = JSON.parse(await readFile(new URL('data/maps.json', root), 'utf8'));

// Без аргументов качаем все карты, иначе только перечисленные: node scripts/download-maps.mjs customs
const only = process.argv.slice(2);

for (const map of maps) {
  if (only.length && !only.includes(map.id)) continue;
  const wikiName = WIKI_FILES[map.id];
  const meta = byTitle[wikiName];
  if (!meta) {
    console.error('нет на вики:', map.id, wikiName);
    continue;
  }
  const width = Math.min(MAX_WIDTH, meta.width);
  const base = meta.url.split('/revision/')[0];
  const cb = meta.url.split('cb=')[1] ?? '';
  const crop = CROP[map.id];
  const url = crop
    ? `${base}/revision/latest/window-crop/width/${width}/x-offset/0/y-offset/0` +
      `/window-width/${meta.width}/window-height/${Math.round(meta.height * crop)}?cb=${cb}&format=webply`
    : `${base}/revision/latest/scale-to-width-down/${width}?cb=${cb}&format=webply`;

  const res = await fetch(url, { headers: UA });
  if (!res.ok) {
    console.error('FAIL', map.id, res.status);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const file = `${map.id}.webp`;
  await writeFile(new URL(file, outDir), buf);

  const size = webpSize(buf);
  map.file = `assets/maps/${file}`;
  map.type = 'raster';
  map.width = size.width;
  map.height = size.height;
  delete map.floors;
  console.log(`${map.id.padEnd(12)} ${size.width}x${size.height}  ${(buf.length / 1024 / 1024).toFixed(2)} МБ`);
}

await writeFile(new URL('data/maps.json', root), JSON.stringify(maps, null, 2) + '\n');
console.log('data/maps.json обновлён');
