-- Birthday reroll credits only. No baseline, match, player or reward resets.
begin;
-- Capture random selection once: volatile random() in a WHERE predicate can
-- be reevaluated for each scanned catalog row, yielding no selected record.
create or replace function private.choose_reward(p_exclude text default null) returns public.reward_catalog
language plpgsql security definer set search_path='' as $$
declare candidates text[]; chosen_key text; chosen public.reward_catalog;
begin
 select array_agg(key order by key) into candidates from public.reward_catalog where enabled and (p_exclude is null or key<>p_exclude);
 if coalesce(cardinality(candidates),0)=0 then raise exception 'No alternative enabled rewards are available. Nothing was changed.'; end if;
 chosen_key=candidates[1+floor(random()*cardinality(candidates))::integer];
 select * into strict chosen from public.reward_catalog where key=chosen_key;
 return chosen;
end; $$;

create table public.reward_reroll_credits (
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references public.players(id) on delete restrict,
 source_key text not null unique,
 label text not null,
 remaining_uses integer not null default 1 check(remaining_uses in (0,1)),
 granted_at timestamptz not null default clock_timestamp(),
 used_at timestamptz,
 used_reward_id uuid references public.reward_rolls(id) on delete restrict,
 request_id uuid unique,
 check((remaining_uses=1 and used_at is null and used_reward_id is null and request_id is null)
 or (remaining_uses=0 and used_at is not null and used_reward_id is not null and request_id is not null))
);
alter table public.reward_reroll_credits enable row level security;
revoke all on public.reward_reroll_credits from public,anon,authenticated;
grant select on public.reward_reroll_credits to anon,authenticated;
create policy public_reroll_credit_read on public.reward_reroll_credits for select to anon,authenticated using(true);
create function public.use_birthday_reroll(p_credit_id uuid,p_reward_id uuid,p_expected_revision integer,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.reward_reroll_credits; r public.reward_rolls; result jsonb;
begin
 if not private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'Request ID required.'; end if;
 perform pg_advisory_xact_lock(61004,1);
 select * into c from public.reward_reroll_credits where id=p_credit_id for update;
 if not found then raise exception 'Birthday credit not found.'; end if;
 if c.remaining_uses=0 then
  if c.request_id=p_request_id and c.used_reward_id=p_reward_id then
   select to_jsonb(x) into result from public.reward_rolls x where x.id=p_reward_id;return result;
  end if;
  raise exception 'This birthday reroll has already been used.';
 end if;
 select * into r from public.reward_rolls where id=p_reward_id for update;
 if not found or r.player_id<>c.player_id then raise exception 'Choose an unused rolled reward belonging to the birthday player.'; end if;
 -- Do not consume a credit for an earlier ordinary reroll's request ID.
 if exists(select 1 from public.reward_admin_audit where request_id=p_request_id) then raise exception 'Request ID already used.'; end if;
 -- Existing RPC enforces status, revision, equal odds, exclusion, config reset and audit.
 result=public.reroll_reward(p_reward_id,p_expected_revision,p_request_id);
 update public.reward_reroll_credits set remaining_uses=0,used_at=clock_timestamp(),used_reward_id=p_reward_id,request_id=p_request_id where id=c.id;
 return result;
end; $$;
revoke all on function public.use_birthday_reroll(uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.use_birthday_reroll(uuid,uuid,integer,uuid) to authenticated;

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
 'reroll_credits',coalesce((select jsonb_agg(to_jsonb(c) order by c.granted_at,c.id) from public.reward_reroll_credits c),'[]'::jsonb),
 'settings',(select to_jsonb(s) from public.league_settings s where id=true)); $$;
revoke all on function public.league_snapshot() from public;
grant execute on function public.league_snapshot() to anon,authenticated;

notify pgrst, 'reload schema';
commit;
