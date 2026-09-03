// Генератор QR-картинок для реквизитов.
//
// Зависимостей в проекте нет и заводить их ради одной картинки не хочется,
// поэтому код собирается здесь целиком: коррекция Рида — Соломона, раскладка
// модулей, выбор маски и запись PNG. Проверить результат можно соседним
// scripts/read-qr.mjs — он читает картинку обратно.
//
//   node scripts/make-qr.mjs assets/misc/foo_qr.png "https://example.com"
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { CAPACITY, ecc, split } from './qr-rs.mjs';

const VERSION = 4; // 33×33 модуля — как у остальных картинок в assets/misc
const LEVEL = 'M';

// --- Данные -------------------------------------------------------------------

const [, , file, text] = process.argv;
if (!file || !text) throw new Error('нужны путь к картинке и содержимое');

const payload = Buffer.from(text, 'utf8');
const row = CAPACITY[VERSION];
const [dataBytes, blocks] = row['LMQH'.indexOf(LEVEL)];
const ecPerBlock = (row[4] - dataBytes) / blocks;

const bits = [];
const push = (v, k) => {
  for (let i = k - 1; i >= 0; i--) bits.push((v >> i) & 1);
};
push(4, 4); // байтовый режим
push(payload.length, VERSION < 10 ? 8 : 16);
for (const b of payload) push(b, 8);
if (bits.length > dataBytes * 8)
  throw new Error(`${payload.length} байт не влезает в версию ${VERSION}${LEVEL}`);

for (let i = 0; i < 4 && bits.length < dataBytes * 8; i++) bits.push(0); // ограничитель
while (bits.length % 8) bits.push(0);

const cw = [];
for (let i = 0; i < bits.length; i += 8) cw.push(bits.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0));
for (let i = 0; cw.length < dataBytes; i++) cw.push(i % 2 ? 0x11 : 0xec); // добивка

const parts = split(cw, dataBytes, blocks);
const eccs = parts.map((d) => ecc(d, ecPerBlock));

// Переплетаем: сначала по байту из каждого блока данных, потом так же коррекция.
const stream = [];
for (let j = 0; j < Math.max(...parts.map((b) => b.length)); j++)
  for (const b of parts) if (j < b.length) stream.push(b[j]);
for (let j = 0; j < ecPerBlock; j++) for (const b of eccs) stream.push(b[j]);

// --- Раскладка модулей --------------------------------------------------------

const n = VERSION * 4 + 17;
const m = Array.from({ length: n }, () => new Array(n).fill(0));
const fixed = Array.from({ length: n }, () => new Array(n).fill(false));
const set = (r, c, dark) => {
  if (r < 0 || c < 0 || r >= n || c >= n) return;
  m[r][c] = dark ? 1 : 0;
  fixed[r][c] = true;
};

for (const [r, c] of [[3, 3], [3, n - 4], [n - 4, 3]]) // глаза вместе с отбивкой
  for (let dr = -4; dr <= 4; dr++)
    for (let dc = -4; dc <= 4; dc++) {
      const d = Math.max(Math.abs(dr), Math.abs(dc));
      set(r + dr, c + dc, d !== 2 && d !== 4);
    }

for (let i = 0; i < n; i++) {
  set(6, i, i % 2 === 0); // синхродорожки
  set(i, 6, i % 2 === 0);
}

// С версии 7 выравнивающих узоров становится больше одного и добавляется блок
// с номером версии — тогда раскладку ниже придётся расширять.
if (VERSION < 2 || VERSION > 6) throw new Error(`раскладка написана под версии 2–6, задана ${VERSION}`);

{
  // выравнивающий узор в правом нижнем углу
  for (let dr = -2; dr <= 2; dr++)
    for (let dc = -2; dc <= 2; dc++)
      set(n - 7 + dr, n - 7 + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
}

/** Строка формата: уровень и маска, защищённые кодом БЧХ. */
function formatBits(mask) {
  const data = ([1, 0, 3, 2]['LMQH'.indexOf(LEVEL)] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return (((data << 10) | rem) ^ 0x5412) >>> 0;
}

/** Разложить строку формата в две копии — у левого верхнего глаза и у двух других. */
function drawFormat(mask) {
  const f = formatBits(mask);
  const bit = (i) => (f >> i) & 1;
  for (let i = 0; i <= 5; i++) set(i, 8, bit(i));
  set(7, 8, bit(6));
  set(8, 8, bit(7));
  set(8, 7, bit(8));
  for (let i = 9; i < 15; i++) set(8, 14 - i, bit(i));
  for (let i = 0; i < 8; i++) set(8, n - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) set(n - 15 + i, 8, bit(i));
  set(n - 8, 8, 1); // всегда тёмный модуль
}

drawFormat(0); // пока только чтобы занять места — настоящую маску впишем позже

// Данные идут парами колонок снизу вверх и обратно, змейкой.
const cells = [];
for (let right = n - 1; right > 0; right -= 2) {
  if (right === 6) right--; // колонку синхродорожки перепрыгиваем
  const up = ((right + 1) & 2) === 0;
  for (let i = 0; i < n; i++) {
    const r = up ? n - 1 - i : i;
    for (const c of [right, right - 1]) if (!fixed[r][c]) cells.push([r, c]);
  }
}
cells.forEach(([r, c], i) => {
  m[r][c] = i < stream.length * 8 ? (stream[i >> 3] >> (7 - (i & 7))) & 1 : 0;
});

const MASK = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

const apply = (id) => {
  for (const [r, c] of cells) m[r][c] ^= MASK[id](r, c) ? 1 : 0;
};

/**
 * Штраф за узор. Маска выбирается по нему: чем меньше, тем легче считывателю —
 * наказываются длинные однотонные полосы, квадраты, куски, похожие на глаз,
 * и общий перекос в тёмное или светлое.
 */
function penalty() {
  let score = 0;
  const lines = [];
  for (let i = 0; i < n; i++) {
    lines.push(m[i].join(''));
    lines.push(m.map((r) => r[i]).join(''));
  }
  for (const line of lines) {
    for (const run of line.match(/0+|1+/g)) if (run.length >= 5) score += 3 + run.length - 5;
    // Глаз — это 1011101, отделённый светлым полем; поле по краю картинки тоже светлое.
    const padded = '0000' + line + '0000';
    for (const p of ['00001011101', '10111010000'])
      for (let i = padded.indexOf(p); i >= 0; i = padded.indexOf(p, i + 1)) score += 40;
  }
  for (let r = 0; r + 1 < n; r++)
    for (let c = 0; c + 1 < n; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  const dark = m.flat().reduce((a, b) => a + b, 0);
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return score;
}

let best = 0;
let bestScore = Infinity;
for (let id = 0; id < 8; id++) {
  apply(id);
  drawFormat(id);
  const s = penalty();
  if (s < bestScore) {
    bestScore = s;
    best = id;
  }
  apply(id); // XOR обратим — снимаем маску перед следующей примеркой
}
apply(best);
drawFormat(best);

// --- PNG ----------------------------------------------------------------------

const SCALE = 12;
const QUIET = 4; // светлое поле по краю, без него код не читается

function png() {
  const side = (n + QUIET * 2) * SCALE;
  const rowBytes = Math.ceil(side / 8);
  const raw = Buffer.alloc((rowBytes + 1) * side);
  for (let y = 0; y < side; y++) {
    const r = Math.floor(y / SCALE) - QUIET;
    const line = raw.subarray(y * (rowBytes + 1) + 1, (y + 1) * (rowBytes + 1));
    if (r < 0 || r >= n) continue;
    for (let x = 0; x < side; x++) {
      const c = Math.floor(x / SCALE) - QUIET;
      if (c >= 0 && c < n && m[r][c]) line[x >> 3] |= 0x80 >> (x & 7);
    }
  }

  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body) >>> 0, body.length + 4);
    return out;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr[8] = 1; // бит на пиксель
  ihdr[9] = 3; // палитра
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from([255, 255, 255, 0, 0, 0])),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = png();
writeFileSync(file, out);
console.log(`\n${file} — ${out.length} байт, ${(n + QUIET * 2) * SCALE}×${(n + QUIET * 2) * SCALE}`);
console.log(`версия ${VERSION}${LEVEL}, маска ${best} (штраф ${bestScore})`);
console.log(`\n  ${text}\n`);
