// Опрос посетителей: боковая панель + квадратная кнопка у правого края.
// Вопросы лежат в data/survey.json (правятся survey-editor.html), ответы уходят
// в таблицу Supabase. Клиент Supabase не тянем — здесь достаточно одного POST.
import { el } from './common.js';
import { t, lang, localized } from './i18n.js';
import { trackEvent } from './analytics.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const LS_KEY = 'kord_breach_survey_v1';
// Показываем не сразу: человек должен успеть поработать с картой, иначе ему
// нечего ответить.
const AUTO_OPEN_MS = 45_000;

function readState() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) ?? {};
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

export async function mountSurvey() {
  let file;
  try {
    const res = await fetch('data/survey.json');
    if (!res.ok) return;
    file = await res.json();
  } catch {
    // Файла нет — опроса просто не существует.
    return;
  }

  // Опросов может быть много, показываем выбранный. activeId пуст — не показываем ничего.
  const survey = (file?.surveys ?? []).find((s) => s.id === file.activeId);
  if (!survey?.questions?.length) return;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  const state = readState();

  /* ---------- кнопка ---------- */

  const button = el(
    'button',
    {
      class: 'survey-tab',
      type: 'button',
      title: state.done ? t('surveyBtnDone') : t('surveyBtnTitle'),
      onclick: () => open('button'),
    },
    '📝'
  );
  const paintButton = () => {
    button.classList.toggle('done', Boolean(state.done));
    button.title = state.done ? t('surveyBtnDone') : t('surveyBtnTitle');
  };

  /* ---------- панель ---------- */

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

    state.done = (state.done ?? 0) + 1;
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
      el('h2', {}, localized(survey, 'title')),
      // Закрыть можно только крестиком — ни Esc, ни клик мимо панель не убирают.
      el('button', { class: 'survey-x', type: 'button', title: t('surveyClose'), onclick: close }, '✕')
    ),
    body,
    status,
    submit
  );

  function open(source) {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    button.classList.add('hidden');
    if (source === 'button') trackEvent('survey-open');
  }

  function close() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    button.classList.remove('hidden');
  }

  buildForm();
  paintButton();
  document.body.append(button, panel);

  if (state.prompted !== survey.id) {
    setTimeout(() => {
      // За 45 секунд человек мог открыть панель сам — второй раз не лезем.
      if (!panel.classList.contains('open')) {
        open('auto');
        trackEvent('survey-auto');
      }
      state.prompted = survey.id;
      writeState(state);
    }, AUTO_OPEN_MS);
  }
}
