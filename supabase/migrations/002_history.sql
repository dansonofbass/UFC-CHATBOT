begin;
create table public.fighter_history(id text primary key, fighter_id bigint not null references public.fighters on delete cascade, event_date date, payload jsonb not null, source_url text not null, updated_at timestamptz not null default now());
create index history_fighter on public.fighter_history(fighter_id,event_date desc);
alter table public.fighter_history enable row level security;
revoke all on public.fighter_history from anon,authenticated;
grant select on public.fighter_history to anon,authenticated;
grant all on public.fighter_history to service_role;
create policy public_read on public.fighter_history for select to anon,authenticated using(true);
commit;
