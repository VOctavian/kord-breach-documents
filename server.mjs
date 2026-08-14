// Статический сервер + endpoint'ы редакторов: координаты точек и опрос.
// Запуск: node server.mjs   →   http://localhost:5173
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPABASE_URL } from './js/config.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const MAX_UPLOAD = 12 * 1024 * 1024;
const UPLOAD_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * service_role ключ Supabase — им читаются ответы опроса, потому что anon-ключу
 * доступ на чтение закрыт политикой. Файл `.env.local` в .gitignore и на сайт
 * не уезжает: этот ключ обходит RLS, в браузере ему делать нечего.
 */
const SERVICE_KEY = (() => {
  const file = join(ROOT, '.env.local');
  if (!existsSync(file)) return null;
  const m = readFileSync(file, 'utf8').match(/^\s*SUPABASE_SERVICE_KEY\s*=\s*(.+)$/m);
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : null;
})();

const TABLE = `${SUPABASE_URL}/rest/v1/survey_responses`;

/** Запрос к Supabase от имени service_role. */
async function supabase(path, init = {}) {
  if (!SERVICE_KEY) throw new Error('нет .env.local с SUPABASE_SERVICE_KEY — см. README');
  const res = await fetch(TABLE + path, {
    ...init,
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, ...init.headers },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res;
}

const json = (res, code, body) =>
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && url.pathname === '/api/spawns') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Array.isArray(data)) throw new Error('ожидался массив');
      await writeFile(join(ROOT, 'data/spawns.json'), JSON.stringify(data, null, 2), 'utf8');
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
      console.log(`сохранено: ${data.filter((s) => s.x != null).length}/${data.length} размечено`);
    } catch (e) {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/survey') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Array.isArray(data?.surveys)) throw new Error('surveys должен быть массивом');
      // Отказываем вместо тихой починки: иначе вкладка со старым кодом молча
      // затирала бы список включённых опросов при каждом сохранении.
      if (!Array.isArray(data?.activeIds))
        throw new Error('нет списка activeIds — перезагрузите вкладку редактора, формат файла изменился');
      if (data.surveys.some((s) => !s.id)) throw new Error('у каждого опроса должен быть id');
      await writeFile(join(ROOT, 'data/survey.json'), JSON.stringify(data, null, 2) + '\n', 'utf8');
      json(res, 200, { ok: true });
      console.log(`опросы сохранены: ${data.surveys.length}, включено ${data.activeIds.length}`);
    } catch (e) {
      json(res, 400, { error: String(e.message ?? e) });
    }
    return;
  }

  if (url.pathname === '/api/survey-results') {
    try {
      if (req.method === 'GET') {
        const survey = url.searchParams.get('survey');
        const filter = survey ? `&survey_id=eq.${encodeURIComponent(survey)}` : '';
        const r = await supabase(`?select=*&order=created_at.desc&limit=1000${filter}`);
        json(res, 200, await r.json());
        return;
      }
      if (req.method === 'DELETE') {
        const id = url.searchParams.get('id');
        if (!/^\d+$/.test(id ?? '')) throw new Error('нужен числовой id');
        await supabase(`?id=eq.${id}`, { method: 'DELETE' });
        json(res, 200, { ok: true });
        console.log(`ответ ${id} удалён`);
        return;
      }
      json(res, 405, { error: 'метод не поддерживается' });
    } catch (e) {
      json(res, 400, { error: String(e.message ?? e) });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/upload') {
    try {
      const ext = UPLOAD_EXT[(req.headers['content-type'] ?? '').split(';')[0].trim()];
      if (!ext) throw new Error('поддерживаются только jpeg, png и webp');
      // Каталог только из списка: имя приходит из браузера, гулять по диску им нельзя.
      const dir = { screenshots: 'assets/screenshots', survey: 'assets/survey' }[url.searchParams.get('dir') ?? 'screenshots'];
      if (!dir) throw new Error('неизвестный каталог загрузки');

      const chunks = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > MAX_UPLOAD) throw new Error('файл больше 12 МБ');
        chunks.push(c);
      }
      const buf = Buffer.concat(chunks);
      const slug = (s) => (s ?? '').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'x';
      const name = `${slug(url.searchParams.get('map'))}-${slug(url.searchParams.get('doc'))}` +
        `-${createHash('sha1').update(buf).digest('hex').slice(0, 8)}.${ext}`;

      await mkdir(join(ROOT, dir), { recursive: true });
      await writeFile(join(ROOT, dir, name), buf);
      res.writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ path: `${dir}/${name}` }));
      console.log(`загружен скриншот: ${name} (${(buf.length / 1024).toFixed(0)} КБ)`);
      // Редактор жмёт картинки в JPEG сам; всё остальное приехало мимо него и весит лишнее.
      if (ext !== 'jpg') console.warn(`  внимание: ${ext} вместо jpeg — файл тяжелее, чем нужно`);
    } catch (e) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end(String(e.message ?? e));
    }
    return;
  }

  let path = decodeURIComponent(url.pathname);
  if (path === '/') path = '/index.html';
  const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const buf = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    }).end(buf);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404: ' + path);
  }
}).listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  if (!SERVICE_KEY) console.log('ответы опроса недоступны: нет .env.local с SUPABASE_SERVICE_KEY');
});
