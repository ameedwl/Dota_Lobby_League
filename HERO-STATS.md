# Hero statistics and manual draft entry

## Result

Lobby Legends now supports optional participant heroes, manual bans, OpenDota hero/ban import, Match Details hero labels, league hero rankings and per-player hero records. Existing match entry, awards, screenshots, authentication and leaderboard calculations remain in place.

The previous OpenDota work was already uncommitted when this task started; it was preserved. No production database operation, Git commit/push or deployment was performed. `.env.local` and old migrations were not edited.

## New migration — review/apply manually

**`supabase/migrations/202609270001_hero_stats.sql`**

This is the only migration created for the hero feature. It is newer than `202609230001_opendota_import.sql`.

### Database design

- Reuses existing `match_players.hero_id INTEGER NULL`. A participant assignment is the sole source of picks and player hero games.
- Adds a read-only `hero_catalog` reference table containing the same 127 IDs/names/slugs as the offline catalog. Normal users, including the app admin, cannot alter it.
- Adds `match_bans(match_id, team, hero_id)`, with match/hero foreign keys, allowed-team validation, a `(match_id, hero_id)` primary key, and a hero lookup index. This prevents the same hero being banned by both sides in one match.
- Match deletion cascades to bans; participant cascade behavior already exists. Public read/admin-only write policies follow the existing league model.
- Adds a participant hero lookup index and a catalog foreign key. The participant FK is initially `NOT VALID`: it enforces future writes without scanning or rewriting any legacy hero values. New writes must use catalog IDs.
- Extends the current `save_match` RPC, not a separate save path. Heroes, bans, match details and awards commit or roll back together. Missing hero keys preserve existing heroes by player ID on edits; explicit `null` removes heroes. An omitted `bans` key preserves bans; `[]` removes them.
- Extends `league_snapshot` with bans while preserving its signature, public reads, security mode and existing match fields.
- Deferred triggers validate the final transaction: either zero or ten distinct played heroes, no played/banned overlap. Existing team/award checks still apply. The existing parent lock/version helper is reused for bans, including direct table edits.

### Why a bans table instead of a second picks list?

Picks already exist in participant assignments. Keeping a second editable picks list would create conflicting sources of truth. The requested bans-table alternative is used. Exact OpenDota pick/ban sequence is deliberately not stored or displayed; draft picks are ignored and ban teams/heroes are imported. Manual users never enter picks twice.

## Hero catalog and display

`src/lib/hero-catalog.json` is a checked-in snapshot of [OpenDota dotaconstants](https://github.com/odota/dotaconstants/blob/master/build/heroes.json), retrieved September 27, 2026. It contains 127 heroes, including Kez and Largo. Only numeric ID, display name and slug are retained.

`src/lib/heroes.ts` centralizes catalog lookup, validation and derived hero statistics. Manual selectors work without a network connection or OpenDota availability. Unknown future IDs display as `Hero #<id>` rather than crashing; new saves using those IDs require a reviewed catalog update in both the JSON and a new database migration.

Hero labels use local text badges in the existing dark style. No external artwork is loaded, so images cannot fail or disrupt layout. Selectors provide a search field and a labeled native select, with existing responsive grids and scrollable tables.

## Add/Edit Match

- **Record Heroes** is optional and initially off for old matches.
- When on, each player slot has a searchable selector and all ten distinct heroes are required.
- Turning tracking off explicitly saves null heroes; the draft selections remain available if toggled back on before saving.
- Radiant/Dire bans can be added, edited or removed, without a fixed count. Zero bans is valid. Empty rows, duplicate bans and played/banned conflicts produce validation messages.
- Edit Match initializes from saved data once. It can add tracking to old matches, correct heroes/bans or remove tracking. Awards retain their existing behavior; screenshot handling is untouched.
- Hero fields, bans and searches use local component state. Background snapshots do not reinitialize them. Existing deleted-player pruning remains intact.

## OpenDota behavior

The existing parser/import preview was extended, not replaced. Participant `hero_id` follows the sorted team/player slot and the admin's mapped league player. The preview shows heroes beside both mapped and unmapped participants. `picks_bans` entries with `is_pick: false` become bans, translating team `0/1` to Radiant/Dire. Draft picks do not contribute additional picks.

Missing draft data does not prevent hero import. Missing/zero player hero IDs remain empty. Any supplied heroes enable tracking on confirmation; incomplete sets must be completed or tracking disabled before saving. The admin can correct heroes/bans in the normal form.

Fetching only creates a preview. **Use this match data** explicitly confirms replacing the draft's heroes/bans along with its existing imported fields. Saving still requires **Save Match**. If OpenDota fails or cannot find a private lobby, the existing draft remains intact and manual hero/ban entry still works.

## Statistics and coverage

No aggregate counters are stored.

- **Most Picked:** count each participant's hero in matches with ten distinct, valid numeric hero IDs. Draft picks are never counted. Matches lacking complete hero data are excluded.
- **Most Banned:** count recorded bans by hero, once per match. Matches without bans contribute nothing.
- **Player hero games:** count that player's participant records in complete hero matches, grouped by hero.
- **Wins/losses:** compare the player's team to the saved match winner. Win rate is `wins / games × 100`.
- Hero rows sort by games/count descending, then numeric hero ID for deterministic ties.
- League coverage states complete hero matches and matches with recorded bans. Player coverage states eligible matches out of their total matches. Empty datasets show explanatory text and never divide by zero.
- Editing or deleting a match immediately changes these derived results through the existing league refresh. Existing wins, losses, awards, streaks, head-to-head, recent form and leaderboard calculations are unchanged.

Historical matches are not backfilled. Null heroes remain valid and public displays omit empty hero labels. No bans section appears without bans. Any pre-existing partial hero data remains readable but is excluded from hero statistics; editing it requires completion or removal.

## Files changed for this feature

### Created

- `src/lib/hero-catalog.json`
- `src/lib/heroes.ts`
- `src/lib/heroes.test.ts`
- `src/components/hero-ui.tsx`
- `scripts/test-heroes-database.mjs`
- `supabase/migrations/202609270001_hero_stats.sql`
- `HERO-STATS.md`

### Modified

- `src/lib/types.ts` — optional bans and explicit null hero removal.
- `src/lib/backend.ts` — snapshot decoding and transactional payload encoding.
- `src/lib/stats.ts` — calls hero validation on writes; existing statistics formulas unchanged.
- `src/lib/supabase.ts` — readable hero/ban constraint errors.
- `src/lib/opendota.ts` — hero and ban parsing.
- `src/components/opendota-import.tsx` — preview labels and replacement confirmation text.
- `src/components/match-form.tsx` — optional tracking, selectors, bans and draft state.
- `src/app/matches/[id]/page.tsx` — participant heroes and bans.
- `src/app/players/[id]/page.tsx` — player hero records and coverage.
- `src/app/stats/page.tsx` — most picked/banned and coverage.
- `src/app/globals.css` — small hero field/badge styles.
- `scripts/test-portable.cjs` — registers hero unit tests.
- `scripts/test-database.mjs` — applies the new migration only inside disposable PGlite and registers tests.
- `scripts/test-form-drafts.cjs` — hero UI and workflow regressions.

## Tests

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | Blocked by worker process `spawn EPERM` |
| `npm run test:portable` | Passed: 57 unit tests |
| `npm run test:database` | Passed: 92 PostgreSQL/PGlite checks |
| `npm run test:forms` | Passed: 11 UI regression groups |
| `npm run build` | Blocked by Next.js subprocess `spawn EPERM` |
| `git diff --check` | Passed |

Tests cover complete/no-hero saves, historical data preservation, OpenDota heroes and optional draft, manual entry after API failure, hero search, editing/removal, cascade deletion, all-or-none/duplicate/conflict validation, derived counts and win rates, catalog parity, old RPC callers, transaction rollback, public/admin permissions, existing awards/screenshots, and polling/focus draft preservation. Existing database regression checks run with the new hero migration installed.

UI checks run in JSDOM, not a real-browser visual session. No live OpenDota match or production write was used for testing. Run the two blocked commands in your normal terminal before releasing.

## Exact manual steps

1. Review the local changes and `supabase/migrations/202609270001_hero_stats.sql`.
2. Confirm all earlier migrations, including `202609230001_opendota_import.sql`, are already applied to your existing Supabase project. Do not rerun old migrations or seed/reset commands.
3. In Supabase SQL Editor, run **only the new hero migration** once. The application needs this migration before saving hero/bans data. No environment-variable changes are needed.
4. In your normal project terminal, run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:portable`, `npm run test:database`, `npm run test:forms`, and `npm run build`.
5. Start the app with `npm run dev`. As admin, test an unsaved manual form: enable Record Heroes, select ten heroes, add bans, wait beyond 15 seconds and switch away/back. Confirm the draft remains intact.
6. Save only when ready to record a real match. Check Match Details, Lobby Records hero tables and the participating player profiles. Edit the match to verify correction/removal workflows.
7. For an available OpenDota match, fetch, inspect hero/ban mappings, confirm population, correct as needed, choose community awards and save explicitly. Screenshots remain in the existing workflow.

Nothing has been pushed, deployed or applied to production by this task.
