// Разовая миграция: поле image → массив images и склейка парных скриншотов одной точки.
import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../data/spawns.json', import.meta.url);
const spawns = JSON.parse(await readFile(path, 'utf8'));

// Точки, которые нужно склеить в одну: [ [id-приёмник, ...ids-доноры], новое описание ]
const MERGES = [
  [
    ['customs-5', 'customs-6'],
    '2 этаж трёхэтажного общежития (комната 212), у внешней лестницы к машине',
  ],
];

for (const s of spawns) {
  if (!s.images) s.images = [s.image];
  delete s.image;
}

const byId = Object.fromEntries(spawns.map((s) => [s.id, s]));
const drop = new Set();

for (const [[target, ...donors], caption] of MERGES) {
  const main = byId[target];
  if (!main) throw new Error('нет точки ' + target);
  for (const id of donors) {
    const d = byId[id];
    if (!d) throw new Error('нет точки ' + id);
    main.images.push(...d.images);
    drop.add(id);
  }
  if (caption) main.caption = caption;
}

const out = spawns.filter((s) => !drop.has(s.id));
await writeFile(path, JSON.stringify(out, null, 2) + '\n');
console.log(`точек: ${spawns.length} → ${out.length}; склеено: ${drop.size}`);
