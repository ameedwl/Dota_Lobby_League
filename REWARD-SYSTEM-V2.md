# Reward System V2

## Scope and status

Implemented locally on 2026-10-10. No live Supabase migration/reset, commit, push, deployment, or .env.local change was performed. SQL validation used a disposable in-memory PGlite database with synthetic fixtures, never the connected league. The existing Rewards design, cards, reveal animation, 11-reward catalog and unrelated league features remain in place.

This document describes V2 and supersedes the original reward documentation where rules differ.

## Rules and baseline

Previously a roll was earned at the first three-win milestone. V2 earns one separate roll at every positive multiple of three consecutive reward-era wins: 3, 6, 9, 12, 15, 18, and onward. A loss resets reward streak to zero; already earned rolls remain. Games without the player do not affect that player's streak.

The reward baseline applies only to reward qualification. Normal statistics, leaderboard, profiles, hero statistics, awards, screenshots and complete match history continue to use the full history.

The one-time script selects the newest match using `played_at DESC, id ASC`, matching the app's authoritative newest-first match chronology. It stores that concrete UUID plus its timestamp and a retained UUID snapshot. **The baseline match itself is included**, so its winners start at reward streak 1 and losers at 0. All older matches remain intact.

The reset script will select the newest production match when you manually run it. No production match ID is known or invented here. If another match is recorded before you run it, that newer match becomes the baseline instead.

The cutoff timestamp and ID snapshot remain fixed after reset. Equal timestamps use the same ID tie-breaker. The original baseline is explicitly included even if its date is later edited; deleting it clears the live FK but retains the cutoff and identity snapshot so older matches do not suddenly re-enter the reward era. Later historical corrections recompute current reward streaks from the remaining qualifying history.

## Entitlements and match saving

- Qualification and the Rewards page use the same database `reward_streaks()` query, returned in `league_snapshot`.
- The existing deferred INSERT trigger processes rewards within the existing match transaction. Active reward consumption remains atomic with successful match saving.
- Only a successfully inserted new match that is the participant's newest chronological game can grant a milestone. A backdated insert that is not their newest game cannot grant a roll.
- Historical edits and deletions can change current reward streaks but never create replacement/backfilled entitlements or rewrite existing reward history. Admin can void unused erroneous rewards.
- Fetch, preview, page refresh, polling, and opening Rewards never grant rolls.
- The existing unique `(player_id, qualifying_match_snapshot)` prevents repeated grants for the same player and match, even if an edit changes the calculated milestone. This is stronger than uniqueness including the milestone.
- Each entitlement stores its own milestone, result, status and history. Available cards group by owner and show a count. **Roll one** uses the oldest available entitlement; the rest remain available. Individual entries remain accessible in history.
- Progress distinguishes reward streaks from normal league streaks. At 5 wins it shows milestone 6 / one more win; at 6 it shows milestone reached and next milestone 9 / three more wins.

## Admin tools

### Reroll

An admin may reroll an unused active or pending reward after confirmation. The database checks admin authorization, locks the entitlement, checks its revision, and draws from enabled rewards excluding the immediately current result. Every remaining candidate has probability `1 / candidate count`. With all eleven enabled, a reroll has ten equally likely alternatives; ordinary rolls retain eleven equal choices. There are no weights or rarity tiers.

Multiple rerolls are allowed. An earlier result can return on a later reroll, but the current result cannot repeat immediately. With no alternative enabled reward, the operation fails without changing anything.

The entitlement ID, owner, qualifying match and milestone are preserved. Reroll clears target player, secondary target, role and hero, increments reroll count/revision, and sets the new reward active when no configuration is required or pending otherwise. The existing reveal animation displays the authoritative stored result.

### Configuration corrections

Before use, an admin can reset an active configurable reward after confirmation, then configure it again through the existing UI. Reset leaves the reward key and entitlement unchanged, clears configuration, and returns it to pending. It is not consumed while pending. Random Hero Curse / Role Roulette draw a new valid server-selected assignment when configured again.

Pending configuration can be edited directly before activation. Configuration drafts survive background polling and focus refresh; a genuine server revision change intentionally invalidates the old draft. Stale saves cannot configure a newly rerolled reward accidentally.

### Void and manual grant

Unused rewards may be voided after a reason and confirmation. The cancelled record retains its owner, original milestone, result, dates and cancellation information in history. Used rewards cannot be rerolled, reset, configured or voided through these RPCs.

The optional admin grant tool creates one separate available roll with source `ADMIN_GRANT`, optional reason, and null milestone/qualifying match. It never changes streaks. Streak rewards use `STREAK_MILESTONE` and their actual milestone. Cards/history identify the source.

### Authorization, retries and audit

RPCs enforce the existing stored admin role; hiding buttons is not the security boundary. Public viewers cannot mutate rewards. Baseline settings are public-readable but cannot be written through client roles, including admins; the reviewed SQL script sets them. Audit rows are admin-readable and not client-writable.

Reroll and configuration reset retain full before/after reward snapshots, acting admin, timestamp and request ID in `reward_admin_audit`. The UI can load the audit and shows the sequence of reroll results. Cancellation keeps its existing reason/actor fields on the reward. The explicit one-time test reset clears reward audit alongside test rewards; ordinary correction actions do not erase it.

Request IDs make retries of rerolls, resets and grants idempotent. Revision checks reject stale corrections. Existing advisory transaction locking and row locking serialize mutations with match saving; database constraints remain the final duplicate guard. Tests cover retries, stale versions and transactional rollback; a real multi-connection production contention test was not performed.

## Migration and manual SQL order

New migration: `supabase/migrations/202610100001_reward_milestones_rerolls.sql`.

Separate reset: `supabase/reset-rewards-to-latest-match.sql`.

All previously applied migrations are unchanged. The new migration preserves existing reward rows and does not choose a baseline or clear test data. New milestone grants pause until the baseline is set; existing active reward consumption continues. Existing V1 rewards are annotated as milestone 3, which matches the old rule.

Follow this order yourself:

1. Review and apply `supabase/migrations/202610100001_reward_milestones_rerolls.sql` in Supabase, after all existing migrations.
2. Review and manually run `supabase/reset-rewards-to-latest-match.sql` once. This intentionally removes all old reward test instances and reward audit, including active/pending/used test reward history. It does not delete or update matches, players, participation, heroes, bans, awards, screenshots, OpenDota IDs or auth data.
3. Inspect its output and confirm `baseline_match_id` is the current newest match using `played_at DESC, id ASC`.
4. Confirm the included baseline winners have reward streak 1 and losers have 0. Confirm ordinary match history/statistics remain unchanged.
5. Restart the local app and check Rewards. The missing-baseline notice should be gone.
6. Test milestones 3/6/9, independent accumulated rolls, a loss and a fresh three-win streak.
7. Test grant, reroll, configuration reset and void tools as admin, then read-only behavior as a viewer. Confirm used rewards remain immutable.
8. Only after local review/testing consider committing, pushing or deploying yourself.

The reset aborts without changes if no match exists, settings are missing, or a baseline has already been set. It uses a transaction and the same reward lock as match saves. It is outside the migration directory and is never invoked by app startup or deployment.

## Files changed

- `supabase/migrations/202610100001_reward_milestones_rerolls.sql`: new schema, reward streak query, milestone processing, admin RPCs, authorization, snapshot extension.
- `supabase/reset-rewards-to-latest-match.sql`: manual reward-only reset and baseline verification output.
- `src/lib/rewards.ts`: baseline/audit types, source labels, grouping and next-milestone display helpers.
- `src/lib/backend.ts`: decode V2 snapshot fields with old-schema defaults.
- `src/lib/store.tsx`: authoritative reward operations, audit reads and snapshot state using existing synchronization.
- `src/components/rewards.tsx`: milestone/source/count display, correction integration and version-aware configuration/reveal.
- `src/components/rewards-admin.tsx`: admin reroll, reset, void, audit and grant UI.
- `src/app/rewards/page.tsx`: grouped rolls and baseline-aware milestone progress within the existing layout.
- `src/app/globals.css`: small admin form/audit spacing rules.
- `src/lib/rewards.test.ts`: progress and independent entitlement grouping tests.
- `scripts/test-rewards-v2-database.mjs`: isolated V2 database regression coverage.
- `scripts/test-database.mjs`: runs V2 tests in the existing database harness.
- `scripts/test-rewards-ui.cjs`: admin tools, confirmations, grouped rolls, audit and draft preservation checks.
- `REWARD-SYSTEM-V2.md`: this report.

## Validation results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | Passed: 73 tests across 6 files |
| `npm run test:portable` | Passed: 73 tests |
| `npm run test:database` | Passed: 149 database checks, including 13 hero save checks after V2 |
| `npm run test:forms` | Passed: 11 regression groups |
| `npm run test:rewards` | Passed: 7 regression groups |
| `npm run build` | Blocked: Google Fonts DNS resolution (`ENOTFOUND fonts.googleapis.com`), preventing Inter and Rajdhani downloads |

Database tests execute against a disposable in-memory PGlite instance. They verify included baseline and deterministic tie ordering, unchanged league records, streaks 1 through 9, loss/requalification, simultaneous milestone earners, multiple rolls, single-entitlement rolling, stored milestones, retries, historical edit/preview non-grant behavior, equal candidate selection structure, excluded current result, multiple rerolls, cleared configuration, audit, manual grants, anonymous/viewer denial, used-reward protection and rollback. Progress unit tests cover milestones through 18.

Existing unit/form tests also cover overall statistics, rankings, player profiles, MVP/runner-up MVP, OpenDota, heroes/drafts, screenshots/lightbox, polling/focus draft preservation, admin/viewer behavior, wraiths and battles. Reward UI tests use real components with mocked transport and timers, not a live Supabase session. No production visual/manual end-to-end verification is claimed. The build could not finish because external Google Fonts were unreachable; fonts and the existing visual design were not replaced to hide that limitation.
