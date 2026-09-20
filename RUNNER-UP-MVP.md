# Runner-up MVP implementation and manual upgrade

## Status

Implemented directly in `C:\Users\ameed\Documents\Dota_Lobby_League_Git` on `main`. Changes are unstaged for review. No commit, push, deployment or production database operation was performed. `.env.local`, credentials, original migration, seed data, authentication and RLS policies were not changed.

## Migration to apply manually

**`supabase/migrations/202609200001_runner_up_mvp.sql`**

This is the only new migration. Do not rerun `202609160001_shared_league.sql` or the seed script against your existing project.

1. Review the new SQL file and the Git diff.
2. In your existing Supabase project's SQL Editor, run the complete new migration once, as the database owner. It includes its own transaction. This was not applied by Codex.
3. Apply it before using the updated frontend to save awards. The old RPC would ignore the new JSON field before migration.
4. Restart/update the app through your normal workflow. No environment-variable changes are required.
5. Verify an existing match still loads with no Runner-up, then verify your next intended match's awards after saving and refreshing. Use a separate test project for disposable test matches.

### Database and RPC changes

- Adds nullable `matches.runner_up_mvp_player_id`, referencing `players(id)` with `ON DELETE RESTRICT`, plus an index.
- All pre-existing rows retain their IDs, timestamps, participation, MVPs and results; the new field is NULL.
- Replaces `private.check_match()` while retaining both existing deferred constraint triggers. Final transaction state must contain 5v5 unique participants, a winning-team MVP and a losing-team Runner-up. Either award may be NULL; they cannot be the same player.
- Replaces `public.save_match(jsonb, boolean, timestamptz)` with the same signature, admin authorization, security-invoker behavior and optimistic-concurrency check. Creates/edits persist Runner-up. An omitted Runner-up key on updates preserves the existing value for older clients; explicit NULL clears it.
- `league_snapshot()` already serializes complete match rows with `to_jsonb`, so it automatically returns the new column; its definition and permissions stay unchanged.
- Requests the PostgREST schema cache to reload after commit. Public reads, admin-only writes, one-admin enforcement and auth remain unchanged.

### Migration risks and historical behavior

The old schema permitted a losing-team MVP. Such historical awards are deliberately preserved, remain readable, and are labeled as historical on match details. Saving an edit to such a match now requires selecting a winning-team MVP or explicitly clearing it. The migration does not silently change historical awards into Runner-up awards. New Runner-up statistics start at zero for existing history.

The migration acquires table locks while adding the column/index. Apply during a quiet period. It assumes the original migration's schema is present, intentionally fails on unexpected schema drift or a repeated application, and rolls back on failure. Do not apply only part of it. Production schema differences were not inspected; validation used isolated PostgreSQL via PGlite.

## UI and statistics

- Add/Edit Match have separate optional award selectors, limited to the winning and losing teams respectively. Winner/roster changes remove only invalid award selections.
- A legacy invalid MVP stays visible as a disabled previous selection until corrected or cleared; saving enforces the new rules.
- Both awards retain component-local drafts through 15-second polling, focus/token refresh, and transient read/auth failures. Failed saves retain drafts; successful saves and Clear clear them. Edit forms retain their original concurrency version.
- Match cards/history and match details show both awards. Runner-up has a secondary silver treatment. Details identify each recipient's team and outcome.
- Player profiles show derived Runner-up MVP awards. Lobby Records adds Most Runner-up MVP Awards using existing deterministic tied-holder ordering.
- Counts derive only from match history. Player ranking, win/loss, streak and head-to-head calculations remain unchanged.

## Files modified

- `scripts/test-database.mjs`
- `scripts/test-form-drafts.cjs`
- `src/app/globals.css`
- `src/app/matches/[id]/page.tsx`
- `src/app/players/[id]/page.tsx`
- `src/app/stats/page.tsx`
- `src/components/match-form.tsx`
- `src/components/ui.tsx`
- `src/lib/backend.ts`
- `src/lib/league.ts`
- `src/lib/stats.test.ts`
- `src/lib/stats.ts`
- `src/lib/supabase.ts`
- `src/lib/types.ts`

## Files created

- `supabase/migrations/202609200001_runner_up_mvp.sql`
- `RUNNER-UP-MVP.md` (this report)

## Validation

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | Environment blocked Vitest worker creation: `spawn EPERM`; portable equivalent passed |
| `npm run test:portable` | 29 unit tests passed |
| `npm run test:database` | 53 PostgreSQL security/integrity checks passed in an ephemeral PGlite database |
| `npm run test:forms` | All five React/DOM scenario groups passed |
| `npm run build` | Environment blocked Next build worker creation: `spawn EPERM` |
| `git diff --check` | Passed |

Dependencies were installed from the existing lockfile using `npm ci --ignore-scripts` because regular `npm ci` could not spawn lifecycle scripts in this environment. Package manifests and lockfile were not changed. Run regular `npm ci`, `npm test` and `npm run build` from your own terminal before release.

Tests cover nullable/absent awards, old snapshot data, strict new-save validation, counts and tied records, create/edit/delete, transaction rollback, direct-table and RPC constraints, participant changes, historical migration preservation, unchanged authorization, and serialization. React tests mount real providers and forms with mocked Supabase; they simulate polling callbacks and focus/token events and check every field including both awards, failed/successful saves, deleted players, winner changes, remote edits, and profile/details/record rendering. No production data is used by these tests. A full production build and live-browser end-to-end save remain unverified due to the environment boundary.

## Git review, commit and push commands

Run these yourself after review. Staging is restricted to the implementation's explicit files.

```powershell
Set-Location 'C:\Users\ameed\Documents\Dota_Lobby_League_Git'
git status --short
git diff --check
git diff --stat
git diff
Get-Content -LiteralPath 'supabase/migrations/202609200001_runner_up_mvp.sql'
git add -- src/lib/types.ts src/lib/stats.ts src/lib/stats.test.ts src/lib/league.ts src/lib/backend.ts src/lib/supabase.ts
git add -- src/components/match-form.tsx src/components/ui.tsx src/app/globals.css src/app/stats/page.tsx 'src/app/matches/[id]/page.tsx' 'src/app/players/[id]/page.tsx'
git add -- scripts/test-database.mjs scripts/test-form-drafts.cjs supabase/migrations/202609200001_runner_up_mvp.sql RUNNER-UP-MVP.md
git diff --cached --check
git diff --cached
git commit -m "Add Runner-up MVP awards with safe forward migration"
```

When you are ready to publish the reviewed commit:

```powershell
git push origin main
```

If GitHub is connected to Vercel automatic deployments, pushing may trigger one. Apply the reviewed migration first and control deployment through your existing workflow. Codex did not push or deploy.
