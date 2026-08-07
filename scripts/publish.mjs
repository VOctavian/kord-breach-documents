// Публикация обновлений разметки: проверки → коммит → пуш → ожидание деплоя.
//
//   node scripts/publish.mjs              проверить, закоммитить, запушить, дождаться сайта
//   node scripts/publish.mjs --dry-run    только проверки и предпросмотр коммита
//   node scripts/publish.mjs --all        добавить в коммит вообще все изменения, не только данные
//   node scripts/publish.mjs -m "текст"   своё сообщение коммита
//   node scripts/publish.mjs --no-wait    не ждать деплой
import { execSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://voctavian.github.io/kord-breach-documents';
const PATHS = ['data', 'assets/screenshots'];

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const DRY = has('--dry-run');
const ALL = has('--all');
const WAIT = !has('--no-wait');
const message = argv[argv.indexOf('-m') + 1] && argv.includes('-m') ? argv[argv.indexOf('-m') + 1] : null;

const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim();
const gh = (args) => execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8' }).trim();

const ok = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const warn = (s) => console.log(`  \x1b[33m!\x1b[0m ${s}`);
const fail = (s) => {
  console.error(`  \x1b[31m✗\x1b[0m ${s}`);
  process.exitCode = 1;
};

/* ---------- 1. проверка данных ---------- */

console.log('\nПроверка данных');

const spawns = JSON.parse(readFileSync(`${ROOT}data/spawns.json`, 'utf8'));
const maps = JSON.parse(readFileSync(`${ROOT}data/maps.json`, 'utf8'));
const docs = JSON.parse(readFileSync(`${ROOT}data/docs.json`, 'utf8'));
const mapIds = new Set(maps.map((m) => m.id));
const docIds = new Set(docs.map((d) => d.id));

const dupes = spawns.map((s) => s.id).filter((id, i, a) => a.indexOf(id) !== i);
if (dupes.length) fail(`повторяющиеся id: ${[...new Set(dupes)].join(', ')}`);

const badMap = spawns.filter((s) => !mapIds.has(s.map));
if (badMap.length) fail(`неизвестная локация: ${badMap.map((s) => `${s.id}→${s.map}`).join(', ')}`);

const badDoc = spawns.filter((s) => !docIds.has(s.doc));
if (badDoc.length) fail(`неизвестный тип документации: ${badDoc.map((s) => `${s.id}→${s.doc}`).join(', ')}`);

const broken = spawns.flatMap((s) => (s.images ?? []).filter((p) => !existsSync(ROOT + p)).map((p) => `${s.id} → ${p}`));
if (broken.length) fail(`нет файлов скриншотов:\n      ${broken.join('\n      ')}`);

if (process.exitCode) {
  console.error('\nПубликация отменена: сначала почини данные.\n');
  process.exit(1);
}

const published = spawns.filter((s) => s.caption?.trim() || s.images?.length);
const unplaced = published.filter((s) => s.x == null);
const drafts = spawns.length - published.length;

const used = new Set(spawns.flatMap((s) => s.images ?? []));
const orphans = readdirSync(`${ROOT}assets/screenshots`)
  .map((f) => `assets/screenshots/${f}`)
  .filter((p) => !used.has(p));

ok(`${spawns.length} точек, ссылки на скриншоты целы`);
if (drafts) warn(`${drafts} пустых заготовок — на сайт не попадут`);
if (orphans.length) warn(`${orphans.length} скриншотов ничем не используется:\n      ${orphans.join('\n      ')}`);
if (unplaced.length) warn(`${unplaced.length} без координат — на карте не покажутся: ${unplaced.map((s) => s.id).join(', ')}`);

/* ---------- 2. что изменилось ---------- */

const changed = git(['status', '--porcelain', '--', ...(ALL ? ['.'] : PATHS)]);
if (!changed) {
  console.log('\nИзменений нет — публиковать нечего.\n');
  process.exit(0);
}

let summary = [];
try {
  const before = JSON.parse(git(['show', 'HEAD:data/spawns.json']));
  const was = new Map(before.map((s) => [s.id, s]));
  const now = new Map(spawns.map((s) => [s.id, s]));

  const added = spawns.filter((s) => !was.has(s.id));
  const removed = before.filter((s) => !now.has(s.id));
  const newlyPlaced = spawns.filter((s) => was.get(s.id)?.x == null && s.x != null);
  const moved = spawns.filter((s) => {
    const b = was.get(s.id);
    return b && b.x != null && s.x != null && (b.x !== s.x || b.y !== s.y);
  });
  const retitled = spawns.filter((s) => was.has(s.id) && was.get(s.id).caption !== s.caption);

  if (added.length) summary.push(`новых точек: ${added.length}`);
  if (removed.length) summary.push(`удалено: ${removed.length}`);
  if (newlyPlaced.length) summary.push(`размечено: ${newlyPlaced.length}`);
  if (moved.length) summary.push(`сдвинуто: ${moved.length}`);
  if (retitled.length) summary.push(`описаний правлено: ${retitled.length}`);
} catch {
  summary.push('обновление данных');
}

const subject = message ?? `Обновление спавнов: ${summary.join(', ') || 'правки данных'}`;
const body = `Итого ${published.length} точек, из них ${published.length - unplaced.length} с координатами.`;

console.log('\nИзменения');
console.log(
  changed
    .split('\n')
    .map((l) => '  ' + l)
    .join('\n')
);
console.log(`\nКоммит\n  ${subject}\n  ${body}`);

if (DRY) {
  console.log('\n--dry-run: ничего не сделано.\n');
  process.exit(0);
}

/* ---------- 3. коммит и пуш ---------- */

console.log('\nПубликация');
git(['add', '--', ...(ALL ? ['.'] : PATHS)]);
git(['commit', '-m', subject, '-m', body, '-m', 'Co-Authored-By: Claude <noreply@anthropic.com>']);
const sha = git(['rev-parse', 'HEAD']).slice(0, 7);
git(['push', 'origin', 'HEAD']);
ok(`закоммичено и запушено: ${sha}`);

if (!WAIT) {
  console.log(`\nДеплой запустится сам. Проверить: gh run list --workflow=deploy.yml --limit 3\n`);
  process.exit(0);
}

/* ---------- 4. ожидание деплоя ---------- */

try {
  execSync('gh --version', { stdio: 'ignore' });
} catch {
  console.log('\ngh не найден — деплой пойдёт сам, но подождать его отсюда не получится.\n');
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runFor(shaFull) {
  for (let i = 0; i < 12; i++) {
    const list = JSON.parse(gh(['run', 'list', '--workflow=deploy.yml', '--limit', '5', '--json', 'databaseId,headSha,status,conclusion']));
    const run = list.find((r) => r.headSha.startsWith(shaFull));
    if (run) return run;
    await sleep(5000);
  }
  return null;
}

async function waitRun(id) {
  // GitHub Actions временами подвисает, поэтому опрашиваем сами, а не через `gh run watch`.
  for (let i = 0; i < 80; i++) {
    const r = JSON.parse(gh(['run', 'view', String(id), '--json', 'status,conclusion']));
    if (r.status === 'completed') return r.conclusion;
    process.stdout.write('.');
    await sleep(15000);
  }
  return 'timeout';
}

let run = await runFor(sha);
if (!run) {
  console.log('  прогон не появился — запусти вручную: gh workflow run deploy.yml --ref main');
  process.exit(0);
}

process.stdout.write(`  жду деплой ${run.databaseId} `);
let result = await waitRun(run.databaseId);

if (result !== 'success') {
  console.log(`\n  первый прогон: ${result}, перезапускаю`);
  try {
    gh(['run', 'rerun', String(run.databaseId)]);
    process.stdout.write('  жду повтор ');
    result = await waitRun(run.databaseId);
  } catch (e) {
    console.log('  перезапустить не вышло:', e.message.split('\n')[0]);
  }
}
console.log('');

if (result !== 'success') {
  warn(`деплой не прошёл (${result}). У GitHub Pages бывают долгие перебои — попробуй позже:`);
  console.log(`      gh run rerun ${run.databaseId}\n`);
  process.exit(1);
}
ok('деплой прошёл');

/* ---------- 5. проверка живого сайта ---------- */

const live = await fetch(`${SITE}/data/spawns.json`, { cache: 'no-store' }).then((r) => r.json());
if (live.length === spawns.length) ok(`сайт отдаёт ${live.length} точек — совпадает`);
else warn(`сайт отдаёт ${live.length} точек, локально ${spawns.length} — CDN мог не успеть обновиться`);

console.log(`\n${SITE}\n`);
