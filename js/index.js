// Главная страница: выбор локации.
import { loadData, el } from './common.js';
import { t, lang, localized, applyI18n } from './i18n.js';
import { langToggle, mountWidgets, isLocal } from './widgets.js';

document.title = t('pageTitleIndex');
document.getElementById('lang-slot').append(langToggle());
if (!isLocal) document.getElementById('editor-link').remove();
applyI18n();
mountWidgets();

const { maps, spawns, docById } = await loadData();
const grid = document.getElementById('grid');

for (const map of maps) {
  const list = spawns.filter((s) => s.map === map.id);
  if (!list.length) continue;

  const byDoc = new Map();
  for (const s of list) byDoc.set(s.doc, (byDoc.get(s.doc) ?? 0) + 1);

  grid.append(
    el(
      'a',
      { class: 'map-card', href: `map.html?map=${map.id}` },
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
              { class: 'chip', title: localized(doc) },
              el('img', { src: doc.icon, alt: '' }),
              String(n)
            );
          })
        )
      )
    )
  );
}
