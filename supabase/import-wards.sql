-- Import authoritative WGS84 GeoJSON; do not use invented boundaries.
-- Replace the JSON below with a FeatureCollection whose properties contain
-- ward_id (integer), ward_name, and zone_name. Polygon and MultiPolygon supported.
begin;
create temporary table mk_ward_import(document jsonb);
insert into mk_ward_import values ('{"type":"FeatureCollection","features":[]}');
do $$ begin if not exists(select 1 from mk_ward_import where jsonb_array_length(document->'features')>0) then raise exception 'Replace the empty GeoJSON with official ward boundaries before importing'; end if; end $$;
insert into public.wards(ward_id,ward_name,zone_name,boundary)
select (feature->'properties'->>'ward_id')::integer,feature->'properties'->>'ward_name',feature->'properties'->>'zone_name',
 ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON((feature->'geometry')::text),4326))
from mk_ward_import,jsonb_array_elements(document->'features') feature
on conflict(ward_id) do update set ward_name=excluded.ward_name,zone_name=excluded.zone_name,boundary=excluded.boundary;
-- Assign previously unassigned reports to the imported boundaries.
update public.complaints c set ward_id=public.get_ward_for_location(ST_Y(c.location::geometry),ST_X(c.location::geometry)) where c.ward_id is null;
drop table mk_ward_import;
commit;
