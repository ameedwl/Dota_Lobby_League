-- MANUAL, ONE-TIME REWARD TEST RESET. Review before running as SQL owner.
-- Clears ONLY reward instances and their correction/reroll audit records.
-- Keeps ALL matches, players, participation, heroes, drafts, awards, screenshots,
-- OpenDota IDs, ordinary statistics and auth data completely untouched.
-- The newest CURRENT match (played_at DESC, id ASC) becomes the INCLUDED baseline.
-- Older matches remain untouched and count for all normal league statistics.
-- First apply migrations/202610100001_reward_milestones_rerolls.sql separately.
-- DO NOT put this file in migrations or execute automatically on deployment.
begin;
select pg_advisory_xact_lock(61004,1);
do $$ declare latest public.matches; begin
 select * into latest from public.matches order by played_at desc,id asc limit 1;
 if not found then raise exception 'No matches exist. Nothing was reset.'; end if;
 if exists(select 1 from public.reward_system_settings where baseline_match_snapshot is not null) then
  raise exception 'A reward baseline already exists. This one-time reset will not clear the new era again.';
 end if;
 if not exists(select 1 from public.reward_system_settings where id=true) then raise exception 'Reward settings missing. Nothing was reset.'; end if;
 delete from public.reward_admin_audit;
 delete from public.reward_rolls;
 update public.reward_system_settings set baseline_match_id=latest.id,baseline_match_snapshot=latest.id,
 baseline_played_at=latest.played_at,updated_at=clock_timestamp(),updated_by=auth.uid() where id=true;
end; $$;
commit;
-- Review these results: newest baseline winner participants start at 1; losers at 0.
select baseline_match_id,baseline_played_at,updated_at from public.reward_system_settings;
select p.nickname,s.current_streak from public.reward_streaks() s join public.players p on p.id=s.player_id order by p.nickname;
