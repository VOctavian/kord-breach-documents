// Edge Function `suggest` — приём предложенных посетителями меток.
//
// Единственный, кто пишет в spawn_suggestions и в бакет suggestions. Аноним не
// получает доступа ни туда, ни туда: иначе ограничение «2 в минуту» обходилось
// бы прямым запросом к PostgREST, а бакет превратился бы в файлообменник.
//
// Деплой без CLI: Dashboard → Edge Functions → Deploy a new function → Via Editor,
// имя `suggest`, вставить этот файл. Секретов заводить не нужно: SUPABASE_URL и
// SUPABASE_SERVICE_ROLE_KEY платформа подставляет сама.
//
// Тело запроса:
//   { map, doc?, caption, x, y, image? }   image — JPEG в base64, без префикса
//
// Ответ: { ok: true } либо 429, если частят.

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_CAPTION = 300;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '86400',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const serviceHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
};

/** Автор, если посетитель вошёл. Аноним тоже может предлагать — просто без имени. */
async function author(authorization: string | null) {
  if (!authorization?.startsWith('Bearer ') || authorization.includes(SERVICE_KEY)) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '', authorization },
  });
  if (!res.ok) return null;
  const u = await res.json();
  if (!u?.id) return null;
  const m = u.user_metadata ?? {};
  return { id: u.id, name: m.full_name || m.name || m.user_name || u.email || null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'только POST' }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'тело не разобралось как JSON' }, 400);
  }

  const caption = String(body?.caption ?? '').trim();
  const map = String(body?.map ?? '').trim();
  const x = Number(body?.x);
  const y = Number(body?.y);

  if (!map) return json({ error: 'не указана локация' }, 400);
  if (!caption) return json({ error: 'нужно описание' }, 400);
  if (caption.length > MAX_CAPTION) return json({ error: `описание длиннее ${MAX_CAPTION} символов` }, 400);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
    return json({ error: 'координаты вне карты' }, 400);
  }

  // За прокси Supabase реальный адрес приходит первым в x-forwarded-for.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();

  let imagePath: string | null = null;
  if (body.image) {
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(body.image), (c) => c.charCodeAt(0));
    } catch {
      return json({ error: 'картинка не разобралась' }, 400);
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) return json({ error: 'картинка больше 3 МБ' }, 400);
    // Клиент присылает JPEG, но проверяем сами: сигнатура FF D8 FF.
    if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) {
      return json({ error: 'принимается только JPEG' }, 400);
    }

    imagePath = `${map}/${crypto.randomUUID()}.jpg`;
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/suggestions/${imagePath}`, {
      method: 'POST',
      headers: { ...serviceHeaders, 'content-type': 'image/jpeg' },
      body: bytes,
    });
    if (!up.ok) return json({ error: `картинка не сохранилась: ${(await up.text()).slice(0, 120)}` }, 502);
  }

  const who = await author(req.headers.get('authorization'));

  const insert = await fetch(`${SUPABASE_URL}/rest/v1/spawn_suggestions`, {
    method: 'POST',
    headers: { ...serviceHeaders, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify({
      map,
      doc: body.doc ? String(body.doc).slice(0, 40) : null,
      caption,
      x,
      y,
      image_path: imagePath,
      author_id: who?.id ?? null,
      author_name: who?.name ?? null,
      client_ip: ip,
    }),
  });

  if (!insert.ok) {
    const text = await insert.text();
    // Триггер частоты бьёт check_violation — для посетителя это 429, а не ошибка.
    if (text.includes('слишком часто')) {
      // Осиротевшую картинку не оставляем: строка не создалась, показать её негде.
      if (imagePath) {
        await fetch(`${SUPABASE_URL}/storage/v1/object/suggestions/${imagePath}`, {
          method: 'DELETE',
          headers: serviceHeaders,
        });
      }
      return json({ error: 'Не больше двух предложений в минуту — подождите немного' }, 429);
    }
    return json({ error: text.slice(0, 200) }, 502);
  }

  return json({ ok: true });
});
