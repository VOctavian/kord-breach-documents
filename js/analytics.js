// Отправка событий в GoatCounter. Просмотры страниц скрипт считает сам,
// здесь — только дополнительные события. Локалхост count.js игнорирует,
// так что во время разметки статистика не засоряется.
export function trackEvent(name) {
  if (window.goatcounter && typeof window.goatcounter.count === 'function') {
    window.goatcounter.count({ path: name, event: true });
  }
}
