import { UMAMI_WEBSITE_ID, UMAMI_SCRIPT } from './config.js';

/** Umami Cloud — второй счётчик, ради realtime-дашборда, которого нет у GoatCounter. */
export function mountUmami() {
  if (!UMAMI_WEBSITE_ID) return;
  if (['localhost', '127.0.0.1', ''].includes(location.hostname)) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = UMAMI_SCRIPT;
  s.dataset.websiteId = UMAMI_WEBSITE_ID;
  document.head.append(s);
}

// Отправка событий в GoatCounter. Просмотры страниц скрипт считает сам,
// здесь — только дополнительные события. Локалхост count.js игнорирует,
// так что во время разметки статистика не засоряется.
export function trackEvent(name) {
  if (window.goatcounter && typeof window.goatcounter.count === 'function') {
    window.goatcounter.count({ path: name, event: true });
  }
}
