-- Forward-only. Apply manually after reviewing. Existing rows keep NULL IDs.
begin;
alter table public.players add column dota_account_id bigint;
alter table public.players add constraint players_dota_account_id_valid
 check (dota_account_id > 0 and dota_account_id < 4294967295);
alter table public.players add constraint players_dota_account_id_key unique (dota_account_id);
comment on column public.players.dota_account_id is 'Optional OpenDota Steam32 account ID; managed by the existing admin-only player RLS policy.';
-- matches.dota_match_id already has a UNIQUE constraint from the initial migration.
-- No historical data, match schema, grants or RLS policies are changed.
commit;
