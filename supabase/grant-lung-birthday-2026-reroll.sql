-- MANUAL ONLY. Apply 202610160001_birthday_reroll_credit.sql first.
-- Resolves an EXISTING Lung/Hermes; creates no player, reward entitlement or streak.
-- Exactly one lifetime credit for this source. Rerunning never restores a used credit.
begin;
select pg_advisory_xact_lock(61004,1);
do $$
declare target uuid; matches integer; existing uuid;
-- If ambiguous, set configured_player_id to the verified existing player's UUID.
 configured_player_id uuid := null;
begin
 if configured_player_id is not null then
  select id into target from public.players where id=configured_player_id;
  if target is null then raise exception 'Configured player does not exist.'; end if;
 else
  select count(*),(array_agg(id))[1] into matches,target from public.players
  where lower(trim(name)) in ('lung','hermes') or lower(trim(nickname)) in ('lung','hermes');
  if matches<>1 then raise exception 'Expected exactly one existing Lung/Hermes, found %. Configure the verified player UUID explicitly.',matches; end if;
 end if;
 select player_id into existing from public.reward_reroll_credits where source_key='lung-birthday-2026';
 if existing is not null and existing<>target then raise exception 'Event gift already belongs to another player. No changes made.'; end if;
 insert into public.reward_reroll_credits(player_id,source_key,label)
 values(target,'lung-birthday-2026','Lung birthday reroll') on conflict(source_key) do nothing;
end; $$;
commit;
select c.*,p.name,p.nickname from public.reward_reroll_credits c join public.players p on p.id=c.player_id where source_key='lung-birthday-2026';
