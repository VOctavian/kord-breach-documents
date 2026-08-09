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

  const fmtDate = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  // Записи до появления поля `at` знали только дату.
  const stamp = (r) => fmtDate.format(new Date(r.at ?? `${r.date}T00:00`));

  const body = (r) => r.maps.map((g) =>
    el(
      'div',
      { class: 'cl-map' },
      el('div', { class: 'cl-map-name' }, localized(mapById[g.map]) || g.map),
      group('changelogAdded', g.added),
      group('changelogFixed', g.fixed)
    )
  );

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
          older.map((r) => el('details', { class: 'cl-past' }, el('summary', {}, stamp(r)), body(r)))
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
