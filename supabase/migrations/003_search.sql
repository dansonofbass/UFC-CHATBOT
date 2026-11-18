-- OR search tolerates conversational queries in English and Persian without requiring
-- every question word to occur in a single chunk. No dynamic SQL is executed.
create or replace function public.search_knowledge(query_text text, query_embedding extensions.vector(384) default null)
returns table(content text,title text,source_url text,updated_at timestamptz,score double precision)
language sql stable set search_path=public,extensions as $$
 with q as (select websearch_to_tsquery('simple', regexp_replace(left(query_text,500),'\s+',' OR ','g')) as terms)
 select c.content,d.title,d.source_url,d.updated_at,
 ts_rank_cd(c.search,q.terms)::double precision + case when query_embedding is not null and c.embedding is not null then greatest(0,1-(c.embedding <=> query_embedding)) else 0 end as score
 from document_chunks c join knowledge_documents d on d.id=c.document_id cross join q
 where c.search @@ q.terms or (query_embedding is not null and c.embedding is not null and 1-(c.embedding <=> query_embedding)>.5)
 order by score desc limit 6;
$$;
