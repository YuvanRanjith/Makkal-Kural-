-- Disposable local/CI database. Fixtures are rolled back.
begin;
set local search_path=public,extensions;
create function pg_temp.assert_ok(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAILED: %',message;end if;end $$;
create function pg_temp.denied(command text,expected text default null) returns void language plpgsql as $$
 declare failed boolean:=false;begin
 begin execute command;exception when others then failed:=true;if expected is not null and position(expected in sqlerrm)=0 then raise exception 'Wrong error: %',sqlerrm;end if;end;
 if not failed then raise exception 'Expected request to be denied: %',command;end if;end $$;
insert into auth.users(id,phone,is_anonymous) values
 ('10000000-0000-4000-8000-000000000001','919111111111',false),
 ('10000000-0000-4000-8000-000000000002','919222222222',false),
 ('10000000-0000-4000-8000-000000000003','919333333333',false),
 ('10000000-0000-4000-8000-000000000005',null,true);
insert into auth.users(id,email,is_anonymous) values('10000000-0000-4000-8000-000000000004','ward-admin@mk.invalid',false);
insert into public.staff_roles(user_id,role) values('10000000-0000-4000-8000-000000000004','admin');
insert into public.wards(ward_id,ward_name,zone_name,boundary) values
 (999997,'Ward A','Test',ST_Multi(ST_GeomFromText('POLYGON((80 13,81 13,81 14,80 14,80 13))',4326))),
 (999998,'Ward B','Test',ST_Multi(ST_GeomFromText('POLYGON((81 13,82 13,82 14,81 14,81 13))',4326)));
insert into public.users(user_id,ward_id,is_anonymous) values
 ('10000000-0000-4000-8000-000000000001',null,false),
 ('10000000-0000-4000-8000-000000000002',999998,false),
 ('10000000-0000-4000-8000-000000000003',999997,false);
insert into public.complaints(complaint_id,user_id,category,image_url,location,ward_id,assigned_to,created_at) values
 ('10000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','Pothole','https://test.invalid/storage/v1/object/public/complaint-photos/10000000-0000-4000-8000-000000000001/a.jpg',ST_SetSRID(ST_MakePoint(80.5,13.5),4326),999997,'10000000-0000-4000-8000-000000000004',now()-interval '16 minutes'),
 ('10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000002','Pothole','https://test.invalid/storage/v1/object/public/complaint-photos/10000000-0000-4000-8000-000000000002/b.jpg',ST_SetSRID(ST_MakePoint(81.5,13.5),4326),999998,'10000000-0000-4000-8000-000000000004',now()-interval '16 minutes'),
 ('10000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000003','Pothole','https://test.invalid/storage/v1/object/public/complaint-photos/10000000-0000-4000-8000-000000000003/c.jpg',ST_SetSRID(ST_MakePoint(80.6,13.5),4326),999997,'10000000-0000-4000-8000-000000000004',now()-interval '16 minutes');
set local role anon;
select pg_temp.denied('select * from public.complaint_details');
select pg_temp.denied('select public.get_ward_heatmap_data()');
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.assert_ok((select count(*)>=3 from public.complaint_details),'citizen can browse community areas without a home ward');
select pg_temp.assert_ok((select count(*)>=1 from public.complaint_details where ward_id=999998),'other areas available to citizen browsing');
select pg_temp.assert_ok((select bool_and(assigned_to is null) from public.complaint_details),'staff assignment IDs redacted');
select pg_temp.assert_ok((select user_id is null from public.complaint_details where complaint_id='10000000-0000-4000-8000-000000000013'),'other citizen identity redacted');
select pg_temp.denied('select assigned_to from public.complaints');
select pg_temp.denied('select * from public.get_staff_members()','Admin access required');
select pg_temp.assert_ok((select count(*)>=2 from public.get_ward_heatmap_data()),'heatmap supports area browsing');
select pg_temp.assert_ok((select count(*)>=1 from public.check_nearby_complaints(13.5,81.5,15)),'nearby search follows coordinates instead of home ward');
select public.endorse_complaint('10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001');
select pg_temp.assert_ok(public.can_read_photo('10000000-0000-4000-8000-000000000002/b.jpg'),'community evidence available after authorized login');
select public.create_report('Garbage','Cooldown test','https://test.invalid/storage/v1/object/public/complaint-photos/10000000-0000-4000-8000-000000000001/test.jpg',13.5,80.5,'10000000-0000-4000-8000-000000000021',null);
-- A retry returns the existing report, without consuming another allowance.
select public.create_report('Garbage','Cooldown test','https://test.invalid/storage/v1/object/public/complaint-photos/10000000-0000-4000-8000-000000000001/test.jpg',13.5,80.5,'10000000-0000-4000-8000-000000000021',null);
select pg_temp.assert_ok((select count(*)=1 from public.complaint_details where request_id='10000000-0000-4000-8000-000000000021'),'idempotent retry during cooldown');
select pg_temp.denied($q$select public.create_report('Garbage','Too soon','https://test.invalid/storage/v1/object/public/complaint-photos/10000000-0000-4000-8000-000000000001/test2.jpg',13.5,80.5,'10000000-0000-4000-8000-000000000022',null)$q$,'REPORT_COOLDOWN');
reset role;
update public.complaints set created_at=now()-interval '15 minutes' where request_id='10000000-0000-4000-8000-000000000021';
set local role authenticated;
select public.create_report('Garbage','Report outside original home ward','https://test.invalid/storage/v1/object/public/complaint-photos/10000000-0000-4000-8000-000000000001/test2.jpg',13.5,81.5,'10000000-0000-4000-8000-000000000022',null);
select pg_temp.assert_ok((select ward_id=999998 from public.complaint_details where request_id='10000000-0000-4000-8000-000000000022'),'report routed from issue GPS');
reset role;
update public.complaints set created_at=now()-interval '16 minutes' where request_id='10000000-0000-4000-8000-000000000022';
set local role authenticated;
select public.create_report('Garbage','Unmapped location','https://test.invalid/storage/v1/object/public/complaint-photos/10000000-0000-4000-8000-000000000001/unmapped.jpg',0,0,'10000000-0000-4000-8000-000000000024',null);
select pg_temp.assert_ok((select ward_id is null from public.complaint_details where request_id='10000000-0000-4000-8000-000000000024'),'unmapped report saved for review');
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated","is_anonymous":true}',true);
set local role authenticated;
select pg_temp.assert_ok((select count(*)=0 from public.complaint_details),'legacy anonymous sessions cannot read reports');
select pg_temp.denied('select public.get_citizen_context()','Citizen login required');
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.assert_ok((select count(*)>=1 from public.complaint_details where ward_id=999998),'staff retain cross-ward work access');
select pg_temp.assert_ok((select assigned_to is not null from public.complaint_details where complaint_id='10000000-0000-4000-8000-000000000012'),'staff retain assignment details');
reset role;
select pg_temp.assert_ok((select not public from storage.buckets where id='complaint-photos'),'evidence bucket is private');
rollback;
