-- Предложенные посетителями метки.
-- Выполнять целиком в SQL Editor. Запуск повторно безопасен.
--
-- Писать сюда может только Edge Function `suggest` (она ходит с service-ключом
-- и обходит RLS). Анониму не выдано ничего: иначе ограничение «2 в минуту»
-- обходилось бы прямым запросом к PostgREST мимо функции.

create table if not exists public.spawn_suggestions (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  map         text not null,
  doc         text,
  caption     text not null,
  x           double precision not null,
  y           double precision not null,
  image_path  text,
  author_id   uuid references auth.users(id) on delete set null,
  author_name text,
  -- Нужен только для ограничения частоты. Чистится вместе со строкой.
  client_ip   text
);
create index if not exists spawn_suggestions_map_idx on public.spawn_suggestions (map);
create index if not exists spawn_suggestions_ip_idx on public.spawn_suggestions (client_ip, created_at);

alter table public.spawn_suggestions enable row level security;

-- Ни anon, ни обычный вошедший не видят чужих предложений: на карте они
-- показываются только админу, а отдаёт их функция.
drop policy if exists suggestions_read_admin on public.spawn_suggestions;
create policy suggestions_read_admin on public.spawn_suggestions
  for select to authenticated using (public.has_role('admin'));

drop policy if exists suggestions_delete_admin on public.spawn_suggestions;
create policy suggestions_delete_admin on public.spawn_suggestions
  for delete to authenticated using (public.has_role('admin'));

/* ---------- ограничение частоты ---------- */

-- Считаем на стороне базы, а не в функции: даже если у функции появится второй
-- вызывающий, правило останется одним и тем же.
create or replace function public.suggestions_rate_limit()
returns trigger language plpgsql as $$
declare
  recent int;
begin
  if new.client_ip is null or new.client_ip = '' then
    return new;
  end if;
  select count(*) into recent
  from public.spawn_suggestions
  where client_ip = new.client_ip
    and created_at > now() - interval '1 minute';

  if recent >= 2 then
    raise exception 'слишком часто: не больше 2 предложений в минуту'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists spawn_suggestions_rate_limit on public.spawn_suggestions;
create trigger spawn_suggestions_rate_limit
  before insert on public.spawn_suggestions
  for each row execute function public.suggestions_rate_limit();

/* ---------- хранилище скриншотов ---------- */

-- Приватный бакет: предложения живут недолго, их смотрит только админ, а
-- публичная раздача сделала бы из него бесплатный файлообменник.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('suggestions', 'suggestions', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = 3145728,
      allowed_mime_types = array['image/jpeg'];

-- Загружает только функция своим service-ключом, поэтому политик на запись нет.
drop policy if exists suggestions_files_read_admin on storage.objects;
create policy suggestions_files_read_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'suggestions' and public.has_role('admin'));

drop policy if exists suggestions_files_delete_admin on storage.objects;
create policy suggestions_files_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'suggestions' and public.has_role('admin'));

/* ---------- уборка ---------- */

-- Предложение живёт до решения админа. Если оно провисело месяц, значит его
-- не примут никогда — но удалять молча нельзя, поэтому только помощник:
--   select public.purge_old_suggestions(30);
create or replace function public.purge_old_suggestions(days int default 30)
returns int language sql security definer set search_path = '' as $$
  with gone as (
    delete from public.spawn_suggestions
    where created_at < now() - make_interval(days => days)
    returning 1
  )
  select count(*)::int from gone;
$$;
