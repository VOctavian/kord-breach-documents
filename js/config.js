// Ключи сторонних сервисов. Пустое значение = сервис просто выключен.
//
// Supabase — счётчик «онлайн» в шапке. Нужен проект на https://supabase.com
// (бесплатный тариф): Project Settings → API → Project URL и anon public key.
// Этот ключ рассчитан на публикацию в браузере, но проект используется только
// для Realtime-присутствия — базы и хранилища в нём быть не должно.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Umami Cloud — realtime-дашборд. https://cloud.umami.is → Add website →
// Tracking code, оттуда website id (data-website-id).
export const UMAMI_WEBSITE_ID = '';
export const UMAMI_SCRIPT = 'https://cloud.umami.is/script.js';
