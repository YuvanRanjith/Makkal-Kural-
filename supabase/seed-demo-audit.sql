-- College presentation sample. Run in Supabase SQL Editor after schema.sql.
-- Creates/resets only this clearly labelled sample; existing real reports stay unchanged.
-- Re-run just before presenting to start a fresh 48-hour sample window.
begin;
set local search_path=public,extensions;
do $$
declare
 demo_id uuid := 'b4e46fce-c707-4f91-82b5-9b757725239f';
 demo_request uuid := 'd9cbb7fe-e5aa-4e15-a94e-a92951ee5235';
 demo_staff uuid;
begin
 select s.user_id into demo_staff from public.staff_roles s
 join auth.users a on a.id=s.user_id where s.role='admin'
 order by case when lower(a.email)='admin@makkalkural.test' then 0 else 1 end,s.user_id limit 1;
 if demo_staff is null then raise exception 'Create your demo staff account and run setup-demo-admin.sql first.'; end if;
 if exists(select 1 from public.complaints where complaint_id=demo_id and
 (request_id is distinct from demo_request or description is null or description not like '[Presentation sample]%')) then
 raise exception 'Sample ID is already used by another report; no changes made.';
 end if;
 insert into public.users(user_id,is_anonymous) values(demo_staff,false) on conflict(user_id) do nothing;
 insert into public.complaints(complaint_id,user_id,category,description,image_url,repair_image_url,location,ward_id,status,upvote_count,created_at,verification_deadline,assigned_to,resolved_at,audit_round,request_id)
 values(demo_id,demo_staff,'Pothole','[Presentation sample] A pothole reported near Kilpauk. The sample repair is ready for citizen verification. Before/after images are illustrations for the college demonstration.',
 '/demo/audit-before.svg','/demo/audit-after.svg',ST_SetSRID(ST_MakePoint(80.245,13.087),4326),public.get_ward_for_location(13.087,80.245),
 'PENDING_VERIFICATION',0,now(),now()+interval '48 hours',demo_staff,null,1,demo_request)
 on conflict(complaint_id) do update set
 description=excluded.description,image_url=excluded.image_url,repair_image_url=excluded.repair_image_url,
 status='PENDING_VERIFICATION',verification_deadline=now()+interval '48 hours',assigned_to=demo_staff,
 resolved_at=null,audit_round=public.complaints.audit_round+1;
end;
$$;
commit;
select complaint_id,status,verification_deadline,audit_round from public.complaints where complaint_id='b4e46fce-c707-4f91-82b5-9b757725239f';
