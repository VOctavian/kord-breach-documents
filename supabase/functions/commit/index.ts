// Edge Function `commit` — записывает файлы в репозиторий от имени админа.
//
// Зачем: сайт статический и живёт в git, поэтому «сохранить точку» с телефона
// означает «сделать коммит». Токен GitHub лежит секретом здесь и в браузер не
// попадает, а право на запись проверяется ролью admin в самой базе.
//
// Деплой без CLI: Dashboard → Edge Functions → Deploy a new function → Via Editor,
// вставить этот файл. Секреты: Project Settings → Edge Functions → Secrets.
//
// Нужны секреты:
//   GITHUB_TOKEN  — fine-grained токен с правом Contents: read and write на репозиторий
//   GITHUB_REPO   — например VOctavian/kord-breach-documents
//   GITHUB_BRANCH — необязательно, по умолчанию main
//
// Тело запроса:
//   { message: string,
//     files: [{ path: string, content: string, encoding?: 'utf-8' | 'base64' }],
//     expectHead?: string }   // sha, на котором правил клиент
//
// Ответ: { sha, url } либо 409, если ветка ушла вперёд.

const GITHUB_API = 'https://api.github.com';
const MAX_FILES = 60;
const MAX_BYTES = 25 * 1024 * 1024;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });

/**
 * Пускаем только админов. Роль спрашиваем у самой базы токеном вызывающего:
 * так права остаются в одном месте — в RLS, — и service-ключ функции не нужен
 * вовсе.
 */
async function isAdmin(authorization: string | null): Promise<boolean> {
  if (!authorization) return false;
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/my_roles`, {
    method: 'POST',
    headers: {
      apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      authorization,
      'content-type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) return false;
  const roles = await res.json();
  return Array.isArray(roles) && roles.includes('admin');
}

function gh(token: string) {
  return async (path: string, init: RequestInit = {}) => {
    const res = await fetch(GITHUB_API + path, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'kord-breach-admin',
        'content-type': 'application/json',
        ...init.headers,
      },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'только POST' }, 405);

  if (!(await isAdmin(req.headers.get('authorization')))) {
    return json({ error: 'нужна роль admin' }, 403);
  }

  const token = Deno.env.get('GITHUB_TOKEN');
  const repo = Deno.env.get('GITHUB_REPO');
  const branch = Deno.env.get('GITHUB_BRANCH') ?? 'main';
  if (!token || !repo) return json({ error: 'не заданы секреты GITHUB_TOKEN и GITHUB_REPO' }, 500);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'тело не разобралось как JSON' }, 400);
  }

  const files = body?.files;
  if (!Array.isArray(files) || !files.length) return json({ error: 'нет файлов' }, 400);
  if (files.length > MAX_FILES) return json({ error: `за раз не больше ${MAX_FILES} файлов` }, 400);

  const total = files.reduce((n: number, f) => n + (f.content?.length ?? 0), 0);
  if (total > MAX_BYTES) return json({ error: 'слишком большой коммит' }, 400);

  for (const f of files) {
    // Путь приходит из браузера — гулять по репозиторию им нельзя.
    if (typeof f.path !== 'string' || f.path.startsWith('/') || f.path.includes('..')) {
      return json({ error: `подозрительный путь: ${f.path}` }, 400);
    }
    if (!/^(data|assets)\//.test(f.path)) {
      return json({ error: `писать можно только в data/ и assets/: ${f.path}` }, 400);
    }
  }

  const api = gh(token);
  try {
    const ref = await api(`/repos/${repo}/git/ref/heads/${branch}`);
    const head = ref.object.sha;

    // Клиент правил не ту версию — молча перезаписать значило бы потерять
    // чужие изменения. Пусть перечитает и повторит.
    if (body.expectHead && body.expectHead !== head) {
      return json({ error: 'ветка ушла вперёд, перезагрузите страницу', head }, 409);
    }

    const baseCommit = await api(`/repos/${repo}/git/commits/${head}`);

    // Блобы по одному, дерево и коммит — разом: так правка данных и картинки
    // попадают в репозиторий одной операцией, без промежуточных состояний.
    const tree = [];
    for (const f of files) {
      const blob = await api(`/repos/${repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: f.content, encoding: f.encoding ?? 'utf-8' }),
      });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    const newTree = await api(`/repos/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }),
    });

    const commit = await api(`/repos/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message: String(body.message ?? 'Обновление из админки').slice(0, 500),
        tree: newTree.sha,
        parents: [head],
      }),
    });

    await api(`/repos/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha }),
    });

    return json({ sha: commit.sha, url: `https://github.com/${repo}/commit/${commit.sha}` });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 502);
  }
});
