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
  constructor(viewport, { onMapClick } = {}) {
    this.viewport = viewport;
    this.onMapClick = onMapClick;
    this.stage = el('div', { class: 'stage' });
    this.viewport.append(this.stage);
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this.minScale = 0.1;
    this.maxScale = 12;
    this.markers = new Map();
    this._bindPointer();
  }

  async load(map) {
    this.map = map;
    this.stage.replaceChildren();
    this.markers.clear();

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
    for (const m of this.markers.values()) m.style.transform = `scale(${inv})`;
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

  addMarker(spawn, doc, { onClick } = {}) {
    const node = el(
      'div',
      {
        class: 'marker',
        title: spawn.caption,
        'data-id': spawn.id,
        onclick: (e) => {
          e.stopPropagation();
          onClick?.(spawn);
        },
      },
      el('img', { src: doc.icon, alt: doc.name })
    );
    node.style.left = spawn.x + '%';
    node.style.top = spawn.y + '%';
    node.style.borderColor = doc.color;
    node.style.transform = `scale(${1 / this.scale})`;
    this.stage.append(node);
    this.markers.set(spawn.id, node);
    return node;
  }

  clearMarkers() {
    for (const m of this.markers.values()) m.remove();
    this.markers.clear();
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
        const r = vp.getBoundingClientRect();
        const x = ((e.clientX - r.left - this.tx) / this.scale / this.w) * 100;
        const y = ((e.clientY - r.top - this.ty) / this.scale / this.h) * 100;
        if (x >= 0 && x <= 100 && y >= 0 && y <= 100) this.onMapClick(x, y);
      }
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', () => (dragging = false));

    vp.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.18 : 1 / 1.18);
      },
      { passive: false }
    );
  }
}
