// Разовая доработка: восстановить пропущенные записи «Что нового».
//
// Правки точек с сайта коммитила Edge Function `commit`, а она до сих пор
// отправляла только data/spawns.json — записи в changelog не появлялось. Здесь
// собираем их задним числом тем же buildRelease, что и обычная публикация.
//
// Считаем по дню целиком, а не по каждому коммиту: за день точку могли добавить
// и тут же убрать (в один заход так ушло около двенадцати). Поштучные записи
// объявили бы посетителю новые точки, которых уже нет, и столько же «удалений»,
// которых по сути не было. Дневной разрез показывает то, что реально осталось.
//
//   node scripts/backfill-changelog.mjs            показать, что будет добавлено
//   node scripts/backfill-changelog.mjs --write    записать в data/changelog.json
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildRelease } from '../js/changelog-build.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WRITE = process.argv.includes('--write');
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();

const maps = JSON.parse(readFileSync(`${ROOT}data/maps.json`, 'utf8')).map((m) => m.id);
const history = JSON.parse(readFileSync(`${ROOT}data/changelog.json`, 'utf8'));

// Отправная точка — коммит, в котором changelog.json трогали последний раз.
const since = git(['log', '-1', '--format=%H', '--', 'data/changelog.json']);

// `git log` отдаёт новые сверху; идём от старых к новым, чтобы записи легли по порядку.
const commits = git(['log', '--format=%H%x09%cI', '--reverse', `${since}..HEAD`, '--', 'data/spawns.json'])
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    const [sha, iso] = l.split('\t');
    return { sha, iso };
  });

const at = (sha) => {
  try {
    return JSON.parse(git(['show', `${sha}:data/spawns.json`]));
  } catch {
    return null;
  }
};

// Дни в порядке возрастания: ключ — местная дата коммита.
const days = new Map();
for (const c of commits) {
  const key = new Date(c.iso).toLocaleDateString('sv-SE'); // sv-SE даёт ровно YYYY-MM-DD
  if (!days.has(key)) days.set(key, []);
  days.get(key).push(c);
}

const seen = new Set(history.map((r) => r.id));
const made = [];

for (const [day, list] of days) {
  // Состояние на начало дня — родитель первого коммита, на конец — последний коммит.
  const was = at(`${list[0].sha}^`);
  const last = list[list.length - 1];
  const now = at(last.sha);
  if (!now || !was) continue;

  const release = buildRelease(now, was, maps, new Date(last.iso));
  if (!release) continue;

  // id уже занят (в этот день публиковали и обычным путём) — разводим суффиксом:
  // по нему попап отмеряет прочитанное, дубли ломали бы отсчёт.
  let id = release.id;
  for (let n = 2; seen.has(id); n++) id = `${release.id}-${n}`;
  release.id = id;
  seen.add(id);

  release.sha = `${day}, коммитов: ${list.length}`;
  made.push(release);
}

const tally = (r) => {
  const n = { added: 0, fixed: 0, removed: 0 };
  for (const g of r.maps) {
    n.added += g.added.length;
    n.fixed += g.fixed.length;
    n.removed += g.removed.length;
  }
  return n;
};

console.log(`\nКоммитов с правками точек после ${since.slice(0, 7)}: ${commits.length}`);
console.log(`Дней с изменениями: ${made.length}\n`);

const total = { added: 0, fixed: 0, removed: 0 };
for (const r of made) {
  const n = tally(r);
  for (const k of Object.keys(total)) total[k] += n[k];
  const parts = [n.added && `+${n.added}`, n.fixed && `✎${n.fixed}`, n.removed && `−${n.removed}`].filter(Boolean);
  console.log(`  ${r.at}  (${r.sha})`);
  console.log(`      ${parts.join(' ').padEnd(14)} ${r.maps.map((g) => `${g.map}`).join(', ')}`);
}
console.log(`\nВсего по записям: +${total.added} ✎${total.fixed} −${total.removed}`);

if (!WRITE) {
  console.log('\nЭто предпросмотр. Записать: node scripts/backfill-changelog.mjs --write\n');
  process.exit(0);
}

// sha держали только для отчёта — в данные он не нужен.
for (const r of made) delete r.sha;
// Новые записи идут сверху, самая свежая первой.
const next = [...made.reverse(), ...history];
writeFileSync(`${ROOT}data/changelog.json`, JSON.stringify(next, null, 2) + '\n', 'utf8');
console.log(`\nЗаписано: было ${history.length}, стало ${next.length}\n`);
