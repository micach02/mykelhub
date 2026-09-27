-- MykelHub cloud storage
--
-- Run this once in the Supabase SQL editor after creating your project.
-- It creates one table and locks it down so each account can only ever see
-- its own rows: without the policy below, anyone holding the anon key could
-- read every customer's debts, and that key is public in a static site.

create table if not exists public.store_data (
  owner      uuid        not null references auth.users (id) on delete cascade,
  -- One row per collection (products, customers, sales, ...), so editing a
  -- product does not rewrite the whole sales history.
  collection text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (owner, collection)
);

alter table public.store_data enable row level security;

-- The whole security model: a row belongs to one account, and only that
-- account can touch it. `with check` stops anyone writing rows for someone else.
drop policy if exists "own rows only" on public.store_data;
create policy "own rows only" on public.store_data
  for all
  to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- Keep updated_at honest rather than trusting whatever the client sends.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists store_data_touch on public.store_data;
create trigger store_data_touch
  before insert or update on public.store_data
  for each row execute function public.touch_updated_at();
