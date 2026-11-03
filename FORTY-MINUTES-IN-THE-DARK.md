# 40 MINUTES IN THE DARK

A Lobby Legends Match Tribute. Local implementation report from 2 November 2026, with the forest and stone revision from 3 November 2026.

This work adds a temporary site-wide celebration and a permanent tribute attached to one existing match. No commit, push, deployment, SQL, database migration, match mutation, reward change, or `.env.local` edit was performed. The Steam/GC experiments and OpenDota integration were not changed.

## 1. Concrete special match

- **Database match ID:** `34fa3a02-c5c4-40d0-bf0d-43ce77513e7b`
- **Dota match ID:** `9072289730`
- **Permanent route:** `/matches/34fa3a02-c5c4-40d0-bf0d-43ce77513e7b`
- **Live record:** [Lobby Legends match](https://dota-lobby-league.vercel.app/matches/34fa3a02-c5c4-40d0-bf0d-43ce77513e7b)

The UUID is stored in `src/lib/match-tributes.ts`. There is no runtime newest/latest-match lookup. Adding another match cannot move the tribute. No duplicate match was created.

## 2. Identification evidence and data discrepancy

Read-only inspection of the live site identified its latest record as the match above, played **1 November 2026 at 22:07 Asia/Beirut**, with **Radiant victory, 53–36**. The recorded hero/player combinations also match the requested story:

| Hero | Player | Team |
| --- | --- | --- |
| Night Stalker | Ameed | Radiant |
| Shadow Fiend | Hermes | Radiant |
| Medusa | Cenky | Dire |
| Spirit Breaker | Martinus | Dire |

**The existing record displays `51.5 minutes`, which is 51:30, not 51:50.** The inspected match schema has no game-mode field. The tribute inscription uses the user's supplied **51:50 / CAPTAINS MODE** as presentation metadata; the stored duration and all other match data remain unchanged. The concrete identity was selected from the current latest record, exact winner/score and matching heroes, rather than claiming an exact database duration/mode match.

A direct database read was unavailable in the sandbox, and its elevated retry was aborted. The live browser provided the record identity and visible evidence instead. No database write was attempted.

## 3. Event start and end

The final activation window is exactly 72 hours:

| Setting | Explicit timestamp | Asia/Beirut |
| --- | --- | --- |
| `globalStart` | `2026-11-03T21:49:00+02:00` | 3 November 2026, 21:49 |
| `globalEnd` | `2026-11-06T21:49:00+02:00` | 6 November 2026, 21:49 |

Both values live in `src/lib/match-tributes.ts`. Start is inclusive; end is exclusive. The fixed UTC offsets make parsing independent of the visitor's timezone. Change these two values together if activation is intentionally postponed; preserve the concrete match ID.

## 4. Automatic global expiration

`isGlobalTributeActive(now)` controls the temporary celebration. The provider checks time once per second and also refreshes on window focus and visibility changes. At the deadline, ordinary routes lose the background, engravings, banner, temporary card, intro and player; active temporary audio stops. Open form/content children remain mounted. No deployment is needed to expire an already deployed event.

The countdown is clamped at zero. There is no theme before the start on ordinary routes. Home, Leaderboard, Players, Stats, Rewards, Add Match, Admin, general Match History and ordinary match pages return to their original presentation after expiration.

## 5. Permanent match behavior

`tributeForMatch(matchId)` and `isSpecialTributeMatch(matchId)` are independent of the global window. `tributeForPath()` first resolves an exact permanent match route, then considers any active global celebration.

The configured Match Details page keeps its forest scene, match inscription, legend archive card, optional anthem, first-visit entrance and Replay Tribute before, during and after the global event. Its edit route does not receive the permanent theme. Other matches receive no permanent treatment.

The existing teams, score, heroes, picks/bans, MVP, runner-up, metadata and screenshot component remain in place. The historical match's displayed metadata is not rewritten to match the decorative inscription.

## 6. Files changed or added

| File | Purpose |
| --- | --- |
| `src/lib/match-tributes.ts` | Central tribute identity, timing, inscription, routing and seen-key helpers |
| `src/lib/match-tributes.test.ts` | Fixed identity, timing boundaries, permanent routes, newer-match and countdown tests |
| `src/components/events/match-tribute.tsx` | Theme provider, native intro dialog, banner, event panel, archive card and shared anthem controls |
| `src/components/events/tribute-forest.tsx` | Responsive forest artwork and decorative canopy, fracture and bat layers |
| `src/app/tribute.css` | Scoped atmosphere, cinematic, responsive layouts and reduced-motion styling |
| `src/app/layout.tsx` | Persistent provider and tribute stylesheet integration |
| `src/app/page.tsx` | Temporary home tribute card |
| `src/app/matches/[id]/page.tsx` | Permanent archive card on the configured match |
| `src/components/ui.tsx` | Permanent badge on the shared match card |
| `src/components/lobby-wraith-effect.tsx` | Suspend existing wraith scheduling while the tribute intro is open |
| `scripts/test-tribute-ui.cjs` | In-process React lifecycle and audio regression checks |
| `scripts/test-portable.cjs` | Include tribute unit tests in the portable runner |
| `package.json` | Add `npm run test:tribute`; no new dependency |
| `public/events/40-minutes-in-the-dark/match-anthem.mp3` | Byte-identical copy of the supplied original audio at the requested public path |
| `FORTY-MINUTES-IN-THE-DARK.md` | This report |

The user's pre-existing `public/events/40-minutes-in-the-dark/match-anthem..mp3` remains untouched. No reward, auth, backend, SQL or OpenDota source was modified.

## 7. Event architecture

The small `matchTributes` registry holds presentation metadata. `MatchTributeProvider` remains mounted above the route content, so navigation during the global event does not recreate the audio element or replay the entrance. All visuals are scoped under `.tribute-theme`; expiry removes the scope instead of rewriting normal page styles.

The theme uses SVG and CSS, with no added animation library or full-screen canvas. Time updates run once a second, not every animation frame. The existing birthday provider remains intact. Tribute replay defers when the birthday intro is active. The existing wraith component uses its normal cleanup/restart mechanism to prevent solos or battles overlapping the tribute cinematic; the wraith rendering and scheduling algorithms are unchanged.

## 8. Hero engravings and stone

One continuous night forest scene frames the inscription. The engravings share the same mineral grain, erosion, moss and cracks as the surrounding basalt. Chipped edges and dark, interrupted grooves suggest material cut into the rock. The old individual hero silhouettes were replaced by two art-directed background plates.

The desktop left cliff holds the largest engraving. Night Stalker emerges as wing ribs and a horned brow behind roots, with a drifting shadow that crosses the cliff. Spirit Breaker's partial bull brow and swept horn sit lower on the same side. On the right, Medusa's serpent grooves curl through the upper ruins and Shadow Fiend's skull and radial cuts sink into the charcoal below.

A handful of small SVG paths align with selected grooves. Violet marks catch Night Stalker's eyes and a wing rib. A teal glint crosses Medusa's stone, dim red lights Shadow Fiend's fractures, and a short dashed blue trace moves along Spirit Breaker's fracture. The cut rock remains visible when the lights fade.

## 9. Forest, atmosphere and motion

Distant trees, the cliffs and low mist are painted into the backdrop. Near branches move by a few pixels on independent 31- and 43-second cycles. A large soft shadow moves across the Night Stalker cliff on a 39-second cycle.

Faint back fog and side-weighted mid fog drift on 59- and 38-second cycles. A front wisp appears briefly on a 51-second cycle. The title and controls sit above the atmospheric layers. A dark gradient keeps the forest passage behind the text.

The intro has a staggered flock that travels from the left toward the upper passage. Entering swaps it for a shorter pass from the opposite side, with no concurrent opening flock. The site and archive get a short pass in each 57-second cycle. Individual bats vary in size, departure time and flap speed. The ordinary site uses two bats and a single mist layer, and portrait uses one bat and omits the front wisp.

## 10. Scene variants

- **Intro.** The stone emerges from near black over three seconds. Spirit Breaker's fracture, Medusa's groove, Shadow Fiend's embers and Night Stalker's eyes and wing glint at staggered intervals. Enter starts a shorter light sequence and a foreground wisp within the existing entrance interval.
- **Global pages.** A dimmer plate and a broad central veil leave the forest at the edges. Fewer fog layers and bats move behind the usual content.
- **Permanent match.** The richer plate and engraving lights frame Match Details. The archive uses the same scene during and after the global celebration.

## 11. Responsive art and reduced motion

A portrait WebP is selected by `picture` at an aspect ratio of 4:5 or narrower. It places Night Stalker high on the left and Spirit Breaker low on the right with a dark corridor between them. It has its own branch and groove coordinates. The existing compact landscape title layout remains in use.

Reduced motion renders the final stone image, a static canopy, shadow and mist, and removes bats and the moving wisp. The intro and anthem controls remain available.

## 12. Revision files and performance

| File | Purpose |
| --- | --- |
| `src/components/events/tribute-forest.tsx` | Shared decorative forest scene and its portrait overlays |
| `src/components/events/tribute-engravings.tsx` | Removed the previous outlined SVG artwork |
| `src/components/events/match-tribute.tsx` | Connects the forest scene to the existing intro, global and archive scopes |
| `src/app/tribute.css` | Defines the scene variants, motion, contrast and responsive rules |
| `public/events/40-minutes-in-the-dark/ruined-forest.webp` | 1672×941 forest plate, 182,812 bytes |
| `public/events/40-minutes-in-the-dark/ruined-forest-portrait.webp` | 941×1672 portrait plate, 96,748 bytes |
| `FORTY-MINUTES-IN-THE-DARK.md` | Revision details and validation |

The built-in image generation tool produced both plates, which are served locally as WebP. The browser selects one plate for the viewport. The memoized decorative scene has no timers or animation state, and the underlying scene is hidden while the intro dialog is mounted. CSS drives the environmental movement, primarily with transforms and opacity. The blue trace changes stroke dash offset on a small SVG path. There are no added animation dependencies or canvas loops.
## 13. First-visit cinematic

The native modal introduces Lobby Legends and the engraved match record as the forest comes into view and the title fades in. **ENTER THE DARK** starts the optional anthem from the click and settles into the site after approximately 2.4 seconds. The intro remains usable in silence. **Skip intro** or Escape dismisses it and stops any requested playback.

The native dialog provides modal focus containment. Focus and body scrolling are restored on dismissal; controls have visible focus styling. No keyboard trap or compulsory listening is introduced.

## 14. Audio path and preservation

Browser URL: `/events/40-minutes-in-the-dark/match-anthem.mp3`

Project path: `public/events/40-minutes-in-the-dark/match-anthem.mp3`

The supplied file was already present as `match-anthem..mp3`. It was copied without transcoding or modifying the recording. Both files have SHA-256:

```text
D1C9BE0D974A5ED24AA2ECC89335D1B5B67F50BB3B58795C601944C008F01106
```

Audio is served as a normal public file, not stored in Supabase or embedded as base64. There is no generated or substitute audio.

## 15. Audio and autoplay handling

No playback occurs before a user gesture. A HEAD check verifies availability and audio content type. The Play button stays disabled while checking or unavailable; a missing/invalid file produces a clear silent fallback and **Check anthem again**.

`HTMLMediaElement.play()` is called synchronously from the interaction before awaiting its promise. Rejection leaves a visible **PLAY MATCH ANTHEM** fallback. If ENTER happens before the availability check completes, the player remains available afterward for an explicit Play click; it does not schedule a surprise autoplay.

Pause/Resume, Mute/Unmute and Stop share one audio element. Pause keeps the player available for resuming. Stop resets the recording without canceling the visual entrance's completion. Request-generation and playback-intent guards prevent stale promises from restarting canceled audio or pausing a newer request. Skip, route teardown and expiry cancel pending entrance work. There is no delayed audio-start timer to fire after Skip.

## 16. Seen state

The versioned localStorage keys are:

```text
lobby-legends-40-minutes-dark-2026-v1-global-seen
lobby-legends-40-minutes-dark-2026-v1-archive-seen
```

Entering or skipping records the qualifying visit. Global navigation and refresh then open directly into the theme. Visiting the permanent match during the global event also marks its archive visit, preventing a second entrance when the deadline passes while that page is open.

If storage is unavailable, an in-memory guard prevents repeated entrances within the mounted session; persistence across a fresh browser session cannot be guaranteed when the browser denies storage. Replay remains available regardless of the keys.

## 17. Replay Tribute

Replay is available from the home event card, the site-wide event panel, and the permanent match archive card. It stops the prior audio session, clears any prior entrance timer and opens a fresh visual entrance. Audio still requires the subsequent user gesture. Replay never changes match or reward data.

## 18. Match History badge

The shared `MatchCard` checks the configured match ID and shows **◆ MATCH LEGEND · 40 MINUTES IN THE DARK** only for that record. This also applies to any use of that card on Home or profile/history lists. The badge is independent of the event clock and therefore remains after global expiry. The card links to the existing Match Details route.

## 19. Original implementation viewport checks

Browser checks covered **1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 390×844, 320×568 and 844×390**. These cover desktop, laptop, tablet landscape/portrait, mobile portrait, narrow mobile and mobile landscape.

There was no horizontal page overflow in the checked tribute layouts. The narrowest intro permits a small vertical scroll so every control stays reachable. Smaller screens reduce opacity, simplify the background and hide secondary reliefs. The low-height landscape layout places title and inscription side by side. Tables retain their existing internal scroll behavior; themed stats grid children use `min-width: 0` to avoid pushing the page wider.

Local QA images:

- `C:/Users/ameed/.codex/visualizations/2026/11/02/01a19d8d-f063-7a62-ba87-9d173d8eac81/tribute-desktop.jpg`
- `C:/Users/ameed/.codex/visualizations/2026/11/02/01a19d8d-f063-7a62-ba87-9d173d8eac81/tribute-mobile.jpg`
- `C:/Users/ameed/.codex/visualizations/2026/11/02/01a19d8d-f063-7a62-ba87-9d173d8eac81/tribute-home.jpg`
- `C:/Users/ameed/.codex/visualizations/2026/11/02/01a19d8d-f063-7a62-ba87-9d173d8eac81/tribute-archive.jpg`

## 20. Reduced-motion controls

`prefers-reduced-motion: reduce` removes tribute animations and transitions and hides bats and the front wisp. The stone, canopy, remaining mist and title render statically. ENTER settles in approximately 200 ms. Audio remains optional and user-triggered. The existing wraith system also retains its reduced-motion behavior.

## 21. Original implementation tests

| Command/check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | 82/82 passed |
| `npm run test:portable` | 82/82 passed |
| `npm run test:tribute` | Six lifecycle regression groups passed |
| `npm run test:forms` | Passed |
| `npm run test:birthday` | Passed |
| `npm run test:rewards` | Passed |
| `node scripts/test-wraith.cjs` | Passed |
| `npm run build` | Passed after an approved network retry for Google Fonts |
| Local browser layouts and real audio controls | Passed for the viewport/control checks described above |
| Local browser expiration simulation | Passed; actual November activation timestamps restored |

## 22. Original implementation coverage

The new unit tests verify the exact concrete UUID, a 72-hour window, before/start/end boundaries, countdown clamping, independent seen keys, exact permanent route matching and immunity to newer/reordered match records. The portable runner includes the same unit cases.

The in-process UI regression suite covers first visit, seen state, Escape/Skip, focus and scroll restoration, wraith suspension, replay, audio gesture/rejection/missing-file behavior, mute/pause/resume/stop, late promise cancellation, ordinary navigation, live expiration and permanent archive behavior. This uses controlled React/JSDOM media and clock substitutes; it does not claim to reproduce every browser's media policy.

Real local browser checks exercised the intro, themed home and special match, actual audio playback, Mute, Pause, Resume and Stop. Ordinary routes retained the active global theme, and history showed one permanent legend badge. Protected Admin/Add Match viewer gates remained unchanged. Forms and reward mutations were not submitted to the live database.

With a temporary completed interval, browser checks confirmed no theme or banner on Home, Leaderboard, Matches, Players, Stats, Rewards, Add Match, Admin and another ordinary match. Home and Matches each retained exactly one legend badge. The special match kept its theme, archive card and enabled anthem control, with no global banner. Replay after expiry and Escape worked; Escape returned focus to Replay and restored body scrolling. The browser console contained no errors in this final expiry pass. The actual **2–6 November 2026, 21:49 Beirut** timestamps were restored and verified in the configuration afterward.

The existing unit and portable suites also cover stats, heroes, screenshots, OpenDota and rewards. Existing birthday and wraith UI regressions passed. No live match insertion was needed to test the newer-match case.

## 23. Original implementation environment limits

- The first production build could not fetch Google Fonts under the initial network restriction. The elevated retry succeeded; font or application code did not need a workaround.
- A direct database identity query was unavailable and its elevated attempt was aborted. Read-only live browser inspection supplied identity evidence, with the duration/mode limitations explicitly recorded above.
- The selected live match has no screenshots attached. Its screenshot component remains present, but a real full-screen screenshot interaction on this particular record could not be exercised without adding data. Test an existing screenshot-bearing match manually if desired; screenshot source was not altered.
- No database mutation tests, SQL application, authenticated admin writes or live reward actions were run. Those are outside this presentation-only task and the user's local-first instruction.
- Browser expiry QA passed and the actual November activation window was restored. Future manual expiry simulations should restore these same values before any separate deployment decision.

## 24. Exact manual steps before testing

1. Confirm the original song is at `public/events/40-minutes-in-the-dark/match-anthem.mp3`. It is already copied there byte-for-byte; no additional placement is needed unless you replace or remove it.
2. From `C:\Users\ameed\Documents\Dota_Lobby_League_Git`, run `npm run dev`. Use the local URL printed by Next.js. The intended global window is 3 November 2026 at 21:49 to 6 November 2026 at 21:49 Beirut time; if testing outside it, temporarily adjust only `globalStart`/`globalEnd` to an active 72-hour interval.
3. Open that local URL in a fresh/incognito browser. For an existing session, remove the two tribute seen keys shown in section 16 from that local origin's localStorage.
4. Verify that the first qualifying global visit shows the intro and that no song plays before interaction.
5. Press **ENTER THE DARK**. If the file check is still pending, use the visible player once it becomes ready.
6. Listen for the supplied anthem and verify that the page remains usable when sound is muted or unavailable. If browser policy rejects playback, press **PLAY MATCH ANTHEM**.
7. Test **Skip intro**, Escape, Mute/Unmute, Pause/Resume, Stop and Replay Tribute. Skip before ENTER should remain silent; Stop after ENTER should not prevent the intro from settling. Confirm keyboard focus remains visible.
8. Browse Home, Leaderboard, Matches, Players, a player profile, Stats and Rewards. If signed in as an admin, also visit Add Match and Admin without saving changes. Confirm the global atmosphere persists, the intro does not repeat and audio does not restart on navigation or refresh.
9. Open `/matches/34fa3a02-c5c4-40d0-bf0d-43ce77513e7b` on the local site. Confirm its 53–36 record and legend badge. The existing metadata still displays 51.5 minutes; the tribute inscription displays the supplied 51:50.
10. Verify the archive card, engraving theme, anthem controls and Replay Tribute. Check the existing teams, heroes, picks/bans and awards. Use an existing match with screenshots to check the gallery/lightbox without modifying this record.
11. Simulate expiry locally by temporarily changing the two global timestamps in `src/lib/match-tributes.ts` to a completed 72-hour interval, for example `2026-10-20T20:45:00+02:00` and `2026-10-23T20:45:00+02:00`. Confirm ordinary routes return to normal, history keeps exactly the special record's badge, other matches stay normal and the special match alone keeps the full tribute. To observe an open tab cross a deadline, temporarily set an end a minute ahead and start exactly 72 hours earlier.
12. Restore `globalStart: "2026-11-03T21:49:00+02:00"` and `globalEnd: "2026-11-06T21:49:00+02:00"`. Do not change the fixed match ID. Recheck the final diff so no test interval remains.
13. Check desktop/tablet/mobile sizes, narrow portrait and landscape, keyboard navigation and your operating system's reduced-motion setting. Refresh once to verify seen-state persistence. Missing audio can be tested by temporarily moving only the correctly named copy aside, then restoring it and pressing **Check anthem again**.
14. Review the local result and report, then decide separately whether to push or deploy. This task stops with local implementation and checks; nothing has been committed, pushed or deployed.

## 25. Artwork generation prompts

<details>
<summary>Desktop and portrait prompts</summary>

Desktop

Create one ultra-wide 16:9 landscape environmental background plate for a premium cinematic Dota 2 match tribute website. No text, no lettering, no title, no UI, no logos. A single coherent photoreal matte-painting scene of a moonless ancient night forest swallowing a ruined basalt monument. Viewed from ground level looking into a narrow forest passage. The central 43% width must be empty very dark midnight-navy negative space behind where a tall centered title and score will be typeset, with receding thin tree trunks, soft dim fog and a little wet stone ground at the very bottom only. Design readable peripheral environmental detail using soft cold gray bounced light and deep navy black shadows. Twisted centuries-old black trees hug the extreme sides and rake across the upper corners, roots wrap the cliffs, wet fractured stone has nuanced mineral grain, moss, sediment and erosion. The two sides are cliff walls made of connected broken rock and weathered temple stones, not four individual plaques. On the LEFT at x 21%, y 39%, the largest weathered hidden RECESSED intaglio engraving of Dota Night Stalker, broad bat wing ribs, pointed horned head and severe brow, organically merging with fissures and stone in a large cliff wall behind branches. At LOWER LEFT x 24% y 77% a partial ancient Spirit Breaker engraving, a charging bull brow and swept horns cut directly into broken basalt, small diagonal fractures. At UPPER RIGHT x 78% y 34% an eroded Medusa face with winding serpent grooves hewn into a ruined wall. At LOWER RIGHT x 78% y 73% an almost-lost Shadow Fiend skull and short radial grooves sunk into charcoal rock. These are ancient incised rock cuts, darker cavities with discontinuous chipped stone edges and crossing cracks, worn away in patches, the same exact rock grain running across the carvings, nearly pareidolia on first sight. Environmental forest and rock reads first. No bright colored glow, no metal, no raised borders, no extruded sculpture, no living people or monsters, no portraits or floating icons, no obvious illustration line art, no torchlights, no moon. Fog pooling behind stones and in the low foreground, cinematic deep perspective. Use slate, desaturated violet, charcoal, a little gray navy. Grade dark but retain readable detail along outer thirds. Full-bleed wide art.

Portrait

Create a 9:16 portrait-oriented background matte painting for a cinematic mobile web intro, a dedicated portrait composition. No text, letters, logos, UI, numbers. Photoreal weathered moonless night forest, midnight navy and basalt gray, very dark. In the UPPER LEFT corner only, a rugged outcrop of ancient ruined basalt with one subtle large recessed Night Stalker intaglio (broad bat wing ribs and small sharp horned head incised into rock, recognizable on second glance) under twisted ancient roots and branches. Preserve quiet deep navy shadow across the central 70% width and middle 55% of height, with extremely faint vertical tree trunks receding into a foggy passage, so large centered white score, text, and controls will read cleanly. Near the BOTTOM RIGHT, under faint low mist, a broken angular stone with the weathered partial engraving of Spirit Breaker, a charging bull brow and horn cut into the same basalt, visible in fragments. Stagger the compositions vertically, upper left and bottom right, with tree silhouettes curling inward a little at upper right. Damp rock mineral grain and crossing hairline cracks within the cuts, subtle soft raking cold light, sparse moss. Cavities of intaglio worn flush into the surrounding rock, no raised relief panels, no separate figures, no glowing outlines, no obvious art lines. A quiet distant foggy forest corridor, scene primarily environmental. Full-bleed portrait.

</details>

## 26. Forest revision verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` and `npm run test:portable` | 82/82 passed in each runner |
| `npm run test:tribute` | All six regression groups passed, including audio errors, cancellation, expiry, replay and the permanent badge |
| `npm run test:birthday` and `node scripts/test-wraith.cjs` | Passed |
| `npm run test:forms` and `npm run test:rewards` | Passed |
| `npm run build` | Passed on a retry outside the Windows sandbox after local build-directory errors |
| Local Chrome | Intro at eight viewport sizes, portrait asset selection, no horizontal overflow in the intro or tested mobile pages, silent Skip, real anthem progress, pause/resume, Replay Tribute, navigation, reduced motion, and archive and history behavior after expiry |

The final Chrome run used an isolated production build, local league fixtures and a browser clock override. Direct loading of the expired match passed in that build. An earlier direct-load attempt picked up a development bundle from the shared build directory. The fixture let the actual Match Details UI render without using the live league service. The anthem advanced using the actual local MP3. The viewport checks covered 1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 390×844, 320×568 and 844×390.

A 120-frame headless desktop sample during the intro measured a 7.1 ms p95 frame interval, with a 14.1 ms maximum in the completed run. The sample is a local smoke check. The initial desktop viewport requested only one forest asset. Playback and reduced-motion checks used the same application controls as the normal site.

Local review captures

- [Desktop intro](C:/Users/ameed/.codex/visualizations/2026/11/03/01a1a2b9-5520-7151-8d42-1ac0fd9832fc/tribute-forest-desktop.jpg)
- [Portrait intro](C:/Users/ameed/.codex/visualizations/2026/11/03/01a1a2b9-5520-7151-8d42-1ac0fd9832fc/tribute-forest-mobile.jpg)
- [Landscape intro](C:/Users/ameed/.codex/visualizations/2026/11/03/01a1a2b9-5520-7151-8d42-1ac0fd9832fc/tribute-forest-landscape.jpg)
- [Temporary global scene](C:/Users/ameed/.codex/visualizations/2026/11/03/01a1a2b9-5520-7151-8d42-1ac0fd9832fc/tribute-forest-global.jpg)
- [Permanent archive after expiry](C:/Users/ameed/.codex/visualizations/2026/11/03/01a1a2b9-5520-7151-8d42-1ac0fd9832fc/tribute-forest-archive-expired.jpg)
- [Reduced-motion portrait intro](C:/Users/ameed/.codex/visualizations/2026/11/03/01a1a2b9-5520-7151-8d42-1ac0fd9832fc/tribute-forest-reduced.jpg)

## 27. Anthem creator credit

**TYSIOTE (Martinus)** created the original anthem. The existing league snapshot confirms that player `f3e6f11d-2ae4-4669-881e-4d4ac535f45b` played Spirit Breaker for Dire in the 53–36 match. The credit links to his [existing Lobby Legends profile](https://dota-lobby-league.vercel.app/players/f3e6f11d-2ae4-4669-881e-4d4ac535f45b).

The temporary home card names TYSIOTE and identifies his Spirit Breaker appearance. The permanent match card also names his team. Both use the same player profile link as the Players roster. His profile shows **♪ Match Anthem Creator** near his name, and his roster card uses the shorter **♪ Anthem Creator**.

The tribute registry stores the concrete creator ID. The profile and roster badges use that ID independently of the event clock and match ordering. The credit and badge are presentation metadata. The player record, statistics, and rewards are supplied through the existing league data path.

| File | Creator credit revision |
| --- | --- |
| `src/lib/match-tributes.ts` | Permanent credit metadata and exact player ID lookup |
| `src/components/events/match-tribute.tsx` | Linked credit on the home and archive cards |
| `src/components/ui.tsx` | Shared player profile link and creator badge |
| `src/app/players/[id]/page.tsx` and `src/app/players/page.tsx` | Profile and roster badge placement |
| `src/app/tribute.css` | Credit and badge styling |
| `scripts/test-tribute-ui.cjs` | Creator link, expiry, badge exclusivity, and displayed statistics regression coverage |

Typecheck, lint, all 82 unit tests, the tribute UI regressions and the form UI regressions passed. The tribute test also checks that a second player with the same nickname receives no badge and that displayed statistics agree before and after the event clock changes.

The isolated production build passed. Chrome checks used a local league fixture and a browser clock override. They verified the active home credit, direct loading of the permanent archive after expiry, navigation through TYSIOTE’s credit link, and badge exclusivity on the profile and roster. The credit fit at 390 px and 320 px. At 390 px the profile had no horizontal overflow. At 320 px the profile already overflowed below the header, with identical page widths when the badge was shown and hidden.
