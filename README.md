# Lobby Legends — Supabase setup

The current design and pure league statistics are preserved. Production league data now comes only from Supabase PostgreSQL. There is no automatic fixture or localStorage fallback. Supabase Auth persists the login session in browser storage; it does not store league history there.

## 1. Create your Supabase project

1. Create a project in the Supabase dashboard and wait for the database to be ready.
2. Keep the database password private. The app does not need it or a service-role key.
3. In the project API settings / Connect dialog, copy the project URL and the public anon key (a publishable key is also supported by the SDK). Never use a service-role or secret key in a NEXT_PUBLIC variable.
4. Enable Email/password authentication. For this league, disable public signups if only the owner needs an account. Anonymous visitors can still view the league.
5. Configure Auth Site URL for your deployment and allowed redirect URLs for local development and Vercel. The app uses password login, not OAuth.

Official references: [API keys](https://supabase.com/docs/guides/api/api-keys), [password authentication](https://supabase.com/docs/guides/auth/passwords), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 2. Apply the database migration

Open **SQL Editor** in the new project. Run the complete file:

`supabase/migrations/202609160001_shared_league.sql`

It creates players, matches, match_players, profiles, league_settings, foreign keys, indexes, RLS, profile-creation triggers, the atomic match-write function and the public snapshot function. Run it once on a new project; do not repeatedly paste it into a populated project.

Alternatively, with the Supabase CLI linked to your project, use `supabase db push` to apply migrations. Review the target project first. The SQL Editor method requires no CLI.

For a development league, optionally run **supabase/seed.sql** afterward. It inserts the existing ten fictional players and ten fixture matches in one transaction, with valid UUIDs. It is deliberately not run by the app and is intended for an empty league. Do not use it to overwrite real history.

## 3. Create the owner account

In **Authentication → Users**, add your own email/password user and confirm its email using the dashboard's confirmation option. Use a strong private password. The auth.users trigger creates a profiles row with role viewer, regardless of signup metadata.

Copy that Auth user's UUID. It is not the player UUID or email address.

## 4. Promote exactly one administrator

Run this SQL in SQL Editor as the project owner. Replace the placeholder UUID with your actual Auth user ID. This transaction checks that the user exists, demotes any previous administrator, and promotes only the chosen user.

```sql
-- Run in Supabase SQL Editor as project owner AFTER creating your Auth user.
-- Replace the placeholder below with the user's actual UUID, not their email.
begin;
lock table public.profiles in exclusive mode;
do $$
declare chosen uuid := 'REPLACE_WITH_YOUR_AUTH_USER_UUID';
begin
 if not exists(select 1 from auth.users where id=chosen) then raise exception 'Auth user does not exist'; end if;
 insert into public.profiles(id) values(chosen) on conflict(id) do nothing;
 update public.profiles set role='viewer' where role='admin';
 update public.profiles set role='admin' where id=chosen;
 if (select count(*) from public.profiles where role='admin')<>1 then raise exception 'Exactly one admin is required'; end if;
end $$;
commit;
-- Verify:
select id,display_name,role from public.profiles where role='admin';

```

The same SQL is saved in `supabase/promote-admin.sql`. A partial unique index prevents a second administrator even if an incorrect manual promotion is attempted. Neither viewers nor the app administrator can modify profiles/roles through the public API. To transfer administration, repeat the owner-only SQL with the new UUID.

## 5. Configure and run the app

Requires Node.js 22 or later.

Copy `.env.example` to `.env.local` in the app directory:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

These are the only application environment variables. No server-only secret is needed. Never put a service-role key or a password in the repository. The .env.local file is ignored by Git.

```powershell
npm install
npm run dev
```

Restart the dev server after changing environment variables. Open the local app, select Login, and use the owner account created above. The Admin link, Add Match and player/match management controls appear after the profile role is verified. Logout removes management access. A viewer can log in but remains read-only.

Until these setup steps are complete, the app intentionally shows a setup message instead of displaying local fixture data as if it were shared data.

## Permissions and integrity

- All five application tables have RLS enabled.
- Public and signed-in visitors can read players, complete match history/participation, and league settings.
- A signed-in user can read only their own profile. There are no client profile-write grants/policies.
- All league INSERT/UPDATE/DELETE policies check the profile whose ID equals auth.uid(). User metadata and client-provided roles cannot grant access.
- Role checks query the database on each write, so revocation takes effect even with an existing JWT.
- All privileged helper functions have a fixed empty search_path and qualified object names. The role lookup lives in a non-exposed private schema.
- save_match is SECURITY INVOKER and uses the same RLS policies. Its explicit admin check also produces a useful error. Creating or editing a match and all ten participation rows is one transaction.
- Deferred database constraints enforce exactly five players per team and participant-only MVPs at commit. They also apply to direct database/API writes, not just the app.
- Unique participation prevents duplicates across teams. Foreign keys protect referenced players. Match deletion cascades only to its participation rows.
- Timestamps and immutable UUIDs determine match order and rank ties. No win/loss/streak counters are stored.
- Match version timestamps reject stale edits. The app reloads an atomic snapshot after successful writes and polls every 15 seconds while visible so other browsers receive updates. Focus also refreshes the league.
- Numeric duration preserves the existing fractional-minute support. Scores are not treated as kills.
- League name and season can be edited under Admin. The name appears in navigation; the season appears on Home and Leaderboard.
- New tables/functions receive no automatic anon/authenticated write or execute grants from this migration's owner defaults. Every future feature must explicitly add RLS/admin checks and tests. Do not add privileged RPCs without reviewing grants and authorization.

## Existing local data

The old fixture file remains at src/lib/fixtures.ts for tests/seed generation. Existing browser-local league keys are left untouched and are not read by the app.

To preserve actual old local history before seeding a new backend:

1. In the browser where the previous version stored the league, export the JSON value of `ll-league-v1` using browser developer tools → Application → Local Storage. Save that value as `legacy-league.json` outside the repository.
2. If you only have the older separate keys, combine `ll-players` and `ll-matches` into an object with `players` and `matches` arrays.
3. Generate a separate SQL file:
   `node scripts/generate-seed.cjs path/to/legacy-league.json path/to/import.sql`
4. Review that SQL and apply it to an empty development league first, then your empty destination league. UUIDs are remapped consistently for participants/MVPs. Old /players/p1 and /matches/LL-1042 URLs are replaced by UUID routes.
5. Do not run both the fixture seed and an actual-history import against the same league.

Regenerate the checked-in fixture seed with `npm run seed:generate`. This only writes a SQL file; it does not connect to any database.

## Verification

```powershell
npm run typecheck
npm run lint
npm test
npm run test:portable
npm run test:database
npm run build
```

- `npm test` uses Vitest. `test:portable` runs the same pure-statistics cases without worker subprocesses when the host blocks workers.
- `test:database` applies the actual migration and seed to an isolated embedded PostgreSQL engine (PGlite). It supplies a minimal auth.users/auth.uid test harness and executes SQL as anon, authenticated viewer, and authenticated admin. It tests real grants/RLS/constraints, not a mocked permission function.
- Covered security cases include public reads; blocked viewer/anon inserts, updates and deletes; blocked profile escalation and forged metadata; one-admin enforcement; admin CRUD; historical player protection; invalid match rollback; stale updates; MVP membership; and role revocation.
- Hosted Supabase Auth, PostgREST and a real login session must still be verified after project setup. No hosted verification is possible before that project exists.
- In a staging project, create a second Auth user and leave them as viewer. Confirm all public routes work signed out and as viewer, direct admin URLs deny access, viewer management controls are absent, and admin save/edit/delete/logout work. Use only disposable test matches for deletion checks.
- The restricted desktop host previously blocked Vitest workers and Next.js build subprocesses with spawn EPERM. A production build must succeed on an unrestricted machine or Vercel before deployment.

## Deploy to Vercel

1. Commit the app, lockfile, migration and seed scripts to your repository; exclude .env.local and any export with private league data.
2. Apply the migration and owner promotion in the target Supabase project first.
3. Import the repository into Vercel with the Next.js framework preset.
4. Add the two NEXT_PUBLIC_SUPABASE_* variables for the correct environment (Production / Preview). Public variables are bundled at build time; redeploy after changing them.
5. Set the Supabase Auth Site URL to the production domain and configure any required preview/local redirect URLs.
6. Deploy using `npm run build`. Verify signed-out reads, owner login, viewer denial and logout against the hosted project. No service-role secret is required.


### Form draft regression checks
Run `npm run test:forms` for in-process React/DOM tests with a mocked Supabase boundary. These mount the real providers and forms and exercise the 15-second polling callbacks, focus and token refresh, refresh failures, failed/successful saves, explicit clearing, deleted players, concurrent match edits, and player/settings drafts. They do not write to a live league.

Match drafts remain component-local. Edit drafts retain their initial match version for optimistic concurrency checks. Background auth verification does not temporarily revoke the current role; verification errors preserve the draft and block writes until permissions can be checked again. Confirmed sign-out or role revocation still removes admin access.
