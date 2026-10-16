# Lung Birthday Event

## Event window and existing player

Requested start: now. Captured start is **2026-10-16T17:17:40Z**; end is **2026-10-19T17:17:40Z**, exactly 72 hours later. In Asia/Beirut this is **October 16, 2026 at 20:17:40 through October 19 at 20:17:40**.

Central configuration lives in `src/lib/special-event.ts`. Client rendering starts neutral on the server, then checks the explicit UTC window after mount, every second, and on focus. At expiration the banner, card, intro, audio and birthday wraith eligibility disappear automatically; no deployment is required. Ordinary league functionality continues. The persistent gift has no expiry.

The existing public profile was inspected locally using shared league data: nickname **LUNG**, name **Hermes**, player UUID **0b4662ea-1447-4b80-b6ae-bd5811b283c8**. No player was created. The resolver accepts exactly one existing player with a normalized name/nickname of Lung or Hermes and uses that player's actual ID. Missing/ambiguous matches disable decorations. The configuration supports an explicit verified `playerId` override if names change or become ambiguous; the manual grant script provides the equivalent override. Both must identify the same player.

## Original stone emblem

`stone-emblem.tsx` creates the seal entirely with SVG/CSS: an irregular stone tablet, beveled edge lines, shallow cracks, inset dark grooves, offset pale engraving, interrupted rune ring, crossed dagger geometry and restrained violet/blue light. Layered dark and light strokes create recessed carving depth; the engraved LUNG lettering uses an offset dark undercut. Four small spectral fragments drift around the crest (two on small screens). No image asset, Valve artwork or rendering dependency is needed.

The existing dark/crimson site remains intact. The home card is a temporary monument with countdown, replay, profile link and database-confirmed gift status. The same small crest appears above Lung's original profile. No other profile receives it, and no statistics are fabricated. His currently visible hero history does not establish Phantom Assassin use, so no PA statistic is claimed.

## Intro, audio and accessibility

First visit shows a native dialog with an always-visible Skip / Close button and Open birthday surprise action. The sequence emerges from shadow, reveals the stone, lights the grooves, brings in the existing articulated wraith in spectral colors, and reveals the title. It settles after 12 seconds. Reduced motion omits the moving wraith/particles and provides a simple static ceremony with manual audio.

Audio path: `public/events/lung-birthday/lung-birthday.mp3` (URL `/events/lung-birthday/lung-birthday.mp3`). **The file is currently missing.** Place Todd / REVO's original recording there unchanged. A HEAD availability/content-type check disables playback controls when missing; media errors also degrade to a silent ceremony.

On the explicit opening gesture, the audio element is primed at zero volume. At 4.5 seconds it returns to the beginning and attempts audible playback. Playback promises are caught. If browser policy still prevents it, Play birthday audio remains available as an explicit gesture. The recording is neither modified, embedded as base64 nor stored in Supabase. No replacement recording is supplied.

Mute/unmute and pause/manual playback are available. Skip/Escape cancels the delayed playback and stops audio. At natural settlement, audio may continue only with the visible pause/resume, mute and stop dock. Replay first stops the previous session. Expiration/unmount cancels timers and pauses media. Generation checks prevent a delayed play promise from restoring a stopped session.

Seen state uses `lobby-legends-lung-birthday-2026-seen` in localStorage. Opening or skipping marks the intro seen; navigation and refresh do not repeat it. Replay remains available from the banner/card without any database mutation. If storage is unavailable, the visit still works, but seen state cannot persist across reloads.

The native modal provides keyboard focus containment, Escape and focus restoration. The page scroll position is preserved with body scrolling locked only while the dialog is open. If the dialog API fails, the intro closes instead of blocking the site. UI uses visible focus outlines and ordinary labeled buttons. Countdown does not run during SSR, avoiding time-based hydration mismatches.

## Wraith integration

The existing canvas, route geometry, size system, Radiant/Dire solos and battles remain. During the event, eligible scheduler turns have a 9% birthday chance, with consecutive birthday events prohibited; normal events dominate. Birthday appearances use Medium/Large (35%/65%), violet/silver-blue energy, a rune seal, drifting shards and a birthday inscription. Existing randomized routes provide variation. There is no extra huge size tier.

Only one major event runs at a time. Opening the intro stops the normal controller and clears its pending timer/frame. The intro's single ceremonial controller runs one birthday pass. Closing/settling cleans it up and resumes normal scheduling. Birthday passes use the existing route renderer, not a second creature implementation. Reduced motion, visibility changes, resize, bounded particles and pixel/DPR caps remain supported. No React state updates occur per animation frame.

## Persistent birthday reroll

New migration: `supabase/migrations/202610160001_birthday_reroll_credit.sql`.

Manual grant: `supabase/grant-lung-birthday-2026-reroll.sql`.

The migration adds `reward_reroll_credits`, public-readable and not client-writable. Its unique source key allows only one lifetime credit for `lung-birthday-2026`. The manual script resolves the existing player and inserts one credit idempotently. Running it twice never restores a used credit; a conflicting owner or ambiguous/missing player causes an error without changes.

**No live credit has been granted by this implementation.** Exactly-one behavior is confirmed in the isolated database tests; run the manual SQL yourself to create the real credit. The UI only says gift unlocked/available when the shared snapshot actually contains it.

The admin-only `use_birthday_reroll` RPC validates credit ownership, locks with the existing reward/match advisory lock and row locks, and calls the existing `reroll_reward` RPC. That preserves the entitlement and milestone/source, excludes the current reward, clears incompatible configuration, updates reroll count and records the normal audit. Credit consumption occurs in the same transaction. Wrong owner, unavailable/used/cancelled reward, stale revision or no alternatives leaves the credit unused. Request IDs make a retry safe; a fresh second use is rejected. A request from an earlier ordinary reroll cannot consume a birthday credit.

The migration also fixes an existing V2 picker defect found during expanded testing: the selected random key is now assigned once before the catalog lookup. Previously PostgreSQL could reevaluate volatile `random()` for each candidate row. The forward-only replacement keeps uniform odds among enabled alternatives and benefits ordinary rerolls too. No previous migration was edited.

Credits do not change win streaks, reward baseline, 3/6/9 logic, rank, matches, stats or reward entitlements. Unspent credit survives visual expiration indefinitely and remains visible on Rewards. A used credit retains its reward link/request/timestamp and is not replenished. Ordinary admin rerolls remain available independently; admins explicitly choose whether to spend the birthday credit.

## Files changed

- `src/lib/special-event.ts`, `src/lib/special-event.test.ts`: event configuration, identity/time helpers, rarity and unit tests.
- `src/components/events/birthday-event.tsx`: event provider, cinematic, audio, banner and home/profile card.
- `src/components/events/stone-emblem.tsx`: original programmatic crest.
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/players/[id]/page.tsx`, `src/app/globals.css`: temporary integration and scoped styles.
- `src/components/lobby-wraith-effect.tsx`, `src/lib/wraith-controller.ts`, `src/lib/wraith-render.ts`, `src/lib/wraith.test.ts`: scheduler coordination, palette, ceremonial effects and regression checks.
- `src/lib/backend.ts`, `src/lib/store.tsx`: optional snapshot credit field and secure redemption call using existing synchronization.
- `src/components/rewards-admin.tsx`, `src/app/rewards/page.tsx`: confirmed credit use and persistent status.
- `supabase/migrations/202610160001_birthday_reroll_credit.sql`: new schema/RPC/snapshot and picker fix.
- `supabase/grant-lung-birthday-2026-reroll.sql`: manual idempotent gift script.
- `scripts/test-birthday-database.mjs`, `scripts/test-birthday-ui.cjs`, `scripts/test-database.mjs`, `scripts/test-rewards-ui.cjs`, `scripts/test-portable.cjs`, `package.json`: added tests and `npm run test:birthday`.
- `public/events/lung-birthday/README.md`: recording placement instructions.
- `LUNG-BIRTHDAY-EVENT.md`: this report.

## Validation

- Typecheck and lint passed.
- Vitest: 77 tests passed across seven files.
- Portable tests: 77 passed.
- Form regression suite: all 11 groups passed, including polling drafts, OpenDota, heroes, awards, profile/leaderboard, screenshots/lightbox and admin/viewer behavior.
- Rewards UI: all 8 groups passed, including birthday confirmation, redemption status, disappearance of spent-credit action and authoritative reveal.
- Birthday UI: all 4 groups passed for SSR neutrality, first visit, target-only cards, scheduler pause/resume, 4.5-second playback, Skip cancellation, seen/replay, mute/pause, fallback, Escape, expiration, missing audio, reduced motion and cleanup.
- Isolated PostgreSQL/PGlite: 161 checks passed. Tests cover migration preservation, idempotent grant, identity ambiguity, owner/auth checks, stale revisions, used rewards, exactly-one redemption, retry, persisted audit, no alternatives rollback, picker draws, and unchanged baseline. No SQL was applied to the live league.
- Production build passed after network permission allowed Google Fonts downloads. Initial restricted attempts encountered DNS/socket permissions and an output-directory error; no font substitution was made.
- Browser: inspected the actual local intro, home card and LUNG/Hermes profile. Verified original profile values remain displayed and the ceremony naturally settles. Tested 1920×1080, 1366×768, 768×1024, 1024×768, 390×844 and 844×390: crest fits, Skip is visible, no dialog horizontal overflow. Short landscape layouts can scroll vertically. Viewport override restored afterward.
- Wraith tests exercise the birthday controller at the same six sizes, with single-controller cleanup and reduced motion; existing solo/battle tests still pass.
- Screenshot: `C:/Users/ameed/Documents/Codex/lung-birthday-preview.png`.

Limitations: the real recording is absent, so its actual sound/length and device-specific autoplay still need your listening test. Browser visual testing was read-only against existing shared league data; live credit redemption was deliberately not tested because SQL remains yours to apply. Multi-connection production load testing was not performed. Expiration is based on the visitor device clock, as a decorative client feature; the server credit does not depend on that clock.

## Exact manual steps

1. Place the unmodified recording at `public/events/lung-birthday/lung-birthday.mp3`.
2. Review and apply **only** the new `202610160001_birthday_reroll_credit.sql` migration after existing migrations. Do not rerun the reward baseline reset.
3. Review and manually run `supabase/grant-lung-birthday-2026-reroll.sql`. Check its returned owner is LUNG/Hermes and remaining uses is 1 (or 0 if already spent). If identity is ambiguous, configure the verified existing UUID in both the script and event config.
4. Start the local app with `npm run dev` (or use the local preview already running). The configured event clock started at your “from now” instruction; it does not restart on deployment or first visit.
5. Open a fresh/incognito browser and inspect the first-visit seal. Click Open birthday surprise.
6. Listen for Todd's audio around 4.5 seconds. Test the manual playback fallback if browser policy blocks it.
7. Test Skip before playback, Escape, mute, pause/resume and stop. Confirm no delayed audio starts after Skip.
8. Test Replay birthday surprise from the banner/home card; it must not grant or consume anything.
9. Inspect Lung's profile and the home card. Other players and real statistics should remain unchanged.
10. After login as admin, open Rewards. With an unused rolled reward owned by Lung, expand Admin correction and use **Use birthday reroll**, then confirm. Check the new result, audit and used credit. This consumes the real one-time gift; ordinary reroll is separate.
11. Test phone/tablet orientations with the real audio file.
12. Run `npm run test:birthday` and the unit tests to exercise automatic expiry without changing production timestamps. For an additional manual local expiry test, temporarily set the configuration end shortly ahead, observe all birthday UI/audio disappear, then restore the original window before committing. The unused gift stays on Rewards.
13. Only after your review decide whether to commit/push/deploy.

No commit, push, deployment, live SQL, player creation, baseline reset, reward deletion, statistics modification or .env.local change was performed.
