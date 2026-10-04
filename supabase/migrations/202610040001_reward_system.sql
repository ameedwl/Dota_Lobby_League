-- Forward-only rewards. REVIEW AND APPLY MANUALLY; never backfills old matches.
begin;
create table public.reward_catalog (
 key text primary key,
 configuration text not null check(configuration in ('none','hero','role','player_role','player','random_hero','swap','random_role')),
 enabled boolean not null default true
);
insert into public.reward_catalog(key,configuration) values
 ('pick_teams','none'),('hero_protection','hero'),('role_priority','role'),('role_commander','player_role'),
 ('self_silence','none'),('silence_someone','player'),('my_teammate','player'),('not_with_me','player'),
 ('random_hero_curse','random_hero'),('team_swap','swap'),('role_roulette','random_role');
create table public.reward_rolls (
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references public.players(id) on delete restrict,
 qualifying_match_id uuid references public.matches(id) on delete set null,
 -- Immutable identity survives deletion/recreation of the qualifying match.
 qualifying_match_snapshot uuid not null,
 reward_key text references public.reward_catalog(key) on delete restrict,
 status text not null default 'available' check(status in ('available','pending_configuration','active','used','cancelled')),
 target_player_id uuid references public.players(id) on delete restrict,
 secondary_target_player_id uuid references public.players(id) on delete restrict,
 target_role integer check(target_role between 1 and 5),
 target_hero_id integer references public.hero_catalog(hero_id) on delete restrict,
 earned_at timestamptz not null default clock_timestamp(),
 rolled_at timestamptz, activated_at timestamptz, used_at timestamptz,
 used_match_id uuid references public.matches(id) on delete set null,
 used_match_snapshot uuid,
 cancelled_at timestamptz, cancel_reason text,
 unique(player_id,qualifying_match_snapshot),
 check(status not in ('pending_configuration','active','used') or (reward_key is not null and rolled_at is not null)),
 check(status not in ('active','used') or activated_at is not null),
 check(status <> 'used' or (used_at is not null and used_match_snapshot is not null)),
 check(status <> 'cancelled' or (cancelled_at is not null and length(trim(cancel_reason)) > 0)),
 check(secondary_target_player_id is null or secondary_target_player_id <> target_player_id)
);
create index reward_rolls_status_idx on public.reward_rolls(status,earned_at desc);
create index reward_rolls_qualifying_idx on public.reward_rolls(qualifying_match_id);
create index reward_rolls_used_idx on public.reward_rolls(used_match_id);
create index reward_rolls_target_idx on public.reward_rolls(target_player_id);
create index reward_rolls_secondary_idx on public.reward_rolls(secondary_target_player_id);
alter table public.reward_catalog enable row level security;
alter table public.reward_rolls enable row level security;
revoke all on public.reward_catalog,public.reward_rolls from public,anon,authenticated;
grant select on public.reward_catalog,public.reward_rolls to anon,authenticated;
create policy public_reward_catalog on public.reward_catalog for select to anon,authenticated using(true);
create policy public_reward_rolls on public.reward_rolls for select to anon,authenticated using(true);
-- No direct client writes, even for admin. RPCs enforce irreversible transitions.

-- Serialize match mutations and reward RPCs before acquiring row locks. This
-- prevents simultaneous match creates from observing the same two-win streak,
-- and gives activation vs match creation a defined order.
create function private.lock_reward_history() returns trigger language plpgsql security definer set search_path=''
as $$ begin perform pg_advisory_xact_lock(61004,1); return null; end; $$;
revoke all on function private.lock_reward_history() from public,anon,authenticated;
create trigger reward_history_lock before insert or update or delete on public.matches for each statement execute function private.lock_reward_history();
create trigger reward_participation_lock before insert or update or delete on public.match_players for each statement execute function private.lock_reward_history();

create function private.process_new_match_rewards() returns trigger language plpgsql security definer set search_path=''
as $$ declare participant record; newest uuid; streak integer; begin
 if not exists(select 1 from public.matches where id=new.id) then return null; end if;
 -- Deferred INSERT-only trigger sees the final validated roster in the same
 -- transaction as save_match (manual or confirmed OpenDota import).
 update public.reward_rolls r set status='used',used_at=clock_timestamp(),used_match_id=new.id,used_match_snapshot=new.id
 where r.status='active'
 and exists(select 1 from public.match_players p where p.match_id=new.id and p.player_id=r.player_id)
 and (r.target_player_id is null or exists(select 1 from public.match_players p where p.match_id=new.id and p.player_id=r.target_player_id))
 and (r.secondary_target_player_id is null or exists(select 1 from public.match_players p where p.match_id=new.id and p.player_id=r.secondary_target_player_id));
 for participant in select p.player_id from public.match_players p join public.matches m on m.id=p.match_id where p.match_id=new.id and p.team=m.winner_team loop
  -- Same ordering as sortMatches: played_at DESC then ID ASC. An old newly
  -- entered match cannot manufacture a reward for a later historical streak.
  select m.id into newest from public.match_players p join public.matches m on m.id=p.match_id
  where p.player_id=participant.player_id order by m.played_at desc,m.id asc limit 1;
  if newest <> new.id then continue; end if;
  with ordered as (
   select p.team=m.winner_team as won,row_number() over(order by m.played_at desc,m.id asc) as n
   from public.match_players p join public.matches m on m.id=p.match_id where p.player_id=participant.player_id
  ) select count(*)::integer into streak from ordered where won and n < coalesce((select min(n) from ordered where not won),9223372036854775807);
  if streak=3 then
   insert into public.reward_rolls(player_id,qualifying_match_id,qualifying_match_snapshot)
   values(participant.player_id,new.id,new.id) on conflict(player_id,qualifying_match_snapshot) do nothing;
  end if;
 end loop;
 return null;
end; $$;
revoke all on function private.process_new_match_rewards() from public,anon,authenticated;
create constraint trigger new_match_rewards after insert on public.matches deferrable initially deferred for each row execute function private.process_new_match_rewards();

create function public.roll_reward(p_reward_id uuid) returns jsonb language plpgsql security definer set search_path=''
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
 update public.reward_rolls set reward_key=chosen.key,rolled_at=clock_timestamp(),
 status=case when chosen.configuration='none' then 'active' else 'pending_configuration' end,
 activated_at=case when chosen.configuration='none' then clock_timestamp() else null end
 where id=r.id returning * into r;
 return to_jsonb(r);
end; $$;

create function public.configure_reward(p_reward_id uuid,p_selection jsonb) returns jsonb language plpgsql security definer set search_path=''
as $$ declare r public.reward_rolls; config text; target uuid; secondary uuid; position integer; hero integer; pool_size integer; begin
 if not private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(61004,1);
 select * into r from public.reward_rolls where id=p_reward_id for update;
 if not found then raise exception 'Reward no longer exists.'; end if;
 -- Retries return the permanent assignment, never reroll or retarget.
 if r.status in ('active','used') then return to_jsonb(r); end if;
 if r.status<>'pending_configuration' then raise exception 'Roll this reward before configuring it, or it has been cancelled.'; end if;
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
 status='active',activated_at=clock_timestamp() where id=r.id returning * into r;
 return to_jsonb(r);
end; $$;

create function public.cancel_reward(p_reward_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path=''
as $$ declare r public.reward_rolls; begin
 if not private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(61004,1);
 select * into r from public.reward_rolls where id=p_reward_id for update;
 if not found then raise exception 'Reward no longer exists.'; end if;
 if r.status='cancelled' then return to_jsonb(r); end if;
 if p_reason is null or length(trim(p_reason))<3 or length(p_reason)>500 then raise exception 'Enter a correction reason (3–500 characters).'; end if;
 update public.reward_rolls set status='cancelled',cancelled_at=clock_timestamp(),cancel_reason=trim(p_reason) where id=r.id returning * into r;
 return to_jsonb(r);
end; $$;
revoke all on function public.roll_reward(uuid),public.configure_reward(uuid,jsonb),public.cancel_reward(uuid,text) from public,anon;
grant execute on function public.roll_reward(uuid),public.configure_reward(uuid,jsonb),public.cancel_reward(uuid,text) to authenticated;

create or replace function public.save_match(p_match jsonb,p_create boolean,p_expected_updated_at timestamptz default null)
returns uuid language plpgsql security invoker set search_path=''
as $$ declare mid uuid=(p_match->>'id')::uuid; existing public.matches; part jsonb; previous_heroes jsonb; begin
 if not private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(61004,1);
 if jsonb_typeof(p_match->'participants') is distinct from 'array' or jsonb_array_length(p_match->'participants')<>10 then
  raise exception 'Exactly ten participants are required.' using errcode='23514';
 end if;
 if p_create then
  insert into public.matches(id,played_at,winner_team,radiant_score,dire_score,duration_minutes,mvp_player_id,runner_up_mvp_player_id,dota_match_id)
  values(mid,(p_match->>'played_at')::timestamptz,p_match->>'winner_team',(p_match->>'radiant_score')::integer,(p_match->>'dire_score')::integer,
   (p_match->>'duration_minutes')::numeric,(p_match->>'mvp_player_id')::uuid,(p_match->>'runner_up_mvp_player_id')::uuid,p_match->>'dota_match_id');
 else
  select * into existing from public.matches where id=mid for update;
  if not found then raise exception 'Match no longer exists.' using errcode='P0002'; end if;
  if p_expected_updated_at is null or existing.updated_at<>p_expected_updated_at then raise exception 'Match changed. Reload before editing.' using errcode='40001'; end if;
  update public.matches set played_at=(p_match->>'played_at')::timestamptz,winner_team=p_match->>'winner_team',
   radiant_score=(p_match->>'radiant_score')::integer,dire_score=(p_match->>'dire_score')::integer,
   duration_minutes=(p_match->>'duration_minutes')::numeric,mvp_player_id=(p_match->>'mvp_player_id')::uuid,runner_up_mvp_player_id=case when p_match ? 'runner_up_mvp_player_id' then (p_match->>'runner_up_mvp_player_id')::uuid else existing.runner_up_mvp_player_id end,dota_match_id=p_match->>'dota_match_id' where id=mid;
  select jsonb_object_agg(player_id,hero_id) into previous_heroes from public.match_players where match_id=mid;
  delete from public.match_players where match_id=mid;
 end if;
 for part in select value from jsonb_array_elements(p_match->'participants') loop
  insert into public.match_players(match_id,player_id,team,hero_id,kills,deaths,assists)
  values(mid,(part->>'player_id')::uuid,part->>'team',case when part ? 'hero_id' then (part->>'hero_id')::integer else (previous_heroes->>(part->>'player_id'))::integer end,(part->>'kills')::integer,(part->>'deaths')::integer,(part->>'assists')::integer);
 end loop;
 if p_match ? 'bans' then
  if jsonb_typeof(p_match->'bans') is distinct from 'array' then raise exception 'Invalid ban list.' using errcode='23514'; end if;
  delete from public.match_bans where match_id=mid;
  for part in select value from jsonb_array_elements(p_match->'bans') loop
   insert into public.match_bans(match_id,team,hero_id) values(mid,part->>'team',(part->>'hero_id')::integer);
  end loop;
 end if;
 return mid;
end; $$;
revoke all on function public.save_match(jsonb,boolean,timestamptz) from public,anon;
grant execute on function public.save_match(jsonb,boolean,timestamptz) to authenticated;


create or replace function public.league_snapshot() returns jsonb language sql stable security invoker set search_path=''
as $$ select jsonb_build_object(
 'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.players p),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(to_jsonb(m) || jsonb_build_object('bans',coalesce((select jsonb_agg(to_jsonb(b) order by b.team,b.hero_id) from public.match_bans b where b.match_id=m.id),'[]'::jsonb),'participants',
   coalesce((select jsonb_agg(to_jsonb(mp) order by mp.team,mp.player_id) from public.match_players mp where mp.match_id=m.id),'[]'::jsonb))
   order by m.played_at desc,m.id) from public.matches m),'[]'::jsonb),
 'rewards',coalesce((select jsonb_agg(to_jsonb(r) order by r.earned_at desc,r.id) from public.reward_rolls r),'[]'::jsonb),
 'reward_catalog',coalesce((select jsonb_agg(to_jsonb(c) order by c.key) from public.reward_catalog c),'[]'::jsonb),
 'settings',(select to_jsonb(s) from public.league_settings s where id=true)); $$;
revoke all on function public.league_snapshot() from public;
grant execute on function public.league_snapshot() to anon,authenticated;

notify pgrst, 'reload schema';
commit;
