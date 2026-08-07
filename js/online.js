// Счётчик «сколько сейчас на сайте» через Supabase Realtime Presence.
// Своего сервера не нужно: каждая вкладка держит вебсокет и объявляет себя
// в общем канале, а число участников канала и есть онлайн.
import { el } from './common.js';
import { t } from './i18n.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const CHANNEL = 'kord-breach-online';

export function mountOnlineBadge(slot) {
  if (!slot) return;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  const dot = el('span', { class: 'online-dot' });
  const label = el('span', { class: 'online-count' }, '…');
  // title ставим сразу, а не через applyI18n — плашка может монтироваться после него.
  const badge = el('div', { class: 'online-badge', title: t('onlineTitle') }, dot, label);
  slot.append(badge);

  connect(label, badge).catch((e) => {
    console.warn('счётчик онлайна недоступен:', e.message);
    badge.remove();
  });
}

async function connect(label, badge) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 1 } },
  });

  const channel = supabase.channel(CHANNEL, {
    config: { presence: { key: crypto.randomUUID() } },
  });

  const render = () => {
    const n = Object.keys(channel.presenceState()).length;
    label.textContent = t('onlineLabel', { n });
    badge.classList.toggle('alone', n <= 1);
  };

  channel
    .on('presence', { event: 'sync' }, render)
    .on('presence', { event: 'join' }, render)
    .on('presence', { event: 'leave' }, render)
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await channel.track({ at: Date.now() });
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') badge.remove();
    });

  // Вкладку закрыли — уходим из канала сразу, не дожидаясь таймаута вебсокета.
  addEventListener('pagehide', () => channel.unsubscribe());
}
