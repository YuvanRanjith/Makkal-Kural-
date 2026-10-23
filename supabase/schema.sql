-- Makkal Kural: fresh setup and upgrade of the original schema.
-- Run as postgres in the Supabase SQL Editor after taking a database backup.
-- Legacy reports are retained; old unauthenticated guest IDs are not claimable.
begin;
create extension if not exists postgis;
create extension if not exists pgcrypto;
revoke create on schema public from public,anon,authenticated;
set local search_path = public, extensions;
create table if not exists public.users (
 user_id uuid primary key default gen_random_uuid(), masked_phone varchar(40), is_anonymous boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.wards (
 ward_id integer primary key, ward_name varchar(200) not null, zone_name varchar(200) not null, boundary geometry(MultiPolygon,4326) not null
);
create table if not exists public.complaints (
 complaint_id uuid primary key default gen_random_uuid(), user_id uuid references public.users(user_id), category varchar(40) not null,
 description text, image_url text not null, repair_image_url text, location geography(Point,4326) not null, ward_id integer references public.wards(ward_id),
 status varchar(30) not null default 'OPEN', upvote_count integer not null default 0, created_at timestamptz not null default now(), verification_deadline timestamptz
);
create table if not exists public.complaint_endorsements (
 endorsement_id uuid primary key default gen_random_uuid(), complaint_id uuid references public.complaints(complaint_id) on delete cascade,
 user_id uuid references public.users(user_id), created_at timestamptz not null default now()
);
create table if not exists public.audit_votes (
 vote_id uuid primary key default gen_random_uuid(), complaint_id uuid references public.complaints(complaint_id) on delete cascade,
 user_id uuid references public.users(user_id), is_verified boolean not null, feedback_notes text, created_at timestamptz not null default now()
);
alter table public.complaints add column if not exists assigned_to uuid references auth.users(id);
alter table public.complaints add column if not exists resolved_at timestamptz;
alter table public.complaints add column if not exists request_id uuid;
alter table public.complaints add column if not exists audit_round integer not null default 0;
alter table public.audit_votes add column if not exists audit_round integer not null default 0;
create table if not exists public.staff_roles (
 user_id uuid primary key references auth.users(id) on delete cascade, role text not null check(role in ('admin','contractor'))
);
create unique index if not exists unique_endorsement_per_user_idx on public.complaint_endorsements(complaint_id,user_id);
alter table public.audit_votes drop constraint if exists unique_vote_per_user;
-- Older databases may have an automatically named two-column vote uniqueness
-- constraint/index. Replace every such key with per-repair-round uniqueness.
do $$ declare r record; begin
 for r in select k.conname from pg_constraint k where k.conrelid='public.audit_votes'::regclass and k.contype='u'
 and (select array_agg(a.attname::text order by a.attname::text) from unnest(k.conkey) key(attnum) join pg_attribute a on a.attrelid=k.conrelid and a.attnum=key.attnum)=array['complaint_id','user_id'] loop
 execute format('alter table public.audit_votes drop constraint %I',r.conname);
 end loop;
 for r in select idx.relname from pg_index i join pg_class idx on idx.oid=i.indexrelid where i.indrelid='public.audit_votes'::regclass and i.indisunique and not i.indisprimary and i.indnkeyatts=2
 and not exists(select 1 from pg_constraint k where k.conindid=i.indexrelid)
 and (select array_agg(a.attname::text order by a.attname::text) from unnest(i.indkey::smallint[]) with ordinality key(attnum,ord) join pg_attribute a on a.attrelid=i.indrelid and a.attnum=key.attnum where key.ord<=i.indnkeyatts)=array['complaint_id','user_id'] loop
 execute format('drop index public.%I',r.relname);
 end loop;
end $$;
create unique index if not exists unique_vote_per_round_idx on public.audit_votes(complaint_id,user_id,audit_round);
create unique index if not exists unique_report_request_idx on public.complaints(user_id,request_id);
create index if not exists complaints_location_idx on public.complaints using gist(location);
create index if not exists wards_boundary_idx on public.wards using gist(boundary);
create index if not exists complaints_status_idx on public.complaints(status);
create index if not exists complaints_owner_idx on public.complaints(user_id,created_at desc);
create index if not exists complaints_ward_id_idx on public.complaints(ward_id);
create index if not exists complaints_deadline_idx on public.complaints(verification_deadline) where status='PENDING_VERIFICATION';

-- Read views expose numeric coordinates consistently; RLS remains on the tables.
create or replace view public.complaint_details with (security_invoker=true) as
 select c.complaint_id,c.user_id,c.category,c.description,c.image_url,c.repair_image_url,
 ST_Y(c.location::geometry) as latitude,ST_X(c.location::geometry) as longitude,
 c.ward_id,w.ward_name,c.status,c.upvote_count,c.created_at,c.verification_deadline,c.assigned_to,c.resolved_at,c.audit_round,c.request_id
 from public.complaints c left join public.wards w on w.ward_id=c.ward_id;

-- Remove the original public policies and any policies on these app-owned tables.
do $$ declare r record; begin
 for r in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('users','wards','complaints','complaint_endorsements','audit_votes','staff_roles') loop
 execute format('drop policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
 end loop;
end $$;
alter table public.users enable row level security;
alter table public.wards enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_endorsements enable row level security;
alter table public.audit_votes enable row level security;
alter table public.staff_roles enable row level security;
revoke all on public.users,public.wards,public.complaints,public.complaint_endorsements,public.audit_votes,public.staff_roles from anon,authenticated;
grant select on public.complaints,public.wards,public.complaint_details to anon,authenticated;
grant select on public.users,public.audit_votes,public.complaint_endorsements,public.staff_roles to authenticated;
create policy read_complaints on public.complaints for select to anon,authenticated using(true);
create policy read_wards on public.wards for select to anon,authenticated using(true);
create policy own_profile on public.users for select to authenticated using(user_id=(select auth.uid()));
create policy own_votes on public.audit_votes for select to authenticated using(user_id=(select auth.uid()));
create policy own_endorsements on public.complaint_endorsements for select to authenticated using(user_id=(select auth.uid()));
create policy own_staff_role on public.staff_roles for select to authenticated using(user_id=(select auth.uid()));

create or replace function public.get_my_staff_role() returns text language sql stable security definer set search_path=public,extensions as $$
 select role from public.staff_roles where user_id=auth.uid();
$$;
create or replace function public.ensure_user() returns uuid language plpgsql security definer set search_path=public,extensions as $$
 declare uid uuid := auth.uid(); begin
 if uid is null then raise exception 'Authentication required'; end if;
 insert into public.users(user_id,is_anonymous) values(uid,coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) on conflict(user_id) do nothing;
 return uid;
 end;
$$;
-- Compatibility function uses the authenticated identity, never a random supplied ID.
create or replace function public.create_anonymous_user() returns uuid language sql security definer set search_path=public,extensions as $$ select public.ensure_user(); $$;
create or replace function public.update_user_phone(p_user_id uuid,p_masked_phone varchar) returns void language plpgsql security definer set search_path=public,extensions as $$
 begin
 if auth.uid() is null or p_user_id is distinct from auth.uid() then raise exception 'Not your profile'; end if;
 if p_masked_phone is not null and p_masked_phone !~ '^\+[0-9]{1,5} [0-9]{2}\*{6}[0-9]{2}$' then raise exception 'Invalid masked phone'; end if;
 perform public.ensure_user(); update public.users set masked_phone=p_masked_phone where user_id=auth.uid();
 end;
$$;
-- 7. RPC: get_ward_for_location
create or replace function get_ward_for_location(
  lat double precision,
  lng double precision
)
returns integer
language sql
stable
set search_path=public,extensions
as $$
  select ward_id
  from public.wards
  where ST_Covers(
    boundary::geometry,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)
  )
  limit 1;
$$;

-- 8. RPC: check_nearby_complaints (15m proximity check)
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
  where c.status in ('OPEN', 'IN_PROGRESS')
    and ST_DWithin(
      c.location::geography,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      least(greatest(radius_meters,1),100)
    )
  order by distance_meters asc
  limit 5;
$$;


create or replace function public.create_report(p_category varchar,p_description text,p_image_url text,p_lat double precision,p_lng double precision,p_request_id uuid,p_masked_phone varchar default null)
 returns jsonb language plpgsql security definer set search_path=public,extensions as $$
 declare uid uuid; c public.complaints; begin
 uid := public.ensure_user();
 if p_category is null or p_category not in ('Pothole','Streetlight','Drainage','Garbage','Other') or length(coalesce(p_description,''))>2000 then raise exception 'Invalid report'; end if;
 if p_lat is null or p_lng is null or not(p_lat between -90 and 90) or not(p_lng between -180 and 180) or p_request_id is null then raise exception 'Invalid location or request'; end if;
 if p_image_url is null or p_image_url not like '%/storage/v1/object/public/complaint-photos/'||uid::text||'/%' then raise exception 'Image must belong to your session'; end if;
 if p_masked_phone is not null then perform public.update_user_phone(uid,p_masked_phone); end if;
 insert into public.complaints(user_id,category,description,image_url,location,ward_id,request_id)
 values(uid,p_category,p_description,p_image_url,ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326),public.get_ward_for_location(p_lat,p_lng),p_request_id)
 on conflict(user_id,request_id) do nothing returning * into c;
 if c.complaint_id is null then select * into c from public.complaints where user_id=uid and request_id=p_request_id; end if;
 return to_jsonb(c) - 'location' || jsonb_build_object('latitude',ST_Y(c.location::geometry),'longitude',ST_X(c.location::geometry));
 end;
$$;
-- Harden the old entry point too, so an upgrade does not leave an open RPC.
create or replace function public.create_complaint(p_user_id uuid,p_category varchar,p_description text,p_image_url text,p_lat double precision,p_lng double precision)
 returns public.complaints language plpgsql security definer set search_path=public,extensions as $$
 declare result jsonb; c public.complaints; begin
 if auth.uid() is null or p_user_id is distinct from auth.uid() then raise exception 'Not your profile'; end if;
 result := public.create_report(p_category,p_description,p_image_url,p_lat,p_lng,gen_random_uuid(),null);
 select * into c from public.complaints where complaint_id=(result->>'complaint_id')::uuid;
 return c; end;
$$;
drop trigger if exists trg_increment_upvote on public.complaint_endorsements;
create or replace function public.increment_upvote_count() returns trigger language plpgsql security definer set search_path=public,extensions as $$
 begin update public.complaints set upvote_count=upvote_count+1 where complaint_id=new.complaint_id; return new; end;
$$;
create trigger trg_increment_upvote after insert on public.complaint_endorsements for each row execute function public.increment_upvote_count();
create or replace function public.endorse_complaint(p_complaint_id uuid,p_user_id uuid) returns integer language plpgsql security definer set search_path=public,extensions as $$
 declare count integer; c public.complaints; begin
 if auth.uid() is null or p_user_id is distinct from auth.uid() then raise exception 'Not your profile'; end if;
 perform public.ensure_user();
 select * into c from public.complaints where complaint_id=p_complaint_id for update;
 if c.complaint_id is null or c.status not in ('OPEN','IN_PROGRESS') then raise exception 'Issue is not open for endorsement'; end if;
 insert into public.complaint_endorsements(complaint_id,user_id) values(p_complaint_id,auth.uid()) on conflict(complaint_id,user_id) do nothing;
 select upvote_count into count from public.complaints where complaint_id=p_complaint_id; return count;
 end;
$$;
create or replace function public.start_work(p_complaint_id uuid) returns void language plpgsql security definer set search_path=public,extensions as $$
 begin
 if public.get_my_staff_role() is null then raise exception 'Staff access required'; end if;
 update public.complaints set status='IN_PROGRESS',assigned_to=auth.uid(),resolved_at=null where complaint_id=p_complaint_id and status='OPEN';
 if not found then raise exception 'This issue has already been assigned or is not open'; end if;
 end;
$$;
create or replace function public.submit_repair_proof(p_complaint_id uuid,p_repair_image_url text) returns public.complaints language plpgsql security definer set search_path=public,extensions as $$
 declare c public.complaints; role text; begin
 role := public.get_my_staff_role();
 if role is null then raise exception 'Staff access required'; end if;
 select * into c from public.complaints where complaint_id=p_complaint_id for update;
 if c.complaint_id is null or c.status!='IN_PROGRESS' then raise exception 'Only in-progress work can be submitted'; end if;
 if role!='admin' and c.assigned_to is distinct from auth.uid() then raise exception 'This work is assigned to another contractor'; end if;
 if p_repair_image_url is null or p_repair_image_url not like '%/storage/v1/object/public/complaint-photos/'||auth.uid()::text||'/repair-%' then raise exception 'Upload your repair photo first'; end if;
 update public.complaints set repair_image_url=p_repair_image_url,status='PENDING_VERIFICATION',verification_deadline=now()+interval '48 hours',audit_round=audit_round+1,resolved_at=null where complaint_id=p_complaint_id returning * into c;
 return c; end;
$$;
create or replace function public.cast_audit_vote(p_complaint_id uuid,p_user_id uuid,p_is_verified boolean,p_feedback_notes text default null)
 returns table(confirm_votes bigint,reject_votes bigint,new_status varchar) language plpgsql security definer set search_path=public,extensions as $$
 declare c public.complaints; yes bigint; no bigint; state varchar; begin
 if auth.uid() is null or p_user_id is distinct from auth.uid() then raise exception 'Not your profile'; end if;
 if p_is_verified is null or length(coalesce(p_feedback_notes,''))>2000 then raise exception 'Invalid vote'; end if;
 perform public.ensure_user();
 select * into c from public.complaints where complaint_id=p_complaint_id for update;
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
create or replace function public.process_expired_audits() returns void language plpgsql security definer set search_path=public,extensions as $$
 declare c public.complaints; yes bigint; no bigint; begin
 for c in select * from public.complaints where status='PENDING_VERIFICATION' and verification_deadline<=now() for update skip locked loop
 select count(*) filter(where is_verified),count(*) filter(where not is_verified) into yes,no from public.audit_votes where complaint_id=c.complaint_id and audit_round=c.audit_round;
 -- No-vote, tied, or rejected repairs return to work; never silently resolve.
 update public.complaints set status=case when yes>no then 'RESOLVED' else 'IN_PROGRESS' end,resolved_at=case when yes>no then now() else null end,verification_deadline=null where complaint_id=c.complaint_id;
 end loop; end;
$$;
-- The legacy RPC has fewer OUT columns; PostgreSQL requires dropping it before replacing its return type.
drop function if exists public.get_ward_heatmap_data();
create or replace function public.get_ward_heatmap_data() returns table(ward_id integer,ward_name varchar,zone_name varchar,open_count bigint,in_progress_count bigint,pending_count bigint,rejected_count bigint,resolved_count bigint,total_count bigint,avg_resolution_hours numeric,health_score integer,boundary_geojson text)
 language sql stable set search_path=public,extensions as $$
 select w.ward_id,w.ward_name::varchar,w.zone_name::varchar,
 count(c.complaint_id) filter(where c.status='OPEN'),count(c.complaint_id) filter(where c.status='IN_PROGRESS'),
 count(c.complaint_id) filter(where c.status='PENDING_VERIFICATION'),count(c.complaint_id) filter(where c.status='REJECTED'),
 count(c.complaint_id) filter(where c.status='RESOLVED'),count(c.complaint_id),
 round(avg(extract(epoch from(c.resolved_at-c.created_at))/3600) filter(where c.status='RESOLVED' and c.resolved_at is not null),1),
 case when count(c.complaint_id)=0 then 100 else round(100.0*count(c.complaint_id) filter(where c.status='RESOLVED')/count(c.complaint_id))::integer end,
 ST_AsGeoJSON(w.boundary::geometry) from public.wards w left join public.complaints c on c.ward_id=w.ward_id group by w.ward_id,w.ward_name,w.zone_name,w.boundary;
$$;
-- Return the coordinate view for legacy map RPC clients too.
drop function if exists public.get_complaints_in_bounds(double precision,double precision,double precision,double precision);
create function public.get_complaints_in_bounds(min_lat double precision,min_lng double precision,max_lat double precision,max_lng double precision)
 returns setof public.complaint_details language sql stable set search_path=public,extensions as $$
 select * from public.complaint_details where latitude between min_lat and max_lat and longitude between min_lng and max_lng order by created_at desc limit 500;
$$;


create or replace function public.get_staff_members() returns table(user_id uuid,email text,role text) language plpgsql stable security definer set search_path=public,extensions as $$
 begin
 if public.get_my_staff_role() is distinct from 'admin' then raise exception 'Admin access required'; end if;
 return query select s.user_id,u.email::text,s.role from public.staff_roles s join auth.users u on u.id=s.user_id order by u.email;
 end;
$$;
create or replace function public.assign_work(p_complaint_id uuid,p_staff_id uuid) returns void language plpgsql security definer set search_path=public,extensions as $$
 begin
 if public.get_my_staff_role() is distinct from 'admin' then raise exception 'Admin access required'; end if;
 if not exists(select 1 from public.staff_roles where user_id=p_staff_id) then raise exception 'Choose an authorized staff member'; end if;
 update public.complaints set status='IN_PROGRESS',assigned_to=p_staff_id,resolved_at=null where complaint_id=p_complaint_id and status in ('OPEN','IN_PROGRESS');
 if not found then raise exception 'Only open or in-progress work can be assigned'; end if;
 end;
$$;

-- Only grant the intended RPCs; trigger/maintenance functions cannot be called by clients.
do $$ declare r record; begin
 for r in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('ensure_user','create_anonymous_user','update_user_phone','get_ward_for_location','check_nearby_complaints','create_report','create_complaint','increment_upvote_count','endorse_complaint','start_work','submit_repair_proof','cast_audit_vote','process_expired_audits','get_ward_heatmap_data','get_complaints_in_bounds','get_my_staff_role','get_staff_members','assign_work') loop
 execute format('revoke all on function %s from public,anon,authenticated',r.signature);
 if r.proname in ('get_ward_for_location','check_nearby_complaints','get_ward_heatmap_data','get_complaints_in_bounds') then execute format('grant execute on function %s to anon,authenticated',r.signature);
 elsif r.proname not in ('ensure_user','increment_upvote_count','process_expired_audits') then execute format('grant execute on function %s to authenticated',r.signature); end if;
 end loop;
end $$;
grant execute on function public.process_expired_audits() to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('complaint-photos','complaint-photos',true,8388608,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Public can upload complaint photos" on storage.objects;
drop policy if exists "Public can view complaint photos" on storage.objects;
drop policy if exists mk_photo_insert on storage.objects;
drop policy if exists mk_photo_read on storage.objects;
drop policy if exists mk_photo_delete on storage.objects;
create policy mk_photo_insert on storage.objects for insert to authenticated with check(bucket_id='complaint-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy mk_photo_read on storage.objects for select to authenticated using(bucket_id='complaint-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy mk_photo_delete on storage.objects for delete to authenticated using(bucket_id='complaint-photos' and (storage.foldername(name))[1]=auth.uid()::text and not exists(select 1 from public.complaints c where c.image_url like '%/complaint-photos/'||storage.objects.name or c.repair_image_url like '%/complaint-photos/'||storage.objects.name));

-- Citizen access rules, GPS routing and cooldown.
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
