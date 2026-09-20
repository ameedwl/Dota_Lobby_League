-- Forward-only upgrade. Review and apply manually; no historical rows are rewritten.
begin;
alter table public.matches add column runner_up_mvp_player_id uuid
 references public.players(id) on delete restrict;
create index matches_runner_up_mvp_idx on public.matches(runner_up_mvp_player_id);

-- Existing deferred triggers continue validating the final match and participation
-- state at commit. Historical awards are preserved; any future edit must satisfy
-- the winning/losing-team rules, including edits through the direct table API.
create or replace function private.check_match() returns trigger language plpgsql security definer set search_path=''
as $$ declare target uuid; mvp uuid; runner_up uuid; winner text; r integer; d integer; begin
 if tg_table_name='matches' then
  if tg_op='DELETE' then target=old.id; else target=new.id; end if;
 else
  if tg_op='DELETE' then target=old.match_id; else target=new.match_id; end if;
 end if;
 select mvp_player_id,runner_up_mvp_player_id,winner_team into mvp,runner_up,winner from public.matches where id=target;
 if not found then return null; end if;
 select count(*) filter(where team='radiant'),count(*) filter(where team='dire') into r,d from public.match_players where match_id=target;
 if r<>5 or d<>5 then raise exception 'Each team must have exactly five unique players.' using errcode='23514'; end if;
 if mvp is not null and not exists(select 1 from public.match_players where match_id=target and player_id=mvp and team=winner) then
  raise exception 'MVP must be on the winning team.' using errcode='23514';
 end if;
 if runner_up is not null and not exists(select 1 from public.match_players where match_id=target and player_id=runner_up and team<>winner) then
  raise exception 'Runner-up MVP must be on the losing team.' using errcode='23514';
 end if;
 if mvp is not null and mvp=runner_up then
  raise exception 'MVP and Runner-up MVP must be different players.' using errcode='23514';
 end if;
 return null;
end; $$;
revoke all on function private.check_match() from public,anon,authenticated;

create or replace function public.save_match(p_match jsonb,p_create boolean,p_expected_updated_at timestamptz default null)
returns uuid language plpgsql security invoker set search_path=''
as $$ declare mid uuid=(p_match->>'id')::uuid; existing public.matches; part jsonb; begin
 if not private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
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
  delete from public.match_players where match_id=mid;
 end if;
 for part in select value from jsonb_array_elements(p_match->'participants') loop
  insert into public.match_players(match_id,player_id,team,hero_id,kills,deaths,assists)
  values(mid,(part->>'player_id')::uuid,part->>'team',(part->>'hero_id')::integer,(part->>'kills')::integer,(part->>'deaths')::integer,(part->>'assists')::integer);
 end loop;
 return mid;
end; $$;
revoke all on function public.save_match(jsonb,boolean,timestamptz) from public,anon;
grant execute on function public.save_match(jsonb,boolean,timestamptz) to authenticated;

-- league_snapshot already uses to_jsonb(matches), so the nullable column is
-- included automatically without changing its signature, security mode or grants.
-- Existing table grants, RLS policies, role checks and one-admin index are unchanged.
notify pgrst, 'reload schema';
commit;
