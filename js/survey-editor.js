// Редактор опроса (только локально): вопросы в data/survey.json и просмотр
// ответов из Supabase. Ответы читает сервер по service_role ключу — anon-ключу
// доступ на чтение закрыт политикой, и это правильно.
import { el } from './common.js';

const $ = (id) => document.getElementById(id);

const survey = await fetch('data/survey.json')
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null) ?? { id: '', enabled: false, title: '', titleEn: '', intro: '', introEn: '', questions: [] };

survey.questions ??= [];

/* ---------- поля опроса ---------- */

const BINDINGS = [
  ['sv-id', 'id'],
  ['sv-title-ru', 'title'],
  ['sv-title-en', 'titleEn'],
  ['sv-intro-ru', 'intro'],
  ['sv-intro-en', 'introEn'],
];

for (const [nodeId, key] of BINDINGS) {
  const node = $(nodeId);
  node.value = survey[key] ?? '';
  node.oninput = () => {
    survey[key] = node.value;
    save();
  };
}

$('sv-enabled').checked = Boolean(survey.enabled);
$('sv-enabled').onchange = () => {
  survey.enabled = $('sv-enabled').checked;
  save();
};

/* ---------- вопросы ---------- */

function renderQuestions() {
  const box = $('sv-questions');
  box.replaceChildren(
    ...survey.questions.map((q, i) =>
      el(
        'div',
        { class: 'sv-question' },
        el(
          'div',
          { class: 'sv-q-head' },
          el('span', { class: 'sv-q-num' }, `#${i + 1}`),
          el('span', { class: 'spacer' }),
          el('button', { class: 'btn small', type: 'button', title: 'Выше', disabled: i === 0 ? '' : null, onclick: () => move(i, -1) }, '↑'),
          el('button', { class: 'btn small', type: 'button', title: 'Ниже', disabled: i === survey.questions.length - 1 ? '' : null, onclick: () => move(i, 1) }, '↓'),
          el('button', { class: 'btn small danger', type: 'button', onclick: () => remove(i) }, 'Удалить')
        ),
        field('Вопрос (RU)', q, 'text'),
        field('Вопрос (EN)', q, 'textEn'),
        el(
          'label',
          { class: 'sv-toggle' },
          el('input', {
            type: 'checkbox',
            checked: q.multiline ? '' : null,
            onchange: (e) => {
              q.multiline = e.target.checked;
              save();
            },
          }),
          el('span', {}, 'Многострочный ответ')
        )
      )
    )
  );
}

function field(label, obj, key) {
  const input = el('input', { type: 'text', value: obj[key] ?? '' });
  input.oninput = () => {
    obj[key] = input.value;
    save();
  };
  return el('label', { class: 'fld' }, el('span', {}, label), input);
}

function move(i, d) {
  const [q] = survey.questions.splice(i, 1);
  survey.questions.splice(i + d, 0, q);
  renderQuestions();
  save();
}

function remove(i) {
  if (!confirm(`Удалить вопрос «${survey.questions[i].text || 'без текста'}»?`)) return;
  survey.questions.splice(i, 1);
  renderQuestions();
  save();
}

$('sv-add').onclick = () => {
  // id вопроса попадает в ключи JSON с ответами, поэтому он должен быть коротким и стабильным.
  survey.questions.push({ id: `q${Date.now().toString(36)}`, text: '', textEn: '', multiline: true });
  renderQuestions();
  save();
};

/* ---------- сохранение ---------- */

let timer;
function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 500);
}

async function flush() {
  clearTimeout(timer);
  setStatus('сохраняю…');
  try {
    const res = await fetch('/api/survey', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(survey),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? res.status);
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

$('done').onclick = async () => {
  const btn = $('done');
  btn.disabled = true;
  if (await flush()) location.href = 'index.html';
  else btn.disabled = false;
};

/* ---------- вкладки ---------- */

const showTab = (results) => {
  $('tab-questions').classList.toggle('active', !results);
  $('tab-results').classList.toggle('active', results);
  $('pane-questions').hidden = results;
  $('pane-results').hidden = !results;
  if (results) loadResults();
};
$('tab-questions').onclick = () => showTab(false);
$('tab-results').onclick = () => showTab(true);

/* ---------- ответы ---------- */

let rows = [];

async function loadResults() {
  const box = $('sv-results');
  box.replaceChildren(el('div', { class: 'sub' }, 'загружаю…'));
  try {
    const res = await fetch('/api/survey-results');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? res.status);
    rows = data;
  } catch (e) {
    box.replaceChildren(el('div', { class: 'status err' }, String(e.message)));
    $('sv-count').textContent = '';
    return;
  }
  renderResults();
}

function renderResults() {
  const box = $('sv-results');
  const byId = new Map(survey.questions.map((q) => [q.id, q.text || q.id]));
  $('sv-count').textContent = `${rows.length} ответов`;

  if (!rows.length) {
    box.replaceChildren(el('div', { class: 'sub' }, 'пока пусто'));
    return;
  }

  box.replaceChildren(
    ...rows.map((r) =>
      el(
        'div',
        { class: 'sv-answer' },
        el(
          'div',
          { class: 'sv-a-head' },
          el('span', { class: 'sv-a-date' }, new Date(r.created_at).toLocaleString('ru-RU')),
          el('span', { class: 'sv-a-lang' }, r.lang ?? '—'),
          el('span', { class: 'spacer' }),
          el('button', { class: 'btn small danger', type: 'button', onclick: () => drop(r.id) }, 'Удалить')
        ),
        ...Object.entries(r.answers ?? {}).map(([qid, value]) =>
          el('div', { class: 'sv-a-item' }, el('div', { class: 'sv-a-q' }, byId.get(qid) ?? qid), el('div', { class: 'sv-a-v' }, value))
        )
      )
    )
  );
}

async function drop(id) {
  if (!confirm('Удалить этот ответ?')) return;
  const res = await fetch(`/api/survey-results?id=${id}`, { method: 'DELETE' });
  if (!res.ok) {
    alert('не удалось: ' + ((await res.json()).error ?? res.status));
    return;
  }
  rows = rows.filter((r) => r.id !== id);
  renderResults();
}

$('sv-reload').onclick = loadResults;

$('sv-csv').onclick = () => {
  const ids = survey.questions.map((q) => q.id);
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const csv = [
    ['Дата', 'Язык', ...survey.questions.map((q) => q.text || q.id)].map(esc).join(','),
    ...rows.map((r) => [new Date(r.created_at).toISOString(), r.lang ?? '', ...ids.map((id) => r.answers?.[id] ?? '')].map(esc).join(',')),
  ].join('\n');

  // BOM, иначе Excel откроет кириллицу кракозябрами.
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = el('a', { href: url, download: `survey-${survey.id || 'export'}.csv` });
  a.click();
  URL.revokeObjectURL(url);
};

renderQuestions();
