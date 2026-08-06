// Скачивает скриншоты спавнов из VK в assets/screenshots/ и пишет spawns.json с локальными путями.
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const outDir = new URL('assets/screenshots/', root);
await mkdir(outDir, { recursive: true });

const raw = JSON.parse(await readFile(new URL('spawns-raw.json', root), 'utf8'));

const MAP_ID = {
  'Таможня': 'customs',
  'Развязка': 'interchange',
  'Улицы Таркова': 'streets',
  'Резерв': 'reserve',
  'Завод': 'factory',
  'Лес': 'woods',
  'Ледокол': 'icebreaker',
  'Эпицентр': 'groundzero',
  'Лаборатория': 'lab',
  'Лабиринт': 'labyrinth',
  'Берег': 'shoreline',
  'Маяк': 'lighthouse',
};

const DOC_ID = {
  'Финансовая документация': 'finansovaea',
  'Личные данные ЧВК': 'personal',
  'Проектная документация': 'proectnaea',
  'Чертежи и тех. документация': 'tehnicheskaea',
  'Тестовая документация': 'testovaea',
  'Пользовательская документация': 'polzovatelskoe',
  'Медицинская документация': 'meditsinskaea',
  'Эксплуатационная документация': 'expluatationnaea',
};

const spawns = [];
let n = 0;
for (const s of raw) {
  const mapId = MAP_ID[s.map];
  const docId = DOC_ID[s.docType];
  if (!mapId || !docId) throw new Error(`нет маппинга: ${s.map} / ${s.docType}`);
  const hash = createHash('sha1').update(s.src.split('?')[0]).digest('hex').slice(0, 8);
  const file = `${mapId}-${docId}-${hash}.jpg`;
  const dest = new URL(file, outDir);

  let ok = false;
  try { ok = (await stat(dest)).size > 1000; } catch {}
  if (!ok) {
    const res = await fetch(s.src, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://vk.ru/' } });
    if (!res.ok) { console.error('FAIL', res.status, file); continue; }
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  }
  spawns.push({
    id: `${mapId}-${++n}`,
    map: mapId,
    mapName: s.map,
    doc: docId,
    docName: s.docType,
    caption: s.caption,
    images: [`assets/screenshots/${file}`],
    x: null,
    y: null,
  });
  process.stdout.write('.');
}

await writeFile(new URL('data/spawns.json', root), JSON.stringify(spawns, null, 2));
console.log(`\nготово: ${spawns.length}`);
