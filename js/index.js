// Главная страница: выбор локации.
import { loadData, el, isPublished } from './common.js';
import { t, lang, localized, applyI18n } from './i18n.js';
import { langToggle, socialLinks, mountWidgets, isLocal } from './widgets.js';
import { trackEvent, mountUmami } from './analytics.js';
import { mountChangelog } from './changelog.js';
import { mountAuthor } from './author.js';
import { mountSurvey } from './survey.js';
import { mountAuth } from './auth.js';
import { mountAds } from './ads.js';

document.title = t('pageTitleIndex');
mountUmami();
mountAuthor(document.getElementById('logo-slot'));
document.getElementById('social-slot').append(socialLinks());
document.getElementById('lang-slot').append(langToggle());
mountAuth(document.getElementById('auth-slot'));
mountAds();
// Редактор работает только с локальным сервером — на сайте ссылки на него нет.
// Редактор опросов открывается из админ-панели, отдельной кнопки в шапке ему не надо.
if (!isLocal) document.getElementById('editor-link').remove();
applyI18n();
mountWidgets();

const data = await loadData();
const { maps, docs, docById } = data;
mountChangelog(data.mapById);
mountSurvey();
const spawns = data.spawns.filter(isPublished);
const grid = document.getElementById('grid');

for (const map of maps) {
  const list = spawns.filter((s) => s.map === map.id);
  if (!list.length) continue;

  const byDoc = new Map();
  for (const s of list) byDoc.set(s.doc, (byDoc.get(s.doc) ?? 0) + 1);

  grid.append(
    el(
      'a',
      {
        class: 'map-card',
        href: `${map.id}.html`,
        'data-docs': [...byDoc.keys()].join(' '),
        onclick: () => trackEvent('map-open-' + map.id),
      },
      el('div', { class: 'thumb' }, el('img', { src: map.file, alt: map.name, loading: 'lazy' })),
      el(
        'div',
        { class: 'body' },
        el('div', { class: 'name' }, el('span', { class: 'count-badge' }, String(list.length)), localized(map)),
        el('div', { class: 'en' }, lang === 'en' ? map.name : map.en),
        el(
          'div',
          { class: 'chips' },
          [...byDoc].map(([docId, n]) => {
            const doc = docById[docId];
            return el(
              'span',
              { class: 'chip', title: localized(doc), 'data-doc': docId },
              el('img', { src: doc.icon, alt: '' }),
              String(n)
            );
          })
        )
      )
    )
  );
}

/* ---------- полоса типов документации ---------- */

const legend = document.getElementById('doc-legend');

/** Подсветить карты, на которых есть спавны этого типа. */
function highlight(docId) {
  grid.classList.toggle('highlighting', docId != null);
  for (const card of grid.querySelectorAll('.map-card')) {
    const has = docId != null && card.dataset.docs.split(' ').includes(docId);
    card.classList.toggle('match', has);
    for (const chip of card.querySelectorAll('.chip')) {
      chip.classList.toggle('match', has && chip.dataset.doc === docId);
    }
  }
}

for (const doc of docs) {
  const n = spawns.filter((s) => s.doc === doc.id).length;
  if (!n) continue;
  const item = el(
    'div',
    {
      class: 'doc-legend-item',
      'data-doc': doc.id,
      onmouseenter: () => highlight(doc.id),
      onmouseleave: () => highlight(null),
      // На тач-устройствах наведения нет — подсвечиваем по тапу.
      onclick: () => highlight(grid.classList.contains('highlighting') ? null : doc.id),
    },
    el('img', { src: doc.icon, alt: localized(doc) }),
    el('div', { class: 'lbl' }, localized(doc)),
    el('div', { class: 'n' }, String(n))
  );
  legend.append(item);
}

/** Обратная связка: подсветить типы документации, которые есть на этой карте. */
function highlightDocs(docIds) {
  legend.classList.toggle('highlighting', docIds != null);
  for (const item of legend.querySelectorAll('.doc-legend-item')) {
    item.classList.toggle('match', !!docIds?.includes(item.dataset.doc));
  }
}

for (const card of grid.querySelectorAll('.map-card')) {
  const docIds = card.dataset.docs.split(' ');
  card.addEventListener('mouseenter', () => highlightDocs(docIds));
  card.addEventListener('mouseleave', () => highlightDocs(null));
}
