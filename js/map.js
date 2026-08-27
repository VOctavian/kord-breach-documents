// Страница локации: карта с иконками документов + просмотрщик скриншотов.
import { loadData, el, MapView, isPublished, contextMenu } from './common.js';
import { t, lang, localized, applyI18n } from './i18n.js';
import { langToggle, socialLinks, mountWidgets, isLocal } from './widgets.js';
import { trackEvent, mountUmami } from './analytics.js';
import { mountChangelog } from './changelog.js';
import { mountAuthor } from './author.js';
import { mountSurvey } from './survey.js';
import { mountPlanning } from './planning.js';
import { mountSuggest } from './suggest.js';
import { mountAuth, hasRole, onAuthChange, ready } from './auth.js';
import { mountAds } from './ads.js';

document.title = t('pageTitleMap');
mountUmami();
mountAuthor(document.getElementById('logo-slot'));
document.getElementById('social-slot').append(socialLinks());
document.getElementById('lang-slot').append(langToggle());
mountAuth(document.getElementById('auth-slot'));
mountAds();
applyI18n();
mountWidgets();

const { maps, mapById, docById, docs, spawns } = await loadData();
mountChangelog(mapById);
mountSurvey();
// У каждой локации теперь своя страница (`shoreline.html`), она объявляет себя
// через `__MAP__`. Старый адрес `map.html?map=<id>` продолжает работать: такие
// ссылки уже разошлись по чатам, ломать их нельзя.
const mapId = new URLSearchParams(location.search).get('map') ?? window.__MAP__;
const map = mapById[mapId];
if (!map) location.replace('index.html');

const all = spawns.filter((s) => s.map === mapId && isPublished(s));
const placed = all.filter((s) => s.x != null && s.y != null);

document.title = `${localized(map)} — Kord Breach`;
document.getElementById('map-name').textContent = localized(map);
// Во второй строке показываем название на другом языке.
document.getElementById('map-sub').textContent =
  `${lang === 'en' ? map.name : map.en} · ${placed.length} / ${all.length} ${t('placedCounter')}`;

// Редактор открыт локально и админу на сайте: правки с сайта уезжают в
// репозиторий через Edge Function. Роль приходит асинхронно, поэтому кнопку
// перекрашиваем по событию, а не один раз при загрузке.
const editLink = document.getElementById('edit-link');
editLink.href = `editor.html?map=${mapId}`;
const paintEditLink = () => (editLink.hidden = !isLocal && !hasRole('admin'));
paintEditLink();
onAuthChange(paintEditLink);
ready().then(paintEditLink);

// Планирование и предложения поднимаются после загрузки карты, а меню нужно уже
// конструктору — отсюда ссылки через переменные. Пункты меню собираются из обоих:
// планирование личное и живёт в браузере, предложение уходит на сервер.
let planning = null;
let suggest = null;
const viewport = document.getElementById('viewport');
const view = new MapView(viewport, {
  onMapContext: (x, y, e) =>
    contextMenu(e, [...(planning?.menuItems(x, y) ?? []), ...(suggest?.menuItems(x, y) ?? [])]),
});
await view.load(map);
planning = mountPlanning(view, mapId, viewport);
suggest = mountSuggest(view, mapId, docs);

const hidden = new Set();
let floor = null;
let visible = [];
let slides = [];
let current = -1;

/* ---------- схема этажей ---------- */

// Тумблер показываем только там, где есть что выключать: на локациях без вторых
// координат он бы ничего не делал — как и группа этажей, которая скрыта по тому
// же принципу.
const ALT_KEY = 'kord_breach_alt_points_v1';
const altToggle = document.getElementById('alt-toggle');
let showAlt = localStorage.getItem(ALT_KEY) !== 'off';
altToggle.checked = showAlt;

if (placed.some((s) => s.x2 != null && s.y2 != null)) {
  document.getElementById('alt-group').hidden = false;
  altToggle.addEventListener('change', () => {
    showAlt = altToggle.checked;
    localStorage.setItem(ALT_KEY, showAlt ? 'on' : 'off');
    render();
  });
}

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

/* ---------- переход между локациями ---------- */

// Вместо списка точек: сами точки и так видны маркерами, а вот перескочить на
// соседнюю карту раньше можно было только через главную. Заодно двенадцать
// страниц локаций перелинковываются между собой.
// Страницы локаций сгенерированы из map.html: пока они не пересобраны после
// правки шаблона, этого блока в них нет. Падать из-за него всей карте незачем —
// без панели она работает, а строка в консоли подскажет причину.
const navBox = document.getElementById('map-nav');
if (!navBox) console.warn('нет #map-nav — страница собрана из старого map.html, пересоберите: node scripts/build-map-pages.mjs --write');

/** Строки панели и типы документации каждой локации — для подсказки и подсветки. */
const navRows = [];

for (const m of navBox ? maps : []) {
  const pts = spawns.filter((s) => s.map === m.id && isPublished(s) && s.x != null);
  // Пустую локацию не показываем: страницы у неё тоже нет.
  if (!pts.length) continue;
  const docIds = [...new Set(pts.map((s) => s.doc))];
  const here = m.id === mapId;
  const row = el(
    'a',
    {
      class: 'map-nav-item' + (here ? ' active' : ''),
      href: `${m.id}.html`,
      // Ссылка на саму себя перезагрузила бы страницу без всякой пользы.
      onclick: here ? (e) => e.preventDefault() : null,
    },
    el('span', { class: 'lbl' }, localized(m)),
    el('span', { class: 'docs' }, docIds.map((id) => el('img', { src: docById[id].icon, alt: '' }))),
    el('span', { class: 'n' }, String(pts.length))
  );
  navRows.push({ row, docs: new Set(docIds) });
  navBox.append(row);
}

/* ---------- подсказка: какая документация лежит на локации ---------- */

// Держим подсказку в body, а не внутри строки: у боковой панели `overflow-y: auto`,
// вложенный блок обрезался бы по её краю.
const tip = el('div', { class: 'doc-tip', hidden: '' });
document.body.append(tip);

let tipTimer;
const unmark = () => navRows.forEach(({ row }) => row.classList.remove('match'));
const hideTip = () => {
  tip.hidden = true;
  unmark();
};
// Уходим не сразу: между строкой и подсказкой есть зазор, и мгновенное закрытие
// не давало бы навести курсор на саму документацию.
const leave = () => (tipTimer = setTimeout(hideTip, 140));
const enter = () => clearTimeout(tipTimer);

tip.addEventListener('mouseenter', enter);
tip.addEventListener('mouseleave', leave);

for (const { row, docs } of navRows) {
  row.addEventListener('mouseenter', () => {
    enter();
    showTip(row, [...docs]);
  });
  row.addEventListener('mouseleave', leave);
}

function showTip(row, docIds) {
  tip.replaceChildren(
    ...docIds.map((id) => {
      const doc = docById[id];
      return el(
        'div',
        {
          class: 'doc-tip-item',
          // Наведение на тип документации показывает, где ещё она встречается.
          onmouseenter: () => navRows.forEach(({ row: r, docs }) => r.classList.toggle('match', docs.has(id))),
          onmouseleave: unmark,
        },
        el('img', { src: doc.icon, alt: '' }),
        el('span', {}, localized(doc))
      );
    })
  );
  tip.hidden = false;
  // Размеры известны только после показа, поэтому позиционируем следом.
  const r = row.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  tip.style.left = Math.min(r.right + 10, innerWidth - t.width - 8) + 'px';
  tip.style.top = Math.max(8, Math.min(r.top - 8, innerHeight - t.height - 8)) + 'px';
}

/* ---------- отрисовка маркеров ---------- */

function render() {
  visible = placed.filter((s) => !hidden.has(s.doc) && (floor == null || !s.floor || s.floor === floor));
  // Плоский список кадров: у точки может быть несколько скриншотов, стрелки листают их подряд.
  // Точке без единого скриншота всё равно даём кадр — иначе клик по её маркеру
  // молча ничего не делал бы, хотя описание у неё есть.
  slides = visible.flatMap((s) =>
    s.images.length
      ? s.images.map((image, i) => ({ spawn: s, image, i, of: s.images.length }))
      : [{ spawn: s, image: null, i: 0, of: 0 }]
  );
  view.clearMarkers();
  for (const s of visible) {
    view.addMarker(s, docById[s.doc], {
      onClick: (sp) => openSpawn(sp),
      alt: showAlt,
    });
  }

  highlight();
}

function highlight() {
  view.setActive(slides[current]?.spawn.id);
}

/* ---------- модалка ---------- */

const modal = document.getElementById('modal');
const $ = (id) => document.getElementById(id);

/** Открыть первый кадр точки; ничего не делает, если её кадров нет на карте. */
function openSpawn(spawn) {
  const i = slides.findIndex((sl) => sl.spawn === spawn);
  if (i >= 0) open(i);
}

// Номер нормализуем по кругу: `step(-1)` с первого кадра должен уводить на
// последний. Отсутствие кадра отсекают вызывающие — иначе `-1` от `findIndex`
// молча открывал бы последний кадр вместо ничего.
function open(i) {
  if (!slides.length) return;
  current = (i + slides.length) % slides.length;
  const { spawn: s, image, i: shot, of } = slides[current];
  const doc = docById[s.doc];
  $('m-icon').src = doc.icon;
  $('m-doc').textContent = localized(doc);
  $('m-cap').textContent =
    (localized(s, 'caption') || '—') + (of > 1 ? ` — ${t('photoOf', { n: shot + 1, total: of })}` : '');
  // Пустой src заставил бы браузер тянуть саму страницу и показать битую картинку.
  $('m-shot').hidden = !image;
  $('m-noshot').hidden = Boolean(image);
  if (image) $('m-shot').src = image;
  else $('m-shot').removeAttribute('src');
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

/* ---------- сворачивание боковой панели ---------- */

const SIDEBAR_KEY = 'kord_breach_sidebar_v1';
const layout = document.querySelector('.layout');
const sidebarBtn = $('sidebar-toggle');

function setSidebar(off) {
  layout.classList.toggle('sidebar-off', off);
  sidebarBtn.textContent = off ? '›' : '‹';
  sidebarBtn.title = t(off ? 'sidebarShow' : 'sidebarHide');
  localStorage.setItem(SIDEBAR_KEY, off ? 'off' : 'on');
}

setSidebar(localStorage.getItem(SIDEBAR_KEY) === 'off');
sidebarBtn.onclick = () => layout.classList.contains('sidebar-off') ? setSidebar(false) : setSidebar(true);

$('fit').onclick = () => view.fit();
$('zin').onclick = () => zoomCenter(1.3);
$('zout').onclick = () => zoomCenter(1 / 1.3);
function zoomCenter(f) {
  const r = view.viewport.getBoundingClientRect();
  view.zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
}

render();
