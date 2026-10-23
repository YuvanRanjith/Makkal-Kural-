-- Run after creating admin@makkalkural.test in Authentication > Users.
-- Assigns app access to that existing account; it does not create a password.
begin;
do $$
declare demo_id uuid;
begin
 select id into demo_id from auth.users where lower(email)='admin@makkalkural.test';
 if demo_id is null then
  raise exception 'Create admin@makkalkural.test in Authentication > Users first, then rerun this script.';
 end if;
 if not exists(select 1 from auth.users where id=demo_id and email_confirmed_at is not null) then
  raise exception 'Enable Auto Confirm when creating this demo account, or confirm its email before assigning access.';
 end if;
 insert into public.staff_roles(user_id,role) values(demo_id,'admin')
 on conflict(user_id) do update set role=excluded.role;
end;
$$;
commit;
