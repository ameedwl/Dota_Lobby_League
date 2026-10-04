# Reward System — V1

## Status and migration

Implementation is ready for review and local testing. Nothing was committed, pushed, deployed, or applied to a real Supabase project. No environment secrets were read or changed. Old migrations were not edited.

**Run this new migration, in full, only after reviewing it:**

`supabase/migrations/202610040001_reward_system.sql`

It is newer than the previously latest `202609270001_hero_stats.sql`. It assumes the existing migrations, including hero tracking and OpenDota uniqueness, are already installed. It runs inside a transaction and requests a PostgREST schema reload. Do not rerun old migrations or reset/seed your existing database.

## Data model and security

- `reward_catalog`: stable key, configuration kind, enabled flag. The TypeScript catalog in `src/lib/rewards.ts` is the central source for names, descriptions, icons and form metadata. The migration mirrors only the server-required keys/configuration/enabled flags; a database test verifies parity. There are no rarity or weight columns.
- `reward_rolls`: one permanent row per earned entitlement, including owner, qualifying match, immutable qualifying match ID snapshot, final reward key, targets, position, hero, status, earned/rolled/activated/used/cancelled timestamps, used match and immutable used-match ID snapshot, and correction reason.
- Status flow: `available` → `pending_configuration` → `active` → `used`. Pick the Teams and Self Silence go directly from available to active when rolled. Cancellation is a terminal correction state, with an explanation; even used records can be annotated as cancelled without erasing their original outcome or usage reference.
- Unique `(player_id, qualifying_match_snapshot)` prevents duplicate unlocks and survives deletion of the referenced match. Multiple separate streaks create separate rows; nothing overwrites an earlier roll.
- Owner and target foreign keys restrict player deletion. Hero and reward catalog references restrict deletion. Qualifying/used match foreign keys use `ON DELETE SET NULL`; immutable match ID snapshots remain. The UI labels deleted matches instead of linking to missing pages.
- Indexes cover status/earned time, qualifying match, used match and both target references; the unique owner/qualification index supports player history.
- RLS permits anonymous and authenticated reads. Neither public users nor the admin client can directly insert, update or delete reward rows or catalog entries. Only authenticated callers can execute the three reward RPCs, and every RPC verifies the existing `private.is_admin()` permission on the server. These security-definer functions have an empty search path, qualified table names, and explicit grants. Revoking admin access immediately blocks reward actions.
- Catalog enabling/disabling is a deliberate SQL-owner maintenance operation in V1, not a public/admin-client toggle. New definitions require updating the central catalog plus a new forward-only migration; tests detect mismatched metadata.

## Eligibility, ordering and match transactions

Qualification happens in an INSERT-only deferred constraint trigger on `matches`, installed by the new migration. It runs after the roster has been recorded, in the same transaction as the existing `save_match` RPC. It also handles valid direct admin match inserts. A failed match/hero/award/participant validation rolls back both the match and all reward processing.

For each winning participant, the server reads actual match history ordered by `played_at DESC, id ASC`, matching the existing statistics helper. It counts consecutive wins before the first loss. Exactly three wins earns one roll. Four, five, six or longer uninterrupted wins earn no extra roll. A loss resets eligibility; a later three-win streak can earn another roll. All qualifying participants are processed independently.

The newly inserted match must be the latest match for that player in this chronological ordering. This prevents backdated newly entered games from granting an entitlement for a later historical streak. Tied timestamps use match ID order, consistently with the existing stats display.

There is no backfill query in the migration or on page reads. Two existing wins can contribute when the next new match completes the streak. An existing three-win streak is not rewarded on installation, refresh or its fourth win. No independent streak counter is stored. Current Streaks on `/rewards` directly reuses `calculatePlayerStats`.

The existing `save_match` signature and all validations are retained. Its replacement only adds a transaction advisory lock before row locking. Match mutation triggers and reward RPCs share that lock so new-match processing and activation have a defined order. Reward RPCs additionally lock the entitlement row. No new match-saving API or extra client-side reward-save request is introduced.

Historical edits do not create, consume, duplicate or automatically cancel rewards. Correct actual mistakes with the confirmed admin correction action. Historical deletions retain reward history and do not automatically reactivate a consumed reward. A newly recorded backdated match still consumes an active reward when required participants are present: consumption is defined by recording order, while streak eligibility is defined by played chronology.

## Rolling and equal probability

`roll_reward` validates admin access, locks the entitlement, counts enabled catalog entries, and selects a uniformly random integer index into the ordered enabled pool. **All 11 enabled rewards have equal odds: 1/11, approximately 9.09% each.** There are no reward-specific weights. Disabled entries are excluded; the denominator automatically follows the enabled count. An empty pool returns an error without spending the entitlement.

The selected key and roll timestamp are stored before the RPC returns. Retries return the existing result rather than rerolling. The browser starts a roughly 2.2-second rotating rune-seal reveal only after receiving the stored result. The reveal can be skipped, and reduced-motion preferences remove the spinning delay. Closing the browser, navigating away or refreshing never changes the result. There is no reroll control.

## The eleven rewards

| Reward | Configuration and next-game rule |
| --- | --- |
| Pick the Teams | Immediately active. Owner chooses how the two teams are divided; tracked as a house rule. |
| Hero Protection | Admin selects one existing hero through the existing searchable HeroSelector. That hero cannot be banned. |
| Role Priority | Select owner's position, 1–5. |
| Role Commander | Select another player and position 1–5. Owner cannot target themselves. |
| Self Silence | Immediately active. Owner stays muted in Discord for the **entire game**. |
| Silence Someone | Select another player who stays muted in Discord for the **entire game**. |
| My Teammate | Select another player who must share the owner's team. |
| Not With Me | Select another player who must be on the opposite team. |
| Random Hero Curse | Select another player. Server uniformly chooses a hero from the existing `hero_catalog` table and permanently stores its ID. The assigned hero cannot be banned. No second hardcoded hero list. |
| The Swap | Select two distinct existing players to swap after teams form. Owner may be one of them. No pre-match team assignment is required. |
| Role Roulette | Select another player. Server uniformly chooses Position 1–5 and permanently stores it. |

`configure_reward` verifies the required fields, target existence, self-target restrictions, distinct swap targets, role range and known heroes. Client-supplied random heroes/roles are rejected. Once activated, repeated configuration requests return the saved result without retargeting or rerolling. Configuration drafts are local component state keyed by reward ID; polling and focus refresh do not reset them. If a selected player disappears before activation, only that selection becomes invalid. Failed requests preserve other draft fields.

## Consumption, display and correction

On successful new match recording, fully active rewards are marked used and linked to the match if:

- Owner-scoped rewards: owner participates.
- Targeted rewards: owner and configured target participate.
- The Swap: owner and both configured players participate.

Missing participants leave the reward active. Pending configuration is never consumed. Form opening, OpenDota fetch/preview, public reads and historical edits do not consume anything. Confirmed manual and OpenDota match creation both use the existing save transaction. Multiple rewards are independently representable and consumable.

`/rewards` adds Available Rolls, Active/Pending Rewards, Current Streaks, Reward Pool and permanent Reward History. History is newest first and filters by owner, status and reward. Owner links and qualifying/used match links connect to existing pages. The main navigation includes Rewards. Public users can read everything but do not see mutation controls.

The Add Match page includes a compact active-house-rules reminder, with a link to Rewards. Existing form fields and draft handling are unchanged. Conflicting same-team/opposite-team pairs, different roles assigned to one player and different curse heroes assigned to one player produce a HOUSE RULE CONFLICT warning. The group/admin resolves conflicts manually. Rewards do not police Discord, build teams or block saving a match because a house rule was not followed.

A restrained Admin correction disclosure requires a 3–500 character explanation and explicit confirmation before voiding a reward. The original outcome and history remain, and voiding does not grant a replacement roll.

## Files changed

New:

- `supabase/migrations/202610040001_reward_system.sql`
- `src/lib/rewards.ts`
- `src/lib/rewards.test.ts`
- `src/components/rewards.tsx`
- `src/app/rewards/page.tsx`
- `scripts/test-rewards-database.mjs`
- `scripts/test-rewards-ui.cjs`
- `REWARD-SYSTEM.md`

Updated:

- `src/lib/backend.ts`: reads rewards/catalog from the shared snapshot; detects an unapplied migration without breaking older league snapshots.
- `src/lib/store.tsx`: shared reward data and admin RPC actions using existing refresh/write flow.
- `src/lib/supabase.ts`: referenced-player deletion message also mentions reward history.
- `src/components/nav.tsx`: Rewards navigation link.
- `src/app/add-match/page.tsx`: active reward reminder.
- `src/app/globals.css`: scoped responsive reward cards/reveal and existing nav collapse behavior for the extra link.
- `scripts/test-database.mjs`: runs reward integration tests and reruns hero/save compatibility after the new migration.
- `scripts/test-portable.cjs`: includes reward unit tests.
- `package.json`: adds `npm run test:rewards` for the new UI regression script.

No wraith, statistics, hero catalog, screenshot, authentication or OpenDota implementation changes were made. No old migration was edited.

## Validation results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run test:portable` | 71 tests passed |
| `npm run test:database` | 133 PostgreSQL security/integrity checks passed using a temporary in-memory PGlite database |
| `npm run test:forms` | All 11 existing form/UI regression groups passed |
| `npm run test:rewards` | All 5 new reward UI/provider regression groups passed |
| `node scripts/test-wraith.cjs` | Passed |
| `npm test` | Blocked before tests by Vitest worker `spawn EPERM` |
| `npm run build` | Blocked during Next production build by `spawn EPERM` |

Database coverage includes no backfill, pre-existing two wins, exact-three eligibility, multiple winners, wins four/five/six, losses and later streaks, duplicate IDs/imports, backdated saves/edits, public/admin permissions, enabled pool filtering, empty pool, all 11 configuration branches, invalid/self targets, stored random assignments, missing participants, failed saves, successful manual/import-shaped saves, corrections and history preservation. Existing hero/draft/award save checks run again after the reward migration is installed in the isolated instance.

UI coverage uses the real LeagueProvider and components with a fake transport: stored-result-before-reveal, reduced motion, polling/focus draft preservation, missing targets, failed configuration, activation/banner updates, public read-only controls, correction confirmation and cleanup without React warnings. Pure tests check catalog invariants, clear instructions and conflict warnings.

Browser layout checks used actual Rewards components rendered with isolated sample data and existing CSS at 1440px desktop, 768px tablet and 390px mobile widths. No horizontal overflow was observed. The preview used fallback fonts and inactive server-rendered controls; it was not a live Supabase end-to-end session.

Not verified here: live Supabase/PostgREST RPC behavior after deployment, true simultaneous multi-connection lock contention, production build output, full in-browser authenticated workflows against a real backend, and animation performance on physical devices. The standard worker restriction was not bypassed. The temporary preview servers were stopped.

## Exact manual steps

1. Review the changed files and the entire new SQL migration. Confirm your project has the prior migrations through `202609270001_hero_stats.sql` already installed.
2. Open Supabase SQL Editor for your intended test project. Copy **all** of `supabase/migrations/202610040001_reward_system.sql`, including `begin` and `commit`, and run it once. Do not run a reset or the existing seed file against your league.
3. Start the local app normally with `npm run dev`. Existing environment configuration is reused; no new keys, service-role key or environment variable is required.
4. Open `/rewards`. Before migration it deliberately shows a setup message; after migration it should show 11 rewards at equal odds and zero retroactive rolls.
5. Sign in with the existing admin. Record legitimate test fixtures in the test league: two prior wins plus a new third should unlock a roll for each qualifying winner. A fourth win must not unlock another. A loss then three wins should unlock a separate entitlement.
6. Roll once. Refresh, revisit and retry safely: the saved result must persist. Configure any required target, position or hero. Wait beyond 15 seconds and switch tabs while configuring; the draft must remain. Check public/incognito users see no roll/configuration/correction controls.
7. Check the Add Match reminder. Save a new match with missing required participants and confirm the reward stays active; then save an applicable match and confirm Used plus its match link. Historical edits must not consume/grant; deleting a referenced test match must retain the reward history.
8. Check the reveal at normal and reduced motion, responsive layouts, and intended house-rule text. Use confirmed Void only for a real recording mistake; it is not a reroll.
9. Rerun `npm run typecheck`, `npm run lint`, `npm run test:portable`, `npm run test:database`, `npm run test:forms`, `npm run test:rewards`, `npm test`, and `npm run build` from a normal local terminal to complete checks unavailable in this restricted execution environment.
10. Review the result and decide yourself whether to commit, push or deploy. None of those actions were performed here.
