begin;
-- Legacy updated_at columns describe ingestion observations. Never backfill them
-- into publisher timestamps. Null means the publisher timestamp was unavailable.
do $$ declare t text; begin
  foreach t in array array['fighters','events','fights','fight_stats','rankings','fighter_history','knowledge_documents'] loop
    execute format('alter table public.%I add column if not exists fetched_at timestamptz', t);
    execute format('alter table public.%I add column if not exists source_updated_at timestamptz', t);
  end loop;
end $$;
create index if not exists fighter_aliases_lookup on public.fighter_aliases(lower(alias));
create index if not exists fighter_history_lookup on public.fighter_history(fighter_id,event_date desc);

-- Reject incompatible model vectors even if their dimensions happen to match.
create or replace function public.search_knowledge(query_text text, query_embedding extensions.vector(384) default null)
returns table(content text,title text,source_url text,updated_at timestamptz,score double precision)
language sql stable set search_path=public,extensions as $$
 with q as (select websearch_to_tsquery('simple', regexp_replace(left(query_text,500),'\s+',' OR ','g')) as terms),
 ranked as (
 select c.content,d.title,d.source_url,d.updated_at,
 ts_rank_cd(c.search,q.terms)::double precision as lexical,
 case when query_embedding is not null and c.embedding is not null
   and c.embedding_model='Xenova/paraphrase-multilingual-MiniLM-L12-v2' and c.embedding_dimensions=384
 then greatest(0,1-(c.embedding <=> query_embedding)) else 0 end as semantic,
 c.search @@ q.terms as matches
 from document_chunks c join knowledge_documents d on d.id=c.document_id cross join q
 ) select content,title,source_url,updated_at,lexical+semantic as score
 from ranked where matches or semantic>.5 order by score desc limit 6;
$$;
commit;
