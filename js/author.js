// Логотип в шапке: по клику — попап со ссылками автора и другими его проектами.
import { el } from './common.js';
import { t, localized } from './i18n.js';
import { overlay, socialLinks } from './widgets.js';
import { trackEvent } from './analytics.js';

const LOGO = 'assets/Icon_2_512x512.png';

const PROJECTS = [
  {
    id: 'tarkov-quest-map',
    name: 'EFT · Карта заданий',
    nameEn: 'EFT · Quest map',
    href: 'https://voctavian.github.io/tarkov-quest-map/',
    desc: 'Карта заданий Escape from Tarkov: где начинается квест, куда идти и что нести.',
    descEn: 'Escape from Tarkov quest map: where a quest starts, where to go and what to bring.',
    // Проект остановился на 1.1.0 — честно предупреждаем, а не даём наткнуться самому.
    stale: true,
  },
];

function projectCard(p) {
  return el(
    'a',
    {
      class: 'proj' + (p.stale ? ' stale' : ''),
      href: p.href,
      target: '_blank',
      rel: 'noopener noreferrer',
      onclick: () => trackEvent('project-' + p.id),
    },
    el('div', { class: 'proj-name' }, localized(p, 'name')),
    el('div', { class: 'proj-desc' }, localized(p, 'desc')),
    p.stale ? el('div', { class: 'proj-warn' }, t('projectStale')) : null
  );
}

/** @param {HTMLElement} slot место в шапке под логотип */
export function mountAuthor(slot) {
  if (!slot) return;

  const pop = overlay(
    'author-overlay',
    el('div', { class: 'author-head' }, el('img', { class: 'author-logo', src: LOGO, alt: 'MasterMD' }), el('h2', {}, 'MasterMD')),
    el('p', { class: 'pop-intro' }, t('authorIntro')),
    socialLinks(),
    el('div', { class: 'author-section' }, t('authorProjects')),
    PROJECTS.map(projectCard),
    el('button', { class: 'btn', type: 'button', onclick: () => pop.classList.remove('open') }, t('closeLabel'))
  );
  document.body.append(pop);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') pop.classList.remove('open');
  });

  slot.append(
    el(
      'button',
      {
        class: 'brand',
        type: 'button',
        // Подсказка своя, а не title: нативная всплывает через секунду и её легко не заметить.
        'data-tip': t('authorTip'),
        'aria-label': t('authorTip'),
        onclick: () => {
          pop.classList.add('open');
          trackEvent('author-open');
        },
      },
      el('img', { src: LOGO, alt: 'MasterMD' })
    )
  );
}
