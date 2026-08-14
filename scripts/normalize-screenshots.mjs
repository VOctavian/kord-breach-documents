// Разовая нормализация уже лежащих скриншотов: PNG из редактора весит 1–3 МБ,
// тот же кадр в JPEG — около 130 КБ, и на глаз они не отличаются. Скрипт перекодирует
// все PNG, на которые ссылается data/spawns.json, переписывает в нём пути и удаляет исходники.
// Повторный запуск ничего не делает: PNG среди ссылок уже не остаётся.
//
// Нужен sharp — в зависимости проекта он не идёт, ставится на время:
//   npm i --no-save sharp     (node_modules в .gitignore, в репозиторий не попадёт)
import { readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const MAX_WIDTH = 1920; // столько же режет редактор перед загрузкой — js/shot-encode.js
const QUALITY = 85;

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.error('нужен sharp: npm i --no-save sharp');
  process.exit(1);
}

const root = new URL('../', import.meta.url);
const spawnsFile = new URL('data/spawns.json', root);
let json = await readFile(spawnsFile, 'utf8');
const spawns = JSON.parse(json);

const pngs = [...new Set(spawns.flatMap((s) => s.images ?? []).filter((p) => p.endsWith('.png')))];
if (!pngs.length) {
  console.log('PNG среди скриншотов нет — делать нечего');
  process.exit(0);
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} МБ`;
let was = 0;
let now = 0;

for (const path of pngs) {
  const jpgPath = path.replace(/\.png$/, '.jpg');
  const from = fileURLToPath(new URL(path, root));
  const to = fileURLToPath(new URL(jpgPath, root));

  // Имя файла оставляем прежним, меняется только расширение: так в истории видно,
  // что это тот же кадр, а не новый.
  let clash = false;
  try { clash = Boolean(await stat(to)); } catch {}
  if (clash) {
    console.error(`пропуск: ${jpgPath} уже существует`);
    continue;
  }

  const before = (await stat(from)).size;
  const buf = await sharp(from)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: QUALITY, progressive: true, mozjpeg: true })
    .toBuffer();

  if (buf.length >= before) {
    console.error(`пропуск: ${path} в JPEG не худеет (${before} → ${buf.length})`);
    continue;
  }

  await writeFile(to, buf);
  await unlink(from);
  json = json.replaceAll(`"${path}"`, `"${jpgPath}"`);
  was += before;
  now += buf.length;
  process.stdout.write('.');
}

await writeFile(spawnsFile, json);
console.log(`\nготово: ${pngs.length} файлов, ${mb(was)} → ${mb(now)} (−${((1 - now / was) * 100).toFixed(0)} %)`);
