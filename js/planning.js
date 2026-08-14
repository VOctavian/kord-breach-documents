// Планирование рейда: контрольные точки поверх карты — куда зайти, что забрать.
// Ничего не уходит на сервер: список лежит в localStorage браузера, отдельно
// для каждой локации.
import { el, contextMenu } from './common.js';
import { t } from './i18n.js';

const KEY = (mapId) => `kord_breach_plan_${mapId}_v1`;
// Куда по умолчанию встаёт окошко комментария относительно метки, в процентах карты.
const BOX_DX = 2.4;
const BOX_DY = -3.6;

export function mountPlanning(view, mapId, viewport) {
  /** @type {{id: string, x: number, y: number, dx: number, dy: number, text: string, done: boolean}[]} */
  let points = read();
  // id → узлы одной точки, чтобы перерисовывать её, не трогая остальные.
  const nodes = new Map();

  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY(mapId)) ?? '[]');
      // Чужие или битые данные молча заменяем пустым планом: планирование —
      // не те данные, ради которых стоит показывать посетителю ошибку.
      return Array.isArray(raw) ? raw.filter((p) => p && p.x != null && p.y != null) : [];
    } catch {
      return [];
    }
  }

  function save() {
    localStorage.setItem(KEY(mapId), JSON.stringify(points));
    resetBtn.hidden = !points.length;
  }

  /* ---------- кнопка сброса ---------- */

  const resetBtn = el(
    'button',
    {
      class: 'btn plan-reset',
      type: 'button',
      hidden: points.length ? null : '',
      onclick: () => {
        if (!confirm(t('planResetAsk', { n: points.length }))) return;
        for (const p of [...points]) remove(p);
      },
    },
    t('planReset')
  );
  viewport.append(resetBtn);

  /* ---------- отрисовка одной точки ---------- */

  function place(p) {
    const n = nodes.get(p.id);
    if (!n) return;
    view.moveOverlay(n.marker, p.x, p.y);
    if (n.box) {
      view.moveOverlay(n.box, p.x + p.dx, p.y + p.dy);
      n.line.at(p.x, p.y, p.x + p.dx, p.y + p.dy);
    }
  }

  /** Показать точку заново: состав узлов зависит от того, есть ли комментарий. */
  function draw(p, { editing = false } = {}) {
    clear(p.id);

    const marker = el(
      'div',
      {
        class: 'plan-marker' + (p.done ? ' done' : ''),
        title: t('planMarkerTitle'),
        oncontextmenu: (e) => {
          // Иначе следом сработает меню карты и предложит поставить ещё одну точку.
          e.preventDefault();
          e.stopPropagation();
          contextMenu(e, [
            [t(p.done ? 'planUndone' : 'planDone'), false, () => toggleDone(p)],
            [t('planDelete'), false, () => remove(p)],
          ]);
        },
      },
      p.done ? '✔' : '🚩'
    );
    view.addOverlay(marker, p.x, p.y);
    const n = { marker, box: null, line: null, note: null };
    nodes.set(p.id, n);

    if (!editing && !p.text) {
      // Комментария нет — у метки остаётся только значок реплики.
      n.note = el(
        'button',
        {
          class: 'plan-note',
          type: 'button',
          title: t('planNoteAdd'),
          onclick: (e) => {
            e.stopPropagation();
            draw(p, { editing: true });
          },
        },
        '💬'
      );
      marker.append(n.note);
      place(p);
      return;
    }

    n.line = view.addLine('plan-line' + (p.done ? ' done' : ''));
    n.box = editing ? editBox(p) : textBox(p);
    view.addOverlay(n.box, p.x + p.dx, p.y + p.dy);
    place(p);
    if (editing) n.box.querySelector('textarea').focus();
  }

  /** Окошко с текстом: его можно таскать, по двойному клику — правка. */
  function textBox(p) {
    const box = el(
      'div',
      { class: 'plan-box' + (p.done ? ' done' : ''), title: t('planBoxTitle') },
      el('span', { class: 'plan-text' }, p.text)
    );
    box.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      draw(p, { editing: true });
    });
    dragBox(box, p);
    return box;
  }

  function editBox(p) {
    const field = el('textarea', { class: 'plan-input', rows: '2', placeholder: t('planNoteHint') });
    field.value = p.text;
    const done = () => {
      p.text = field.value.trim();
      save();
      draw(p);
    };
    field.addEventListener('keydown', (e) => {
      // Enter сохраняет, Shift+Enter — перенос строки.
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        done();
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        draw(p);
      }
    });
    const box = el(
      'div',
      { class: 'plan-box editing' },
      field,
      el('button', { class: 'btn plan-ok', type: 'button', onclick: done }, t('planNoteSave'))
    );
    // Ввод не должен уезжать вместе с картой — гасим протяжку внутри окошка.
    box.addEventListener('pointerdown', (e) => e.stopPropagation());
    return box;
  }

  /** Перетаскивание окошка: смещение храним в процентах карты, как и координаты. */
  function dragBox(box, p) {
    box.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      // Без этого MapView начнёт панораму и окно «уедет» вместе с картой.
      e.stopPropagation();
      box.setPointerCapture(e.pointerId);
      const from = { x: e.clientX, y: e.clientY, dx: p.dx, dy: p.dy };
      let moved = false;

      const move = (ev) => {
        moved = true;
        p.dx = from.dx + ((ev.clientX - from.x) / view.scale / view.w) * 100;
        p.dy = from.dy + ((ev.clientY - from.y) / view.scale / view.h) * 100;
        place(p);
      };
      const up = () => {
        box.removeEventListener('pointermove', move);
        box.removeEventListener('pointerup', up);
        if (moved) save();
      };
      box.addEventListener('pointermove', move);
      box.addEventListener('pointerup', up);
    });
  }

  function clear(id) {
    const n = nodes.get(id);
    if (!n) return;
    view.removeOverlay(n.marker);
    if (n.box) view.removeOverlay(n.box);
    n.line?.remove();
    nodes.delete(id);
  }

  /* ---------- действия ---------- */

  function add(x, y) {
    const p = {
      id: 'p' + Date.now().toString(36),
      x: +x.toFixed(3),
      y: +y.toFixed(3),
      dx: BOX_DX,
      dy: BOX_DY,
      text: '',
      done: false,
    };
    points.push(p);
    save();
    // Сразу предлагаем комментарий — но его можно не писать и просто уйти.
    draw(p, { editing: true });
  }

  function toggleDone(p) {
    p.done = !p.done;
    save();
    draw(p);
  }

  function remove(p) {
    clear(p.id);
    points = points.filter((v) => v !== p);
    save();
  }

  for (const p of points) draw(p);

  return {
    /** Пункты для меню по правому клику — их собирает map.js вместе с чужими. */
    menuItems: (x, y) => [[t('planAdd'), false, () => add(x, y)]],
  };
}
