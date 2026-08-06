// Статический сервер + endpoint для сохранения координат из редактора.
// Запуск: node server.mjs   →   http://localhost:5173
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const MAX_UPLOAD = 12 * 1024 * 1024;
const UPLOAD_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

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

  if (req.method === 'POST' && url.pathname === '/api/upload') {
    try {
      const ext = UPLOAD_EXT[(req.headers['content-type'] ?? '').split(';')[0].trim()];
      if (!ext) throw new Error('поддерживаются только jpeg, png и webp');

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

      await mkdir(join(ROOT, 'assets/screenshots'), { recursive: true });
      await writeFile(join(ROOT, 'assets/screenshots', name), buf);
      res.writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ path: `assets/screenshots/${name}` }));
      console.log(`загружен скриншот: ${name} (${(buf.length / 1024).toFixed(0)} КБ)`);
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
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
