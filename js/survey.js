// Опросы посетителей: столбик квадратных кнопок у правого края и панель на
// каждый включённый опрос. Вопросы лежат в data/survey.json (правятся
// survey-editor.html), ответы уходят в таблицу Supabase. Клиент Supabase не
// тянем — здесь достаточно одного POST.
import { el } from './common.js';
import { t, lang, localized } from './i18n.js';
import { trackEvent } from './analytics.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// v2: счётчик пройденного стал раздельным по опросам — включённых теперь может
// быть несколько, и зелёная полоса у каждой кнопки своя.
const LS_KEY = 'kord_breach_survey_v2';

function readState() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}

const writeState = (s) => localStorage.setItem(LS_KEY, JSON.stringify(s));

async function send(survey, answers) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/survey_responses`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'content-type': 'application/json',
      // Без этого PostgREST попытается вернуть вставленную строку, упрётся
      // в отсутствие select-политики и ответит 401.
      prefer: 'return=minimal',
    },
    body: JSON.stringify({ survey_id: survey.id, lang, answers }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
}

/**
 * Какие опросы показывать. Список переключается из админки, поэтому спрашиваем
 * Supabase — иначе включение требовало бы деплоя. На любую ошибку откатываемся
 * на файл: опросы важнее свежести списка.
 */
async function activeIds(file) {
  // activeId — прежний формат с одним опросом, читаем пока файл не пересохранён.
  const fallback = Array.isArray(file?.activeIds) ? file.activeIds : [file?.activeId].filter(Boolean);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/site_settings?key=eq.survey_active_ids&select=value`, {
      headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return fallback;
    const value = (await res.json())[0]?.value;
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/** Картинки опроса или вопроса: клик открывает оригинал в новой вкладке. */
function gallery(images) {
  if (!images?.length) return null;
  return el(
    'div',
    { class: 'survey-gallery' },
    images.map((src) =>
      el('a', { href: src, target: '_blank', rel: 'noopener noreferrer' }, el('img', { src, alt: '', loading: 'lazy' }))
    )
  );
}

/**
 * Кнопка и панель одного опроса. `onOpen` даёт хозяину закрыть остальные панели:
 * они лежат друг на друге у правого края, две открытые перекрыли бы одна другую.
 */
function buildSurvey(survey, state, rail, onOpen) {
  const name = localized(survey, 'title');

  // Ярлык свисает с кнопки влево — он остаётся на виду, даже когда сама кнопка
  // наполовину спрятана за краем экрана.
  const badge = el('span', { class: 'survey-new' }, t('surveyNew'));
  const button = el(
    'button',
    { class: 'survey-tab', type: 'button', onclick: () => open('button') },
    badge,
    '📝'
  );
  const paintButton = () => {
    const done = state[survey.id] > 0;
    button.classList.toggle('done', done);
    badge.hidden = done;
    // Кнопок может быть несколько, поэтому в подсказке ещё и название опроса.
    button.title = `${name} — ${done ? t('surveyBtnDone') : t('surveyBtnTitle')}`;
  };

  const fields = new Map();
  const body = el('div', { class: 'survey-body' });
  const status = el('div', { class: 'survey-status' });
  const submit = el('button', { class: 'btn primary survey-send', type: 'button', onclick: () => onSubmit() }, t('surveySend'));

  function buildForm() {
    fields.clear();
    body.replaceChildren(
      el('p', { class: 'survey-intro' }, localized(survey, 'intro') || ''),
      gallery(survey.images),
      ...survey.questions.map((q) => {
        const input = q.multiline
          ? el('textarea', { rows: 3, id: `sv-${q.id}` })
          : el('input', { type: 'text', id: `sv-${q.id}` });
        fields.set(q.id, input);
        return el('div', { class: 'survey-q' }, el('label', { class: 'fld' }, el('span', {}, localized(q, 'text')), input), gallery(q.images));
      })
    );
    status.textContent = '';
    status.className = 'survey-status';
    submit.textContent = t('surveySend');
    submit.disabled = false;
    submit.hidden = false;
  }

  async function onSubmit() {
    const answers = {};
    for (const [id, input] of fields) {
      const v = input.value.trim();
      if (v) answers[id] = v;
    }
    if (!Object.keys(answers).length) {
      status.textContent = t('surveyEmpty');
      status.className = 'survey-status err';
      return;
    }

    submit.disabled = true;
    status.textContent = t('surveySending');
    status.className = 'survey-status';
    try {
      await send(survey, answers);
    } catch (e) {
      // Текст ответов не трогаем: человек не должен набирать всё заново.
      status.textContent = t('surveyError', { e: e.message });
      status.className = 'survey-status err';
      submit.disabled = false;
      return;
    }

    state[survey.id] = (state[survey.id] ?? 0) + 1;
    writeState(state);
    paintButton();
    trackEvent('survey-submit');

    submit.hidden = true;
    status.textContent = '';
    body.replaceChildren(
      el('div', { class: 'survey-thanks' }, el('div', { class: 'survey-thanks-title' }, t('surveyThanks')), el('p', {}, t('surveyThanksNote'))),
      el('button', { class: 'btn survey-again', type: 'button', onclick: buildForm }, t('surveyAgain'))
    );
  }

  const panel = el(
    'aside',
    { class: 'survey-panel', 'aria-hidden': 'true' },
    el(
      'div',
      { class: 'survey-head' },
      el('h2', {}, name),
      // Закрыть можно только крестиком — ни Esc, ни клик мимо панель не убирают.
      el('button', { class: 'survey-x', type: 'button', title: t('surveyClose'), onclick: close }, '✕')
    ),
    body,
    status,
    submit
  );

  function open(source) {
    onOpen(close);
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    // Прячем весь столбик: панель всё равно перекрывает правый край.
    rail.classList.add('hidden');
    if (source === 'button') trackEvent('survey-open');
  }

  function close() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    rail.classList.remove('hidden');
  }

  buildForm();
  paintButton();
  return { button, panel };
}

export async function mountSurvey() {
  let file;
  try {
    const res = await fetch('data/survey.json');
    if (!res.ok) return;
    file = await res.json();
  } catch {
    // Файла нет — опросов просто не существует.
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  const active = await activeIds(file);
  const list = (file?.surveys ?? []).filter((s) => active.includes(s.id) && s.questions?.length);
  if (!list.length) return;

  const state = readState();
  const rail = el('div', { class: 'survey-rail' });

  // Открыта всегда не больше одной панели: следующая закрывает предыдущую.
  let closeOpen = null;
  const onOpen = (close) => {
    if (closeOpen && closeOpen !== close) closeOpen();
    closeOpen = close;
  };

  const parts = list.map((s) => buildSurvey(s, state, rail, onOpen));
  rail.append(...parts.map((p) => p.button));
  document.body.append(rail, ...parts.map((p) => p.panel));
}
