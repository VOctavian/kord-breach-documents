// Страница локации: карта с иконками документов + просмотрщик скриншотов.
import { loadData, el, MapView } from './common.js';
import { t, lang, localized, applyI18n } from './i18n.js';
import { langToggle, mountWidgets, isLocal } from './widgets.js';
import { trackEvent } from './analytics.js';

document.title = t('pageTitleMap');
document.getElementById('lang-slot').append(langToggle());
applyI18n();
mountWidgets();

const { mapById, docById, spawns } = await loadData();
const mapId = new URLSearchParams(location.search).get('map');
const map = mapById[mapId];
if (!map) location.replace('index.html');

const all = spawns.filter((s) => s.map === mapId);
const placed = all.filter((s) => s.x != null && s.y != null);

document.title = `${localized(map)} — Kord Breach`;
document.getElementById('map-name').textContent = localized(map);
// Во второй строке показываем название на другом языке.
document.getElementById('map-sub').textContent =
  `${lang === 'en' ? map.name : map.en} · ${placed.length} / ${all.length} ${t('placedCounter')}`;

const editLink = document.getElementById('edit-link');
if (isLocal) editLink.href = `editor.html?map=${mapId}`;
else editLink.remove();

const view = new MapView(document.getElementById('viewport'));
await view.load(map);

const hidden = new Set();
let floor = null;
let visible = [];
let slides = [];
let current = -1;

/* ---------- фильтры по типу документации ---------- */

const filters = document.getElementById('filters');
const docIds = [...new Set(all.map((s) => s.doc))];
for (const id of docIds) {
  const doc = docById[id];
  const n = all.filter((s) => s.doc === id).length;
  const row = el(
    'div',
    {
      class: 'filter-row',
      onclick: () => {
        hidden.has(id) ? hidden.delete(id) : hidden.add(id);
        row.classList.toggle('off', hidden.has(id));
        render();
      },
    },
    el('img', { src: doc.icon, alt: '' }),
    el('span', { class: 'lbl' }, localized(doc)),
    el('span', { class: 'n' }, String(n))
  );
  filters.append(row);
}

/* ---------- этажи ---------- */

if (map.floors?.length > 1) {
  document.getElementById('floors-group').hidden = false;
  const box = document.getElementById('floors');
  const mk = (id, name) =>
    el(
      'button',
      {
        class: 'floor-btn' + (id === null ? ' active' : ''),
        onclick: (e) => {
          floor = id;
          box.querySelectorAll('.floor-btn').forEach((b) => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          view.setFloor(id);
          render();
        },
      },
      name
    );
  box.append(mk(null, t('allLayers')));
  for (const f of map.floors) box.append(mk(f.id, localized(f)));
}

/* ---------- отрисовка маркеров и списка ---------- */

const listBox = document.getElementById('spawn-list');

function render() {
  visible = placed.filter((s) => !hidden.has(s.doc) && (floor == null || !s.floor || s.floor === floor));
  // Плоский список кадров: у точки может быть несколько скриншотов, стрелки листают их подряд.
  slides = visible.flatMap((s) => s.images.map((image, i) => ({ spawn: s, image, i, of: s.images.length })));
  view.clearMarkers();
  for (const s of visible) {
    view.addMarker(s, docById[s.doc], { onClick: (sp) => open(slides.findIndex((sl) => sl.spawn === sp)) });
  }

  listBox.replaceChildren();
  all.forEach((s) => {
    const doc = docById[s.doc];
    const item = el(
      'div',
      {
        class: 'spawn-item' + (s.x == null ? ' unplaced' : ''),
        title: s.x == null ? t('unplacedTitle') : localized(s, 'caption'),
        onclick: () => {
          const slide = slides.findIndex((sl) => sl.spawn === s);
          if (slide < 0) return;
          view.centerOn(s.x, s.y);
          open(slide);
        },
      },
      el('img', { src: doc.icon, alt: '' }),
      el('span', {}, localized(s, 'caption') || t('noCaption'))
    );
    item.dataset.id = s.id;
    listBox.append(item);
  });
  highlight();
}

function highlight() {
  const id = slides[current]?.spawn.id;
  for (const [mid, node] of view.markers) node.classList.toggle('active', mid === id);
  listBox.querySelectorAll('.spawn-item').forEach((n) => n.classList.toggle('active', n.dataset.id === id));
}

/* ---------- модалка ---------- */

const modal = document.getElementById('modal');
const $ = (id) => document.getElementById(id);

function open(i) {
  if (i < 0 || !slides.length) return;
  current = (i + slides.length) % slides.length;
  const { spawn: s, image, i: shot, of } = slides[current];
  const doc = docById[s.doc];
  $('m-icon').src = doc.icon;
  $('m-doc').textContent = localized(doc);
  $('m-cap').textContent =
    (localized(s, 'caption') || '—') + (of > 1 ? ` — ${t('photoOf', { n: shot + 1, total: of })}` : '');
  $('m-shot').src = image;
  $('m-counter').textContent = `${current + 1} / ${slides.length}`;
  $('m-map').textContent = localized(map);
  $('m-floor').textContent = s.floor ? map.floors?.find((f) => f.id === s.floor)?.name ?? '' : '';
  // Считаем открытие просмотрщика, а не каждое пролистывание стрелками.
  if (!modal.classList.contains('open')) trackEvent('spawn-view-' + mapId);
  modal.classList.add('open');
  highlight();
}

const step = (d) => open(current + d);
const close = () => modal.classList.remove('open');

$('m-prev').onclick = () => step(-1);
$('m-next').onclick = () => step(1);
$('m-close').onclick = close;
modal.addEventListener('click', (e) => {
  if (e.target === modal) close();
});

document.addEventListener('keydown', (e) => {
  if (!modal.classList.contains('open')) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
});

$('fit').onclick = () => view.fit();
$('zin').onclick = () => zoomCenter(1.3);
$('zout').onclick = () => zoomCenter(1 / 1.3);
function zoomCenter(f) {
  const r = view.viewport.getBoundingClientRect();
  view.zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
}

render();
