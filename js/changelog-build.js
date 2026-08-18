// Сборка записи для попапа «Что нового».
//
// Модуль общий для двух путей публикации: `scripts/publish.mjs` (локально, через
// git) и `js/store.js` (правки с сайта, через Edge Function). Пока логика жила
// только в скрипте, правки из админки уезжали в репозиторий вообще без записи —
// посетитель их не видел. Поэтому здесь чистая функция без Node и без DOM.

/**
 * Точка видна посетителю? Заготовки без описания и точки без координат в
 * changelog не попадают — они появятся в той публикации, где их наконец разметят.
 */
const visible = (s) => Boolean(s && (s.caption?.trim() || s.images?.length) && s.x != null);

const item = (s) => ({ id: s.id, caption: s.caption ?? '', captionEn: s.captionEn ?? '' });
const sameImages = (a, b) => JSON.stringify(a.images ?? []) === JSON.stringify(b.images ?? []);

/**
 * Что изменилось с прошлой публикации, разложенное по локациям.
 *
 * @param {object[]} spawns   точки как они есть сейчас
 * @param {object[]} was      точки на момент прошлой публикации
 * @param {string[]} mapIds   порядок локаций для вывода
 * @param {Date}     now      время записи
 * @returns {object|null}     запись или `null`, если посетителю показывать нечего
 */
export function buildRelease(spawns, was, mapIds, now = new Date()) {
  const before = new Map(was.map((s) => [s.id, s]));
  const after = new Map(spawns.map((s) => [s.id, s]));

  const groups = [];
  for (const map of mapIds) {
    const added = [];
    const fixed = [];
    const removed = [];

    for (const s of spawns) {
      if (s.map !== map || !visible(s)) continue;
      const was1 = before.get(s.id);
      // Точки раньше не было на карте: либо новая, либо наконец размеченная.
      if (!visible(was1)) added.push(item(s));
      else if (was1.x !== s.x || was1.y !== s.y || was1.caption !== s.caption || !sameImages(was1, s)) {
        fixed.push(item(s));
      }
    }

    // Пропавшие: удалили целиком либо сняли координаты — с карты исчезли и те и другие.
    for (const s of was) {
      if (s.map !== map || !visible(s)) continue;
      if (!visible(after.get(s.id))) removed.push(item(s));
    }

    if (added.length || fixed.length || removed.length) groups.push({ map, added, fixed, removed });
  }

  if (!groups.length) return null;

  const pad = (n) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  // `at` — местное время публикации, его же показывает попап.
  return { id: `${day}-${time.replace(':', '')}`, at: `${day}T${time}`, maps: groups };
}
