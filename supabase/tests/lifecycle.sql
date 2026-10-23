-- Disposable database only. Every fixture is rolled back.
begin;
set local search_path=public,extensions;
create function pg_temp.assert_ok(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAILED: %',message; end if; end $$;
create function pg_temp.must_fail(command text,message text) returns void language plpgsql as $$
 declare failed boolean := false; begin
 begin execute command; exception when others then failed := true; end;
 if not failed then raise exception 'FAILED: expected denial: %',message; end if;
 end;
$$;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000001','citizen1@mk.invalid'),
 ('00000000-0000-4000-8000-000000000002','citizen2@mk.invalid'),
 ('00000000-0000-4000-8000-000000000003','citizen3@mk.invalid'),
 ('00000000-0000-4000-8000-000000000004','citizen4@mk.invalid'),
 ('00000000-0000-4000-8000-000000000005','contractor@mk.invalid'),
 ('00000000-0000-4000-8000-000000000006','othercontractor@mk.invalid'),
 ('00000000-0000-4000-8000-000000000007','admin@mk.invalid');
update auth.users set phone='91900000000'||right(id::text,1),is_anonymous=false where id in('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004');
insert into public.staff_roles(user_id,role) values('00000000-0000-4000-8000-000000000005','contractor'),('00000000-0000-4000-8000-000000000006','contractor'),('00000000-0000-4000-8000-000000000007','admin');
insert into public.wards(ward_id,ward_name,zone_name,boundary) values(999999,'Test ward','Test zone',ST_Multi(ST_GeomFromText('POLYGON((80 13,81 13,81 14,80 14,80 13))',4326)));
insert into public.users(user_id,ward_id,is_anonymous) select id,999999,false from auth.users where id in('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004') on conflict(user_id) do update set ward_id=excluded.ward_id;
-- Anonymous API clients cannot read private data or invoke mutations.
set local role anon;
select pg_temp.must_fail($q$select public.create_anonymous_user()$q$,'unauthenticated mutation');
select pg_temp.must_fail($q$update public.complaints set status='RESOLVED'$q$,'direct anonymous update');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',true);
set local role authenticated;
select public.create_anonymous_user();
select public.create_report('Pothole','Test issue','https://test.invalid/storage/v1/object/public/complaint-photos/00000000-0000-4000-8000-000000000001/test.jpg',13.5,80.5,'00000000-0000-4000-8000-000000000011',null);
select pg_temp.must_fail($q$select public.get_staff_members()$q$,'citizen staff directory access');
select pg_temp.assert_ok((select count(*)=1 from public.check_nearby_complaints(13.5,80.5,15) where complaint_id in(select complaint_id from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011')),'nearby complaint at same coordinates');
select pg_temp.assert_ok((select count(*)=0 from public.check_nearby_complaints(13.501,80.5,15) where complaint_id in(select complaint_id from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011')),'15-metre search excludes point roughly 110 metres away');
-- Idempotent replay yields one row.
select public.create_report('Pothole','Test issue','https://test.invalid/storage/v1/object/public/complaint-photos/00000000-0000-4000-8000-000000000001/test.jpg',13.5,80.5,'00000000-0000-4000-8000-000000000011',null);
select pg_temp.assert_ok((select count(*)=1 from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011'),'idempotent report');
select pg_temp.assert_ok((select latitude=13.5 and longitude=80.5 from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011'),'numeric coordinate contract');
select pg_temp.assert_ok((select ward_id=999999 from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011'),'automatic ward assignment');
select pg_temp.must_fail($q$select public.update_user_phone('00000000-0000-4000-8000-000000000002','+91 98******10')$q$,'profile spoofing');
select pg_temp.must_fail($q$update public.complaints set status='RESOLVED'$q$,'authenticated direct update');
select pg_temp.must_fail($q$insert into public.staff_roles(user_id,role) values('00000000-0000-4000-8000-000000000001','admin')$q$,'role escalation');
select public.endorse_complaint((select complaint_id from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011'),'00000000-0000-4000-8000-000000000001');
select public.endorse_complaint((select complaint_id from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011'),'00000000-0000-4000-8000-000000000001');
select pg_temp.assert_ok((select upvote_count=1 from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011'),'unique endorsement');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
set local role authenticated;
select public.start_work((select complaint_id from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011'));
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.must_fail($q$select public.submit_repair_proof((select complaint_id from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011'),'https://test.invalid/storage/v1/object/public/complaint-photos/00000000-0000-4000-8000-000000000006/repair-test.jpg')$q$,'another contractor repair');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
set local role authenticated;
select public.submit_repair_proof((select complaint_id from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011'),'https://test.invalid/storage/v1/object/public/complaint-photos/00000000-0000-4000-8000-000000000005/repair-test.jpg');
select pg_temp.must_fail($q$select public.cast_audit_vote((select complaint_id from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011'),'00000000-0000-4000-8000-000000000005',true)$q$,'self verification');
reset role;
-- Expiry with no votes returns the issue to work.
update public.complaints set verification_deadline=now()-interval '1 minute' where request_id='00000000-0000-4000-8000-000000000011';
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.must_fail($q$select public.cast_audit_vote((select complaint_id from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011'),'00000000-0000-4000-8000-000000000001',true)$q$,'expired vote');
reset role;
select public.process_expired_audits();
select pg_temp.assert_ok((select status='IN_PROGRESS' from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011'),'zero-vote expiry');
-- A second repair opens a new round and three citizens can resolve it.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
set local role authenticated;
select public.submit_repair_proof((select complaint_id from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011'),'https://test.invalid/storage/v1/object/public/complaint-photos/00000000-0000-4000-8000-000000000005/repair-second.jpg');
reset role;
do $$ declare uid uuid; cid uuid; begin
 select complaint_id into cid from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011';
 foreach uid in array array['00000000-0000-4000-8000-000000000001'::uuid,'00000000-0000-4000-8000-000000000002'::uuid,'00000000-0000-4000-8000-000000000003'::uuid] loop
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid::text,'role','authenticated')::text,true);
 perform public.cast_audit_vote(cid,uid,true,null);
 end loop;
end $;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.assert_ok((select status='RESOLVED' and resolved_at is not null and audit_round=2 from public.complaint_details where request_id='00000000-0000-4000-8000-000000000011'),'three confirmations resolve second repair');
select pg_temp.assert_ok((select resolved_count=1 and health_score=100 from public.get_ward_heatmap_data() where ward_id=999999),'heatmap aggregate');
-- Age the first report so the separate assignment scenario is outside the cooldown.
update public.complaints set created_at=now()-interval '16 minutes' where request_id='00000000-0000-4000-8000-000000000011';
-- Administrator can assign work, while citizens and contractors cannot.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.create_report('Garbage','Assignment test','https://test.invalid/storage/v1/object/public/complaint-photos/00000000-0000-4000-8000-000000000001/test2.jpg',13.5,80.5,'00000000-0000-4000-8000-000000000012',null);
select pg_temp.must_fail($q$select public.assign_work((select complaint_id from public.complaint_details where request_id='00000000-0000-4000-8000-000000000012'),'00000000-0000-4000-8000-000000000005')$q$,'citizen assignment');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.assert_ok((select count(*)=3 from public.get_staff_members()),'admin staff directory');
select public.assign_work((select complaint_id from public.complaint_details where request_id='00000000-0000-4000-8000-000000000012'),'00000000-0000-4000-8000-000000000005');
select pg_temp.assert_ok((select assigned_to='00000000-0000-4000-8000-000000000005' and status='IN_PROGRESS' from public.complaint_details where request_id='00000000-0000-4000-8000-000000000012'),'admin assignment');
reset role;
rollback;
