// Извлекает структуру статьи VK: заголовки, абзацы и картинки (src + alt) в порядке следования.
import { readFile, writeFile } from 'node:fs/promises';

const html = await readFile(new URL('../article.html', import.meta.url), 'utf8');
const body = html.slice(html.indexOf('article_view article_mobile'));

const nodes = [];
const re = /<(h\d|p|figure)\b([^>]*)>([\s\S]*?)<\/\1>/g;
let m;
while ((m = re.exec(body))) {
  const [, tag, , inner] = m;
  if (tag === 'figure') {
    const seen = new Set();
    const images = [];
    for (const im of inner.matchAll(/<img\b[^>]*>/g)) {
      const src = im[0].match(/src="([^"]+)"/)?.[1];
      const alt = decode(im[0].match(/alt="([^"]*)"/)?.[1] ?? '');
      if (!src) continue;
      const full = src.replace(/&amp;/g, '&').replace(/cs=\d+x\d+/, 'cs=1280x0');
      const key = full.split('?')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      images.push({ src: full, alt });
    }
    if (images.length) nodes.push({ type: 'figure', images });
  } else {
    const text = decode(inner.replace(/<[^>]+>/g, ''));
    if (text) nodes.push({ type: tag, text });
  }
}

function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c))
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/\s+/g, ' ')
    .trim();
}

await writeFile(new URL('../article-nodes.json', import.meta.url), JSON.stringify(nodes, null, 2));

// Собираем секцию «Спавны секретных документов»: h3 = тип документа, p «● X» = карта, figure = спавны.
const startIdx = nodes.findIndex((n) => n.type === 'h2' && n.text.startsWith('Спавны секретных документов'));
const out = [];
let docType = null;
let map = null;
for (const n of nodes.slice(startIdx)) {
  if (n.type === 'h2' && !n.text.startsWith('Спавны')) break;
  if (n.type === 'h3') { docType = n.text.replace(/\s*\[.*$/, '').trim(); map = null; }
  else if (n.type === 'p' && /^●/.test(n.text)) map = n.text.replace(/^●\s*/, '').trim();
  else if (n.type === 'figure' && docType && map) {
    for (const img of n.images) out.push({ docType, map, caption: img.alt.trim(), src: img.src });
  }
}

await writeFile(new URL('../spawns-raw.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('спавнов:', out.length);
const byMap = {};
for (const s of out) (byMap[s.map] ??= []).push(s);
for (const [k, v] of Object.entries(byMap)) console.log(`${k}: ${v.length}`);
