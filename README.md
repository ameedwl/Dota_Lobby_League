# Lobby Legends

A polished, responsive private Dota 2 lobby league dashboard. Phase 1 uses browser-local data, giving a ten-player group a complete leaderboard, match ledger, profiles, records, and match-entry workflow without requiring a backend.

## Stack and architecture

- Next.js App Router, React, strict TypeScript, Tailwind CSS 4, and Lucide icons.
- `src/lib/fixtures.ts` supplies development seed data; production components never embed fixtures.
- `LeagueProvider` hydrates fixtures once, then persists player and match changes in `localStorage`.
- Match participation is the source of truth. Pure utilities in `src/lib/stats.ts` derive games, wins, losses, rates, streaks, form, MVPs, and rivalry records.
- Route-focused pages use shared cards, avatars, headers, standings, and match components.

## Local installation

Requires Node.js 20.9 or later.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Local changes persist in the browser under `ll-players` and `ll-matches`; clear those keys to restore fixtures.

## Environment variables

None are required in Phase 1. Add future public configuration to `.env.local` and never commit secrets.

## Quality commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

## Sample data

Ten fictional players and ten complete 5v5 matches live in `src/lib/fixtures.ts`. They load automatically on a fresh browser profile. This intentionally replaces a database seed command for Phase 1.

## Phase 2: Supabase setup

Supabase, PostgreSQL migrations, and authentication are intentionally **not implemented** yet. In Phase 2, replace the provider implementation with a repository/service interface backed by Supabase while preserving the domain types and stat functions. Recommended tables are `players`, `matches`, and `match_players`, with a unique `(match_id, player_id)` constraint, team checks, foreign keys, and participant performance columns ready for hero/KDA data.

## Deploy to Vercel

1. Push the repository to a Git host and import it into Vercel.
2. Keep the framework preset as **Next.js** and build command as `npm run build`.
3. No environment variables are needed for Phase 1.
4. Deploy. Note that local data is per-browser and is not shared between friends until Phase 2.

## Current limitations and roadmap

Phase 1 has no accounts, shared persistence, live Dota integration, or cross-device sync. Player deletion is blocked when history references that player. The recommended next feature is the Supabase repository layer and relational migration, followed by admin authentication. The stat model already leaves room for hero/KDA data and a future ten-player team balancer.
