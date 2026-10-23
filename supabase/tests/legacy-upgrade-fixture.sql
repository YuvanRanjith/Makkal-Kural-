-- CI/disposable local database only: emulate the older heatmap return signature
-- and an automatically named unique vote constraint before rerunning schema.sql.
drop function if exists public.get_ward_heatmap_data();
create function public.get_ward_heatmap_data() returns table(
 ward_id integer,ward_name text,zone_name text,open_count bigint,resolved_count bigint,total_count bigint,
 avg_resolution_hours numeric,health_score integer,boundary_geojson text
) language sql as $$
 select null::integer,null::text,null::text,0::bigint,0::bigint,0::bigint,null::numeric,0::integer,null::text where false;
$$;
alter table public.audit_votes add constraint legacy_vote_unique unique(complaint_id,user_id);
