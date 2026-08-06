// Локализация ru/en. Разметка помечается data-i18n / data-i18n-title / data-i18n-placeholder.
import { trackEvent } from './analytics.js';

const LS_KEY = 'kord_breach_lang_v1';

const DICT = {
  pageTitleIndex: { ru: 'Kord Breach — спавны секретных документов', en: 'Kord Breach — secret document spawns' },
  pageTitleMap: { ru: 'Карта — Kord Breach', en: 'Map — Kord Breach' },
  appTitle: { ru: 'Kord Breach', en: 'Kord Breach' },
  appSubtitle: { ru: 'Спавны секретных документов', en: 'Secret document spawns' },

  indexIntro: {
    ru: 'Выберите локацию. На карте отмечены точки спавна секретных документов — кликните по иконке, чтобы увидеть скриншот с описанием; стрелками ← / → листаются остальные спавны этой локации.',
    en: 'Pick a location. Secret document spawns are marked on the map — click an icon to see the screenshot with a description; ← / → cycle through the other spawns on that map.',
  },

  backToMaps: { ru: '← Локации', en: '← Locations' },
  editorLink: { ru: 'Редактор точек', en: 'Point editor' },
  editorShort: { ru: 'Редактор', en: 'Editor' },
  fitLabel: { ru: 'Вписать', en: 'Fit' },
  docTypeHeader: { ru: 'Тип документации', en: 'Document type' },
  spawnListHeader: { ru: 'Точки спавна', en: 'Spawn points' },
  floorHeader: { ru: 'Этаж', en: 'Floor' },
  allLayers: { ru: 'Все слои', en: 'All layers' },
  mapHint: {
    ru: 'Колесо — зум · перетаскивание — сдвиг · клик по иконке — скриншот',
    en: 'Wheel — zoom · drag — pan · click an icon — screenshot',
  },
  noCaption: { ru: '(без описания)', en: '(no description)' },
  unplacedTitle: { ru: 'Точка ещё не размечена на карте', en: 'This point is not placed on the map yet' },
  placedCounter: { ru: 'точек размечено', en: 'points placed' },
  photoOf: { ru: 'фото {n} из {total}', en: 'photo {n} of {total}' },
  zoomIn: { ru: 'Приблизить', en: 'Zoom in' },
  zoomOut: { ru: 'Отдалить', en: 'Zoom out' },
  closeEsc: { ru: 'Закрыть (Esc)', en: 'Close (Esc)' },
  prevTitle: { ru: 'Предыдущий (←)', en: 'Previous (←)' },
  nextTitle: { ru: 'Следующий (→)', en: 'Next (→)' },
  langToggleTitle: { ru: 'Переключить язык', en: 'Switch language' },

  coffeeBtnLabel: { ru: '☕ Угостить кофе', en: '☕ Buy me a coffee' },
  coffeeBtnTitle: { ru: 'Поддержать разработчика', en: 'Support the developer' },
  coffeeIntro: {
    ru: 'Если карта спавнов пригодилась — можно поддержать монеткой. Спасибо!',
    en: 'If this spawn map helped you out, you can chip in. Thanks!',
  },
  boostyLabel: { ru: 'Boosty (карта)', en: 'Boosty (card)' },
  copyLabel: { ru: 'Копировать', en: 'Copy' },
  copiedLabel: { ru: 'Скопировано', en: 'Copied' },
  qrShowLabel: { ru: 'QR-код', en: 'QR code' },
  openLinkLabel: { ru: 'Перейти ↗', en: 'Open ↗' },
  closeLabel: { ru: 'Закрыть ✕', en: 'Close ✕' },

  feedbackBtnLabel: { ru: '💬 Фидбэк', en: '💬 Feedback' },
  feedbackBtnTitle: {
    ru: 'Сообщить об ошибке или предложить точку спавна',
    en: 'Report a mistake or suggest a spawn point',
  },
  feedbackIntro: {
    ru: 'Нашли неточность в координатах, знаете спавн, которого здесь нет, или есть идея — заходите в Discord. Скриншот прикладывать прямо в чат.',
    en: 'Found a wrong marker, know a spawn that is missing here, or have an idea — drop by the Discord. Screenshots go straight into the chat.',
  },
  discordJoin: { ru: 'Открыть Discord ↗', en: 'Open Discord ↗' },

  sourceLabel: { ru: 'Источники', en: 'Sources' },
  sourceArticle: { ru: 'Скриншоты и описания — статья МетаДвиж', en: 'Screenshots and descriptions — MetaDvizh article' },
  sourceMaps: { ru: 'Карты — Escape from Tarkov Wiki', en: 'Maps — Escape from Tarkov Wiki' },
};

export const lang = localStorage.getItem(LS_KEY) === 'en' ? 'en' : 'ru';

export function t(key, vars) {
  const entry = DICT[key];
  let text = entry ? entry[lang] ?? entry.ru : key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, v);
  return text;
}

/**
 * Название сущности с учётом языка: {name, nameEn} или {caption, captionEn}.
 * У карт английское название лежит в поле `en`.
 */
export function localized(obj, field = 'name') {
  if (!obj) return '';
  const en = obj[field + 'En'] ?? (field === 'name' ? obj.en : null);
  return lang === 'en' && en ? en : obj[field];
}

export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach((n) => (n.textContent = t(n.dataset.i18n)));
  root.querySelectorAll('[data-i18n-html]').forEach((n) => (n.innerHTML = t(n.dataset.i18nHtml)));
  root.querySelectorAll('[data-i18n-title]').forEach((n) => (n.title = t(n.dataset.i18nTitle)));
  root.querySelectorAll('[data-i18n-placeholder]').forEach((n) => (n.placeholder = t(n.dataset.i18nPlaceholder)));
}

export function setLang(next) {
  if (next === lang) return;
  localStorage.setItem(LS_KEY, next);
  trackEvent('lang-switch-' + next);
  location.reload();
}
