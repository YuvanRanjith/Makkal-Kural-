-- Run once in Supabase SQL Editor after schema.sql. Requires Supabase Cron/pg_cron.
create extension if not exists pg_cron;
do $$ begin
 if exists(select 1 from cron.job where jobname='makkal-kural-expired-audits') then perform cron.unschedule('makkal-kural-expired-audits'); end if;
end $$;
select cron.schedule('makkal-kural-expired-audits','*/5 * * * *','select public.process_expired_audits();');
