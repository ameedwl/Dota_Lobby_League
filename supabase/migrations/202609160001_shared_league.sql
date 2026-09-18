-- Run as the project database owner. No service-role key is used by the app.
begin;
revoke create on schema public from public,anon,authenticated;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '',
 role text not null default 'viewer' check (role in ('admin','viewer')),
 created_at timestamptz not null default now()
);
-- At most one administrator, even if somebody makes a mistaken SQL promotion.
create unique index profiles_one_admin on public.profiles ((role)) where role='admin';

create table public.players (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(btrim(name)) between 1 and 120),
 nickname text not null check (length(btrim(nickname)) between 1 and 60),
 steam_id text,
 avatar_url text,
 created_at timestamptz not null default now()
);
create table public.matches (
 id uuid primary key default gen_random_uuid(),
 played_at timestamptz not null default now() check (isfinite(played_at)),
 winner_team text not null check (winner_team in ('radiant','dire')),
 radiant_score integer check (radiant_score >= 0),
 dire_score integer check (dire_score >= 0),
 -- Numeric minutes preserves existing fractional duration support.
 duration_minutes numeric check (duration_minutes > 0 and duration_minutes < 'Infinity'::numeric),
 mvp_player_id uuid references public.players(id) on delete restrict,
 dota_match_id text unique check (dota_match_id ~ '^[0-9]+$'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default clock_timestamp()
);
create table public.match_players (
 id uuid primary key default gen_random_uuid(),
 match_id uuid not null references public.matches(id) on delete cascade,
 player_id uuid not null references public.players(id) on delete restrict,
 team text not null check (team in ('radiant','dire')),
 hero_id integer check (hero_id > 0),
 kills integer check (kills >= 0),
 deaths integer check (deaths >= 0),
 assists integer check (assists >= 0),
 unique(match_id,player_id)
);
create index matches_played_at_idx on public.matches(played_at desc,id);
create index matches_mvp_idx on public.matches(mvp_player_id);
create index match_players_player_idx on public.match_players(player_id,match_id);
create table public.league_settings (
 id boolean primary key default true check (id),
 name text not null default 'Lobby Legends' check (length(btrim(name)) between 1 and 80),
 season text not null default 'Season I' check (length(btrim(season)) between 1 and 80)
);
insert into public.league_settings(id) values(true);

create function private.is_admin() returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'); $$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create function private.create_profile() returns trigger language plpgsql security definer set search_path=''
as $$ begin
 insert into public.profiles(id,display_name,role)
 values(new.id,left(coalesce(new.raw_user_meta_data->>'display_name',''),120),'viewer');
 return new;
end; $$;
revoke all on function private.create_profile() from public,anon,authenticated;
create trigger auth_user_profile after insert on auth.users for each row execute function private.create_profile();
-- Existing Auth users are viewers; metadata can never grant admin.
insert into public.profiles(id,display_name)
select id,left(coalesce(raw_user_meta_data->>'display_name',''),120) from auth.users on conflict(id) do nothing;

alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.league_settings enable row level security;
revoke all on public.profiles,public.players,public.matches,public.match_players,public.league_settings from public,anon,authenticated;
grant select on public.players,public.matches,public.match_players,public.league_settings to anon,authenticated;
grant select on public.profiles to authenticated;
grant insert,update,delete on public.players,public.matches,public.match_players,public.league_settings to authenticated;

create policy own_profile on public.profiles for select to authenticated using (id=(select auth.uid()));
-- No profile write grants or write policies, including for the app's administrator.
create policy public_players on public.players for select to anon,authenticated using (true);
create policy public_matches on public.matches for select to anon,authenticated using (true);
create policy public_participation on public.match_players for select to anon,authenticated using (true);
create policy public_settings on public.league_settings for select to anon,authenticated using (true);
create policy admin_players on public.players for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_matches on public.matches for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_participation on public.match_players for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_settings on public.league_settings for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create function private.touch_match() returns trigger language plpgsql set search_path=''
as $$ begin new.updated_at=clock_timestamp(); return new; end; $$;
revoke all on function private.touch_match() from public,anon,authenticated;
create trigger touch_match before update on public.matches for each row execute function private.touch_match();

-- Serialize direct participation edits against their parent, and invalidate stale edit forms.
create function private.lock_match() returns trigger language plpgsql security definer set search_path=''
as $$ declare target uuid; begin
 if tg_op='UPDATE' and new.match_id <> old.match_id then raise exception 'A participation row cannot move between matches.' using errcode='23514'; end if;
 if tg_op='DELETE' then target=old.match_id; else target=new.match_id; end if;
 update public.matches set updated_at=clock_timestamp() where id=target;
 if tg_op='DELETE' then return old; else return new; end if;
end; $$;
revoke all on function private.lock_match() from public,anon,authenticated;
create trigger lock_participation before insert or update or delete on public.match_players for each row execute function private.lock_match();

-- Deferred constraints validate the complete final transaction, including direct API writes.
create function private.check_match() returns trigger language plpgsql security definer set search_path=''
as $$ declare target uuid; mvp uuid; r integer; d integer; begin
 if tg_table_name='matches' then
  if tg_op='DELETE' then target=old.id; else target=new.id; end if;
 else
  if tg_op='DELETE' then target=old.match_id; else target=new.match_id; end if;
 end if;
 select mvp_player_id into mvp from public.matches where id=target;
 if not found then return null; end if;
 select count(*) filter(where team='radiant'),count(*) filter(where team='dire') into r,d from public.match_players where match_id=target;
 if r<>5 or d<>5 then raise exception 'Each team must have exactly five unique players.' using errcode='23514'; end if;
 if mvp is not null and not exists(select 1 from public.match_players where match_id=target and player_id=mvp) then
  raise exception 'MVP must participate in the match.' using errcode='23514';
 end if;
 return null;
end; $$;
revoke all on function private.check_match() from public,anon,authenticated;
create constraint trigger matches_complete after insert or update on public.matches deferrable initially deferred for each row execute function private.check_match();
create constraint trigger participation_complete after insert or update or delete on public.match_players deferrable initially deferred for each row execute function private.check_match();

create function public.save_match(p_match jsonb,p_create boolean,p_expected_updated_at timestamptz default null)
returns uuid language plpgsql security invoker set search_path=''
as $$ declare mid uuid=(p_match->>'id')::uuid; existing public.matches; part jsonb; begin
 if not private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if jsonb_typeof(p_match->'participants') is distinct from 'array' or jsonb_array_length(p_match->'participants')<>10 then
  raise exception 'Exactly ten participants are required.' using errcode='23514';
 end if;
 if p_create then
  insert into public.matches(id,played_at,winner_team,radiant_score,dire_score,duration_minutes,mvp_player_id,dota_match_id)
  values(mid,(p_match->>'played_at')::timestamptz,p_match->>'winner_team',(p_match->>'radiant_score')::integer,(p_match->>'dire_score')::integer,
   (p_match->>'duration_minutes')::numeric,(p_match->>'mvp_player_id')::uuid,p_match->>'dota_match_id');
 else
  select * into existing from public.matches where id=mid for update;
  if not found then raise exception 'Match no longer exists.' using errcode='P0002'; end if;
  if p_expected_updated_at is null or existing.updated_at<>p_expected_updated_at then raise exception 'Match changed. Reload before editing.' using errcode='40001'; end if;
  update public.matches set played_at=(p_match->>'played_at')::timestamptz,winner_team=p_match->>'winner_team',
   radiant_score=(p_match->>'radiant_score')::integer,dire_score=(p_match->>'dire_score')::integer,
   duration_minutes=(p_match->>'duration_minutes')::numeric,mvp_player_id=(p_match->>'mvp_player_id')::uuid,dota_match_id=p_match->>'dota_match_id' where id=mid;
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

-- One consistent read snapshot, without the REST table row limit truncating history.
create function public.league_snapshot() returns jsonb language sql stable security invoker set search_path=''
as $$ select jsonb_build_object(
 'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.players p),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(to_jsonb(m) || jsonb_build_object('participants',
   coalesce((select jsonb_agg(to_jsonb(mp) order by mp.team,mp.player_id) from public.match_players mp where mp.match_id=m.id),'[]'::jsonb))
   order by m.played_at desc,m.id) from public.matches m),'[]'::jsonb),
 'settings',(select to_jsonb(s) from public.league_settings s where id=true)); $$;
revoke all on function public.league_snapshot() from public;
grant execute on function public.league_snapshot() to anon,authenticated;
commit;


