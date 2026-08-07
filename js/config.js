// Ключи сторонних сервисов. Пустое значение = сервис просто выключен.
//
// Supabase — счётчик «онлайн» в шапке. Нужен проект на https://supabase.com
// (бесплатный тариф): Project Settings → API → Project URL и anon public key.
// Этот ключ рассчитан на публикацию в браузере, но проект используется только
// для Realtime-присутствия — базы и хранилища в нём быть не должно.
export const SUPABASE_URL = 'https://negnlixqeyxskgbqxhvn.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lZ25saXhxZXl4c2tnYnF4aHZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMzM3NzEsImV4cCI6MjEwMTcwOTc3MX0.X74QQsS4D95XUNxrnRoSjws4swTyUyJ3bW2NENA3R2w';

// Umami Cloud — realtime-дашборд. https://cloud.umami.is → Add website →
// Tracking code, оттуда website id (data-website-id).
export const UMAMI_WEBSITE_ID = 'e96e9480-83ae-4d26-b75e-2b84b42180a9';
export const UMAMI_SCRIPT = 'https://cloud.umami.is/script.js';
