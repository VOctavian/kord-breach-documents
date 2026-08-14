-- Авторизация, роли и настройки сайта.
-- Выполнять целиком в SQL Editor проекта Supabase. Запуск повторно безопасен.
--
-- Существующую таблицу survey_responses и её политику на вставку от anon
-- скрипт НЕ трогает: анонимные ответы на опросы должны работать как раньше.

/* ---------- профили ---------- */

-- Зеркало auth.users: сама auth.users из PostgREST не видна, а админке нужно
-- понимать, кому выдаётся роль.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  email        text,
  display_name text,
  avatar_url   text
);
alter table public.profiles enable row level security;

-- Исключение внутри этой функции ломает вход целиком («Database error saving
-- new user»), поэтому здесь только upsert и ничего больше.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name',
                   new.raw_user_meta_data->>'name',
                   new.raw_user_meta_data->>'user_name'),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do update
    set email        = excluded.email,
        display_name = coalesce(excluded.display_name, public.profiles.display_name),
        avatar_url   = coalesce(excluded.avatar_url,   public.profiles.avatar_url);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute function public.handle_new_user();

/* ---------- роли ---------- */

do $$ begin
  create type public.app_role as enum ('admin', 'subscriber');
exception when duplicate_object then null;
end $$;

-- Отдельная таблица, а не колонка в профиле: роли совмещаются, у подписки есть
-- срок. Ссылка на profiles, а не на auth.users — только так PostgREST умеет
-- встраивать роли в выборку профилей (?select=*,user_roles(role)).
create table if not exists public.user_roles (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       public.app_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) default auth.uid(),
  expires_at timestamptz,
  primary key (user_id, role)
);
create index if not exists user_roles_role_idx on public.user_roles (role);
alter table public.user_roles enable row level security;

-- security definer: политики на других таблицах зовут эту функцию, не требуя
-- прав на select из user_roles — иначе таблицу пришлось бы открыть целиком.
-- search_path обязателен: без него функцию можно перехватить своей схемой.
create or replace function public.has_role(check_role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = check_role
      and (ur.expires_at is null or ur.expires_at > now())
  );
$$;
grant execute on function public.has_role(public.app_role) to authenticated;

-- Свои роли клиент спрашивает одним RPC. В JWT их намеренно нет: сломанный
-- Custom Access Token Hook уронил бы вход для всех, а роль в токене живёт до
-- часа после снятия.
create or replace function public.my_roles()
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(ur.role::text), '{}')
  from public.user_roles ur
  where ur.user_id = auth.uid()
    and (ur.expires_at is null or ur.expires_at > now());
$$;
grant execute on function public.my_roles() to authenticated;

-- Снять с себя последнюю админку можно было бы одним кликом, а вернуть — только
-- через SQL Editor. Дешевле запретить.
create or replace function public.keep_last_admin()
returns trigger language plpgsql as $$
begin
  if old.role = 'admin'
     and (select count(*) from public.user_roles where role = 'admin') <= 1 then
    raise exception 'нельзя удалить последнего админа';
  end if;
  return old;
end $$;

drop trigger if exists user_roles_keep_last_admin on public.user_roles;
create trigger user_roles_keep_last_admin
  before delete on public.user_roles
  for each row execute function public.keep_last_admin();

/* ---------- политики: профили и роли ---------- */

drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.has_role('admin'));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists roles_read on public.user_roles;
create policy roles_read on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));

drop policy if exists roles_write_admin on public.user_roles;
create policy roles_write_admin on public.user_roles
  for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

/* ---------- политики: ответы на опросы ---------- */

-- Только добавляем. Политика на вставку от anon остаётся нетронутой.
drop policy if exists survey_read_admin on public.survey_responses;
create policy survey_read_admin on public.survey_responses
  for select to authenticated using (public.has_role('admin'));

drop policy if exists survey_delete_admin on public.survey_responses;
create policy survey_delete_admin on public.survey_responses
  for delete to authenticated using (public.has_role('admin'));

-- Роль authenticated не наследует прав anon: без этой политики вошедший
-- пользователь не смог бы отправить ответ.
drop policy if exists survey_insert_authed on public.survey_responses;
create policy survey_insert_authed on public.survey_responses
  for insert to authenticated with check (true);

/* ---------- настройки сайта ---------- */

-- Здесь живёт то, что админ меняет без деплоя.
create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid()
);
alter table public.site_settings enable row level security;

drop policy if exists settings_read_all on public.site_settings;
create policy settings_read_all on public.site_settings
  for select to anon, authenticated using (true);

drop policy if exists settings_write_admin on public.site_settings;
create policy settings_write_admin on public.site_settings
  for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

grant select on public.site_settings to anon, authenticated;

insert into public.site_settings (key, value) values
  ('survey_active_ids', '[]'::jsonb),
  ('ads_enabled',       'false'::jsonb)
on conflict (key) do nothing;

/* ---------- первый админ ----------

Автоматики «первый вошедший становится админом» нет намеренно — это гонка.
Порядок такой:

  1. Один раз войти на сайте через Google. Триггер создаст профиль.
  2. Выполнить здесь, подставив свою почту:

       insert into public.user_roles (user_id, role)
       select id, 'admin' from public.profiles where email = 'frosea94@gmail.com'
       on conflict do nothing;

  3. Перезагрузить страницу — my_roles() вернёт {admin}.

Проверить политики, не выходя из редактора (uuid брать из public.profiles):

  begin;
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
    select public.my_roles();
    select count(*) from public.survey_responses;
  rollback;

У обычного пользователя ожидаем {} и 0, у админа — {admin} и полное число.
---------------------------------------------------------------------------- */
