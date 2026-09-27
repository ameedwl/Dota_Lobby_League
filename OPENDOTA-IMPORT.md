# OpenDota import: implementation and setup

## What changed

Add Match now offers an admin-only OpenDota preview above the existing manual form. Fetching does not save or replace the draft. **Use this match data** explicitly confirms replacement of teams, winner, scores, duration, played date and Dota Match ID. It clears both awards for manual selection. Save Match still uses the existing validation, RPC and statistics pipeline. Editing an existing match never fetches OpenDota.

The imported preview and match form use component-local state. Polling and focus refreshes preserve them; deleted players are removed only from their affected selections. The screenshot workflow, match/statistics schema, statistics functions, ranking and public pages are unchanged.

### API and parsing

- `GET /api/opendota/match/[matchId]` verifies the caller's bearer token with Supabase Auth, then checks their stored profile role. User metadata is not trusted. Anonymous, expired and viewer sessions are rejected before OpenDota is fetched.
- The server uses the existing public Supabase configuration and caller JWT, with no service-role key. No new environment variables or OpenDota API key are required by this implementation.
- Requests use the fixed endpoint `https://api.opendota.com/api/matches/{id}`, with a 12-second upstream timeout. Only supported match fields and account/team slots are returned, with `Cache-Control: no-store`.
- Parsing rejects malformed, mismatched, duplicate-slot, duplicate-account and non-5v5 responses. Scores remain optional; seconds convert to fractional minutes. UTC start time is displayed locally; original seconds are retained when the imported date is unchanged.
- Invalid IDs, not-found matches, rate limiting, upstream failures, invalid JSON, timeouts and network failures show errors without clearing the manual draft.
- Reference: [OpenDota API documentation](https://docs.opendota.com/).

### Player mapping

The Players management form includes optional **Dota Account ID**, separate from the existing Steam ID field. Enter the Steam32 account ID, not a Steam64 ID. Application validation and PostgreSQL uniqueness prevent duplicate assignments. Existing admin-only player RLS also protects the new column.

Known IDs map automatically. Unknown, null and anonymous IDs require an explicit selection from existing league players; no identities are guessed and no players are created. Preview assignments apply only to that match. Permanent mappings are managed on Players; there is intentionally no automatic “remember mapping” write during preview.

Duplicate Dota Match IDs are checked before fetch, applying a preview and saving. A link opens an existing match when found. The initial migration already provides `UNIQUE (dota_match_id)`, which rejects conflicting writes even when another browser has stale data. No extra match constraint or historical data cleanup is needed.

## One new migration — apply manually

**`supabase/migrations/202609230001_opendota_import.sql`**

It adds:

- `players.dota_account_id bigint NULL`.
- A check allowing positive Steam32 account IDs below the anonymous sentinel `4294967295`.
- A unique constraint on non-null account IDs; multiple null values remain allowed.

It does not update existing players or matches, change their IDs, modify grants/RLS, or alter old migrations. The existing snapshot function includes the column automatically.

### Manual Supabase steps

1. Review the new migration locally. Confirm the previous three migrations have already been applied.
2. In your existing project's SQL Editor, run **only** `202609230001_opendota_import.sql` once. Do not run seed/reset scripts or replay old migrations.
3. Apply it before using the updated player-management form, since player writes now include the new column. Existing public reads tolerate the column being absent during rollout.
4. Sign in as admin and enter known account IDs through Players → Manage player → Edit.
5. On Add Match, fetch a real lobby Match ID, resolve unmapped slots, choose **Use this match data**, review the manual form, choose awards and press Save Match when ready.

No production migration or production data write was performed during development. `.env.local` was not modified, and no credentials were printed or copied.

## Validation results

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | Environment blocked Vitest worker creation: `spawn EPERM` |
| `npm run test:portable` | Passed, 51 tests (same unit-test sources through the portable runner) |
| `npm run test:database` | Passed, 78 checks against disposable local PGlite PostgreSQL |
| `npm run test:forms` | Passed, 10 regression groups |
| `npm run build` | Environment blocked Next.js build subprocess creation: `spawn EPERM` |

Coverage includes field/team mapping, malformed/error responses, server authorization, database preservation/RLS/uniqueness, manual-vs-imported statistics equivalence, explicit confirmation/no automatic save, manual awards, unknown/anonymous assignment, duplicate warnings, loading controls, and polling/focus draft preservation. Existing manual, edit, player, leaderboard and screenshot regression checks also pass.

Integration tests use controlled OpenDota fixtures and mocked HTTP responses. No live OpenDota match was imported and no real-browser end-to-end import was performed. Rerun `npm test` and `npm run build` in your normal terminal where child-process creation is permitted.

## Limitations

Availability and completeness depend on OpenDota: a lobby can be unavailable, anonymous, incomplete or rate limited. The manual workflow remains available. Missing optional details stay blank after confirmation and can be entered manually; a blank played date uses the existing save-time default. Nonstandard/non-5v5 matches are rejected. No replays, screenshots, hero statistics, KDA, or raw API payloads are persisted.

## Files modified

- `src/lib/types.ts` — optional player account ID.
- `src/lib/backend.ts` — encode/decode account ID.
- `src/lib/league.ts` — account format and uniqueness validation.
- `src/lib/store.tsx` — player mapping validation and duplicate match guard.
- `src/lib/supabase.ts` — friendly uniqueness errors.
- `src/app/players/page.tsx` — admin account ID input.
- `src/components/match-form.tsx` — confirmed draft population and duplicate guard.
- `scripts/test-portable.cjs` — register OpenDota unit tests.
- `scripts/test-database.mjs` — register local migration/security checks.
- `scripts/test-form-drafts.cjs` — import and player-management regressions.

## Files created

- `src/lib/opendota.ts` — ID validation, response parser, mapping and upstream fetch.
- `src/lib/opendota-server.ts` — authenticated request handler.
- `src/app/api/opendota/match/[matchId]/route.ts` — Next.js route.
- `src/components/opendota-import.tsx` — import preview and assignment UI.
- `src/lib/opendota.test.ts` — unit, HTTP and authorization tests.
- `scripts/test-opendota-database.mjs` — migration and RLS tests.
- `supabase/migrations/202609230001_opendota_import.sql` — the only new migration.
- `OPENDOTA-IMPORT.md` — this report.

## Git commands for you to run afterward

Nothing was committed, pushed or deployed. These PowerShell commands stage only this feature's files. Review the staged diff before committing; run the final push only when you want to publish your branch.

```powershell
Set-Location 'C:\Users\ameed\Documents\Dota_Lobby_League_Git'
git status --short
git diff --check
git diff
$importFiles = @(
  'src/lib/types.ts',
  'src/lib/backend.ts',
  'src/lib/league.ts',
  'src/lib/store.tsx',
  'src/lib/supabase.ts',
  'src/app/players/page.tsx',
  'src/components/match-form.tsx',
  'scripts/test-portable.cjs',
  'scripts/test-database.mjs',
  'scripts/test-form-drafts.cjs',
  'src/lib/opendota.ts',
  'src/lib/opendota-server.ts',
  'src/app/api/opendota/match/[matchId]/route.ts',
  'src/components/opendota-import.tsx',
  'src/lib/opendota.test.ts',
  'scripts/test-opendota-database.mjs',
  'supabase/migrations/202609230001_opendota_import.sql',
  'OPENDOTA-IMPORT.md'
)
git --literal-pathspecs add -- $importFiles
git diff --cached --check
git diff --cached
git commit -m "Add admin OpenDota match import with reviewed player mapping"
git push origin HEAD
```
