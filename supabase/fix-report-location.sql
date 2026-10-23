-- Compatibility repair retaining current login, routing and cooldown rules.
-- V1.1: phone/password citizens, location-based routing, private evidence and 15-minute cooldown.
-- Apply after schema.sql on existing databases. No reports or accounts are deleted.
begin;
set local search_path=public,extensions;
alter table public.users add column if not exists ward_id integer references public.wards(ward_id);
create or replace function public.is_citizen() returns boolean language sql stable security definer set search_path=public,extensions as $$
 select auth.uid() is not null and public.get_my_staff_role() is null and exists(select 1 from auth.users u where u.id=auth.uid() and coalesce(u.phone,'')<>'' and not coalesce(u.is_anonymous,false));
$$;
create or replace function public.get_my_ward_id() returns integer language sql stable security definer set search_path=public,extensions as $$
 select u.ward_id from public.users u where u.user_id=auth.uid() and public.is_citizen();
$$;
create or replace function public.can_view_ward(p_ward_id integer) returns boolean language sql stable security definer set search_path=public,extensions as $$
 select auth.uid() is not null and (public.get_my_staff_role() is not null or public.is_citizen());
$$;
create or replace function public.ensure_user() returns uuid language plpgsql security definer set search_path=public,extensions as $$
 begin
 if auth.uid() is null or (not public.is_citizen() and public.get_my_staff_role() is null) then raise exception 'Phone and password login required' using errcode='42501'; end if;
 insert into public.users(user_id,is_anonymous) values(auth.uid(),false) on conflict(user_id) do nothing;return auth.uid();
 end;
$$;
create or replace function public.get_ward_options() returns table(ward_id integer,ward_name text,zone_name text) language plpgsql stable security definer set search_path=public,extensions as $$
 begin
 if not public.is_citizen() then raise exception 'Citizen login required' using errcode='42501'; end if;
 return query select w.ward_id,w.ward_name::text,w.zone_name::text from public.wards w where not (w.ward_id=104 and w.zone_name='Live Demo') order by w.ward_name;
 end;
$$;
create or replace function public.set_my_ward(p_ward_id integer) returns void language plpgsql security definer set search_path=public,extensions as $$
 declare existing integer;begin
 if not public.is_citizen() then raise exception 'Citizen login required' using errcode='42501'; end if;
 perform public.ensure_user();
 select u.ward_id into existing from public.users u where user_id=auth.uid() for update;
 if existing is not null and existing<>p_ward_id then raise exception 'Ask the administrator to change your ward' using errcode='42501'; end if;
 if p_ward_id is null or not exists(select 1 from public.wards w where w.ward_id=p_ward_id and not(w.ward_id=104 and w.zone_name='Live Demo')) then raise exception 'Choose a valid ward';end if;
 update public.users set ward_id=p_ward_id where user_id=auth.uid();
 end;
$$;
create or replace function public.get_citizen_context() returns jsonb language plpgsql security definer set search_path=public,extensions as $$
 declare uid uuid; result jsonb;begin
 if not public.is_citizen() then raise exception 'Citizen login required' using errcode='42501';end if;
 uid:=public.ensure_user();
 select jsonb_build_object('user_id',u.user_id,'ward_id',u.ward_id,'ward_name',w.ward_name,'next_report_at',(select max(c.created_at)+interval '15 minutes' from public.complaints c where c.user_id=uid)) into result
 from public.users u left join public.wards w on w.ward_id=u.ward_id where u.user_id=uid;
 return result;end;
$$;
-- A security-barrier view intentionally handles filtering and staff-field redaction.
-- Base-table column grants below prevent bypassing redaction via direct REST queries.
create or replace view public.complaint_details with (security_invoker=false,security_barrier=true) as
 select c.complaint_id,case when public.get_my_staff_role() is not null or c.user_id=auth.uid() then c.user_id else null end as user_id,
 c.category,c.description,c.image_url,c.repair_image_url,ST_Y(c.location::geometry) as latitude,ST_X(c.location::geometry) as longitude,
 c.ward_id,w.ward_name,c.status,c.upvote_count,c.created_at,c.verification_deadline,
 case when public.get_my_staff_role() is not null then c.assigned_to else null end as assigned_to,c.resolved_at,c.audit_round,
 case when public.get_my_staff_role() is not null or c.user_id=auth.uid() then c.request_id else null end as request_id
 from public.complaints c left join public.wards w on w.ward_id=c.ward_id where public.can_view_ward(c.ward_id);
do $$ declare r record;begin
 for r in select tablename,policyname from pg_policies where schemaname='public' and tablename in('complaints','wards') loop execute format('drop policy %I on public.%I',r.policyname,r.tablename);end loop;
end $$;
revoke all on public.complaints,public.wards,public.complaint_details from anon,authenticated;
grant select(complaint_id,category,description,image_url,repair_image_url,location,ward_id,status,upvote_count,created_at,verification_deadline,resolved_at,audit_round) on public.complaints to authenticated;
grant select on public.complaint_details,public.wards to authenticated;
create policy ward_complaints on public.complaints for select to authenticated using(public.can_view_ward(ward_id));
create policy ward_boundaries on public.wards for select to authenticated using(public.can_view_ward(ward_id));
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
create or replace function check_nearby_complaints(
  lat double precision,
  lng double precision,
  radius_meters int default 15
)
returns table (
  complaint_id uuid,
  category character varying,
  image_url text,
  status character varying,
  upvote_count integer,
  distance_meters double precision,
  created_at timestamptz
)
language sql
stable
set search_path=public,extensions
as $$
  select
    c.complaint_id,
    c.category,
    c.image_url,
    c.status,
    c.upvote_count,
    ST_Distance(
      c.location::geography,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    ) as distance_meters,
    c.created_at
  from public.complaints c
  where public.can_view_ward(c.ward_id) and c.status in ('OPEN', 'IN_PROGRESS')
    and ST_DWithin(
      c.location::geography,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      least(greatest(radius_meters,1),100)
    )
  order by distance_meters asc
  limit 5;
$$;
create or replace function public.endorse_complaint(p_complaint_id uuid,p_user_id uuid) returns integer language plpgsql security definer set search_path=public,extensions as $$
 declare count integer; c public.complaints; begin
 if auth.uid() is null or p_user_id is distinct from auth.uid() then raise exception 'Not your profile'; end if;
 perform public.ensure_user();
 select * into c from public.complaints where complaint_id=p_complaint_id for update;
 if c.complaint_id is null or not public.is_citizen() or not public.can_view_ward(c.ward_id) then raise exception 'Citizen login required to endorse issues' using errcode='42501'; end if;
 if c.complaint_id is null or c.status not in ('OPEN','IN_PROGRESS') then raise exception 'Issue is not open for endorsement'; end if;
 insert into public.complaint_endorsements(complaint_id,user_id) values(p_complaint_id,auth.uid()) on conflict(complaint_id,user_id) do nothing;
 select upvote_count into count from public.complaints where complaint_id=p_complaint_id; return count;
 end;
$$;
create or replace function public.cast_audit_vote(p_complaint_id uuid,p_user_id uuid,p_is_verified boolean,p_feedback_notes text default null)
 returns table(confirm_votes bigint,reject_votes bigint,new_status varchar) language plpgsql security definer set search_path=public,extensions as $$
 declare c public.complaints; yes bigint; no bigint; state varchar; begin
 if auth.uid() is null or p_user_id is distinct from auth.uid() then raise exception 'Not your profile'; end if;
 if p_is_verified is null or length(coalesce(p_feedback_notes,''))>2000 then raise exception 'Invalid vote'; end if;
 perform public.ensure_user();
 select * into c from public.complaints where complaint_id=p_complaint_id for update;
 if c.complaint_id is null or not public.is_citizen() or not public.can_view_ward(c.ward_id) then raise exception 'Citizen login required to verify repairs' using errcode='42501'; end if;
 if c.complaint_id is null or c.status!='PENDING_VERIFICATION' or c.verification_deadline is null or c.verification_deadline<=now() then raise exception 'Verification window is closed'; end if;
 if c.assigned_to=auth.uid() then raise exception 'You cannot verify your own repair'; end if;
 insert into public.audit_votes(complaint_id,user_id,is_verified,feedback_notes,audit_round)
 values(p_complaint_id,auth.uid(),p_is_verified,p_feedback_notes,c.audit_round) on conflict(complaint_id,user_id,audit_round) do nothing;
 select count(*) filter(where is_verified),count(*) filter(where not is_verified) into yes,no from public.audit_votes where complaint_id=p_complaint_id and audit_round=c.audit_round;
 state := 'PENDING_VERIFICATION';
 if yes>=3 and yes>no then state := 'RESOLVED'; elsif no>=3 and no>yes then state := 'IN_PROGRESS'; end if;
 if state!='PENDING_VERIFICATION' then update public.complaints set status=state,resolved_at=case when state='RESOLVED' then now() else null end,verification_deadline=null where complaint_id=p_complaint_id; end if;
 return query select yes,no,state; end;
$$;
create or replace function public.can_read_photo(p_name text) returns boolean language sql stable security definer set search_path=public,extensions as $$
 select auth.uid() is not null and (
 public.get_my_staff_role() is not null or
 (public.is_citizen() and split_part(p_name,'/',1)=auth.uid()::text) or
 exists(select 1 from public.complaints c where public.can_view_ward(c.ward_id) and (right(c.image_url,length(p_name)+1)='/'||p_name or right(c.repair_image_url,length(p_name)+1)='/'||p_name)));
$$;
create or replace function public.can_delete_photo(p_name text) returns boolean language sql stable security definer set search_path=public,extensions as $$
 select auth.uid() is not null and split_part(p_name,'/',1)=auth.uid()::text and not exists(select 1 from public.complaints c where right(c.image_url,length(p_name)+1)='/'||p_name or right(c.repair_image_url,length(p_name)+1)='/'||p_name);
$$;
-- Existing canonical public-URL strings are preserved, but the bucket is private.
-- The application now signs authorized images instead of loading public URLs.
update storage.buckets set public=false where id='complaint-photos';
drop policy if exists mk_photo_insert on storage.objects;
drop policy if exists mk_photo_read on storage.objects;
drop policy if exists mk_photo_delete on storage.objects;
create policy mk_photo_insert on storage.objects for insert to authenticated with check(bucket_id='complaint-photos' and split_part(name,'/',1)=auth.uid()::text and (public.get_my_staff_role() is not null or public.is_citizen()));
create policy mk_photo_read on storage.objects for select to authenticated using(bucket_id='complaint-photos' and public.can_read_photo(name));
create policy mk_photo_delete on storage.objects for delete to authenticated using(bucket_id='complaint-photos' and public.can_delete_photo(name));
-- Read RPCs also require a real session; do not leave legacy anon grants behind.
do $$ declare r record;begin
 for r in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('is_citizen','get_my_ward_id','can_view_ward','get_ward_options','set_my_ward','get_citizen_context','can_read_photo','can_delete_photo','check_nearby_complaints','get_ward_for_location','get_ward_heatmap_data','get_complaints_in_bounds') loop
 execute format('revoke all on function %s from public,anon,authenticated',r.signature);execute format('grant execute on function %s to authenticated',r.signature);
 end loop;end $$;
create or replace function public.get_ward_for_location(lat double precision,lng double precision) returns integer language sql stable set search_path=public,extensions as $$
 select w.ward_id from public.wards w where not(w.ward_id=104 and w.zone_name='Live Demo')
 and ST_Covers(w.boundary::geometry,ST_SetSRID(ST_MakePoint(lng,lat),4326))
 order by ST_Area(w.boundary::geography),w.ward_id limit 1;
$$;
notify pgrst,'reload schema';
commit;
