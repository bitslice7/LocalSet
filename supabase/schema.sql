-- Run once in the Supabase SQL editor.
-- One private JSON document per authenticated user, with optimistic revisions.

create table if not exists public.workout_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  constraint workout_state_is_object check (jsonb_typeof(state) = 'object')
);

create or replace function public.touch_workout_state_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workout_state_set_updated_at on public.workout_state;
create trigger workout_state_set_updated_at
before update on public.workout_state
for each row execute function public.touch_workout_state_updated_at();

alter table public.workout_state enable row level security;
alter table public.workout_state force row level security;

revoke all on table public.workout_state from anon, authenticated;
grant select, insert, update, delete on table public.workout_state to authenticated;

drop policy if exists "workout_state_select_own" on public.workout_state;
create policy "workout_state_select_own"
on public.workout_state
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "workout_state_insert_own" on public.workout_state;
create policy "workout_state_insert_own"
on public.workout_state
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "workout_state_update_own" on public.workout_state;
create policy "workout_state_update_own"
on public.workout_state
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "workout_state_delete_own" on public.workout_state;
create policy "workout_state_delete_own"
on public.workout_state
for delete
to authenticated
using ((select auth.uid()) = user_id);
