// Куда редактор сохраняет правки.
//
// Локально — сразу на диск через server.mjs, как было. На сайте диска нет, и
// каждое сохранение означало бы коммит: двигая маркер, админ насажал бы сотню
// коммитов и столько же прогонов деплоя. Поэтому на сайте правки копятся в
// черновике, а в репозиторий уезжают одной кнопкой «Опубликовать».
import { isLocal } from './widgets.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { session } from './auth.js';
import { buildRelease } from './changelog-build.js';

export const remote = !isLocal;

const DRAFT_KEY = 'kord_breach_draft_v1';

// Картинки, добавленные до публикации: на сайте их ещё нет по своему адресу,
// показывать надо из памяти. Пережить перезагрузку вкладки они не могут —
// об этом предупреждаем в beforeunload.
const pending = new Map();

let dirty = false;
const listeners = new Set();

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const notify = () => listeners.forEach((fn) => fn({ dirty, pending: pending.size }));

export const isDirty = () => dirty;
export const pendingImages = () => pending.size;

/** Адрес для показа: у неопубликованной картинки он временный. */
export function srcFor(path) {
  return pending.get(path)?.url ?? path;
}

/* ---------- сохранение точек ---------- */

let timer;

export function saveSpawns(spawns, onStatus = () => {}) {
  if (remote) {
    dirty = true;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(spawns));
    } catch {
      // Черновик — удобство, а не гарантия: место кончилось, работаем дальше.
    }
    notify();
    onStatus('черновик сохранён', 'ok');
    return;
  }

  clearTimeout(timer);
  timer = setTimeout(async () => {
    onStatus('сохраняю…');
    try {
      const res = await fetch('/api/spawns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(spawns),
      });
      if (!res.ok) throw new Error(await res.text());
      onStatus('сохранено ✓', 'ok');
    } catch (e) {
      onStatus('ошибка сохранения: ' + e.message, 'err');
    }
  }, 500);
}

/** Черновик подхватывается при следующем открытии редактора на сайте. */
export function readDraft() {
  if (!remote) return null;
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY));
  } catch {
    return null;
  }
}

export function dropDraft() {
  localStorage.removeItem(DRAFT_KEY);
  dirty = false;
  notify();
}

/* ---------- картинки ---------- */

const sha1 = async (buf) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-1', buf))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/** Кладёт JPEG и возвращает путь, по которому он будет лежать в репозитории. */
export async function addImage(blob, { map, doc }) {
  if (!remote) {
    const res = await fetch(`/api/upload?map=${map}&doc=${doc}`, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg' },
      body: blob,
    });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()).path;
  }

  // Имя считаем так же, как server.mjs, — чтобы файл, добавленный с сайта и
  // локально, назывался одинаково и не задваивался.
  const bytes = await blob.arrayBuffer();
  const slug = (s) => (s ?? '').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'x';
  const path = `assets/screenshots/${slug(map)}-${slug(doc)}-${(await sha1(bytes)).slice(0, 8)}.jpg`;

  pending.set(path, { blob, bytes, url: URL.createObjectURL(blob) });
  dirty = true;
  notify();
  return path;
}

/* ---------- публикация ---------- */

const base64 = (bytes) => {
  let s = '';
  const view = new Uint8Array(bytes);
  // По кускам: спред на мегабайтном массиве упирается в предел аргументов.
  for (let i = 0; i < view.length; i += 0x8000) {
    s += String.fromCharCode(...view.subarray(i, i + 0x8000));
  }
  return btoa(s);
};

/**
 * Отправляет черновик в репозиторий одним коммитом. Картинки едут вместе с
 * данными: иначе между двумя коммитами сайт ссылался бы на несуществующий файл.
 */
/**
 * Запись в «Что нового» для правок с сайта. Сравниваем с тем, что сейчас лежит
 * на сайте: это ровно то состояние, которое видит посетитель.
 *
 * Ошибку глотаем: не попавшая запись обиднее, чем несорвавшаяся публикация, но
 * ронять из-за неё сами правки точно не стоит.
 */
async function changelogFile(spawns) {
  try {
    const bust = `?cb=${Date.now()}`;
    const [was, maps, history] = await Promise.all([
      fetch(`data/spawns.json${bust}`).then((r) => r.json()),
      fetch(`data/maps.json${bust}`).then((r) => r.json()),
      fetch(`data/changelog.json${bust}`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ]);
    const release = buildRelease(spawns, was, maps.map((m) => m.id));
    if (!release) return null;
    return {
      path: 'data/changelog.json',
      content: JSON.stringify([release, ...(Array.isArray(history) ? history : [])], null, 2) + '\n',
    };
  } catch {
    return null;
  }
}

export async function publish(spawns, message) {
  const token = session()?.access_token;
  if (!token) throw new Error('нужно войти');

  const changelog = await changelogFile(spawns);
  const files = [
    { path: 'data/spawns.json', content: JSON.stringify(spawns, null, 2) + '\n' },
    ...(changelog ? [changelog] : []),
    ...[...pending].map(([path, { bytes }]) => ({ path, content: base64(bytes), encoding: 'base64' })),
  ];

  const res = await fetch(`${SUPABASE_URL}/functions/v1/commit`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ message, files }),
  });

  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `${res.status}`);

  for (const { url } of pending.values()) URL.revokeObjectURL(url);
  pending.clear();
  dropDraft();
  return out;
}
