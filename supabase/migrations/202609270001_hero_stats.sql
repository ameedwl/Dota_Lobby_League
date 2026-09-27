-- Forward-only hero tracking. Review and run manually; never rewrites history.
begin;
create table public.hero_catalog (hero_id integer primary key check(hero_id>0), name text not null, slug text not null);
insert into public.hero_catalog(hero_id,name,slug) values
(1,'Anti-Mage','antimage'),
(2,'Axe','axe'),
(3,'Bane','bane'),
(4,'Bloodseeker','bloodseeker'),
(5,'Crystal Maiden','crystal_maiden'),
(6,'Drow Ranger','drow_ranger'),
(7,'Earthshaker','earthshaker'),
(8,'Juggernaut','juggernaut'),
(9,'Mirana','mirana'),
(10,'Morphling','morphling'),
(11,'Shadow Fiend','nevermore'),
(12,'Phantom Lancer','phantom_lancer'),
(13,'Puck','puck'),
(14,'Pudge','pudge'),
(15,'Razor','razor'),
(16,'Sand King','sand_king'),
(17,'Storm Spirit','storm_spirit'),
(18,'Sven','sven'),
(19,'Tiny','tiny'),
(20,'Vengeful Spirit','vengefulspirit'),
(21,'Windranger','windrunner'),
(22,'Zeus','zuus'),
(23,'Kunkka','kunkka'),
(25,'Lina','lina'),
(26,'Lion','lion'),
(27,'Shadow Shaman','shadow_shaman'),
(28,'Slardar','slardar'),
(29,'Tidehunter','tidehunter'),
(30,'Witch Doctor','witch_doctor'),
(31,'Lich','lich'),
(32,'Riki','riki'),
(33,'Enigma','enigma'),
(34,'Tinker','tinker'),
(35,'Sniper','sniper'),
(36,'Necrophos','necrolyte'),
(37,'Warlock','warlock'),
(38,'Beastmaster','beastmaster'),
(39,'Queen of Pain','queenofpain'),
(40,'Venomancer','venomancer'),
(41,'Faceless Void','faceless_void'),
(42,'Wraith King','skeleton_king'),
(43,'Death Prophet','death_prophet'),
(44,'Phantom Assassin','phantom_assassin'),
(45,'Pugna','pugna'),
(46,'Templar Assassin','templar_assassin'),
(47,'Viper','viper'),
(48,'Luna','luna'),
(49,'Dragon Knight','dragon_knight'),
(50,'Dazzle','dazzle'),
(51,'Clockwerk','rattletrap'),
(52,'Leshrac','leshrac'),
(53,'Nature''s Prophet','furion'),
(54,'Lifestealer','life_stealer'),
(55,'Dark Seer','dark_seer'),
(56,'Clinkz','clinkz'),
(57,'Omniknight','omniknight'),
(58,'Enchantress','enchantress'),
(59,'Huskar','huskar'),
(60,'Night Stalker','night_stalker'),
(61,'Broodmother','broodmother'),
(62,'Bounty Hunter','bounty_hunter'),
(63,'Weaver','weaver'),
(64,'Jakiro','jakiro'),
(65,'Batrider','batrider'),
(66,'Chen','chen'),
(67,'Spectre','spectre'),
(68,'Ancient Apparition','ancient_apparition'),
(69,'Doom','doom_bringer'),
(70,'Ursa','ursa'),
(71,'Spirit Breaker','spirit_breaker'),
(72,'Gyrocopter','gyrocopter'),
(73,'Alchemist','alchemist'),
(74,'Invoker','invoker'),
(75,'Silencer','silencer'),
(76,'Outworld Devourer','obsidian_destroyer'),
(77,'Lycan','lycan'),
(78,'Brewmaster','brewmaster'),
(79,'Shadow Demon','shadow_demon'),
(80,'Lone Druid','lone_druid'),
(81,'Chaos Knight','chaos_knight'),
(82,'Meepo','meepo'),
(83,'Treant Protector','treant'),
(84,'Ogre Magi','ogre_magi'),
(85,'Undying','undying'),
(86,'Rubick','rubick'),
(87,'Disruptor','disruptor'),
(88,'Nyx Assassin','nyx_assassin'),
(89,'Naga Siren','naga_siren'),
(90,'Keeper of the Light','keeper_of_the_light'),
(91,'Io','wisp'),
(92,'Visage','visage'),
(93,'Slark','slark'),
(94,'Medusa','medusa'),
(95,'Troll Warlord','troll_warlord'),
(96,'Centaur Warrunner','centaur'),
(97,'Magnus','magnataur'),
(98,'Timbersaw','shredder'),
(99,'Bristleback','bristleback'),
(100,'Tusk','tusk'),
(101,'Skywrath Mage','skywrath_mage'),
(102,'Abaddon','abaddon'),
(103,'Elder Titan','elder_titan'),
(104,'Legion Commander','legion_commander'),
(105,'Techies','techies'),
(106,'Ember Spirit','ember_spirit'),
(107,'Earth Spirit','earth_spirit'),
(108,'Underlord','abyssal_underlord'),
(109,'Terrorblade','terrorblade'),
(110,'Phoenix','phoenix'),
(111,'Oracle','oracle'),
(112,'Winter Wyvern','winter_wyvern'),
(113,'Arc Warden','arc_warden'),
(114,'Monkey King','monkey_king'),
(119,'Dark Willow','dark_willow'),
(120,'Pangolier','pangolier'),
(121,'Grimstroke','grimstroke'),
(123,'Hoodwink','hoodwink'),
(126,'Void Spirit','void_spirit'),
(128,'Snapfire','snapfire'),
(129,'Mars','mars'),
(131,'Ring Master','ringmaster'),
(135,'Dawnbreaker','dawnbreaker'),
(136,'Marci','marci'),
(137,'Primal Beast','primal_beast'),
(138,'Muerta','muerta'),
(145,'Kez','kez'),
(155,'Largo','largo');
alter table public.hero_catalog enable row level security;
revoke all on public.hero_catalog from public,anon,authenticated;
grant select on public.hero_catalog to anon,authenticated;
create policy public_hero_catalog on public.hero_catalog for select to anon,authenticated using(true);
-- Reuse the existing nullable participant hero_id; grandfather old rows without rewriting them.
-- NOT VALID preserves any previously stored unknown IDs while enforcing the FK on future writes.
alter table public.match_players add constraint participant_known_hero foreign key(hero_id) references public.hero_catalog(hero_id) not valid;
create table public.match_bans (
 match_id uuid not null references public.matches(id) on delete cascade,
 team text not null check(team in ('radiant','dire')),
 hero_id integer not null references public.hero_catalog(hero_id),
 primary key(match_id,hero_id)
);
create index match_bans_hero_idx on public.match_bans(hero_id);
create index match_players_hero_idx on public.match_players(hero_id) where hero_id is not null;
alter table public.match_bans enable row level security;
revoke all on public.match_bans from public,anon,authenticated;
grant select on public.match_bans to anon,authenticated;
grant insert,update,delete on public.match_bans to authenticated;
create policy public_match_bans on public.match_bans for select to anon,authenticated using(true);
create policy admin_match_bans on public.match_bans for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
-- Reuse parent locking/version invalidation so direct ban edits serialize with participant edits.
create trigger lock_bans before insert or update or delete on public.match_bans for each row execute function private.lock_match();
create function private.check_heroes() returns trigger language plpgsql security definer set search_path=''
as $$ declare target uuid; count_heroes integer; unique_heroes integer; begin
 if tg_table_name='matches' then
  if tg_op='DELETE' then target=old.id; else target=new.id; end if;
 else
  if tg_op='DELETE' then target=old.match_id; else target=new.match_id; end if;
 end if;
 if not exists(select 1 from public.matches where id=target) then return null; end if;
 select count(hero_id),count(distinct hero_id) into count_heroes,unique_heroes from public.match_players where match_id=target;
 if count_heroes not in (0,10) then raise exception 'Record all ten participant heroes, or remove hero tracking.' using errcode='23514'; end if;
 if count_heroes<>unique_heroes then raise exception 'A played hero cannot be selected more than once.' using errcode='23514'; end if;
 if exists(select 1 from public.match_players p join public.match_bans b on b.match_id=p.match_id and b.hero_id=p.hero_id where p.match_id=target) then
  raise exception 'A banned hero cannot also be played in the same match.' using errcode='23514';
 end if;
 return null;
end; $$;
revoke all on function private.check_heroes() from public,anon,authenticated;
create constraint trigger match_hero_complete after insert or update on public.matches deferrable initially deferred for each row execute function private.check_heroes();
create constraint trigger participant_hero_complete after insert or update or delete on public.match_players deferrable initially deferred for each row execute function private.check_heroes();
create constraint trigger ban_hero_complete after insert or update or delete on public.match_bans deferrable initially deferred for each row execute function private.check_heroes();

create or replace function public.save_match(p_match jsonb,p_create boolean,p_expected_updated_at timestamptz default null)
returns uuid language plpgsql security invoker set search_path=''
as $$ declare mid uuid=(p_match->>'id')::uuid; existing public.matches; part jsonb; previous_heroes jsonb; begin
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
 'settings',(select to_jsonb(s) from public.league_settings s where id=true)); $$;
revoke all on function public.league_snapshot() from public;
grant execute on function public.league_snapshot() to anon,authenticated;

notify pgrst, 'reload schema';
commit;
