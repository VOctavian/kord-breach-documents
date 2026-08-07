// Общие для всех страниц виджеты: переключатель языка, «Угостить кофе», фидбэк в Discord.
import { t, lang, setLang, applyI18n } from './i18n.js';
import { el } from './common.js';
import { trackEvent } from './analytics.js';

export const DISCORD_INVITE = 'https://discord.gg/GUeWxXf9R';

const SOCIALS = [
  {
    name: 'YouTube',
    href: 'https://www.youtube.com/@MasterMD_yt',
    color: '#ff0033',
    path: 'M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.2c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.2c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.5 15.6V8.4l6.3 3.6-6.3 3.6z',
  },
  {
    name: 'Twitch',
    href: 'https://www.twitch.tv/mastermd_ttv',
    color: '#9146ff',
    path: 'M11.6 4.7h1.7v5.2h-1.7zm4.7 0H18v5.2h-1.7zM6 0 1.7 4.3v15.4h5.2V24l4.3-4.3h3.4L22.3 12V0zm14.6 11.1-3.5 3.5h-3.4l-3 3v-3H6.9V1.7h13.7z',
  },
  {
    name: 'TikTok',
    href: 'https://www.tiktok.com/@mastermd_tt',
    color: '#25f4ee',
    path: 'M16.4 0c.3 2.3 1.6 3.7 3.9 3.9v2.7c-1.3.1-2.5-.3-3.9-1.1v6.9c0 8.8-9.6 11.5-13.4 5.2C.5 13.4 2 6.6 8.8 6.4v2.8c-.5.1-1.1.2-1.6.4-1.5.5-2.4 1.5-2.1 3.2.4 3.3 6.5 4.3 6-2.2V0z',
  },
  {
    name: 'Boosty',
    href: 'https://boosty.to/mastermd',
    color: '#f15f2c',
    path: 'M13 2 3 14h7v8l10-12h-7z',
  },
];

/** Иконки соцсетей автора — вставляются в шапку. */
export function socialLinks() {
  return el(
    'div',
    { class: 'social-links' },
    SOCIALS.map((s) => {
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('aria-hidden', 'true');
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', s.path);
      icon.append(p);
      const link = el(
        'a',
        {
          href: s.href,
          title: s.name,
          'aria-label': s.name,
          target: '_blank',
          rel: 'noopener noreferrer',
          onclick: () => trackEvent('social-' + s.name.toLowerCase()),
        },
        icon
      );
      link.style.setProperty('--brand', s.color);
      return link;
    })
  );
}

const DONATE = [
  { label: 'Binance Pay ID', value: '155093026', qr: 'assets/misc/binance_pay_qr.png' },
  { label: 'USDT (TRC20)', value: 'TNEiHy5bQmHmFBjfy4gtDPmfU8qDY3VSTk' },
  { label: 'BTC', value: '16DGMk6p5TtLMoycR5BMmugPD1i2aU17oW' },
  { label: t('boostyLabel'), value: 'https://boosty.to/mastermd/donate', link: 'https://boosty.to/mastermd/donate' },
];

/** Переключатель ru/en — вставляется в шапку. */
export function langToggle() {
  const mk = (code) =>
    el(
      'button',
      {
        class: 'lang-opt' + (code === lang ? ' active' : ''),
        type: 'button',
        onclick: () => setLang(code),
      },
      code.toUpperCase()
    );
  return el('div', { class: 'lang-toggle', title: t('langToggleTitle') }, mk('ru'), mk('en'));
}

function overlay(id, ...content) {
  const box = el('div', { class: 'pop-box' }, ...content);
  const node = el('div', { class: 'pop-overlay', id }, box);
  node.addEventListener('click', (e) => {
    if (e.target === node) node.classList.remove('open');
  });
  return node;
}

function copyRow(item) {
  const value = el('div', { class: 'pop-value' }, item.value.replace(/^https:\/\//, ''));
  const copyBtn = el(
    'button',
    {
      class: 'btn small',
      type: 'button',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(item.value);
        } catch {
          const ta = el('textarea', { style: 'position:fixed;opacity:0' });
          ta.value = item.value;
          document.body.append(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        copyBtn.textContent = t('copiedLabel');
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = t('copyLabel');
          copyBtn.classList.remove('copied');
        }, 1400);
      },
    },
    t('copyLabel')
  );

  const row = el('div', { class: 'pop-row' }, value, copyBtn);
  if (item.link) {
    row.append(
      el('a', { class: 'btn small', href: item.link, target: '_blank', rel: 'noopener noreferrer' }, t('openLinkLabel'))
    );
  }

  const wrap = el('div', { class: 'pop-method' }, el('div', { class: 'pop-method-label' }, item.label), row);

  if (item.qr) {
    const img = el('img', { class: 'pop-qr', alt: 'QR', hidden: '' });
    row.append(
      el(
        'button',
        {
          class: 'btn small',
          type: 'button',
          onclick: () => {
            if (!img.src) img.src = item.qr;
            img.hidden = !img.hidden;
          },
        },
        t('qrShowLabel')
      )
    );
    wrap.append(img);
  }
  return wrap;
}

/** Плавающие кнопки «кофе» и «фидбэк» + их модалки. Вызывать один раз на странице. */
export function mountWidgets() {
  const coffee = overlay(
    'coffee-overlay',
    el('h2', { 'data-i18n': 'coffeeBtnLabel' }),
    el('p', { class: 'pop-intro', 'data-i18n': 'coffeeIntro' }),
    ...DONATE.map(copyRow),
    el('button', { class: 'btn', type: 'button', 'data-i18n': 'closeLabel', onclick: () => coffeeClose() })
  );
  const coffeeClose = () => coffee.classList.remove('open');

  const feedback = overlay(
    'feedback-overlay',
    el('h2', { 'data-i18n': 'feedbackBtnLabel' }),
    el('p', { class: 'pop-intro', 'data-i18n': 'feedbackIntro' }),
    el(
      'a',
      {
        class: 'btn primary discord-btn',
        href: DISCORD_INVITE,
        target: '_blank',
        rel: 'noopener noreferrer',
        onclick: () => trackEvent('discord-open'),
      },
      t('discordJoin')
    ),
    el('div', { class: 'pop-method' }, el('div', { class: 'pop-value' }, DISCORD_INVITE.replace('https://', ''))),
    el('button', { class: 'btn', type: 'button', 'data-i18n': 'closeLabel', onclick: () => feedback.classList.remove('open') })
  );

  const buttons = el(
    'div',
    { class: 'float-buttons' },
    el(
      'button',
      {
        id: 'btn-coffee',
        type: 'button',
        'data-i18n': 'coffeeBtnLabel',
        'data-i18n-title': 'coffeeBtnTitle',
        onclick: () => {
          coffee.classList.add('open');
          trackEvent('coffee-open');
        },
      },
      t('coffeeBtnLabel')
    ),
    el(
      'button',
      {
        id: 'btn-feedback',
        type: 'button',
        'data-i18n': 'feedbackBtnLabel',
        'data-i18n-title': 'feedbackBtnTitle',
        onclick: () => {
          feedback.classList.add('open');
          trackEvent('feedback-open');
        },
      },
      t('feedbackBtnLabel')
    )
  );

  document.body.append(buttons, coffee, feedback);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    coffee.classList.remove('open');
    feedback.classList.remove('open');
  });
  applyI18n();
}

/** Редактор работает только с локальным сервером — на GitHub Pages ссылку прячем. */
export const isLocal = ['localhost', '127.0.0.1', ''].includes(location.hostname);
