// Общие утилиты: загрузка данных и интерактивная карта (pan/zoom + маркеры).

export async function loadData() {
  const [maps, docs, spawns] = await Promise.all([
    fetch('data/maps.json').then((r) => r.json()),
    fetch('data/docs.json').then((r) => r.json()),
    fetch('data/spawns.json').then((r) => r.json()),
  ]);
  return {
    maps,
    docs,
    spawns,
    mapById: Object.fromEntries(maps.map((m) => [m.id, m])),
    docById: Object.fromEntries(docs.map((d) => [d.id, d])),
  };
}

/**
 * Точка готова к показу, если у неё есть описание или хотя бы один скриншот.
 * Недозаполненные заготовки из редактора на сайт не выводим.
 */
export function isPublished(spawn) {
  return Boolean(spawn.caption?.trim() || spawn.images?.length);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** То же, что `el`, но в пространстве имён SVG: иначе браузер не отрисует тег. */
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, String(v));
  return node;
}

export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) node.append(kid);
  return node;
}

/**
 * Карта с зумом/панорамой. Координаты маркеров хранятся в процентах (0..100)
 * от натурального размера карты, поэтому не зависят от масштаба показа.
 */
export class MapView {
  constructor(viewport, { onMapClick, onMapContext } = {}) {
    this.viewport = viewport;
    this.onMapClick = onMapClick;
    this.onMapContext = onMapContext;
    this.stage = el('div', { class: 'stage' });
    this.viewport.append(this.stage);
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this.minScale = 0.1;
    this.maxScale = 12;
    this.markers = new Map();
    // Вторые маркеры тех же точек и связи между парами — по одному на точку.
    this.alts = new Map();
    this.links = new Map();
    this._bindPointer();
  }

  async load(map) {
    this.map = map;
    this.stage.replaceChildren();
    this.markers.clear();
    this.alts.clear();
    this.links.clear();

    if (map.type === 'svg') {
      const text = await fetch(map.file).then((r) => r.text());
      const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
      const [, , w, h] = (svg.getAttribute('viewBox') || '0 0 1000 1000').split(/\s+/).map(Number);
      this.w = w;
      this.h = h;
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.style.pointerEvents = 'none';
      this.svg = svg;
      this.stage.append(svg);
    } else {
      this.w = map.width;
      this.h = map.height;
      this.svg = null;
      const img = el('img', { src: map.file, draggable: 'false', alt: map.name });
      this.stage.append(img);
    }

    // Слой связей кладём до маркеров: они добавляются позже и потому окажутся выше.
    this.linkLayer = svgEl('svg', { class: 'link-layer', viewBox: `0 0 ${this.w} ${this.h}` });
    this.stage.append(this.linkLayer);

    this.stage.style.width = this.w + 'px';
    this.stage.style.height = this.h + 'px';
    this.fit();
  }

  /** Показать только выбранный этаж (плюс «землю» как подложку). null = все слои. */
  setFloor(floorId) {
    if (!this.svg || !this.map.floors?.length) return;
    // Слой «земли» остаётся видимым как подложка под выбранным этажом.
    const base = (this.map.floors.find((f) => /^ground/i.test(f.id)) ?? this.map.floors[0]).id;
    for (const f of this.map.floors) {
      const g = this.svg.querySelector('#' + CSS.escape(f.id));
      if (!g) continue;
      const show = floorId == null || f.id === floorId || (f.id === base && floorId !== base);
      g.style.display = show ? '' : 'none';
      g.style.opacity = floorId != null && f.id === base && floorId !== base ? '0.45' : '';
    }
  }

  fit() {
    const r = this.viewport.getBoundingClientRect();
    const s = Math.min(r.width / this.w, r.height / this.h) * 0.94;
    this.minScale = s * 0.5;
    this.scale = s;
    this.tx = (r.width - this.w * s) / 2;
    this.ty = (r.height - this.h * s) / 2;
    this.apply();
  }

  apply() {
    this.stage.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
    const inv = 1 / this.scale;
    for (const box of [this.markers, this.alts])
      for (const m of box.values()) m.style.transform = `scale(${inv})`;
  }

  zoomAt(clientX, clientY, factor) {
    const r = this.viewport.getBoundingClientRect();
    const px = clientX - r.left;
    const py = clientY - r.top;
    const next = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    const k = next / this.scale;
    this.tx = px - (px - this.tx) * k;
    this.ty = py - (py - this.ty) * k;
    this.scale = next;
    this.apply();
  }

  /** Плавно подвести точку (в процентах) в центр вьюпорта. */
  centerOn(xPct, yPct, scale = Math.max(this.scale, 2)) {
    const r = this.viewport.getBoundingClientRect();
    this.scale = Math.min(this.maxScale, scale);
    this.tx = r.width / 2 - (xPct / 100) * this.w * this.scale;
    this.ty = r.height / 2 - (yPct / 100) * this.h * this.scale;
    this.stage.style.transition = 'transform 0.25s ease-out';
    this.apply();
    setTimeout(() => (this.stage.style.transition = ''), 260);
  }

  /**
   * Маркер точки. Если заданы вторые координаты (`x2`/`y2` — та же точка на
   * схеме этажей, нарисованной с краю карты), рядом появляется второй маркер и
   * тонкая линия между ними. Возвращает основной маркер.
   */
  addMarker(spawn, doc, { onClick } = {}) {
    const main = this._marker(spawn, doc, onClick, false);
    this.markers.set(spawn.id, main);
    if (spawn.x2 == null || spawn.y2 == null) return main;

    const alt = this._marker(spawn, doc, onClick, true);
    this.alts.set(spawn.id, alt);
    const link = this._link(spawn);
    this.links.set(spawn.id, link);
    // Наведение на любой из маркеров подсвечивает связь: в тонкую линию попасть
    // курсором трудно, а понять, куда она ведёт, нужно именно от маркера.
    for (const node of [main, alt]) {
      node.addEventListener('mouseenter', () => link.classList.add('hot'));
      node.addEventListener('mouseleave', () => link.classList.remove('hot'));
    }
    return main;
  }

  _marker(spawn, doc, onClick, alt) {
    const node = el(
      'div',
      {
        class: 'marker' + (alt ? ' alt' : ''),
        title: spawn.caption,
        'data-id': spawn.id,
        onclick: (e) => {
          e.stopPropagation();
          onClick?.(spawn);
        },
      },
      el('img', { src: doc.icon, alt: doc.name })
    );
    node.style.left = (alt ? spawn.x2 : spawn.x) + '%';
    node.style.top = (alt ? spawn.y2 : spawn.y) + '%';
    node.style.borderColor = doc.color;
    node.style.transform = `scale(${1 / this.scale})`;
    this.stage.append(node);
    return node;
  }

  /** Линия между основным и второстепенным маркерами одной точки. */
  _link(spawn) {
    const ends = {
      x1: (spawn.x / 100) * this.w,
      y1: (spawn.y / 100) * this.h,
      x2: (spawn.x2 / 100) * this.w,
      y2: (spawn.y2 / 100) * this.h,
    };
    const g = svgEl('g', { class: 'link', 'data-id': spawn.id });
    g.append(svgEl('line', { class: 'link-hit', ...ends }), svgEl('line', { class: 'link-wire', ...ends }));
    this.linkLayer.append(g);
    return g;
  }

  /** Подсветить точку: оба её маркера и связь между ними. */
  setActive(id) {
    for (const box of [this.markers, this.alts, this.links])
      for (const [mid, node] of box) node.classList.toggle('active', mid === id);
  }

  clearMarkers() {
    for (const box of [this.markers, this.alts, this.links]) {
      for (const node of box.values()) node.remove();
      box.clear();
    }
  }

  _bindPointer() {
    const vp = this.viewport;
    let dragging = false;
    let moved = 0;
    let lx = 0;
    let ly = 0;

    let captured = false;

    vp.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      captured = false;
      moved = 0;
      lx = e.clientX;
      ly = e.clientY;
    });

    vp.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      moved += Math.abs(dx) + Math.abs(dy);
      lx = e.clientX;
      ly = e.clientY;
      // Захват указателя только когда началось реальное перетаскивание:
      // иначе браузер перенацелил бы click на вьюпорт и клики по маркерам не работали бы.
      if (!captured && moved > 4) {
        vp.setPointerCapture(e.pointerId);
        captured = true;
        vp.classList.add('grabbing');
      }
      this.tx += dx;
      this.ty += dy;
      this.apply();
    });

    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      captured = false;
      vp.classList.remove('grabbing');
      if (moved < 4 && this.onMapClick && !e.target.closest('.marker')) {
        const p = this.pointAt(e.clientX, e.clientY);
        if (p) this.onMapClick(p.x, p.y);
      }
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', () => (dragging = false));

    vp.addEventListener('contextmenu', (e) => {
      if (!this.onMapContext) return;
      e.preventDefault();
      const p = this.pointAt(e.clientX, e.clientY);
      if (p) this.onMapContext(p.x, p.y, e);
    });

    vp.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.18 : 1 / 1.18);
      },
      { passive: false }
    );
  }

  /** Экранная точка → проценты карты. `null`, если ткнули мимо изображения. */
  pointAt(clientX, clientY) {
    const r = this.viewport.getBoundingClientRect();
    const x = ((clientX - r.left - this.tx) / this.scale / this.w) * 100;
    const y = ((clientY - r.top - this.ty) / this.scale / this.h) * 100;
    return x >= 0 && x <= 100 && y >= 0 && y <= 100 ? { x, y } : null;
  }
}
