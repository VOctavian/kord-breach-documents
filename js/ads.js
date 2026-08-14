// Реклама и её отключение для подписчиков.
//
// Самих блоков пока нет — это точка расширения. Механика ролей рабочая, так что
// когда блоки появятся, трогать придётся только mountAds().
import { ready, hasRole } from './auth.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

let enabledGlobally = false;

/** Показывать ли рекламу этому посетителю. */
export function adsEnabled() {
  return enabledGlobally && !hasRole('subscriber') && !hasRole('admin');
}

/**
 * Глобальный рубильник живёт в site_settings, чтобы выключить рекламу целиком
 * без деплоя. Недоступен Supabase — считаем, что рекламы нет: показать её лишний
 * раз хуже, чем не показать.
 */
async function readSwitch() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/site_settings?key=eq.ads_enabled&select=value`, {
      headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    return (await res.json())[0]?.value === true;
  } catch {
    return false;
  }
}

export async function mountAds() {
  // Роли ждём обязательно: иначе подписчик успел бы увидеть вспышку рекламы до
  // того, как выяснится, что показывать её ему не надо.
  const [, on] = await Promise.all([ready(), readSwitch()]);
  enabledGlobally = on;

  // Классом заведуют будущие блоки: схлопнуть плейсхолдер можно чистым CSS,
  // не рассказывая об этом JS.
  document.body.classList.toggle('no-ads', !adsEnabled());
}
