# Match screenshots — implementation and manual Supabase setup

## Status

Implemented directly in `C:\Users\ameed\Documents\Dota_Lobby_League_Git`. No production database/Storage operations, credentials access, environment changes, commit, push or deployment were performed. Both original migrations are unchanged. The code uses the existing public Supabase client and authenticated admin session; no service-role key is introduced.

## Exact migration and bucket setup

Run **`supabase/migrations/202609210001_match_screenshots.sql`** manually, once, after the existing migrations. This is the only new migration.

1. Review the complete file and this report. Verify your existing project already has the shared-league and Runner-up MVP migrations.
2. Run the entire new SQL file in your existing project's Supabase SQL Editor as the database owner. It is wrapped in one transaction. Do not rerun old migrations or seed/reset scripts.
3. This migration creates the Storage bucket **`match-screenshots`** automatically when you manually apply it. Do not create it separately first. Its settings are public reads, maximum **10,485,760 bytes (10 MiB)**, and exactly `image/jpeg`, `image/png`, `image/webp`.
4. Ensure the project's global Storage file-size setting allows at least 10 MiB. The bucket limit still caps each image at 10 MiB.
5. Verify the bucket and the policies listed below appear in Supabase. The migration also requests PostgREST schema-cache reload. No new environment variables, auth users, roles, or credentials are required.
6. Use a test project for disposable uploads. After release, attach screenshots to an intended match as admin; check public viewing from a signed-out browser. Only perform production removals when you actually want to delete those screenshots.

If a bucket with this exact name already exists, or the migration has already been applied, stop and review its configuration. The migration intentionally reports the conflict rather than overwriting a bucket or hiding schema differences. Apply it before using the new uploader. A failure before commit rolls back the migration; it does not rewrite historical matches.

## Database

`public.match_screenshots`:

- `id uuid` primary key, `match_id uuid` references matches with `ON DELETE CASCADE`.
- Unique `storage_path`, `sort_order` constrained to 1–3, `created_at` timestamp.
- Unique `(match_id, sort_order)` provides a database-enforced maximum of three attachments, including concurrent writers. This index also supports ordered lookup by match.
- Paths must match `matches/{match_id}/{screenshot_id}.jpg|png|webp`; user filenames are never used as paths.
- An insert trigger verifies admin authorization, an existing Storage object, and valid cleanup state. Rows cannot point to an object in another bucket or a different match's path.
- Public SELECT, admin-only INSERT/DELETE. No UPDATE grant is needed: replace attachments by removing and uploading a new UUID; the Storage policy allows authenticated-admin file replacement when needed.

`public.screenshot_cleanup`:

- Durable cleanup work list keyed by Storage path, with `cleanup_after`, `upload_pending`, and `created_at`; indexed for due work.
- No match foreign key, so pending cleanup survives a match deletion.
- Admin-only SELECT. Writes occur through restricted trigger/RPC functions, not public table grants.
- Screenshot deletion—including a match cascade—queues its object transactionally.

No match/player IDs, awards, statistics, ranking rules or existing rows are modified. The main league snapshot is unchanged; screenshots load separately only on Match Details.

## Exact database policies

On `public.match_screenshots`:

- `screenshots_public_read`: SELECT for anon/authenticated.
- `screenshots_admin_insert`: INSERT for authenticated, requiring existing `private.is_admin()`.
- `screenshots_admin_delete`: DELETE for authenticated, requiring existing `private.is_admin()`.

On `public.screenshot_cleanup`:

- `screenshot_cleanup_admin_read`: SELECT for authenticated admin only.

## Exact Storage policies

All are on `storage.objects` and scoped to `bucket_id = 'match-screenshots'`:

| Policy | Role/operation | Rule |
| --- | --- | --- |
| `match_screenshots_storage_read` | anon/authenticated SELECT | Public metadata access; public bucket URLs serve images without login |
| `match_screenshots_storage_insert` | authenticated INSERT | Existing admin role, safe generated path, existing match |
| `match_screenshots_storage_update` | authenticated UPDATE | Existing admin role; resulting path is safe and belongs to an existing match |
| `match_screenshots_storage_delete` | authenticated DELETE | Existing admin role; no live screenshot row or unexpired upload refers to the path |
| `match_screenshots_storage_insert_guard` | authenticated INSERT, restrictive | Same admin/path/match checks even if another permissive policy exists |
| `match_screenshots_storage_update_guard` | authenticated UPDATE, restrictive | Same admin/path/match checks even if another permissive policy exists |
| `match_screenshots_storage_delete_guard` | authenticated DELETE, restrictive | Same admin/reference/grace-period checks even if another permissive policy exists |
| `match_screenshots_storage_anon_insert_guard` | anon INSERT, restrictive | Denies writes to this bucket |
| `match_screenshots_storage_anon_update_guard` | anon UPDATE, restrictive | Denies writes to this bucket |
| `match_screenshots_storage_anon_delete_guard` | anon DELETE, restrictive | Denies writes to this bucket |

Restrictive guards leave other buckets' policy decisions unchanged. Existing league RLS, public reads, profile permissions and one-admin enforcement remain intact.

## Workflow and cleanup

Uploads validate MIME type, size, batch count and match existence. The app generates UUID paths, registers a one-hour cleanup grace period through `prepare_screenshot_upload`, uploads original bytes with overwrite disabled, then inserts metadata. A successful insert cancels the cleanup registration in the same database transaction.

Failed inserts queue immediate cleanup through `discard_screenshot_upload`. Ambiguous responses are reconciled against the metadata row so a committed upload is not deleted. Successful files in a partially failed batch remain visible. If the browser closes or connectivity disappears mid-upload, the pre-registered path becomes eligible for cleanup after one hour.

Removal requires confirmation, deletes the database row first, then removes the object through the Supabase Storage API. `complete_screenshot_cleanup` acknowledges cleanup only after the object is gone. It cannot erase an unexpired upload's cleanup registration. Direct match deletion also queues every screenshot through the cascade trigger.

The existing LeagueProvider retries due cleanup on admin connection, focus, and each visible 15-second interval, including after navigating away from a deleted match. With no connected administrator, queued files remain until an admin reconnects; no server-side worker or service-role secret is added. Removed public files can remain in existing caches/downloaded copies; deletion is not a privacy revocation mechanism.

SQL only reads Storage object metadata. It never deletes `storage.objects` rows to simulate deleting files: actual bytes are removed with the Storage API, as required by the [Supabase Storage schema guidance](https://supabase.com/docs/guides/storage/schema/design).

## UI and performance

- MATCH SCREENSHOTS appears below existing teams/match details, using current dark panels and typography.
- Admin-only drag/drop and browse accept multiple files, with status and per-file completion counts; duplicate submissions are blocked synchronously.
- Up to three responsive thumbnails, stable slot ordering, inline removal confirmation.
- Accessible native-dialog preview with close, Escape and previous/next controls; images preserve aspect ratio within the viewport.
- Public/viewer users can view and preview images; upload/remove controls disappear after logout.
- Image errors have an inline fallback. Screenshot-list errors never block the league snapshot.
- Images are lazy-loaded on Match Details. History/list pages load no images. Thumbnails use CSS sizing of the original file; no compression, original modification, or paid image-transform dependency is introduced.

## Files modified

- `scripts/test-database.mjs`
- `scripts/test-form-drafts.cjs`
- `scripts/test-portable.cjs`
- `src/app/globals.css`
- `src/app/matches/[id]/page.tsx`
- `src/lib/store.tsx`
- `src/lib/types.ts`

## Files created

- `scripts/screenshot-test-client.cjs`
- `scripts/test-screenshots-database.mjs`
- `src/components/match-screenshots.tsx`
- `src/lib/screenshots.ts`
- `src/lib/screenshots.test.ts`
- `supabase/migrations/202609210001_match_screenshots.sql`
- `MATCH-SCREENSHOTS.md` (this report)

## Validation results

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, no warnings |
| `npm test` | Blocked by environment: Vitest worker `spawn EPERM` |
| `npm run test:portable` | 42 unit/workflow tests passed |
| `npm run test:database` | 71 PostgreSQL integrity/security checks passed in isolated PGlite |
| `npm run test:forms` | All seven React/DOM scenario groups passed, including screenshots |
| `npm run build` | Blocked by environment: Next worker `spawn EPERM` |
| `git diff --check` | Passed |

Tests cover 0–3 attachments, fourth rejection, MIME/size checks, ordering, matching IDs, public reads, admin-only writes/replacement/deletion, restrictive policies, cascade cleanup, upload interruption, concurrent slot use, partial/failed uploads, response loss, metadata cleanup, gallery/lightbox, browser/drop input, confirmations, and logout. Existing match drafts and award/leaderboard tests still pass.

Database tests use actual PostgreSQL logic via PGlite with minimal mock Storage tables; they verify bucket settings and RLS but do not run the Supabase Storage HTTP service. React tests use JSDOM and a mocked Storage boundary, including a dialog-method shim. No live upload, CDN behavior, native-browser visual review, or production build was verified. Run `npm test` and `npm run build` in your normal terminal and smoke-test Storage HTTP behavior in a separate Supabase test project before releasing.

## Security and rollout considerations

- Screenshots are intentionally public; upload only content meant for public viewing. Originals and embedded metadata are preserved.
- File-type/size restrictions exist in the browser and bucket configuration. Authorization is enforced by database/Storage policies, not by hidden buttons.
- The migration takes normal schema locks and assumes existing Supabase-managed Storage tables and league admin functions. It was not applied to or introspected against production.
- Cleanup is eventual across database and object storage. The durable queue and upload grace period prevent normal failure/interruption paths from silently abandoning files, but require an admin browser to perform due cleanup.
- No scheduled function, new authorization model, or service-role key is needed.

References: [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [bucket restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets).

## Exact Git review, commit and push commands

Run these yourself after review. Current branch: `main`; remote: `origin`.

```powershell
Set-Location 'C:\Users\ameed\Documents\Dota_Lobby_League_Git'
git status --short
git diff --check
git diff --stat
git diff
Get-Content -LiteralPath 'supabase/migrations/202609210001_match_screenshots.sql'
git add -- src/lib/types.ts src/lib/store.tsx src/lib/screenshots.ts src/lib/screenshots.test.ts src/components/match-screenshots.tsx src/app/globals.css 'src/app/matches/[id]/page.tsx'
git add -- scripts/test-database.mjs scripts/test-form-drafts.cjs scripts/test-portable.cjs scripts/screenshot-test-client.cjs scripts/test-screenshots-database.mjs
git add -- supabase/migrations/202609210001_match_screenshots.sql MATCH-SCREENSHOTS.md
git diff --cached --check
git diff --cached
git commit -m "Add public match screenshots with admin uploads and durable cleanup"
```

Only when you are ready to publish:

```powershell
git push origin main
```

A push may trigger your existing automatic deployment configuration. Apply the reviewed migration before publishing the new uploader. Nothing was pushed or deployed by Codex.
