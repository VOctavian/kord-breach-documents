// Редактор опросов (только локально): список опросов, вопросы, картинки и
// просмотр ответов. Ответы читает сервер по service_role ключу — anon-ключу
// доступ на чтение закрыт политикой, и это правильно.
import { el } from './common.js';
import { toJpeg } from './to-jpeg.js';

const $ = (id) => document.getElementById(id);

/**
 * Запрос к локальному серверу. Ответ читается текстом и разбирается вручную:
 * если маршрута нет, сервер отдаёт статикой «404: /api/survey», и слепой
 * `res.json()` жаловался бы на символ в позиции 3 вместо того, чтобы сказать,
 * что запущен старый процесс. Node не перечитывает server.mjs на лету.
 */
async function api(path, init) {
  const res = await fetch(path, init);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      res.status === 404
        ? `сервер не знает ${path.split('?')[0]} — перезапустите node server.mjs`
        : `сервер ответил не JSON: ${text.slice(0, 120)}`
    );
  }
  if (!res.ok) throw new Error(data.error ?? `сервер вернул ${res.status}`);
  return data;
}

const EMPTY = { activeIds: [], surveys: [] };

const file = await fetch('data/survey.json')
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null) ?? EMPTY;

// Старый формат — один опрос в корне файла. Заворачиваем, чтобы правки не потерялись.
if (!Array.isArray(file.surveys)) {
  const old = file.id ? [{ ...file, images: [], enabled: undefined }] : [];
  Object.assign(file, { activeId: file.enabled ? file.id : null, surveys: old });
}
// Формат с одним включённым опросом: activeId → список activeIds.
if (!Array.isArray(file.activeIds)) {
  file.activeIds = file.activeId ? [file.activeId] : [];
}
delete file.activeId;

file.surveys.forEach((s) => {
  s.images ??= [];
  s.questions ??= [];
  s.questions.forEach((q) => (q.images ??= []));
});

let current = file.surveys[0] ?? null;

/* ---------- список опросов ---------- */

function renderList() {
  const box = $('sv-list');
  box.replaceChildren(
    ...file.surveys.map((s) =>
      el(
        'div',
        { class: 'sv-item' + (s === current ? ' current' : '') },
        el(
          'button',
          { class: 'sv-item-name', type: 'button', onclick: () => select(s) },
          s.title || s.id || 'без названия',
          el('span', { class: 'sv-item-sub' }, `${s.questions.length} вопр.`)
        ),
        el(
          'button',
          {
            class: 'sv-item-on' + (isOn(s) ? ' on' : ''),
            type: 'button',
            title: isOn(s) ? 'Показывается на сайте — выключить' : 'Показывать этот опрос на сайте',
            onclick: () => {
              // Включённых опросов может быть сколько угодно: у каждого своя
              // кнопка в столбике справа.
              if (isOn(s)) file.activeIds.splice(file.activeIds.indexOf(s.id), 1);
              else file.activeIds.push(s.id);
              renderList();
              renderActiveNote();
              save();
            },
          },
          isOn(s) ? '●' : '○'
        )
      )
    )
  );
  if (!file.surveys.length) box.append(el('div', { class: 'sub' }, 'пока ни одного'));
}

const isOn = (s) => file.activeIds.includes(s.id);

function renderActiveNote() {
  const on = file.surveys.filter(isOn);
  $('active-note').textContent = on.length
    ? `на сайте: ${on.map((s) => s.title || s.id).join(', ')}`
    : 'на сайте: ни одного опроса';
}

function select(s) {
  current = s;
  renderList();
  renderEditor();
  if (!$('pane-results').hidden) loadResults();
}

$('sv-new').onclick = () => {
  current = { id: newId('s'), title: 'Новый опрос', titleEn: '', intro: '', introEn: '', images: [], questions: [] };
  file.surveys.push(current);
  renderList();
  renderEditor();
  save();
};

/** id уходит в survey_id в базе, поэтому только латиница, цифры, точка, дефис. */
const newId = (p) => `${p}${Date.now().toString(36)}`;

function duplicate(s) {
  const copy = structuredClone(s);
  copy.id = newId('s');
  copy.title = (s.title || s.id) + ' (копия)';
  // id вопросов тоже новые: иначе ответы двух опросов смешаются в выгрузке.
  copy.questions.forEach((q, i) => (q.id = `q${Date.now().toString(36)}${i}`));
  file.surveys.splice(file.surveys.indexOf(s) + 1, 0, copy);
  current = copy;
  renderList();
  renderEditor();
  save();
}

function removeSurvey(s) {
  if (!confirm(`Удалить опрос «${s.title || s.id}»? Ответы в базе останутся.`)) return;
  file.surveys.splice(file.surveys.indexOf(s), 1);
  if (isOn(s)) file.activeIds.splice(file.activeIds.indexOf(s.id), 1);
  current = file.surveys[0] ?? null;
  renderList();
  renderActiveNote();
  renderEditor();
  save();
}

/* ---------- поля ---------- */

function textField(label, obj, key, multiline = false) {
  const input = multiline ? el('textarea', { rows: 2 }) : el('input', { type: 'text' });
  input.value = obj[key] ?? '';
  input.oninput = () => {
    obj[key] = input.value;
    if (key === 'title') renderList();
    save();
  };
  return el('label', { class: 'fld' }, el('span', {}, label), input);
}

const TYPES = [
  ['text', 'Текстовый ответ'],
  ['one', 'Один вариант'],
  ['many', 'Несколько вариантов'],
];

/** Тип вопроса. У старых вопросов поля нет — это текстовый ответ. */
function typeField(q) {
  const select = el(
    'select',
    {
      class: 'btn',
      onchange: (e) => {
        q.type = e.target.value;
        // Переключились на варианты, а их нет — заводим пару пустых, иначе
        // вопрос выглядел бы сломанным: подпись есть, выбирать нечего.
        if (q.type !== 'text' && !q.options?.length) q.options = [newOption(), newOption()];
        renderEditor();
        save();
      },
    },
    TYPES.map(([v, label]) => el('option', { value: v, selected: (q.type ?? 'text') === v ? '' : null }, label))
  );
  return el('label', { class: 'fld' }, el('span', {}, 'Тип ответа'), select);
}

const newOption = () => ({ id: newId('o'), text: '', textEn: '' });

/** Часть карточки вопроса, зависящая от типа: галочка многострочности или список вариантов. */
function questionBody(q) {
  const type = q.type ?? 'text';
  if (type === 'text') {
    return [
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
      ),
    ];
  }

  const options = (q.options ??= []);
  return [
    el('div', { class: 'sv-sub-label' }, 'Варианты ответа'),
    ...options.map((o, i) =>
      el(
        'div',
        { class: 'sv-option' },
        el('span', { class: 'sv-q-num' }, `${i + 1}`),
        textField('RU', o, 'text'),
        textField('EN', o, 'textEn'),
        el(
          'button',
          {
            class: 'btn small',
            type: 'button',
            title: 'Выше',
            disabled: i === 0 ? '' : null,
            onclick: () => {
              options.splice(i - 1, 0, ...options.splice(i, 1));
              renderEditor();
              save();
            },
          },
          '↑'
        ),
        el(
          'button',
          {
            class: 'btn small danger',
            type: 'button',
            onclick: () => {
              options.splice(i, 1);
              renderEditor();
              save();
            },
          },
          '✕'
        )
      )
    ),
    el(
      'button',
      {
        class: 'btn small',
        type: 'button',
        onclick: () => {
          options.push(newOption());
          renderEditor();
          save();
        },
      },
      '+ Вариант'
    ),
    el(
      'label',
      { class: 'sv-toggle' },
      el('input', {
        type: 'checkbox',
        checked: q.extra ? '' : null,
        onchange: (e) => {
          q.extra = e.target.checked;
          save();
        },
      }),
      el('span', {}, 'Поле «своими словами»')
    ),
  ];
}

/** Галерея: загрузка файлов в assets/survey и удаление из списка. */
function galleryBlock(owner) {
  const strip = el(
    'div',
    { class: 'sv-gallery' },
    owner.images.map((src) =>
      el(
        'div',
        { class: 'sv-thumb' },
        el('img', { src, alt: '' }),
        el(
          'button',
          {
            class: 'sv-thumb-x',
            type: 'button',
            title: 'Убрать из галереи (файл на диске останется)',
            onclick: () => {
              owner.images.splice(owner.images.indexOf(src), 1);
              renderEditor();
              save();
            },
          },
          '✕'
        )
      )
    )
  );

  const picker = el('input', { type: 'file', accept: 'image/*', multiple: '', style: 'display:none' });
  picker.onchange = async () => {
    for (const f of picker.files) {
      try {
        const res = await fetch(`/api/upload?dir=survey&map=survey&doc=img`, {
          method: 'POST',
          headers: { 'content-type': 'image/jpeg' },
          body: await toJpeg(f),
        });
        if (!res.ok) throw new Error(await res.text());
        const { path } = await res.json();
        if (!owner.images.includes(path)) owner.images.push(path);
      } catch (e) {
        setStatus('не загрузилось: ' + e.message, 'err');
      }
    }
    picker.value = '';
    renderEditor();
    save();
  };

  return el(
    'div',
    { class: 'sv-gallery-block' },
    strip,
    el('button', { class: 'btn small', type: 'button', onclick: () => picker.click() }, '+ Картинка'),
    picker
  );
}

/* ---------- редактор опроса ---------- */

function renderEditor() {
  const pane = $('pane-edit');
  if (!current) {
    pane.replaceChildren(el('div', { class: 'sub' }, 'Создайте опрос слева.'));
    return;
  }

  const idInput = el('input', { type: 'text', value: current.id });
  idInput.oninput = () => {
    const v = idInput.value.replace(/[^a-zA-Z0-9._-]/g, '');
    idInput.value = v;
    // Включённые опросы перечислены по id, поэтому переименование тянет ссылку за собой.
    const at = file.activeIds.indexOf(current.id);
    if (at !== -1) file.activeIds[at] = v;
    current.id = v;
    renderList();
    renderActiveNote();
    save();
  };

  pane.replaceChildren(
    el(
      'div',
      { class: 'sv-head-row' },
      el('button', { class: 'btn small', type: 'button', onclick: () => duplicate(current) }, 'Дублировать'),
      el('button', { class: 'btn small danger', type: 'button', onclick: () => removeSurvey(current) }, 'Удалить опрос')
    ),
    el('div', { class: 'sv-card' },
      el('label', { class: 'fld' }, el('span', {}, 'Идентификатор (уходит в базу вместе с ответами)'), idInput),
      textField('Название (RU)', current, 'title'),
      textField('Название (EN)', current, 'titleEn'),
      textField('Вступление (RU)', current, 'intro', true),
      textField('Вступление (EN)', current, 'introEn', true),
      el('div', { class: 'sv-sub-label' }, 'Галерея опроса'),
      galleryBlock(current)
    ),
    el('div', { class: 'sv-sub-label' }, 'Вопросы'),
    ...current.questions.map((q, i) =>
      el(
        'div',
        { class: 'sv-question' },
        el(
          'div',
          { class: 'sv-q-head' },
          el('span', { class: 'sv-q-num' }, `#${i + 1}`),
          el('span', { class: 'spacer' }),
          el('button', { class: 'btn small', type: 'button', title: 'Выше', disabled: i === 0 ? '' : null, onclick: () => moveQ(i, -1) }, '↑'),
          el('button', { class: 'btn small', type: 'button', title: 'Ниже', disabled: i === current.questions.length - 1 ? '' : null, onclick: () => moveQ(i, 1) }, '↓'),
          el('button', { class: 'btn small', type: 'button', onclick: () => duplicateQ(i) }, 'Дублировать'),
          el('button', { class: 'btn small danger', type: 'button', onclick: () => removeQ(i) }, 'Удалить')
        ),
        textField('Вопрос (RU)', q, 'text'),
        textField('Вопрос (EN)', q, 'textEn'),
        typeField(q),
        ...questionBody(q),
        el('div', { class: 'sv-sub-label' }, 'Галерея вопроса'),
        galleryBlock(q)
      )
    ),
    el('button', { class: 'btn', id: 'sv-add', type: 'button', onclick: addQ }, '+ Вопрос')
  );
}

function addQ() {
  current.questions.push({ id: newId('q'), text: '', textEn: '', type: 'text', multiline: true, options: [], extra: false, images: [] });
  renderEditor();
  save();
}

function moveQ(i, d) {
  const [q] = current.questions.splice(i, 1);
  current.questions.splice(i + d, 0, q);
  renderEditor();
  save();
}

function duplicateQ(i) {
  const copy = structuredClone(current.questions[i]);
  copy.id = newId('q');
  current.questions.splice(i + 1, 0, copy);
  renderEditor();
  save();
}

function removeQ(i) {
  if (!confirm(`Удалить вопрос «${current.questions[i].text || 'без текста'}»?`)) return;
  current.questions.splice(i, 1);
  renderEditor();
  save();
}

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
    await api('/api/survey', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(file),
    });
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
  $('tab-edit').classList.toggle('active', !results);
  $('tab-results').classList.toggle('active', results);
  $('pane-edit').hidden = results;
  $('pane-results').hidden = !results;
  if (results) loadResults();
};
$('tab-edit').onclick = () => showTab(false);
$('tab-results').onclick = () => showTab(true);

/* ---------- ответы ---------- */

let rows = [];

async function loadResults() {
  const box = $('sv-results');
  if (!current) {
    box.replaceChildren(el('div', { class: 'sub' }, 'нет выбранного опроса'));
    return;
  }
  box.replaceChildren(el('div', { class: 'sub' }, 'загружаю…'));
  try {
    rows = await api(`/api/survey-results?survey=${encodeURIComponent(current.id)}`);
  } catch (e) {
    box.replaceChildren(el('div', { class: 'status err' }, String(e.message)));
    $('sv-count').textContent = '';
    return;
  }
  renderResults();
}

function renderResults() {
  const box = $('sv-results');
  const byId = new Map(current.questions.map((q) => [q.id, q.text || q.id]));
  $('sv-count').textContent = `${rows.length} ответов на «${current.title || current.id}»`;

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
  try {
    await api(`/api/survey-results?id=${id}`, { method: 'DELETE' });
  } catch (e) {
    alert('не удалось: ' + e.message);
    return;
  }
  rows = rows.filter((r) => r.id !== id);
  renderResults();
}

$('sv-reload').onclick = loadResults;

$('sv-csv').onclick = () => {
  const ids = current.questions.map((q) => q.id);
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const csv = [
    ['Дата', 'Язык', ...current.questions.map((q) => q.text || q.id)].map(esc).join(','),
    ...rows.map((r) => [new Date(r.created_at).toISOString(), r.lang ?? '', ...ids.map((id) => r.answers?.[id] ?? '')].map(esc).join(',')),
  ].join('\n');

  // BOM, иначе Excel откроет кириллицу кракозябрами.
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = el('a', { href: url, download: `survey-${current.id}.csv` });
  a.click();
  URL.revokeObjectURL(url);
};

renderList();
renderActiveNote();
renderEditor();
