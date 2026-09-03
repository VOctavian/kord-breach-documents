// Разовая проверка: что зашито в QR-картинке.
//
// Готовых декодеров в проекте нет и заводить зависимость ради одной проверки
// не хочется, поэтому читаем сами. Картинка синтетическая (ровная сетка,
// без шума и перспективы), так что можно обойтись без поиска углов и без
// коррекции ошибок — просто снять модули и разобрать поток.
//
//   node scripts/read-qr.mjs assets/misc/donationalerts_qr.png
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { CAPACITY, ecc, split } from './qr-rs.mjs';

/** PNG → функция «яркость пикселя (x, y)» плюс размеры. */
function png(buf) {
  let pos = 8; // сигнатура
  const idat = [];
  let w, h, depth, color, palette;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      color = data[9];
      if (data[12] !== 0) throw new Error('чересстрочный PNG не поддержан');
    } else if (type === 'PLTE') palette = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (channels == null) throw new Error(`тип цвета ${color} не поддержан`);
  const bpp = Math.max(1, (channels * depth) / 8);
  const rowBytes = Math.ceil((channels * depth * w) / 8);

  // Снимаем построчные фильтры PNG: каждая строка предсказана от соседей.
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * rowBytes);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (rowBytes + 1)];
    const src = raw.subarray(y * (rowBytes + 1) + 1, (y + 1) * (rowBytes + 1));
    const line = out.subarray(y * rowBytes, (y + 1) * rowBytes);
    const prev = y ? out.subarray((y - 1) * rowBytes, y * rowBytes) : Buffer.alloc(rowBytes);
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
  }

  const sample = (x, y, ch) => {
    if (depth === 8) return out[y * rowBytes + x * channels + ch];
    if (depth === 1) {
      const bit = x * channels + ch;
      return (out[y * rowBytes + (bit >> 3)] >> (7 - (bit & 7))) & 1 ? 255 : 0;
    }
    throw new Error(`глубина ${depth} бит не поддержана`);
  };

  const dark = (x, y) => {
    if (color === 3) {
      const i = depth === 8 ? out[y * rowBytes + x] : sample(x, y, 0) && 1;
      return palette[i * 3] < 128;
    }
    return sample(x, y, 0) < 128;
  };
  return { w, h, dark };
}

/** Пиксели → матрица модулей. Границы ищем по краям тёмного, шаг — по кванту. */
function modules({ w, h, dark }) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (dark(x, y)) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  const side = x1 - x0 + 1;

  // Левый верхний глаз — ровно 7 модулей: по нему и меряем шаг.
  let run = 0;
  while (dark(x0 + run, y0)) run++;
  const step = run / 7;
  const n = Math.round(side / step);
  if (n % 4 !== 1) throw new Error(`не похоже на QR: ${n} модулей в строке`);

  const m = [];
  for (let r = 0; r < n; r++) {
    m.push([]);
    for (let c = 0; c < n; c++) {
      m[r].push(dark(Math.round(x0 + (c + 0.5) * step), Math.round(y0 + (r + 0.5) * step)) ? 1 : 0);
    }
  }
  return m;
}

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

/** Координаты центров выравнивающих узоров для версии. */
function aligns(version) {
  if (version < 2) return [];
  const count = Math.floor(version / 7) + 2;
  const last = version * 4 + 10;
  const step = version === 32 ? 26 : Math.ceil((last - 6) / (count - 1) / 2) * 2;
  const out = [6];
  for (let i = count - 1; i > 0; i--) out.splice(1, 0, last - (count - 1 - i) * step);
  return out;
}

/** Карта служебных модулей: их пропускаем при чтении данных. */
function reserved(n, version) {
  const f = Array.from({ length: n }, () => new Array(n).fill(false));
  const mark = (r, c, h, w) => {
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) if (f[r + i]) f[r + i][c + j] = true;
  };
  for (const [r, c] of [[0, 0], [0, n - 8], [n - 8, 0]]) mark(r, c, 9, 9); // глаза + формат
  mark(6, 0, 1, n); // синхродорожки
  mark(0, 6, n, 1);
  const a = aligns(version);
  for (const r of a)
    for (const c of a) {
      const eye = (r === 6 && c === 6) || (r === 6 && c === a.at(-1)) || (r === a.at(-1) && c === 6);
      if (!eye) mark(r - 2, c - 2, 5, 5);
    }
  if (version >= 7) {
    mark(0, n - 11, 6, 3);
    mark(n - 11, 0, 3, 6);
  }
  return f;
}

const file = process.argv[2];
if (!file) throw new Error('укажите путь к картинке');
const m = modules(png(readFileSync(file)));
const n = m.length;
const version = (n - 17) / 4;

// Номер маски — биты 12..10 строки формата. Старшая половина строки лежит в
// ряду 8 справа налево от глаза, то есть эти биты — колонки 2, 3 и 4. Строка
// защищена XOR с 0b101010000010010, на нужные три бита приходится 1, 0, 1.
const maskId = ((m[8][2] ^ 1) << 2) | ((m[8][3] ^ 0) << 1) | (m[8][4] ^ 1);
const mask = MASK[maskId];
const skip = reserved(n, version);

// Данные идут парами колонок снизу вверх и обратно, змейкой.
const stream = [];
let up = true;
for (let right = n - 1; right > 0; right -= 2) {
  if (right === 6) right--; // колонку синхродорожки перепрыгиваем
  for (let i = 0; i < n; i++) {
    const r = up ? n - 1 - i : i;
    for (const c of [right, right - 1]) {
      if (skip[r][c]) continue;
      stream.push(m[r][c] ^ (mask(r, c) ? 1 : 0));
    }
  }
  up = !up;
}

// Уровень коррекции — биты 14 и 13 строки формата, то есть колонки 0 и 1 ряда 8.
const ecBits = ((m[8][0] ^ 1) << 1) | (m[8][1] ^ 0);
const ecLevel = [1, 0, 3, 2][ecBits]; // 01=L, 00=M, 11=Q, 10=H → индекс в CAPACITY
const rowCap = CAPACITY[version];
if (!rowCap) throw new Error(`версии ${version} нет в таблице`);
const [dataBytes, blocks] = rowCap[ecLevel];
const ecPerBlock = (rowCap[4] - dataBytes) / blocks;

/**
 * Расплести кодовые слова. В потоке они лежат по кругу: первый байт каждого
 * блока, потом вторые и так далее — читать подряд нельзя. Блоки бывают разной
 * длины, длинные добираются в последнем круге.
 */
function deinterleave(cw, count, len) {
  const parts = Array.from({ length: blocks }, () => []);
  let i = 0;
  for (let round = 0; round < len; round++)
    for (let b = 0; b < blocks; b++) if (parts[b].length < count[b]) parts[b].push(cw[i++]);
  return parts;
}

// Сетку проверяем по синхродорожке: там обязано чередоваться тёмное и светлое.
// Если сбилась — дальше разбирать бессмысленно, получится правдоподобный мусор.
const timing = m[6].slice(8, n - 8).join('');
if (!/^(10)*1?$/.test(timing)) throw new Error('сетка снята неверно: синхродорожка не чередуется');

const codewords = [];
for (let i = 0; i + 8 <= stream.length; i += 8)
  codewords.push(stream.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0));

// Длины блоков данных те же, что при сборке; блоки коррекции всегда равные.
const lens = split(new Array(dataBytes).fill(0), dataBytes, blocks).map((b) => b.length);
const dataParts = deinterleave(codewords.slice(0, dataBytes), lens, Math.max(...lens));
const ecParts = deinterleave(
  codewords.slice(dataBytes),
  new Array(blocks).fill(ecPerBlock),
  ecPerBlock
);

// Байты коррекции пересчитываем заново: если они сходятся с записанными, значит
// картинка снята без ошибок и сканер прочтёт её так же.
const intact = dataParts.every((d, i) => {
  const mine = ecc(d, ecPerBlock);
  return mine.every((v, j) => v === ecParts[i][j]);
});

const data = dataParts.flat();
let p = 0;
const take = (k) => {
  let v = 0;
  for (let i = 0; i < k; i++, p++) v = (v << 1) | ((data[p >> 3] >> (7 - (p & 7))) & 1);
  return v;
};

const mode = take(4);
if (mode !== 4) throw new Error(`ожидался байтовый режим, получен ${mode}`);
const len = take(version < 10 ? 8 : 16);
const bytes = Buffer.from(Array.from({ length: len }, () => take(8)));

console.log(`\n${file}`);
console.log(`версия ${version} (${n}×${n}), уровень ${'LMQH'[ecLevel]}, маска ${maskId}, ${len} байт`);
console.log(`коррекция ${intact ? 'сходится' : 'НЕ СХОДИТСЯ — картинка повреждена'}`);
console.log(`\n  ${bytes.toString('utf8')}\n`);
