// Предложенные посетителями метки.
//
// Предложить может любой, без входа — но пишет всё Edge Function `suggest`:
// она одна знает service-ключ и она же режет частоту. Ни таблица, ни бакет
// анониму не открыты, иначе ограничение обходилось бы прямым запросом.
//
// Админу предложения видны на карте отдельными маркерами: пунктирная рамка и
// вопросительный знак, чтобы ни секунды не путать их с проверенными точками.
import { el, contextMenu } from './common.js';
import { t, localized } from './i18n.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { session, hasRole, authFetch, ready, onAuthChange } from './auth.js';
import { toJpeg } from './to-jpeg.js';
import { overlay } from './widgets.js';
import { trackEvent } from './analytics.js';

// Предложение — это подсказка, а не документ: экран целиком ни к чему, а вес
// картинки бьёт и по лимиту хранилища, и по терпению того, кто грузит с телефона.
const MAX_SIDE = 1600;

export function mountSuggest(view, mapId, docs) {
  let items = [];
  const markers = new Map();

  /* ---------- форма предложения ---------- */

  function openForm(x, y) {
    const caption = el('textarea', { rows: 3, placeholder: t('suggestCaptionHint') });
    const doc = el(
      'select',
      { class: 'btn' },
      el('option', { value: '' }, t('suggestDocUnknown')),
      docs.map((d) => el('option', { value: d.id }, localized(d)))
    );
    const file = el('input', { type: 'file', accept: 'image/*' });
    const status = el('div', { class: 'status' });
    const send = el('button', { class: 'btn primary', type: 'button' }, t('suggestSend'));

    const pop = overlay('suggest-overlay');
    document.body.append(pop);
    const box = pop.querySelector('.pop-box');
    const close = () => pop.remove();

    box.append(
      el('h2', {}, t('suggestTitle')),
      el('p', { class: 'pop-intro' }, t('suggestIntro')),
      el('label', { class: 'fld' }, el('span', {}, t('suggestCaption')), caption),
      el('label', { class: 'fld' }, el('span', {}, t('suggestDoc')), doc),
      el('label', { class: 'fld' }, el('span', {}, t('suggestShot')), file),
      status,
      el('div', { class: 'editor-nav' }, send, el('button', { class: 'btn', type: 'button', onclick: close }, t('closeLabel')))
    );
    pop.classList.add('open');
    caption.focus();

    send.onclick = async () => {
      if (!caption.value.trim()) {
        status.textContent = t('suggestNeedCaption');
        status.className = 'status err';
        return;
      }
      send.disabled = true;
      status.textContent = t('suggestSending');
      status.className = 'status';

      try {
        const image = file.files[0] ? await encode(file.files[0]) : null;
        const res = await fetch(`${SUPABASE_URL}/functions/v1/suggest`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            authorization: `Bearer ${session()?.access_token ?? SUPABASE_ANON_KEY}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            map: mapId,
            doc: doc.value || null,
            caption: caption.value.trim(),
            x: +x.toFixed(3),
            y: +y.toFixed(3),
            image,
          }),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error ?? res.status);

        trackEvent('suggest-sent');
        box.replaceChildren(
          el('h2', {}, t('suggestThanks')),
          el('p', { class: 'pop-intro' }, t('suggestThanksNote')),
          el('button', { class: 'btn', type: 'button', onclick: close }, t('closeLabel'))
        );
        if (hasRole('admin')) reload();
      } catch (e) {
        // «Failed to fetch» посетителю ничего не объясняет: так выглядит и
        // недоступный сервис, и офлайн, и блокировка расширением.
        status.textContent = /failed to fetch|networkerror/i.test(e.message) ? t('suggestOffline') : e.message;
        status.className = 'status err';
        send.disabled = false;
      }
    };
  }

  /** Ужимаем до разумной стороны и переводим в JPEG — сервер другого не примет. */
  async function encode(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  /* ---------- предложения на карте (только админу) ---------- */

  async function reload() {
    for (const node of markers.values()) node.remove();
    markers.clear();
    items = [];
    if (!hasRole('admin')) return;

    try {
      const res = await authFetch(
        `/rest/v1/spawn_suggestions?select=*&map=eq.${encodeURIComponent(mapId)}&order=created_at.desc`
      );
      if (!res.ok) return;
      items = await res.json();
    } catch {
      return;
    }
    for (const s of items) draw(s);
  }

  function draw(s) {
    // Пульсирует вложенный кружок, а не сам маркер: внешнему узлу MapView на
    // каждом зуме проставляет инлайновый transform, гасящий масштаб карты, и
    // анимация трансформа эту компенсацию бы перебила.
    const node = el(
      'button',
      { class: 'suggest-marker', type: 'button', title: s.caption },
      el('span', { class: 'suggest-dot' }, '?')
    );
    node.onclick = (e) => {
      e.stopPropagation();
      openCard(s);
    };
    view.addOverlay(node, s.x, s.y);
    markers.set(s.id, node);
  }

  /** Карточка предложения: посмотреть, забрать в редактор или удалить. */
  async function openCard(s) {
    const pop = overlay('suggest-card');
    document.body.append(pop);
    const box = pop.querySelector('.pop-box');
    const close = () => pop.remove();

    const shot = el('div', { class: 'sub' }, s.image_path ? t('suggestLoadingShot') : t('suggestNoShot'));

    box.append(
      el('h2', {}, t('suggestCardTitle')),
      el('p', { class: 'pop-intro' }, `${s.author_name ?? t('suggestAnon')} · ${new Date(s.created_at).toLocaleString()}`),
      el('div', { class: 'suggest-caption' }, s.caption),
      shot,
      el(
        'div',
        { class: 'editor-nav' },
        el('a', { class: 'btn primary', href: `editor.html?map=${mapId}&suggestion=${s.id}` }, t('suggestAccept')),
        el('button', { class: 'btn danger', type: 'button', onclick: () => remove(s, close) }, t('suggestReject')),
        el('button', { class: 'btn', type: 'button', onclick: close }, t('closeLabel'))
      )
    );
    pop.classList.add('open');

    if (s.image_path) {
      const url = await signedUrl(s.image_path);
      shot.replaceChildren(
        url ? el('img', { class: 'suggest-shot', src: url, alt: '' }) : el('div', { class: 'status err' }, t('suggestShotFailed'))
      );
    }
  }

  async function remove(s, done) {
    if (!confirm(t('suggestRejectAsk'))) return;
    await authFetch(`/rest/v1/spawn_suggestions?id=eq.${s.id}`, { method: 'DELETE' });
    if (s.image_path) await deleteImage(s.image_path);
    markers.get(s.id)?.remove();
    markers.delete(s.id);
    items = items.filter((v) => v.id !== s.id);
    done?.();
  }

  ready().then(reload);
  onAuthChange(reload);

  return {
    menuItems: (x, y) => [[t('suggestAdd'), false, () => openForm(x, y)]],
    reload,
  };
}

/* ---------- доступ к приватному бакету ---------- */

/** Бакет закрыт, поэтому картинку админ смотрит по временной ссылке. */
export async function signedUrl(path, expires = 3600) {
  try {
    const res = await authFetch(`/storage/v1/object/sign/suggestions/${path}`, {
      method: 'POST',
      body: JSON.stringify({ expiresIn: expires }),
    });
    if (!res.ok) return null;
    return SUPABASE_URL + '/storage/v1' + (await res.json()).signedURL;
  } catch {
    return null;
  }
}

export async function fetchImage(path) {
  const url = await signedUrl(path, 300);
  if (!url) return null;
  const res = await fetch(url);
  return res.ok ? res.blob() : null;
}

export async function deleteImage(path) {
  await authFetch(`/storage/v1/object/suggestions/${path}`, { method: 'DELETE' });
}

export async function loadSuggestion(id) {
  const res = await authFetch(`/rest/v1/spawn_suggestions?select=*&id=eq.${id}`);
  if (!res.ok) return null;
  return (await res.json())[0] ?? null;
}

export async function dropSuggestion(s) {
  await authFetch(`/rest/v1/spawn_suggestions?id=eq.${s.id}`, { method: 'DELETE' });
  if (s.image_path) await deleteImage(s.image_path);
}
