// Коррекция ошибок Рида — Соломона для QR: общее для генератора и читалки.
// Арифметика в поле GF(256) с образующим многочленом 0x11D — так задано стандартом.

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** Порождающий многочлен для `d` байт коррекции: произведение (x − α^i). */
function generator(d) {
  let g = [1];
  for (let i = 0; i < d; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j <= g.length; j++) next[j] = (g[j] ?? 0) ^ mul(EXP[i], g[j - 1] ?? 0);
    g = next;
  }
  return g;
}

/** Байты коррекции для блока — остаток от деления на порождающий многочлен. */
export function ecc(data, d) {
  const g = generator(d);
  const rem = new Array(d).fill(0);
  for (const b of data) {
    const factor = b ^ rem.shift();
    rem.push(0);
    for (let i = 0; i < d; i++) rem[i] ^= mul(g[i + 1], factor);
  }
  return rem;
}

// Сколько байт данных и на сколько блоков коррекции они разбиты, по версиям.
// Порядок уровней — L, M, Q, H. Последнее число — всего кодовых слов в версии.
export const CAPACITY = {
  1: [[19, 1], [16, 1], [13, 1], [9, 1], 26],
  2: [[34, 1], [28, 1], [22, 1], [16, 1], 44],
  3: [[55, 1], [44, 1], [34, 2], [26, 2], 70],
  4: [[80, 1], [64, 2], [48, 2], [36, 4], 100],
  5: [[108, 1], [86, 2], [62, 4], [46, 4], 134],
  6: [[136, 2], [108, 4], [76, 4], [60, 4], 172],
  7: [[156, 2], [124, 4], [88, 6], [66, 5], 196],
  8: [[194, 2], [154, 4], [110, 6], [86, 6], 242],
  9: [[232, 2], [182, 5], [132, 8], [100, 8], 292],
  10: [[274, 4], [216, 5], [154, 8], [122, 8], 346],
};

/** Разбить байты данных на блоки: длинные (на байт больше) идут последними. */
export function split(cw, dataBytes, blocks) {
  const short = Math.floor(dataBytes / blocks);
  const longs = dataBytes % blocks;
  const parts = [];
  for (let b = 0, i = 0; b < blocks; b++) {
    const len = short + (b >= blocks - longs ? 1 : 0);
    parts.push(cw.slice(i, i + len));
    i += len;
  }
  return parts;
}
