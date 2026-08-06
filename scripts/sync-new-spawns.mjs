// Досыпает в data/spawns.json точки, появившиеся в статье после прошлого разбора.
// Уже размеченные координаты, правки описаний и склейки не трогает.
//   node scripts/sync-new-spawns.mjs --dry-run   посмотреть, что добавится
//   node scripts/sync-new-spawns.mjs             применить
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const shotsDir = new URL('assets/screenshots/', root);
const DRY_RUN = process.argv.includes('--dry-run');

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

const sha1 = (data) => createHash('sha1').update(data).digest('hex');
const urlKey = (src) => sha1(src.split('?')[0]).slice(0, 8);

await mkdir(shotsDir, { recursive: true });

const raw = JSON.parse(await readFile(new URL('spawns-raw.json', root), 'utf8'));
const spawnsPath = new URL('data/spawns.json', root);
const spawns = JSON.parse(await readFile(spawnsPath, 'utf8'));

// Что уже есть: пути картинок и содержимое файлов (на случай перезалива в VK по новому адресу).
const known = new Set(spawns.flatMap((s) => s.images));
const byContent = new Map();
for (const file of await readdir(shotsDir)) {
  byContent.set(sha1(await readFile(new URL(file, shotsDir))), `assets/screenshots/${file}`);
}

// Кадры, которые остались в статье: по ним поймём, какие старые картинки исчезли.
const stillInArticle = new Set(
  raw.map((i) => `assets/screenshots/${MAP_ID[i.map]}-${DOC_ID[i.docType]}-${urlKey(i.src)}.jpg`)
);

/**
 * Ищет уже размеченную точку, для которой этот кадр — просто перезалив:
 * совпадают карта, тип и описание, а её прежние картинки из статьи пропали.
 */
function findReupload(mapId, docId, caption) {
  if (!caption) return null;
  return spawns.find(
    (s) =>
      s.map === mapId &&
      s.doc === docId &&
      s.caption === caption &&
      s.images.length &&
      s.images.every((p) => !stillInArticle.has(p))
  );
}

const added = [];
const swapped = [];
let skipped = 0;

for (const item of raw) {
  const mapId = MAP_ID[item.map];
  const docId = DOC_ID[item.docType];
  if (!mapId || !docId) throw new Error(`нет маппинга: ${item.map} / ${item.docType}`);

  const file = `${mapId}-${docId}-${urlKey(item.src)}.jpg`;
  const path = `assets/screenshots/${file}`;
  if (known.has(path)) {
    skipped++;
    continue;
  }

  const reupload = findReupload(mapId, docId, item.caption);

  if (DRY_RUN) {
    if (reupload) swapped.push({ id: reupload.id, caption: item.caption, placed: reupload.x != null });
    else added.push({ map: item.map, docType: item.docType, caption: item.caption, path });
    if (reupload) known.add(path); // чтобы второй такой же кадр не подменил ту же точку повторно
    continue;
  }

  const res = await fetch(item.src, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://vk.ru/' } });
  if (!res.ok) {
    console.error('FAIL', res.status, item.caption);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());

  // Тот же кадр байт в байт, перезалитый по другому адресу — ничего не делаем.
  const same = byContent.get(sha1(buf));
  if (same && known.has(same)) {
    skipped++;
    continue;
  }

  await writeFile(new URL(file, shotsDir), buf);
  byContent.set(sha1(buf), path);
  known.add(path);

  if (reupload) {
    // Точка та же, VK перезалил скриншот: подменяем картинку, координаты сохраняем.
    reupload.images = [path];
    swapped.push({ id: reupload.id, caption: item.caption, placed: reupload.x != null });
    continue;
  }

  spawns.push({
    id: `${mapId}-${urlKey(item.src)}`,
    map: mapId,
    mapName: item.map,
    doc: docId,
    docName: item.docType,
    caption: item.caption,
    captionEn: '',
    images: [path],
    x: null,
    y: null,
    floor: null,
  });
  added.push({ map: item.map, docType: item.docType, caption: item.caption, path });
}

if (!DRY_RUN && (added.length || swapped.length)) {
  await writeFile(spawnsPath, JSON.stringify(spawns, null, 2) + '\n');
}

/* ---------- отчёт ---------- */

console.log(`в статье: ${raw.length} · уже было: ${skipped} · ${DRY_RUN ? 'добавится' : 'добавлено'}: ${added.length}`);
if (swapped.length) {
  console.log(`\nПерезалито в VK — подменяем картинку, координаты сохраняем (${swapped.length}):`);
  for (const s of swapped) console.log(`  ${s.id}${s.placed ? ' [размечена]' : ''}: ${s.caption}`);
}

const byMap = {};
for (const a of added) (byMap[a.map] ??= []).push(a);
for (const [map, list] of Object.entries(byMap)) {
  console.log(`\n${map} (+${list.length})`);
  for (const a of list) console.log(`  [${a.docType}] ${a.caption || '(без описания)'}`);
}

// Точки, которых в статье больше нет — только сообщаем, ничего не удаляем.
const swappedIds = new Set(swapped.map((s) => s.id));
const orphans = spawns.filter(
  (s) => s.images.length && !swappedIds.has(s.id) && s.images.every((p) => !stillInArticle.has(p))
);
if (orphans.length) {
  console.log(`\nНет в новой версии статьи (${orphans.length}, оставлены как есть):`);
  for (const s of orphans) console.log(`  ${s.id}: ${s.caption || '(без описания)'}`);
}

console.log(`\nвсего точек: ${spawns.length} · размечено: ${spawns.filter((s) => s.x != null).length}`);
