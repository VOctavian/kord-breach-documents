// Отдельная страница на каждую локацию + sitemap.xml и robots.txt.
//
// Зачем: все двенадцать карт жили по одному адресу `map.html?map=<id>`. Для
// поиска и для превью ссылок это одна страница — один заголовок, одно описание,
// одна карточка на весь сайт. Здесь из map.html собираются настоящие страницы
// `<id>.html` со своими тегами.
//
// Файлы кладём в корень, а не в подкаталог: приложение обращается к `css/`,
// `js/` и `data/` относительными путями, и из вложенной папки они бы поехали.
//
//   node scripts/build-map-pages.mjs            показать, что изменится
//   node scripts/build-map-pages.mjs --write    записать
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://voctavian.github.io/kord-breach-documents';
const WRITE = process.argv.includes('--write');

const maps = JSON.parse(readFileSync(`${ROOT}data/maps.json`, 'utf8'));
const spawns = JSON.parse(readFileSync(`${ROOT}data/spawns.json`, 'utf8'));
const template = readFileSync(`${ROOT}map.html`, 'utf8');

/** Точка видна посетителю — тот же критерий, что у попапа и у проверок публикации. */
const visible = (s) => Boolean((s.caption?.trim() || s.images?.length) && s.x != null);

/** Экранируем для подстановки в атрибут: в названиях карт кавычек нет, но кода это не касается. */
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const pages = [];

for (const map of maps) {
  const n = spawns.filter((s) => s.map === map.id && visible(s)).length;
  // Пустую локацию отдельной страницей не выделяем: показывать на ней нечего,
  // а в выдаче она была бы пустышкой.
  if (!n) continue;

  const title = `${map.name} — спавны секретных документов Kord Breach`;
  const desc =
    `${n} точек спавна секретных документов на карте «${map.name}» (${map.en}) ` +
    `в Escape from Tarkov: координаты, скриншоты и описания.`;
  const url = `${SITE}/${map.id}.html`;

  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${attr(desc)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${attr(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${attr(desc)}$2`)
    .replace(/(<meta property="og:image:alt" content=")[^"]*(">)/, `$1${attr(map.name)} — карта спавнов Kord Breach$2`);

  // Пояснение про шаблон и его `noindex` — свойства самого map.html. Утащить их
  // сюда значило бы закрыть от поиска ровно те страницы, ради которых всё затеяно.
  html = html
    .replace(/\n {2}<!-- Шаблон, из которого[\s\S]*?-->/, '')
    .replace(/\n {2}<meta name="robots" content="noindex, follow">/, '');

  // Канонический адрес и сама привязка к локации. Приложение читает `__MAP__`,
  // когда в адресе нет `?map=`, — так старые ссылки продолжают работать.
  html = html.replace(
    '<meta property="og:type" content="website">',
    `<link rel="canonical" href="${url}">\n` +
      `  <meta property="og:url" content="${url}">\n` +
      `  <script>window.__MAP__ = ${JSON.stringify(map.id)};</script>\n` +
      '  <meta property="og:type" content="website">'
  );

  pages.push({ file: `${map.id}.html`, url, title, points: n, html });
}

const urls = [
  { loc: `${SITE}/`, priority: '1.0' },
  ...pages.map((p) => ({ loc: p.url, priority: '0.8' })),
];

const today = new Date().toISOString().slice(0, 10);
const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls
    .map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${u.priority}</priority>\n  </url>`)
    .join('\n') +
  '\n</urlset>\n';

// Редакторы и админку из индексации убираем: страницы рабочие, но посторонним
// в выдаче не нужны.
const robots = `User-agent: *
Allow: /
Disallow: /admin.html
Disallow: /editor.html

Sitemap: ${SITE}/sitemap.xml
`;

const files = [
  ...pages.map((p) => ({ path: p.file, body: p.html })),
  { path: 'sitemap.xml', body: sitemap },
  { path: 'robots.txt', body: robots },
];

let changed = 0;
for (const f of files) {
  const full = ROOT + f.path;
  const old = existsSync(full) ? readFileSync(full, 'utf8') : null;
  if (old === f.body) continue;
  changed++;
  if (WRITE) writeFileSync(full, f.body, 'utf8');
}

console.log(`\nСтраниц локаций: ${pages.length} из ${maps.length} карт`);
for (const p of pages) console.log(`  ${p.file.padEnd(18)} ${String(p.points).padStart(3)} точек  ${p.title}`);
console.log(`\nsitemap.xml: ${urls.length} адресов, robots.txt`);
console.log(changed ? `Файлов изменится: ${changed}` : 'Всё уже актуально');
if (!WRITE && changed) console.log('\nЭто предпросмотр. Записать: node scripts/build-map-pages.mjs --write\n');
