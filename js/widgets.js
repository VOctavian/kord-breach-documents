// Общие для всех страниц виджеты: переключатель языка, «Угостить кофе», фидбэк в Discord.
import { t, lang, setLang, applyI18n } from './i18n.js';
import { el } from './common.js';
import { trackEvent } from './analytics.js';

export const DISCORD_INVITE = 'https://discord.gg/GUeWxXf9R';

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
