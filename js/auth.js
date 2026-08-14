// Вход через Supabase и роли пользователя.
//
// Права режет RLS на стороне базы. Всё, что здесь есть про роли, — только для
// того, чтобы нарисовать правильную кнопку; полагаться на это как на защиту
// нельзя, вкладка открыта пользователю.
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SDK } from './config.js';
import { el } from './common.js';
import { t } from './i18n.js';
import { overlay } from './widgets.js';
import { trackEvent } from './analytics.js';

const STORAGE_KEY = 'kord_breach_auth_v1';
const ROLES_KEY = 'kord_breach_roles_v1';
const RETURN_KEY = 'kord_breach_auth_return';
const LOAD_TIMEOUT = 4000;

// Провайдеры — данные, а не код: VK добавится сюда же (Custom OIDC, тот же
// signInWithOAuth), а Telegram получит своё start(), потому что сессию ему
// выдаёт Edge Function по подписи виджета, а не редирект провайдера.
const PROVIDERS = [
  {
    id: 'google',
    label: 'Google',
    color: '#ea4335',
    path: 'M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.344-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z',
  },
  {
    id: 'discord',
    label: 'Discord',
    color: '#5865f2',
    // guilds.members.read нужен, чтобы позже выдавать подписку по роли на
    // сервере. Скоуп добавлен сразу: если дописать его потом, всем уже
    // вошедшим Discord покажет экран подтверждения заново.
    scopes: 'identify email guilds.members.read',
    path: 'M20.3 4.4a19.8 19.8 0 0 0-4.9-1.5c-.2.4-.5.9-.6 1.3a18.3 18.3 0 0 0-5.5 0c-.2-.4-.4-.9-.6-1.3a19.7 19.7 0 0 0-4.9 1.5C.5 9 .3 13.6.1 18.1a19.9 19.9 0 0 0 6 3 14.1 14.1 0 0 0 1.2-2c-.7-.2-1.3-.5-1.9-.9l.4-.3c3.9 1.8 8.2 1.8 12.1 0l.4.3c-.6.4-1.2.7-1.9.9.4.7.8 1.4 1.2 2a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.5-13.7zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z',
  },
];

const state = {
  session: null,
  // Кэш только ради того, чтобы кнопка не мигала между переходами.
  // Источник истины — RLS, здесь может лежать что угодно.
  roles: readCachedRoles(),
  failed: false,
};

const listeners = new Set();

function readCachedRoles() {
  try {
    return JSON.parse(sessionStorage.getItem(ROLES_KEY)) ?? [];
  } catch {
    return [];
  }
}

/* ---------- SDK ---------- */

let sdkPromise = null;

function client() {
  sdkPromise ??= import(SUPABASE_SDK).then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // Только PKCE: implicit кладёт токен в #fragment, откуда он утечёт
        // в Referer при загрузке внешних картинок.
        flowType: 'pkce',
        storageKey: STORAGE_KEY,
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  );
  return sdkPromise;
}

/* ---------- инициализация ---------- */

let readyPromise = null;

/** Резолвится ВСЕГДА — в том числе когда Supabase или CDN недоступны. */
export function ready() {
  readyPromise ??= Promise.race([init(), wait(LOAD_TIMEOUT)]).then(() => state);
  return readyPromise;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function init() {
  try {
    const supabase = await client();
    const { data } = await supabase.auth.getSession();
    await apply(data.session);

    supabase.auth.onAuthStateChange((_event, session) => {
      apply(session).then(notify);
    });

    restoreReturnPath();
  } catch (e) {
    // Сайт обязан работать без Supabase: карта, точки и опросы от него не
    // зависят. Ломается только вход.
    state.failed = true;
    console.warn('вход недоступен:', e.message);
  }
  notify();
}

async function apply(session) {
  state.session = session ?? null;
  state.roles = session ? await fetchRoles() : [];
  try {
    sessionStorage.setItem(ROLES_KEY, JSON.stringify(state.roles));
  } catch {}
}

async function fetchRoles() {
  try {
    const res = await authFetch('/rest/v1/rpc/my_roles', { method: 'POST', body: '{}' });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) ?? [];
  } catch (e) {
    console.warn('роли не прочитались:', e.message);
    return [];
  }
}

function notify() {
  for (const fn of listeners) fn(state);
}

/**
 * После входа Supabase возвращает на корень сайта — так в allow-list хватает
 * одной записи. Страницу, с которой ушли, восстанавливаем сами, иначе
 * map.html?map=woods терялся бы.
 */
function restoreReturnPath() {
  const back = sessionStorage.getItem(RETURN_KEY);
  if (!back) return;
  sessionStorage.removeItem(RETURN_KEY);
  if (back !== location.pathname + location.search) location.replace(back);
}

/* ---------- публичный интерфейс ---------- */

export function session() {
  return state.session;
}

export function profile() {
  const u = state.session?.user;
  if (!u) return null;
  const m = u.user_metadata ?? {};
  return {
    id: u.id,
    email: u.email ?? '',
    name: m.full_name || m.name || m.user_name || u.email?.split('@')[0] || '',
    avatar: m.avatar_url || m.picture || '',
  };
}

export function hasRole(role) {
  return state.roles.includes(role);
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function signIn(providerId) {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  if (!provider) return;
  trackEvent('auth-signin-' + providerId);

  sessionStorage.setItem(RETURN_KEY, location.pathname + location.search);
  // На GitHub Pages сайт лежит в подпапке, а location.origin — чужой корень.
  // Отсюда new URL('.', ...) вместо origin: иначе после входа выкинет на 404.
  const siteRoot = new URL('.', location.href).href;

  const supabase = await client();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: provider.id,
    options: { redirectTo: siteRoot, scopes: provider.scopes },
  });
  if (error) {
    sessionStorage.removeItem(RETURN_KEY);
    throw error;
  }
}

export async function signOut() {
  trackEvent('auth-signout');
  const supabase = await client();
  await supabase.auth.signOut();
  sessionStorage.removeItem(ROLES_KEY);
}

/** Запрос к PostgREST от имени пользователя. Что он увидит — решает RLS. */
export async function authFetch(path, init = {}) {
  const token = state.session?.access_token ?? SUPABASE_ANON_KEY;
  return fetch(SUPABASE_URL + path, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
}

/* ---------- кнопка в шапке ---------- */

function icon(path, size = 18) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path);
  p.setAttribute('fill', 'currentColor');
  svg.append(p);
  return svg;
}

function providerButton(provider, onDone) {
  const btn = el(
    'button',
    {
      class: 'btn auth-provider',
      type: 'button',
      onclick: async () => {
        btn.disabled = true;
        try {
          await signIn(provider.id);
        } catch (e) {
          btn.disabled = false;
          onDone(e.message);
        }
      },
    },
    icon(provider.path),
    el('span', {}, provider.label)
  );
  btn.style.setProperty('--brand', provider.color);
  return btn;
}

/** Кнопка входа/аккаунта в шапке. Вызывать один раз на странице. */
export function mountAuth(slot) {
  if (!slot) return;

  const error = el('p', { class: 'pop-intro auth-error', hidden: '' });
  const pop = overlay('auth-overlay');
  document.body.append(pop);
  const box = pop.querySelector('.pop-box');

  // Кнопка админки висит по центру шапки, а не в слоте: справа и так тесно, а
  // ходит админ туда часто. Абсолютное позиционирование — топбар sticky, то есть
  // сам служит точкой отсчёта.
  const adminLink = el('a', { class: 'btn primary admin-link', href: 'admin.html', hidden: '' }, t('authAdminPanel'));
  const button = el('button', { class: 'btn auth-btn', type: 'button', onclick: open });
  slot.append(button);
  slot.closest('.topbar')?.append(adminLink);

  function open() {
    render();
    pop.classList.add('open');
  }

  const close = () => pop.classList.remove('open');

  function render() {
    const me = profile();
    box.replaceChildren();

    if (state.failed) {
      box.append(
        el('h2', {}, t('authSignIn')),
        el('p', { class: 'pop-intro' }, t('authUnavailable')),
        el('button', { class: 'btn', type: 'button', onclick: close }, t('closeLabel'))
      );
      return;
    }

    if (!me) {
      box.append(
        el('h2', {}, t('authSignIn')),
        el('p', { class: 'pop-intro' }, t('authSignInIntro')),
        el(
          'div',
          { class: 'auth-providers' },
          PROVIDERS.map((p) =>
            providerButton(p, (msg) => {
              error.textContent = t('authError') + ': ' + msg;
              error.hidden = false;
            })
          )
        ),
        error,
        el('button', { class: 'btn', type: 'button', onclick: close }, t('closeLabel'))
      );
      return;
    }

    const badges = el(
      'div',
      { class: 'auth-badges' },
      hasRole('admin') ? el('span', { class: 'auth-badge' }, t('authRoleAdmin')) : null,
      hasRole('subscriber') ? el('span', { class: 'auth-badge' }, t('authRoleSubscriber')) : null
    );

    box.append(
      el('h2', {}, t('authAccount')),
      el(
        'div',
        { class: 'auth-me' },
        avatar(me, 42),
        el('div', {}, el('div', { class: 'auth-name' }, me.name), el('div', { class: 'auth-email' }, me.email))
      ),
      badges,
      el('button', { class: 'btn', type: 'button', onclick: () => signOut().then(close) }, t('authSignOut')),
      el('button', { class: 'btn', type: 'button', onclick: close }, t('closeLabel'))
    );
  }

  function avatar(me, size) {
    if (me.avatar) {
      return el('img', { class: 'auth-avatar', src: me.avatar, alt: '', width: size, height: size });
    }
    const node = el('span', { class: 'auth-avatar auth-avatar-text' }, (me.name[0] ?? '?').toUpperCase());
    node.style.width = node.style.height = size + 'px';
    return node;
  }

  function paint() {
    const me = profile();
    // На самой админке кнопка вела бы на текущую страницу.
    adminLink.hidden = !hasRole('admin') || location.pathname.endsWith('admin.html');
    button.replaceChildren();
    button.title = me ? me.email : t('authSignInTitle');
    if (me) {
      button.append(avatar(me, 22), el('span', { class: 'auth-btn-name' }, me.name));
      button.classList.toggle('is-admin', hasRole('admin'));
    } else {
      button.append(el('span', {}, t('authSignIn')));
    }
    if (pop.classList.contains('open')) render();
  }

  paint();
  onAuthChange(paint);
  ready();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}
