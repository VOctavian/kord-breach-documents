// Добавляет в индекс git только те новые скриншоты, на которые ссылается data/spawns.json.
// Файлы, оставшиеся от удалённых точек, в коммит не попадают.
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const spawns = JSON.parse(await readFile(new URL('../data/spawns.json', import.meta.url), 'utf8'));
const refs = new Set(spawns.flatMap((s) => s.images));

const untracked = execSync('git ls-files --others --exclude-standard assets/screenshots', { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((p) => p.replaceAll('\\', '/'));

const add = untracked.filter((p) => refs.has(p));
const skip = untracked.filter((p) => !refs.has(p));

console.log(`добавляю: ${add.length} · пропускаю (ни одна точка не ссылается): ${skip.length}`);
for (const p of skip) console.log(`   пропуск: ${p}`);

if (add.length) {
  execSync(`git add ${add.map((p) => JSON.stringify(p)).join(' ')}`, { stdio: 'inherit' });
}
