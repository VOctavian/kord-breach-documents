// Сравнивает разобранную статью с data/spawns.json и показывает, чего у нас ещё нет.
// Сначала сверяет по хешу URL (так называет файлы download-screenshots.mjs),
// затем по содержимому — на случай, если скриншот залили через редактор вручную.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const sha = (buf) => createHash('sha1').update(buf).digest('hex');

const raw = JSON.parse(await readFile(new URL('spawns-raw.json', root), 'utf8'));
const spawns = JSON.parse(await readFile(new URL('data/spawns.json', root), 'utf8'));

const files = await readdir(new URL('assets/screenshots/', root));
const onDisk = new Set(files);

// Хеши содержимого всех скриншотов, что уже лежат у нас.
const contentHashes = new Map();
for (const f of files) {
  contentHashes.set(sha(await readFile(new URL('assets/screenshots/' + f, root))), f);
}

const used = new Set(spawns.flatMap((s) => s.images ?? []));
const captions = new Set(spawns.map((s) => (s.caption ?? '').trim().toLowerCase()));

const MAP_ID = {
  'Таможня': 'customs', 'Развязка': 'interchange', 'Улицы Таркова': 'streets', 'Резерв': 'reserve',
  'Завод': 'factory', 'Лес': 'woods', 'Ледокол': 'icebreaker', 'Эпицентр': 'groundzero',
  'Лаборатория': 'lab', 'Лабиринт': 'labyrinth', 'Берег': 'shoreline', 'Маяк': 'lighthouse',
};
const DOC_ID = {
  'Финансовая документация': 'finansovaea', 'Личные данные ЧВК': 'personal',
  'Проектная документация': 'proectnaea', 'Чертежи и тех. документация': 'tehnicheskaea',
  'Тестовая документация': 'testovaea', 'Пользовательская документация': 'polzovatelskoe',
  'Медицинская документация': 'meditsinskaea', 'Эксплуатационная документация': 'expluatationnaea',
};

const fresh = [];
let byUrl = 0;
let byContent = 0;

for (const item of raw) {
  const mapId = MAP_ID[item.map];
  const docId = DOC_ID[item.docType];
  if (!mapId || !docId) {
    console.log('НЕТ МАППИНГА:', item.map, '/', item.docType);
    continue;
  }
  const file = `${mapId}-${docId}-${sha(item.src.split('?')[0]).slice(0, 8)}.jpg`;
  if (onDisk.has(file) && used.has(`assets/screenshots/${file}`)) {
    byUrl++;
    continue;
  }

  const res = await fetch(item.src, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://vk.ru/' } });
  if (!res.ok) {
    console.log('не скачался:', res.status, item.caption);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const known = contentHashes.get(sha(buf));
  if (known && used.has(`assets/screenshots/${known}`)) {
    byContent++;
    continue;
  }
  fresh.push({ ...item, mapId, docId, file, buf, sameCaption: captions.has(item.caption.trim().toLowerCase()) });
}

console.log(`\nв статье: ${raw.length} · у нас: ${spawns.length}`);
console.log(`совпало по ссылке: ${byUrl}, по содержимому: ${byContent}`);
console.log(`\nНОВЫХ: ${fresh.length}`);
for (const f of fresh) {
  console.log(`\n  [${f.map} · ${f.docType}]`);
  console.log(`  ${f.caption}`);
  console.log(`  ${f.sameCaption ? 'описание уже встречается у существующей точки' : 'описание новое'} · ${f.file}`);
}

if (process.argv.includes('--write')) {
  const { writeFile } = await import('node:fs/promises');
  for (const f of fresh) await writeFile(new URL('assets/screenshots/' + f.file, root), f.buf);
  await writeFile(
    new URL('new-spawns.json', root),
    JSON.stringify(
      fresh.map((f) => ({
        map: f.mapId, mapName: f.map, doc: f.docId, docName: f.docType,
        caption: f.caption, images: [`assets/screenshots/${f.file}`],
      })),
      null, 2
    )
  );
  console.log(`\nскриншоты сохранены, список в new-spawns.json`);
}
