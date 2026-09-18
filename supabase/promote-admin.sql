-- Run in Supabase SQL Editor as project owner AFTER creating your Auth user.
-- Replace the placeholder below with the user's actual UUID, not their email.
begin;
lock table public.profiles in exclusive mode;
do $$
declare chosen uuid := 'REPLACE_WITH_YOUR_AUTH_USER_UUID';
begin
 if not exists(select 1 from auth.users where id=chosen) then raise exception 'Auth user does not exist'; end if;
 insert into public.profiles(id) values(chosen) on conflict(id) do nothing;
 update public.profiles set role='viewer' where role='admin';
 update public.profiles set role='admin' where id=chosen;
 if (select count(*) from public.profiles where role='admin')<>1 then raise exception 'Exactly one admin is required'; end if;
end $$;
commit;
-- Verify:
select id,display_name,role from public.profiles where role='admin';

