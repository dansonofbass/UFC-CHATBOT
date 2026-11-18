begin;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create table public.data_sources(id text primary key, name text not null, url text not null, license text not null, updated_at timestamptz not null default now());
create table public.fighters(id bigint primary key, slug text unique not null, name text not null, search_name text not null, payload jsonb not null, source_url text not null, updated_at timestamptz not null default now());
create index fighters_search on public.fighters using gin(to_tsvector('simple',search_name));
create table public.fighter_aliases(id bigint generated always as identity primary key, fighter_id bigint not null references public.fighters on delete cascade, alias text not null, unique(fighter_id,alias));
create table public.events(id bigint primary key, slug text unique not null, title text not null, starts_at timestamptz not null, status text not null check(status in ('announced','scheduled','live','completed','cancelled','postponed')), payload jsonb not null, source_url text not null, updated_at timestamptz not null default now());
create index events_date on public.events(starts_at desc);
create table public.fights(id bigint primary key, event_id bigint not null references public.events on delete cascade, fighter_a_id bigint references public.fighters, fighter_b_id bigint references public.fighters, status text, payload jsonb not null, source_url text not null, updated_at timestamptz not null default now());
create index fights_event on public.fights(event_id);
create index fights_fighter_a on public.fights(fighter_a_id);
create index fights_fighter_b on public.fights(fighter_b_id);
create table public.fight_stats(id bigint generated always as identity primary key, fight_id bigint not null references public.fights on delete cascade, scope text not null, payload jsonb not null, source_url text not null, updated_at timestamptz not null default now(), unique(fight_id,scope));
create table public.rankings(id bigint generated always as identity primary key, snapshot_date date not null unique, payload jsonb not null, source_url text not null, updated_at timestamptz not null default now());
create table public.news_items(id text primary key, title text not null, url text unique not null, published_at timestamptz not null, excerpt text not null, source text not null references public.data_sources, confirmation text not null default 'report' check(confirmation in ('confirmed','unconfirmed','report')), fighter_ids bigint[] not null default '{}', event_ids bigint[] not null default '{}', updated_at timestamptz not null default now());
create index news_date on public.news_items(published_at desc);
create table public.knowledge_documents(id text primary key, title text not null, body text not null, source_url text not null, source_id text references public.data_sources, published_at timestamptz, updated_at timestamptz not null default now());
create table public.document_chunks(id text primary key, document_id text not null references public.knowledge_documents on delete cascade, content text not null, embedding extensions.vector(384), embedding_model text, embedding_dimensions int check(embedding_dimensions=384), search tsvector generated always as (to_tsvector('simple', content)) stored, updated_at timestamptz not null default now());
create index chunks_search on public.document_chunks using gin(search);
create index chunks_vector on public.document_chunks using hnsw(embedding extensions.vector_cosine_ops);
create table public.sync_runs(id uuid primary key default gen_random_uuid(), kind text not null, started_at timestamptz not null default now(), finished_at timestamptz, status text not null default 'running', cursor text, requests int not null default 0, error_code text);
create table public.provider_usage(id bigint generated always as identity primary key, provider text not null, model text, tokens int not null default 0, status text not null, created_at timestamptz not null default now());
create index usage_date on public.provider_usage(created_at);
create table public.query_cache(key text primary key, response jsonb not null, expires_at timestamptz not null);
create table public.usage_buckets(key text primary key, count bigint not null default 0, expires_at timestamptz not null);
create function public.consume_budget(bucket text, amount int, ceiling int, expiry timestamptz) returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare accepted boolean;
begin
 insert into usage_buckets(key,count,expires_at) values(bucket,amount,expiry)
 on conflict(key) do update set count=case when usage_buckets.expires_at < now() then amount else usage_buckets.count+amount end, expires_at=expiry
 where usage_buckets.expires_at < now() or usage_buckets.count+amount<=ceiling returning true into accepted;
 return coalesce(accepted,false);
end; $$;
create function public.search_knowledge(query_text text, query_embedding extensions.vector(384) default null) returns table(content text, title text, source_url text, updated_at timestamptz, score double precision) language sql stable set search_path=public,extensions as $$
 select c.content,d.title,d.source_url,d.updated_at,
 (ts_rank_cd(c.search,plainto_tsquery('simple',left(query_text,500)))::double precision + case when query_embedding is not null and c.embedding is not null then greatest(0,1-(c.embedding <=> query_embedding)) else 0 end) as score
 from document_chunks c join knowledge_documents d on d.id=c.document_id
 where c.search @@ plainto_tsquery('simple',left(query_text,500)) or (query_embedding is not null and c.embedding is not null and 1-(c.embedding <=> query_embedding)>.5)
 order by score desc limit 6;
$$;
do $$ declare t text; begin
 foreach t in array array['data_sources','fighters','fighter_aliases','events','fights','fight_stats','rankings','news_items','knowledge_documents','document_chunks','sync_runs','provider_usage','query_cache','usage_buckets'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['data_sources','fighters','fighter_aliases','events','fights','fight_stats','rankings','news_items','knowledge_documents','document_chunks'] loop
 execute format('grant select on public.%I to anon, authenticated',t);
 execute format('create policy public_read on public.%I for select to anon, authenticated using (true)',t);
 end loop;
end $$;
revoke all on function public.consume_budget(text,int,int,timestamptz) from public,anon,authenticated;
grant execute on function public.consume_budget(text,int,int,timestamptz) to service_role;
grant execute on function public.search_knowledge(text,extensions.vector) to anon,authenticated,service_role;
grant usage, select on all sequences in schema public to service_role;
commit;
