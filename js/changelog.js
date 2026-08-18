// Попап «Что нового». Записи в data/changelog.json пишет scripts/publish.mjs при
// каждой публикации; непрочитанные показываются сами, остальные лежат ниже
// свёрнутыми. Закрыл — до следующей публикации сам не появится, но открыть
// заново можно кнопкой.
import { el } from './common.js';
import { t, lang, localized } from './i18n.js';
import { overlay } from './widgets.js';
import { trackEvent } from './analytics.js';

const LS_KEY = 'kord_breach_changelog_v1';
// Пришедшему впервые не разворачиваем всю историю обновлений.
const MAX_RELEASES = 3;
// Длинные списки сворачиваем: тридцать строк подряд всё равно никто не прочитает.
const MAX_ITEMS = 10;

function group(titleKey, items) {
  // Списка может не быть вовсе: в записях, сделанных до появления категории.
  if (!items?.length) return null;
  const shown = items.slice(0, MAX_ITEMS);
  return el(
    'div',
    { class: 'cl-group' },
    el('div', { class: 'cl-group-title' }, t(titleKey)),
    el(
      'ul',
      { class: 'cl-list' },
      shown.map((i) => el('li', {}, localized(i, 'caption') || t('noCaption'))),
      items.length > shown.length ? el('li', { class: 'cl-more' }, t('changelogMore', { n: items.length - shown.length })) : null
    )
  );
}

/** @param {Record<string, object>} mapById справочник локаций для названий */
export async function mountChangelog(mapById) {
  let history;
  try {
    const res = await fetch('data/changelog.json');
    if (!res.ok) return;
    history = await res.json();
  } catch {
    // Файла ещё нет (первая публикация) — попапу просто нечего показывать.
    return;
  }
  if (!Array.isArray(history) || !history.length) return;

  const seenAt = history.findIndex((r) => r.id === localStorage.getItem(LS_KEY));
  // id не найден — это первый визит либо запись уже уехала из истории.
  // Непрочитанное помечаем поштучно: за день обновлений бывает несколько, и
  // увидев девятичасовое, посетитель ещё не видел то, что вышло в полдень.
  const fresh = new Set(
    (seenAt === -1 ? history.slice(0, MAX_RELEASES) : history.slice(0, seenAt)).map((r) => r.id)
  );

  const locale = lang === 'en' ? 'en-GB' : 'ru-RU';
  const fmtDay = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtTime = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  // Только месяц: пара «месяц + год» собирается руками, иначе ru-RU дописывает «г.».
  const fmtMonth = new Intl.DateTimeFormat(locale, { month: 'long' });
  // Записи до появления поля `at` знали только дату.
  const when = (r) => new Date(r.at ?? `${r.date}T00:00`);
  const dayKey = (r) => {
    const d = when(r);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  // Русские месяцы и дни Intl отдаёт строчными, а в заголовке это выглядит опиской.
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // Новое в самом сайте — отдельным зелёным блоком над правками точек: это не
  // про спавны, и путать их не стоит.
  const features = (r) =>
    r.features?.length ? el('div', { class: 'cl-feat' }, group('changelogFeatures', r.features)) : null;

  const body = (r) => [
    features(r),
    // Запись бывает и без правок точек — только про новые возможности сайта.
    ...(r.maps ?? []).map((g) =>
      el(
        'div',
        { class: 'cl-map' },
        el('div', { class: 'cl-map-name' }, localized(mapById[g.map]) || g.map),
        group('changelogAdded', g.added),
        group('changelogFixed', g.fixed),
        group('changelogRemoved', g.removed)
      )
    ),
  ];

  /** Сколько точек за набор обновлений добавлено, поправлено и убрано. */
  function tally(releases) {
    const n = { added: 0, fixed: 0, removed: 0 };
    for (const r of releases)
      for (const g of r.maps ?? []) {
        n.added += g.added?.length ?? 0;
        n.fixed += g.fixed?.length ?? 0;
        n.removed += g.removed?.length ?? 0;
      }
    return n;
  }

  /** Сводка «+3 ✎2 −1». Нули пропускаем, иначе строка пестрит без пользы. */
  function tallyNode(n) {
    const parts = [
      n.added && ['add', `+${n.added}`, t('changelogAdded')],
      n.fixed && ['fix', `✎${n.fixed}`, t('changelogFixed')],
      n.removed && ['del', `−${n.removed}`, t('changelogRemoved')],
    ].filter(Boolean);
    return el(
      'span',
      { class: 'cl-tally' },
      parts.map(([cls, text, title]) => el('span', { class: `cl-t-${cls}`, title }, text))
    );
  }

  /** Одно обновление внутри дня: время, метка «новое» и сами правки. */
  const releaseBlock = (r) =>
    el(
      'div',
      { class: 'cl-release' + (fresh.has(r.id) ? ' cl-new' : '') },
      el(
        'div',
        { class: 'cl-date' },
        fmtTime.format(when(r)),
        fresh.has(r.id) ? el('span', { class: 'cl-badge' }, t('changelogNewMark')) : null
      ),
      body(r)
    );

  /**
   * День целиком. Развёрнут, если внутри есть непрочитанное или если это верхний
   * день: открыв попап кнопкой, посетитель должен сразу видеть последнее.
   */
  const dayNode = (releases, forceOpen = false) => {
    const isNew = releases.some((r) => fresh.has(r.id));
    return el(
      'details',
      { class: 'cl-day' + (isNew ? ' cl-new' : ''), open: isNew || forceOpen ? '' : null },
      el(
        'summary',
        {},
        el('span', { class: 'cl-day-name' }, cap(fmtDay.format(when(releases[0])))),
        tallyNode(tally(releases))
      ),
      el('div', { class: 'cl-day-body' }, releases.map(releaseBlock))
    );
  };

  const bucket = (label, count, kids) =>
    el(
      'details',
      { class: 'cl-bucket' },
      el('summary', {}, label, el('span', { class: 'cl-count' }, String(count))),
      el('div', { class: 'cl-bucket-body' }, kids)
    );

  /**
   * История по дням: этот месяц — списком дней, месяцы постарше — в свои папки,
   * прошлые годы — ещё на уровень глубже (год → месяц → день → обновления).
   * `list` — массив дней, каждый день это массив своих обновлений.
   */
  function historyTree(list) {
    const now = new Date();
    const thisMonth = [];
    /** @type {Map<number, Map<number, object[][]>>} год → месяц → дни */
    const byYear = new Map();

    for (const day of list) {
      const d = when(day[0]);
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        thisMonth.push(day);
        continue;
      }
      if (!byYear.has(d.getFullYear())) byYear.set(d.getFullYear(), new Map());
      const months = byYear.get(d.getFullYear());
      if (!months.has(d.getMonth())) months.set(d.getMonth(), []);
      months.get(d.getMonth()).push(day);
    }

    const desc = (m) => [...m.keys()].sort((a, b) => b - a);
    // В счётчике папки — число обновлений, а не дней: так понятнее, сколько там правок.
    const size = (days) => days.reduce((n, day) => n + day.length, 0);
    const monthBucket = (year, month, days, withYear) => {
      const name = cap(fmtMonth.format(new Date(year, month, 1)));
      // Стрелка, а не `map(dayNode)`: вторым аргументом прилетел бы индекс и
      // каждый день, кроме нулевого, раскрывался бы сам.
      return bucket(withYear ? `${name} ${year}` : name, size(days), days.map((d) => dayNode(d)));
    };

    const nodes = thisMonth.map((d) => dayNode(d));

    // Прошлые месяцы текущего года остаются на верхнем уровне — год в них и так виден.
    for (const month of desc(byYear.get(now.getFullYear()) ?? new Map())) {
      nodes.push(monthBucket(now.getFullYear(), month, byYear.get(now.getFullYear()).get(month), true));
    }

    for (const year of desc(byYear).filter((y) => y !== now.getFullYear())) {
      const months = byYear.get(year);
      nodes.push(
        bucket(
          String(year),
          desc(months).reduce((n, m) => n + size(months.get(m)), 0),
          desc(months).map((m) => monthBucket(year, m, months.get(m), false))
        )
      );
    }
    return nodes;
  }

  // Раскладываем историю по дням, сохраняя порядок «свежие сверху».
  const days = new Map();
  for (const r of history) {
    const k = dayKey(r);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(r);
  }
  const dayList = [...days.values()];
  const hasFresh = (day) => day.some((r) => fresh.has(r.id));
  // Всё прочитано (открыли кнопкой) — показываем хотя бы последний день.
  const top = dayList.some(hasFresh) ? dayList.filter(hasFresh) : dayList.slice(0, 1);
  const older = dayList.filter((day) => !top.includes(day));

  const node = overlay(
    'changelog-overlay',
    el('h2', {}, t('changelogTitle')),
    el('p', { class: 'pop-intro' }, t('changelogIntro')),
    top.map((d) => dayNode(d, true)),
    older.length
      ? el(
          'div',
          { class: 'cl-history' },
          el('div', { class: 'cl-history-title' }, t('changelogHistory')),
          historyTree(older)
        )
      : null,
    el('button', { class: 'btn primary', type: 'button', onclick: () => close() }, t('changelogGot'))
  );

  // Любое закрытие считаем прочтением, иначе попап будет догонять на каждой странице.
  function close() {
    localStorage.setItem(LS_KEY, history[0].id);
    node.classList.remove('open');
  }
  node.addEventListener('click', (e) => {
    if (e.target === node) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && node.classList.contains('open')) close();
  });

  document.body.append(node);

  document.querySelector('.float-buttons')?.prepend(
    el(
      'button',
      {
        id: 'btn-changelog',
        type: 'button',
        title: t('changelogBtnTitle'),
        onclick: () => {
          node.classList.add('open');
          trackEvent('changelog-open');
        },
      },
      t('changelogBtnLabel')
    )
  );

  if (fresh.size) {
    node.classList.add('open');
    trackEvent('changelog-new-' + history[0].id);
  }
}
