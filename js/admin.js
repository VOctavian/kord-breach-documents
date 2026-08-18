// Веб-админка: ответы на опросы, список включённых опросов, роли.
//
// Проверка роли ниже — только чтобы не рисовать бесполезный интерфейс. Доступ к
// данным режет RLS в базе: без роли admin PostgREST вернёт пустую выборку, даже
// если открыть эту страницу и вызвать всё вручную из консоли.
//
// Интерфейс намеренно только на русском: страница для автора, i18n тут лишний вес.
import { el } from './common.js';
import { ready, session, profile, hasRole, authFetch, mountAuth, onAuthChange } from './auth.js';
import { answerCard, resultsCsv, downloadCsv } from './survey-results.js';
import { isLocal } from './widgets.js';

const $ = (id) => document.getElementById(id);
const root = $('root');

mountAuth($('auth-slot'));

let file = { surveys: [], activeIds: [] };
try {
  file = await fetch('data/survey.json').then((r) => r.json());
} catch {
  // Определения опросов лежат в git; без них работает только вкладка ролей.
}
const surveyById = new Map((file.surveys ?? []).map((s) => [s.id, s]));

function render() {
  if (!session()) return renderMessage('Нужно войти', 'Админка доступна после входа — кнопка справа вверху.');
  $('who').textContent = profile()?.email ?? '';
  if (!hasRole('admin')) return renderMessage('Нет доступа', 'У этого аккаунта нет роли администратора.');
  renderPanel();
}

function renderMessage(title, text) {
  $('nav').hidden = true;
  root.replaceChildren(el('div', { class: 'sv-card' }, el('h2', {}, title), el('p', { class: 'pop-intro' }, text)));
}

function setStatus(text, cls = '') {
  const n = $('status');
  n.textContent = text;
  n.className = 'status ' + cls;
  if (cls === 'ok') setTimeout(() => (n.textContent = ''), 1800);
}

/* ---------- каркас ---------- */

// Разделы слева — список данных, а не разметка: дальше сюда добавятся спавны и
// настройки сайта.
const SECTIONS = [
  { id: 'users', label: 'Юзеры', build: buildUsers },
  { id: 'surveys', label: 'Опросы', build: buildSurveys },
  { id: 'spawns', label: 'Спавны', build: buildSpawns },
];

function renderPanel() {
  const nav = $('nav');
  const pane = el('section');
  nav.hidden = false;

  const open = (item) => {
    location.hash = item.id;
    nav.querySelectorAll('.admin-nav-item').forEach((b) => b.classList.toggle('active', b.dataset.id === item.id));
    pane.replaceChildren();
    item.build(pane);
  };

  nav.replaceChildren(
    el(
      'div',
      { class: 'group' },
      el(
        'div',
        { class: 'admin-nav' },
        SECTIONS.map((item) =>
          el(
            'button',
            { class: 'admin-nav-item', type: 'button', 'data-id': item.id, onclick: () => open(item) },
            item.label
          )
        )
      )
    )
  );

  root.replaceChildren(pane);
  // Раздел в адресе, чтобы перезагрузка возвращала туда же.
  open(SECTIONS.find((i) => i.id === location.hash.slice(1)) ?? SECTIONS[0]);
}

/** Опросы: сверху что показывать на сайте, ниже — пришедшие ответы. */
async function buildSurveys(pane) {
  const active = el('div');
  const results = el('div');
  pane.append(active, results);
  await buildActive(active);
  await buildResults(results);
}

/* ---------- раздел «Спавны» ---------- */

async function buildSpawns(pane) {
  let maps = [];
  try {
    maps = await fetch('data/maps.json').then((r) => r.json());
  } catch {}

  pane.append(
    el(
      'div',
      { class: 'sv-card' },
      el('h2', {}, 'Точки на картах'),
      el(
        'p',
        { class: 'pop-intro' },
        isLocal
          ? 'Редактор пишет прямо на диск — правки видны сразу после перезагрузки страницы.'
          : 'Правки копятся в черновике и уезжают в репозиторий кнопкой «Опубликовать». ' +
            'После публикации сайт обновляется за 1–2 минуты, пока идёт деплой.'
      ),
      el(
        'div',
        { class: 'admin-maps' },
        maps.map((m) => el('a', { class: 'btn', href: `editor.html?map=${m.id}` }, m.name))
      )
    )
  );
}

/* ---------- ответы на опросы ---------- */

async function buildResults(pane) {
  const bar = el('div', { class: 'sv-results-bar' });
  const box = el('div', {}, el('div', { class: 'sub' }, 'загружаю…'));
  pane.append(bar, box);

  // Опросы берём из объединения файла и того, что реально встречается в ответах:
  // иначе ответы на удалённый опрос стали бы невидимыми.
  let ids = [...surveyById.keys()];
  try {
    const res = await authFetch('/rest/v1/survey_responses?select=survey_id');
    if (res.ok) {
      for (const r of await res.json()) if (!ids.includes(r.survey_id)) ids.push(r.survey_id);
    }
  } catch {}

  if (!ids.length) {
    box.replaceChildren(el('div', { class: 'sub' }, 'опросов нет'));
    return;
  }

  const select = el(
    'select',
    { class: 'btn', onchange: () => load(select.value) },
    ids.map((id) => el('option', { value: id }, surveyById.get(id)?.title || id))
  );
  const count = el('span', { class: 'sub' });
  let rows = [];

  bar.append(
    select,
    count,
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn', type: 'button', onclick: () => load(select.value) }, 'Обновить'),
    el(
      'button',
      {
        class: 'btn',
        type: 'button',
        onclick: () => {
          const id = select.value;
          downloadCsv(`survey-${id}.csv`, resultsCsv(surveyById.get(id) ?? { questions: [] }, rows));
        },
      },
      'Выгрузить CSV'
    )
  );

  async function load(id) {
    box.replaceChildren(el('div', { class: 'sub' }, 'загружаю…'));
    try {
      const res = await authFetch(
        `/rest/v1/survey_responses?select=*&survey_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=1000`
      );
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
      rows = await res.json();
    } catch (e) {
      box.replaceChildren(el('div', { class: 'status err' }, e.message));
      return;
    }
    paint(id);
  }

  function paint(id) {
    const survey = surveyById.get(id);
    count.textContent = `${rows.length} ответов`;
    if (!rows.length) {
      box.replaceChildren(el('div', { class: 'sub' }, 'пока пусто'));
      return;
    }
    const titleById = new Map((survey?.questions ?? []).map((q) => [q.id, q.text || q.id]));
    box.replaceChildren(...rows.map((r) => answerCard(r, titleById, drop)));

    async function drop(row) {
      if (!confirm('Удалить этот ответ?')) return;
      const res = await authFetch(`/rest/v1/survey_responses?id=eq.${row.id}`, { method: 'DELETE' });
      if (!res.ok) return setStatus('не удалилось: ' + (await res.text()).slice(0, 80), 'err');
      rows = rows.filter((r) => r.id !== row.id);
      paint(id);
      setStatus('удалено ✓', 'ok');
    }
  }

  load(select.value);
}

/* ---------- какие опросы показывать ---------- */

async function buildActive(pane) {
  const box = el('div', { class: 'sv-card' }, el('div', { class: 'sub' }, 'загружаю…'));
  pane.append(box);

  let active = [];
  try {
    const res = await authFetch('/rest/v1/site_settings?key=eq.survey_active_ids&select=value');
    active = (await res.json())[0]?.value ?? [];
  } catch (e) {
    box.replaceChildren(el('div', { class: 'status err' }, e.message));
    return;
  }

  const surveys = file.surveys ?? [];
  if (!surveys.length) {
    box.replaceChildren(el('div', { class: 'sub' }, 'в data/survey.json нет опросов'));
    return;
  }

  // `replaceChildren` — нативный метод: `null` он не пропускает мимо, как наш
  // `el()`, а превращает в текстовый узел «null». Отсеиваем сами.
  const kids = [
    el(
      'p',
      { class: 'pop-intro' },
      'Тексты опросов правятся локально в редакторе и живут в git. Здесь только переключается, ' +
        'какие из них показывать — это применяется сразу, без деплоя.'
    ),
    // Редактор опросов требует локального сервера, поэтому на сайте ссылки нет.
    isLocal ? el('a', { class: 'btn', href: 'survey-editor.html' }, 'Открыть редактор опросов') : null,
    ...surveys.map((s) => {
      const cb = el('input', { type: 'checkbox', checked: active.includes(s.id) ? '' : null, onchange: save });
      return el(
        'label',
        { class: 'sv-item' },
        cb,
        el('span', { class: 'sv-item-name' }, s.title || s.id),
        el('span', { class: 'sv-item-sub' }, `${s.questions?.length ?? 0} вопр.`)
      );
    }),
  ];
  box.replaceChildren(...kids.filter(Boolean));

  async function save() {
    const ids = surveys.filter((s, i) => box.querySelectorAll('input[type=checkbox]')[i].checked).map((s) => s.id);
    setStatus('сохраняю…');
    const res = await authFetch('/rest/v1/site_settings?key=eq.survey_active_ids', {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ value: ids, updated_at: new Date().toISOString() }),
    });
    setStatus(res.ok ? 'сохранено ✓' : 'ошибка: ' + (await res.text()).slice(0, 80), res.ok ? 'ok' : 'err');
  }
}

/* ---------- раздел «Юзеры» ---------- */

async function buildUsers(pane) {
  const search = el('input', { type: 'search', class: 'btn', placeholder: 'поиск по почте или имени', oninput: paint });
  const box = el('div', {}, el('div', { class: 'sub' }, 'загружаю…'));
  pane.append(el('div', { class: 'sv-results-bar' }, search), box);

  let users = [];
  try {
    const res = await authFetch('/rest/v1/profiles?select=id,email,display_name,avatar_url,user_roles(role,expires_at)');
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
    users = await res.json();
  } catch (e) {
    box.replaceChildren(el('div', { class: 'status err' }, e.message));
    return;
  }

  function paint() {
    const q = search.value.trim().toLowerCase();
    const list = users.filter((u) => !q || `${u.email} ${u.display_name}`.toLowerCase().includes(q));
    if (!list.length) return box.replaceChildren(el('div', { class: 'sub' }, 'никого не найдено'));
    box.replaceChildren(...list.map(userRow));
  }

  function userRow(u) {
    const roles = u.user_roles ?? [];
    const toggle = (role) => {
      const has = roles.some((r) => r.role === role);
      return el(
        'label',
        { class: 'sv-toggle' },
        el('input', {
          type: 'checkbox',
          checked: has ? '' : null,
          onchange: (e) => grant(u, role, e.currentTarget.checked),
        }),
        el('span', {}, role === 'admin' ? 'Админ' : 'Подписчик')
      );
    };
    return el(
      'div',
      { class: 'sv-answer' },
      el(
        'div',
        { class: 'sv-a-head' },
        el('span', { class: 'sv-a-date' }, u.display_name || '—'),
        el('span', { class: 'sv-a-lang' }, u.email ?? ''),
        el('span', { class: 'spacer' }),
        toggle('admin'),
        toggle('subscriber')
      )
    );
  }

  async function grant(user, role, on) {
    setStatus('сохраняю…');
    const res = on
      ? await authFetch('/rest/v1/user_roles', {
          method: 'POST',
          headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ user_id: user.id, role }),
        })
      : await authFetch(`/rest/v1/user_roles?user_id=eq.${user.id}&role=eq.${role}`, { method: 'DELETE' });

    if (!res.ok) {
      // Триггер не даёт снять последнего админа — сообщение из базы понятное,
      // показываем его как есть.
      setStatus((await res.text()).slice(0, 140), 'err');
      paint();
      return;
    }
    const roles = (user.user_roles ??= []);
    user.user_roles = on ? [...roles, { role, expires_at: null }] : roles.filter((r) => r.role !== role);
    setStatus('сохранено ✓', 'ok');
  }

  paint();
}

/* ---------- запуск ---------- */

// Строго в конце файла: render() доходит до renderPanel(), а тот читает SECTIONS.
// Вызов сверху попадал бы в мёртвую зону const и валил панель у настоящего админа.
await ready();
render();
onAuthChange(render);
