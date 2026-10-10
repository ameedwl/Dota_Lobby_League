-- Reward System V2. Forward-only; does NOT reset reward data or choose a baseline.
-- After review/apply, manually run ../reset-rewards-to-latest-match.sql separately.
begin;
create table public.reward_system_settings (
 id boolean primary key default true check(id),
 baseline_match_id uuid references public.matches(id) on delete set null,
 baseline_match_snapshot uuid,
 baseline_played_at timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 updated_by uuid references auth.users(id) on delete set null,
 check((baseline_match_snapshot is null)=(baseline_played_at is null))
);
insert into public.reward_system_settings(id) values(true);
alter table public.reward_system_settings enable row level security;
revoke all on public.reward_system_settings from public,anon,authenticated;
grant select on public.reward_system_settings to anon,authenticated;
create policy public_reward_settings on public.reward_system_settings for select to anon,authenticated using(true);
-- Only the manually reviewed SQL reset may set the baseline in V2.
alter table public.reward_rolls alter column qualifying_match_snapshot drop not null;
alter table public.reward_rolls
 add column source_type text not null default 'STREAK_MILESTONE' check(source_type in ('STREAK_MILESTONE','ADMIN_GRANT')),
 add column streak_milestone integer default 3,
 add column reroll_count integer not null default 0 check(reroll_count>=0),
 add column revision integer not null default 0 check(revision>=0),
 add column grant_reason text,
 add column grant_request_id uuid unique,
 add constraint reward_source_valid check(
  (source_type='STREAK_MILESTONE' and qualifying_match_snapshot is not null and streak_milestone is not null and streak_milestone>0 and streak_milestone%3=0 and grant_request_id is null)
  or (source_type='ADMIN_GRANT' and qualifying_match_snapshot is null and qualifying_match_id is null and streak_milestone is null and grant_request_id is not null)
 );
-- Keep the existing stronger UNIQUE(player_id,qualifying_match_snapshot): one
-- milestone per player/match, even if a historical edit changes its streak length.
create table public.reward_admin_audit (
 id uuid primary key default gen_random_uuid(),
 reward_id uuid not null references public.reward_rolls(id) on delete cascade,
 request_id uuid not null unique,
 action text not null check(action in ('reroll','reset_configuration')),
 previous_result jsonb not null,
 new_result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 created_by uuid references auth.users(id) on delete set null
);
create index reward_admin_audit_reward_idx on public.reward_admin_audit(reward_id,created_at);
alter table public.reward_admin_audit enable row level security;
revoke all on public.reward_admin_audit from public,anon,authenticated;
grant select on public.reward_admin_audit to authenticated;
create policy admin_reward_audit_read on public.reward_admin_audit for select to authenticated using((select private.is_admin()));

-- Single reward-only streak query used by BOTH qualification and UI snapshots.
-- Freeze the cutoff at reset; preserve the baseline ID even if later deleted.
create function public.reward_streaks() returns table(player_id uuid,current_streak integer,latest_match_id uuid)
language sql stable security invoker set search_path='' as $$
 with ordered as (
  select p.player_id,m.id,p.team=m.winner_team as won,
   row_number() over(partition by p.player_id order by m.played_at desc,m.id asc) as n,
   sum(case when p.team=m.winner_team then 0 else 1 end) over(partition by p.player_id order by m.played_at desc,m.id asc rows unbounded preceding) as losses
  from public.matches m join public.match_players p on p.match_id=m.id cross join public.reward_system_settings s
  where s.baseline_match_snapshot is not null and
   (m.id=s.baseline_match_snapshot or m.played_at>s.baseline_played_at or (m.played_at=s.baseline_played_at and m.id<=s.baseline_match_snapshot))
 ) select p.id,count(o.player_id) filter(where o.won and o.losses=0)::integer,
  (max(o.id::text) filter(where o.n=1))::uuid
 from public.players p left join ordered o on o.player_id=p.id group by p.id;
$$;
revoke all on function public.reward_streaks() from public;
grant execute on function public.reward_streaks() to anon,authenticated;

create or replace function private.process_new_match_rewards() returns trigger language plpgsql security definer set search_path=''
as $$ begin
 if not exists(select 1 from public.matches where id=new.id) then return null; end if;
 -- Existing applicability and atomic consumption behavior is preserved.
 update public.reward_rolls r set status='used',used_at=clock_timestamp(),used_match_id=new.id,used_match_snapshot=new.id,revision=revision+1
 where r.status='active'
 and exists(select 1 from public.match_players p where p.match_id=new.id and p.player_id=r.player_id)
 and (r.target_player_id is null or exists(select 1 from public.match_players p where p.match_id=new.id and p.player_id=r.target_player_id))
 and (r.secondary_target_player_id is null or exists(select 1 from public.match_players p where p.match_id=new.id and p.player_id=r.secondary_target_player_id));
 insert into public.reward_rolls(player_id,qualifying_match_id,qualifying_match_snapshot,streak_milestone)
 select s.player_id,new.id,new.id,s.current_streak from public.reward_streaks() s
 where s.latest_match_id=new.id and s.current_streak>0 and s.current_streak%3=0
 on conflict(player_id,qualifying_match_snapshot) do nothing;
 return null;
end; $$;

-- A single captured candidate array keeps the equal-odds pool consistent.
create function private.choose_reward(p_exclude text default null) returns public.reward_catalog language plpgsql security definer set search_path=''
as $$ declare candidates text[]; chosen public.reward_catalog; begin
 select array_agg(key order by key) into candidates from public.reward_catalog where enabled and (p_exclude is null or key<>p_exclude);
 if coalesce(cardinality(candidates),0)=0 then raise exception 'No alternative enabled rewards are available. Nothing was changed.'; end if;
 select * into chosen from public.reward_catalog where key=candidates[1+floor(random()*cardinality(candidates))::integer];
 return chosen;
end; $$;
revoke all on function private.choose_reward(text) from public,anon,authenticated;

create function public.reroll_reward(p_reward_id uuid,p_expected_revision integer,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=''
as $$ declare r public.reward_rolls; before_result jsonb; chosen public.reward_catalog; audit public.reward_admin_audit; begin
 if not private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'A request ID is required.'; end if;
 perform pg_advisory_xact_lock(61004,1);
 select * into r from public.reward_rolls where id=p_reward_id for update;
 if not found then raise exception 'Reward no longer exists.'; end if;
 select * into audit from public.reward_admin_audit where request_id=p_request_id;
 if found then
  if audit.reward_id<>r.id or audit.action<>'reroll' then raise exception 'Request ID already used for another action.'; end if;
  return to_jsonb(r);
 end if;
 if r.status not in ('active','pending_configuration') or r.used_at is not null then raise exception 'Only unused rolled rewards can be rerolled.'; end if;
 if p_expected_revision is null or p_expected_revision<>r.revision then raise exception 'This reward changed. Refresh and review it before trying again.'; end if;
 before_result=to_jsonb(r);chosen=private.choose_reward(r.reward_key);
 update public.reward_rolls set reward_key=chosen.key,rolled_at=clock_timestamp(),reroll_count=reroll_count+1,revision=revision+1,
 target_player_id=null,secondary_target_player_id=null,target_role=null,target_hero_id=null,
 status=case when chosen.configuration='none' then 'active' else 'pending_configuration' end,
 activated_at=case when chosen.configuration='none' then clock_timestamp() else null end
 where id=r.id returning * into r;
 insert into public.reward_admin_audit(reward_id,request_id,action,previous_result,new_result,created_by)
 values(r.id,p_request_id,'reroll',before_result,to_jsonb(r),auth.uid());
 return to_jsonb(r);
end; $$;

create function public.reset_reward_configuration(p_reward_id uuid,p_expected_revision integer,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=''
as $$ declare r public.reward_rolls; before_result jsonb; audit public.reward_admin_audit; config text; begin
 if not private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'A request ID is required.'; end if;
 perform pg_advisory_xact_lock(61004,1);
 select * into r from public.reward_rolls where id=p_reward_id for update;
 if not found then raise exception 'Reward no longer exists.'; end if;
 select * into audit from public.reward_admin_audit where request_id=p_request_id;
 if found then
  if audit.reward_id<>r.id or audit.action<>'reset_configuration' then raise exception 'Request ID already used for another action.'; end if;
  return to_jsonb(r);
 end if;
 if r.status<>'active' or r.used_at is not null then raise exception 'Only active unused rewards can have their configuration reset.'; end if;
 if p_expected_revision is null or p_expected_revision<>r.revision then raise exception 'This reward changed. Refresh and review it before trying again.'; end if;
 select configuration into config from public.reward_catalog where key=r.reward_key;
 if config='none' then raise exception 'This reward has no configuration.'; end if;
 before_result=to_jsonb(r);
 update public.reward_rolls set status='pending_configuration',target_player_id=null,secondary_target_player_id=null,target_role=null,target_hero_id=null,
 activated_at=null,revision=revision+1 where id=r.id returning * into r;
 insert into public.reward_admin_audit(reward_id,request_id,action,previous_result,new_result,created_by)
 values(r.id,p_request_id,'reset_configuration',before_result,to_jsonb(r),auth.uid());
 return to_jsonb(r);
end; $$;

create function public.grant_reward_roll(p_player_id uuid,p_reason text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=''
as $$ declare r public.reward_rolls; begin
 if not private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'A request ID is required.'; end if;
 if length(coalesce(p_reason,''))>500 then raise exception 'Grant reason must be 500 characters or fewer.'; end if;
 perform pg_advisory_xact_lock(61004,1);
 select * into r from public.reward_rolls where grant_request_id=p_request_id;
 if found then
  if r.player_id<>p_player_id or coalesce(r.grant_reason,'')<>trim(coalesce(p_reason,'')) then raise exception 'Request ID already used for another grant.'; end if;
  return to_jsonb(r);
 end if;
 if not exists(select 1 from public.players where id=p_player_id) then raise exception 'Choose an existing player.'; end if;
 insert into public.reward_rolls(player_id,source_type,streak_milestone,grant_reason,grant_request_id)
 values(p_player_id,'ADMIN_GRANT',null,trim(coalesce(p_reason,'')),p_request_id) returning * into r;
 return to_jsonb(r);
end; $$;
revoke all on function public.reroll_reward(uuid,integer,uuid),public.reset_reward_configuration(uuid,integer,uuid),public.grant_reward_roll(uuid,text,uuid) from public,anon;
grant execute on function public.reroll_reward(uuid,integer,uuid),public.reset_reward_configuration(uuid,integer,uuid),public.grant_reward_roll(uuid,text,uuid) to authenticated;

create or replace function public.roll_reward(p_reward_id uuid) returns jsonb language plpgsql security definer set search_path=''
as $$ declare r public.reward_rolls; chosen public.reward_catalog; pool_size integer; begin
 if not private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(61004,1);
 select * into r from public.reward_rolls where id=p_reward_id for update;
 if not found then raise exception 'Reward no longer exists.'; end if;
 if r.status='cancelled' then raise exception 'This reward was cancelled.'; end if;
 if r.status<>'available' then return to_jsonb(r); end if;
 -- Uniform integer index across the enabled catalog. There are no weights.
 select count(*) into pool_size from public.reward_catalog where enabled;
 if pool_size=0 then raise exception 'No rewards are enabled. Your roll is still available.'; end if;
 select * into chosen from public.reward_catalog where enabled order by key offset floor(random()*pool_size)::integer limit 1;
 update public.reward_rolls set reward_key=chosen.key,rolled_at=clock_timestamp(),revision=revision+1,
 status=case when chosen.configuration='none' then 'active' else 'pending_configuration' end,
 activated_at=case when chosen.configuration='none' then clock_timestamp() else null end
 where id=r.id returning * into r;
 return to_jsonb(r);
end; $$;

create or replace function public.configure_reward(p_reward_id uuid,p_selection jsonb) returns jsonb language plpgsql security definer set search_path=''
as $$ declare r public.reward_rolls; config text; target uuid; secondary uuid; position integer; hero integer; pool_size integer; begin
 if not private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(61004,1);
 select * into r from public.reward_rolls where id=p_reward_id for update;
 if not found then raise exception 'Reward no longer exists.'; end if;
 -- Retries return the permanent assignment, never reroll or retarget.
 if r.status='used' or r.used_at is not null then raise exception 'Used rewards are immutable.'; end if;
 if r.status='active' then return to_jsonb(r); end if;
 if r.status<>'pending_configuration' then raise exception 'Roll this reward before configuring it, or it has been cancelled.'; end if;
 if (p_selection->>'expected_revision')::integer is distinct from r.revision then raise exception 'This reward changed. Refresh and review it before configuring.'; end if;
 if jsonb_typeof(p_selection) is distinct from 'object' then raise exception 'Invalid reward configuration.'; end if;
 select configuration into config from public.reward_catalog where key=r.reward_key;
 target=nullif(p_selection->>'target_player_id','')::uuid;
 secondary=nullif(p_selection->>'secondary_target_player_id','')::uuid;
 position=nullif(p_selection->>'target_role','')::integer;
 hero=nullif(p_selection->>'target_hero_id','')::integer;
 if config in ('player','player_role','random_hero','random_role','swap') then
  if target is null or not exists(select 1 from public.players where id=target) then raise exception 'Select an existing target player.'; end if;
  if config<>'swap' and target=r.player_id then raise exception 'Choose another player, not the reward owner.'; end if;
 elsif target is not null then raise exception 'This reward does not accept a target player.';
 end if;
 if config='swap' then
  if secondary is null or secondary=target or not exists(select 1 from public.players where id=secondary) then raise exception 'Select two distinct existing players for The Swap.'; end if;
 elsif secondary is not null then raise exception 'This reward does not accept a second target.';
 end if;
 if config in ('role','player_role') then
  if position is null or position not between 1 and 5 then raise exception 'Choose Position 1 through 5.'; end if;
 elsif position is not null then raise exception 'The role is selected by the server or is not required.';
 end if;
 if config='hero' then
  if hero is null or not exists(select 1 from public.hero_catalog where hero_id=hero) then raise exception 'Choose a valid hero from the catalog.'; end if;
 elsif hero is not null then raise exception 'The hero is selected by the server or is not required.';
 end if;
 if config='random_hero' then
  select count(*) into pool_size from public.hero_catalog;
  if pool_size=0 then raise exception 'The hero catalog is empty. Try again after it is restored.'; end if;
  select hero_id into hero from public.hero_catalog order by hero_id offset floor(random()*pool_size)::integer limit 1;
 end if;
 if config='random_role' then position=1+floor(random()*5)::integer; end if;
 update public.reward_rolls set target_player_id=target,secondary_target_player_id=secondary,target_role=position,target_hero_id=hero,
 status='active',activated_at=clock_timestamp(),revision=revision+1 where id=r.id returning * into r;
 return to_jsonb(r);
end; $$;

create or replace function public.cancel_reward(p_reward_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path=''
as $$ declare r public.reward_rolls; begin
 if not private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(61004,1);
 select * into r from public.reward_rolls where id=p_reward_id for update;
 if not found then raise exception 'Reward no longer exists.'; end if;
 if r.status='used' or r.used_at is not null then raise exception 'Used rewards are immutable.'; end if;
 if r.status='cancelled' then return to_jsonb(r); end if;
 if p_reason is null or length(trim(p_reason))<3 or length(p_reason)>500 then raise exception 'Enter a correction reason (3–500 characters).'; end if;
 update public.reward_rolls set status='cancelled',revision=revision+1,cancelled_at=clock_timestamp(),cancel_reason=trim(p_reason) where id=r.id returning * into r;
 return to_jsonb(r);
end; $$;
revoke all on function public.roll_reward(uuid),public.configure_reward(uuid,jsonb),public.cancel_reward(uuid,text) from public,anon;
grant execute on function public.roll_reward(uuid),public.configure_reward(uuid,jsonb),public.cancel_reward(uuid,text) to authenticated;

create or replace function public.league_snapshot() returns jsonb language sql stable security invoker set search_path=''
as $$ select jsonb_build_object(
 'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.players p),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(to_jsonb(m) || jsonb_build_object('bans',coalesce((select jsonb_agg(to_jsonb(b) order by b.team,b.hero_id) from public.match_bans b where b.match_id=m.id),'[]'::jsonb),'participants',
   coalesce((select jsonb_agg(to_jsonb(mp) order by mp.team,mp.player_id) from public.match_players mp where mp.match_id=m.id),'[]'::jsonb))
   order by m.played_at desc,m.id) from public.matches m),'[]'::jsonb),
 'rewards',coalesce((select jsonb_agg(to_jsonb(r) order by r.earned_at desc,r.id) from public.reward_rolls r),'[]'::jsonb),
 'reward_catalog',coalesce((select jsonb_agg(to_jsonb(c) order by c.key) from public.reward_catalog c),'[]'::jsonb),
 'reward_system_settings',(select to_jsonb(s) from public.reward_system_settings s where id=true),
 'reward_streaks',coalesce((select jsonb_agg(to_jsonb(s) order by s.player_id) from public.reward_streaks() s),'[]'::jsonb),
 'settings',(select to_jsonb(s) from public.league_settings s where id=true)); $$;
revoke all on function public.league_snapshot() from public;
grant execute on function public.league_snapshot() to anon,authenticated;

notify pgrst, 'reload schema';
commit;
