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
  if (!items.length) return null;
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
  const fresh = seenAt === -1 ? history.slice(0, MAX_RELEASES) : history.slice(0, seenAt);
  // Даже когда всё прочитано (открыли кнопкой), последнее обновление показываем развёрнутым.
  const open = fresh.length ? fresh : history.slice(0, 1);
  const older = history.slice(open.length);

  const locale = lang === 'en' ? 'en-GB' : 'ru-RU';
  const fmtDate = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  // Только месяц: пара «месяц + год» собирается руками, иначе ru-RU дописывает «г.».
  const fmtMonth = new Intl.DateTimeFormat(locale, { month: 'long' });
  // Записи до появления поля `at` знали только дату.
  const when = (r) => new Date(r.at ?? `${r.date}T00:00`);
  const stamp = (r) => fmtDate.format(when(r));

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
        group('changelogFixed', g.fixed)
      )
    ),
  ];

  const release = (r) => el('details', { class: 'cl-past' }, el('summary', {}, stamp(r)), body(r));
  const bucket = (label, count, kids) =>
    el(
      'details',
      { class: 'cl-bucket' },
      el('summary', {}, label, el('span', { class: 'cl-count' }, String(count))),
      el('div', { class: 'cl-bucket-body' }, kids)
    );

  /**
   * История: этот месяц — списком, месяцы постарше — в свои папки, прошлые годы —
   * ещё на уровень глубже (год → месяц → обновление).
   */
  function historyTree(list) {
    const now = new Date();
    const thisMonth = [];
    /** @type {Map<number, Map<number, object[]>>} год → месяц → записи */
    const byYear = new Map();

    for (const r of list) {
      const d = when(r);
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        thisMonth.push(r);
        continue;
      }
      if (!byYear.has(d.getFullYear())) byYear.set(d.getFullYear(), new Map());
      const months = byYear.get(d.getFullYear());
      if (!months.has(d.getMonth())) months.set(d.getMonth(), []);
      months.get(d.getMonth()).push(r);
    }

    const desc = (m) => [...m.keys()].sort((a, b) => b - a);
    // Русские месяцы Intl отдаёт строчными, а в заголовке это выглядит опиской.
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const monthBucket = (year, month, releases, withYear) => {
      const name = cap(fmtMonth.format(new Date(year, month, 1)));
      return bucket(withYear ? `${name} ${year}` : name, releases.length, releases.map(release));
    };

    const nodes = thisMonth.map(release);

    // Прошлые месяцы текущего года остаются на верхнем уровне — год в них и так виден.
    for (const month of desc(byYear.get(now.getFullYear()) ?? new Map())) {
      nodes.push(monthBucket(now.getFullYear(), month, byYear.get(now.getFullYear()).get(month), true));
    }

    for (const year of desc(byYear).filter((y) => y !== now.getFullYear())) {
      const months = byYear.get(year);
      const total = [...months.values()].reduce((n, rs) => n + rs.length, 0);
      nodes.push(
        bucket(String(year), total, desc(months).map((m) => monthBucket(year, m, months.get(m), false)))
      );
    }
    return nodes;
  }

  const node = overlay(
    'changelog-overlay',
    el('h2', {}, t('changelogTitle')),
    el('p', { class: 'pop-intro' }, t('changelogIntro')),
    open.map((r) => el('div', { class: 'cl-release' }, el('div', { class: 'cl-date' }, stamp(r)), body(r))),
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

  if (fresh.length) {
    node.classList.add('open');
    trackEvent('changelog-new-' + history[0].id);
  }
}
