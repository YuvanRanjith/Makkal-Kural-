-- Run once in Supabase SQL Editor after the citizen-login upgrade. Safe to rerun.
-- Removes home-ward restrictions; preserves staff redaction, private photos and 15-minute quota.
begin;
set local search_path=public,extensions;
create or replace function public.can_view_ward(p_ward_id integer) returns boolean language sql stable security definer set search_path=public,extensions as $$
 select auth.uid() is not null and (public.get_my_staff_role() is not null or public.is_citizen());
$$;
create or replace function public.create_report(p_category varchar,p_description text,p_image_url text,p_lat double precision,p_lng double precision,p_request_id uuid,p_masked_phone varchar default null)
 returns jsonb language plpgsql security definer set search_path=public,extensions as $$
 declare uid uuid; c public.complaints; report_ward integer; eligible timestamptz; begin
 uid := public.ensure_user();
 if not public.is_citizen() then raise exception 'Phone and password login required' using errcode='42501'; end if;
 -- One transaction per account: simultaneous requests cannot bypass the cooldown.
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select * into c from public.complaints where user_id=uid and request_id=p_request_id;
 if c.complaint_id is not null then return (select to_jsonb(d) from public.complaint_details d where d.complaint_id=c.complaint_id); end if;
 select max(created_at)+interval '15 minutes' into eligible from public.complaints where user_id=uid;
 if eligible>now() then raise exception 'REPORT_COOLDOWN' using errcode='P0001',detail=eligible::text; end if;
 if p_category is null or p_category not in ('Pothole','Streetlight','Drainage','Garbage','Other') or length(coalesce(p_description,''))>2000 then raise exception 'Invalid report'; end if;
 if p_lat is null or p_lng is null or not(p_lat between -90 and 90) or not(p_lng between -180 and 180) or p_request_id is null then raise exception 'Invalid location or request'; end if;
 -- Route by the issue location, independently of the account's former home ward.
 -- Smaller matching polygons win; the city-wide demo envelope is excluded.
 select w.ward_id into report_ward from public.wards w
 where not(w.ward_id=104 and w.zone_name='Live Demo')
 and ST_Covers(w.boundary::geometry,ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326))
 order by ST_Area(w.boundary::geography),w.ward_id limit 1;
 -- No matching boundary is valid: keep ward_id null for staff review.
 if p_image_url is null or p_image_url not like '%/storage/v1/object/public/complaint-photos/'||uid::text||'/%' then raise exception 'Image must belong to your session'; end if;
 if p_masked_phone is not null then perform public.update_user_phone(uid,p_masked_phone); end if;
 insert into public.complaints(user_id,category,description,image_url,location,ward_id,request_id)
 values(uid,p_category,p_description,p_image_url,ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326),report_ward,p_request_id)
 on conflict(user_id,request_id) do nothing returning * into c;
 if c.complaint_id is null then select * into c from public.complaints where user_id=uid and request_id=p_request_id; end if;
 return to_jsonb(c) - 'location' || jsonb_build_object('latitude',ST_Y(c.location::geometry),'longitude',ST_X(c.location::geometry));
 end;
$$;

create or replace function public.get_ward_for_location(lat double precision,lng double precision) returns integer language sql stable set search_path=public,extensions as $$
 select w.ward_id from public.wards w where not(w.ward_id=104 and w.zone_name='Live Demo')
 and ST_Covers(w.boundary::geometry,ST_SetSRID(ST_MakePoint(lng,lat),4326))
 order by ST_Area(w.boundary::geography),w.ward_id limit 1;
$$;
drop policy if exists mk_photo_insert on storage.objects;
create policy mk_photo_insert on storage.objects for insert to authenticated with check(bucket_id='complaint-photos' and split_part(name,'/',1)=auth.uid()::text and (public.get_my_staff_role() is not null or public.is_citizen()));
notify pgrst,'reload schema';
commit;
