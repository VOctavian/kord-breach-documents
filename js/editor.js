// Редактор (только локально): расстановка точек, правка описаний и скриншотов.
import { loadData, el, MapView } from './common.js';

const data = await loadData();
const { maps, docs, docById, spawns } = data;

const params = new URLSearchParams(location.search);
let mapId = params.get('map') ?? maps[0].id;
let map = data.mapById[mapId];
let list = [];
let idx = 0;
let floor = null;
let shotIdx = 0;

const $ = (id) => document.getElementById(id);
// Левая кнопка только двигает карту: случайный клик больше не сбивает координаты.
const view = new MapView($('viewport'), { onMapContext: openMenu });
const current = () => list[idx];

/* ---------- выбор локации ---------- */

const select = $('map-select');
for (const m of maps) {
  select.append(el('option', { value: m.id, selected: m.id === mapId ? '' : null }, m.name));
}
select.onchange = () => {
  mapId = select.value;
  history.replaceState(null, '', `?map=${mapId}`);
  openMap();
};

for (const d of docs) $('e-doc').append(el('option', { value: d.id }, d.name));

async function openMap() {
  map = data.mapById[mapId];
  list = spawns.filter((s) => s.map === mapId);
  idx = Math.max(0, list.findIndex((s) => s.x == null));
  floor = null;
  await view.load(map);
  buildFloors();
  render();
}

/* ---------- этажи ---------- */

function buildFloors() {
  const group = $('floors-group');
  const box = $('floors');
  box.replaceChildren();
  if (!map.floors?.length || map.floors.length < 2) {
    group.hidden = true;
    return;
  }
  group.hidden = false;
  const mk = (id, name) =>
    el('button', { class: 'floor-btn' + (id === floor ? ' active' : ''), 'data-floor': id ?? '', onclick: () => applyFloor(id) }, name);
  box.append(mk(null, 'Все слои'));
  for (const f of map.floors) box.append(mk(f.id, f.name));
}

/** Подсказка этажа по тексту описания — чтобы сразу показать нужный слой карты. */
function guessFloor(caption) {
  if (!map.floors?.length) return null;
  const has = (id) => map.floors.find((f) => f.id === id)?.id ?? null;
  const t = (caption || '').toLowerCase();
  if (/подвал|подземн|бункер|коллектор/.test(t)) return has('Underground_Level') ?? has('Technical_Level');
  if (/\b5 этаж|пятый этаж/.test(t)) return has('Fifth_Floor');
  if (/\b4 этаж|четв[её]ртый этаж/.test(t)) return has('Fourth_Floor');
  if (/\b3 этаж|трет(ий|ьем) этаж/.test(t)) return has('Third_Floor');
  if (/\b2 этаж|втор(ой|ом) этаж/.test(t)) return has('Second_Floor') ?? has('Second_Level');
  if (/\b1 этаж|перв(ый|ом) этаж/.test(t)) return has('First_Floor') ?? has('Ground_Floor') ?? has('First_Level');
  return null;
}

function applyFloor(id) {
  floor = id;
  $('floors')
    .querySelectorAll('.floor-btn')
    .forEach((b) => b.classList.toggle('active', (b.dataset.floor || '') === (id ?? '')));
  view.setFloor(id);
}

/* ---------- постановка точки ---------- */

function place(spawn, x, y) {
  spawn.x = +x.toFixed(3);
  spawn.y = +y.toFixed(3);
  spawn.floor = floor ?? null;
  render();
  save();
}

/* ---------- контекстное меню ---------- */

let menu = null;

function closeMenu() {
  menu?.remove();
  menu = null;
}

function openMenu(x, y, e) {
  closeMenu();
  const s = current();
  const item = (label, disabled, onclick) =>
    el('button', { class: 'ctx-item', type: 'button', disabled: disabled ? '' : null, onclick }, label);

  menu = el(
    'div',
    { class: 'ctx-menu' },
    item('Новая точка здесь', false, () => {
      closeMenu();
      place(createSpawn(), x, y);
      $('e-cap-ru').focus();
    }),
    item(s ? 'Переместить сюда' : 'Переместить сюда (точка не выбрана)', !s, () => {
      closeMenu();
      place(s, x, y);
    })
  );

  document.body.append(menu);
  // Рядом с краем окна меню развернулось бы за экран — двигаем внутрь.
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(e.clientX, innerWidth - r.width - 6) + 'px';
  menu.style.top = Math.min(e.clientY, innerHeight - r.height - 6) + 'px';
}

addEventListener('pointerdown', (e) => {
  if (menu && !e.target.closest('.ctx-menu')) closeMenu();
});
// Ловим на перехвате: правый клик мимо карты до MapView не доходит, а старое
// меню закрыть всё равно надо.
addEventListener('contextmenu', closeMenu, true);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
});
addEventListener('blur', closeMenu);

/* ---------- отрисовка ---------- */

/** Основной скриншот + миниатюры, если у точки их несколько. */
function renderShots() {
  const images = current()?.images ?? [];
  shotIdx = Math.min(shotIdx, Math.max(0, images.length - 1));
  $('e-shot').src = images[shotIdx] ?? '';
  $('e-shot').style.visibility = images.length ? '' : 'hidden';
  $('del-shot').disabled = images.length < 1;

  const box = $('e-thumbs');
  box.replaceChildren();
  if (images.length < 2) return;
  images.forEach((src, i) =>
    box.append(
      el('img', {
        src,
        alt: `Фото ${i + 1}`,
        class: i === shotIdx ? 'active' : '',
        onclick: () => {
          shotIdx = i;
          renderShots();
        },
      })
    )
  );
}

function render() {
  const s = current();
  if (s) applyFloor(s.floor ?? guessFloor(s.caption));

  $('e-doc').value = s?.doc ?? docs[0].id;
  $('e-cap-ru').value = s?.caption ?? '';
  $('e-cap-en').value = s?.captionEn ?? '';
  renderShots();

  const done = list.filter((v) => v.x != null).length;
  $('progress-bar').style.width = list.length ? (done / list.length) * 100 + '%' : '0%';
  $('progress-text').textContent = `${map.name}: ${done} / ${list.length}${s ? ` · текущая №${idx + 1}` : ''}`;

  view.clearMarkers();
  for (const sp of list) {
    if (sp.x == null) continue;
    const node = view.addMarker(sp, docById[sp.doc], {
      onClick: (target) => {
        idx = list.indexOf(target);
        shotIdx = 0;
        render();
      },
    });
    if (sp === s) node.classList.add('active');
  }

  const box = $('spawn-list');
  box.replaceChildren();
  list.forEach((sp, i) => {
    box.append(
      el(
        'div',
        {
          class: 'spawn-item' + (i === idx ? ' active' : '') + (sp.x == null ? ' unplaced' : ''),
          onclick: () => {
            idx = i;
            shotIdx = 0;
            if (sp.x != null) view.centerOn(sp.x, sp.y);
            render();
          },
        },
        el('img', { src: docById[sp.doc].icon, alt: '' }),
        el(
          'span',
          {},
          `${i + 1}. ${sp.caption || '(без описания)'}${sp.images.length > 1 ? ` (${sp.images.length} фото)` : ''}`
        ),
        el('span', { class: sp.x == null ? 'badge-empty' : 'badge-placed' }, sp.x == null ? '○' : '●')
      )
    );
  });
}

/* ---------- правка полей ---------- */

function bindField(inputId, apply) {
  const node = $(inputId);
  node.addEventListener('input', () => {
    const s = current();
    if (!s) return;
    apply(s, node.value);
    save();
  });
  // Список слева обновляем только по окончании ввода, чтобы не дёргать его на каждый символ.
  node.addEventListener('change', render);
}

bindField('e-cap-ru', (s, v) => (s.caption = v));
bindField('e-cap-en', (s, v) => (s.captionEn = v));

$('e-doc').addEventListener('change', () => {
  const s = current();
  if (!s) return;
  s.doc = $('e-doc').value;
  s.docName = docById[s.doc].name;
  render();
  save();
});

/* ---------- скриншоты ---------- */

$('add-shot').onclick = () => $('shot-input').click();

$('shot-input').addEventListener('change', async () => {
  const s = current();
  const files = [...$('shot-input').files];
  $('shot-input').value = '';
  if (!s || !files.length) return;

  setStatus('загружаю…');
  try {
    for (const file of files) {
      const res = await fetch(`/api/upload?map=${s.map}&doc=${s.doc}&name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!res.ok) throw new Error(await res.text());
      const { path } = await res.json();
      s.images.push(path);
      shotIdx = s.images.length - 1;
    }
    render();
    save();
  } catch (e) {
    setStatus('не удалось загрузить: ' + e.message, 'err');
  }
});

$('del-shot').onclick = () => {
  const s = current();
  if (!s || !s.images.length) return;
  if (!confirm(`Убрать фото ${shotIdx + 1} из ${s.images.length}?\nФайл останется на диске.`)) return;
  s.images.splice(shotIdx, 1);
  shotIdx = 0;
  render();
  save();
};

/* ---------- добавление и удаление точек ---------- */

/** Пустая точка текущей локации; координат нет, пока её куда-нибудь не поставят. */
function createSpawn() {
  const doc = $('e-doc').value || docs[0].id;
  const spawn = {
    id: `${mapId}-c${Date.now().toString(36)}`,
    map: mapId,
    mapName: map.name,
    doc,
    docName: docById[doc].name,
    caption: '',
    captionEn: '',
    images: [],
    x: null,
    y: null,
    floor: null,
  };
  spawns.push(spawn);
  list = spawns.filter((s) => s.map === mapId);
  idx = list.indexOf(spawn);
  shotIdx = 0;
  return spawn;
}

$('new-spawn').onclick = () => {
  createSpawn();
  render();
  $('e-cap-ru').focus();
  save();
};

$('del-spawn').onclick = () => {
  const s = current();
  if (!s) return;
  if (!confirm(`Удалить точку «${s.caption || 'без описания'}» целиком?`)) return;
  spawns.splice(spawns.indexOf(s), 1);
  list = spawns.filter((v) => v.map === mapId);
  idx = Math.min(idx, Math.max(0, list.length - 1));
  render();
  save();
};

/* ---------- сохранение ---------- */

let timer;
function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 500);
}

/** Записать немедленно, не дожидаясь автосохранения. `false` — запись не удалась. */
async function flush() {
  clearTimeout(timer);
  setStatus('сохраняю…');
  try {
    const res = await fetch('/api/spawns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(spawns),
    });
    if (!res.ok) throw new Error(await res.text());
    setStatus('сохранено ✓', 'ok');
    return true;
  } catch (e) {
    setStatus('ошибка сохранения: ' + e.message, 'err');
    return false;
  }
}

function setStatus(text, cls = '') {
  const n = $('status');
  n.textContent = text;
  n.className = 'status ' + cls;
  if (cls === 'ok') setTimeout(() => (n.textContent = ''), 1800);
}

/* ---------- управление ---------- */

$('done').onclick = async () => {
  const btn = $('done');
  btn.disabled = true;
  // Правка могла случиться меньше секунды назад — дописываем её, а не уходим молча.
  // Если запись не прошла, остаёмся на странице: иначе правки просто пропадут.
  if (await flush()) location.href = `map.html?map=${mapId}`;
  else btn.disabled = false;
};
const step = (d) => {
  if (!list.length) return;
  idx = (idx + d + list.length) % list.length;
  shotIdx = 0;
  render();
};
$('prev').onclick = () => step(-1);
$('next').onclick = () => step(1);
$('next-empty').onclick = () => {
  const i = list.findIndex((v, j) => j > idx && v.x == null);
  idx = i >= 0 ? i : Math.max(0, list.findIndex((v) => v.x == null));
  shotIdx = 0;
  render();
};
$('clear').onclick = () => {
  const s = current();
  if (!s) return;
  s.x = s.y = null;
  s.floor = null;
  render();
  save();
};

$('fit').onclick = () => view.fit();
$('zin').onclick = () => zoomCenter(1.3);
$('zout').onclick = () => zoomCenter(1 / 1.3);
function zoomCenter(f) {
  const r = view.viewport.getBoundingClientRect();
  view.zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
}

$('e-shot').onclick = () => {
  const s = current();
  if (!s?.images.length) return;
  $('m-shot').src = s.images[shotIdx];
  $('m-cap').textContent = s.caption;
  $('modal').classList.add('open');
};
$('m-close').onclick = () => $('modal').classList.remove('open');
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal')) $('modal').classList.remove('open');
});

document.addEventListener('keydown', (e) => {
  // В полях ввода стрелки и Delete должны работать как обычно.
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === 'Escape') $('modal').classList.remove('open');
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
});

await openMap();
