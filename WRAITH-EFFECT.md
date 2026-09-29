# Lobby Wraith visual effect

## Design

- **Dire:** a dark split-horn mask, angular crimson vertebral armor, orange eye slits and etched chevrons. The tail tapers into fine bones, with a few embers and faint smoke motes. Shorter route waves, slightly faster travel and quicker energy pulses give it a sharper personality without frame-to-frame jitter.
- **Radiant:** an elongated lantern crest, swept crescent horns, curved spectral plates and occasional open rune rings. Gold outlines, pale cyan energy and small floating diamond sparks accompany wider, calmer curves and slower pulses. Its head and plate geometry differ from Dire, not just its colors.
- Both are original procedural canvas drawings. No character artwork, assets, dependencies or mouse-following behavior were added.

## Motion and timing

Each event independently chooses Dire when `Math.random() < 0.5`, otherwise Radiant. Repeated appearances of the same variant are possible; there is no forced alternation.

Entry and exit edges, edge positions, curve control points, wave phase and duration vary per event. A cubic route plus a smooth, variant-specific lateral wave is sampled into an arc-length lookup table. The head advances along that table; successive segments sample increasingly older positions at fixed distance offsets. Each segment rotates along its local tangent, letting bends travel through the body rather than moving it as one image.

The route starts and ends beyond the viewport. Negative-distance samples extend the entry tangent for the trailing body. The head continues beyond the endpoint until every tail segment has exited, then the canvas is cleared.

- First appearance: random **8–22 second** delay.
- Later appearances: a new independent **8–22 second** wait after the previous event ends.
- Event duration: Small **4.8–8 seconds**, Medium **5.52–9.2 seconds**, Large **6.72–11.2 seconds**, varying with route length, speed choice and variant; this includes offscreen approach/departure.
- Desktop: 25 articulated segments, around 300 CSS pixels of body length for Small at a 1440px viewport.
- Narrow screens: 17 segments at reduced scale, with 7/9/12 steady particles instead of desktop 15/19/26. The same occasional timing is retained.

## Global mounting and performance

`LobbyWraithEffect` is mounted once in `src/app/layout.tsx`, outside the auth/league providers. It persists through normal App Router navigation and does not subscribe to league or form state.

The fixed transparent canvas uses `pointer-events: none`, `aria-hidden`, no focus stop, no layout space and z-index 20, below navigation (30) and native modal dialogs. It never modifies page scroll styles or listens to mouse/touch input.

Only an active creature uses requestAnimationFrame. Waiting uses one timeout, not a repeating interval. React does not rerender per frame. The controller bounds particle work, caps devicePixelRatio at 2 and backing resolution near four million pixels, and cleans up its timer, frame and listeners on unmount. Resize cancels the current event, resizes the backing canvas and starts a fresh delay.

Hidden tabs cancel all active/waiting animation work. Becoming visible starts a new wait. **Reduced motion disables spawning completely**, including when the preference changes while the page is open; CSS also hides the canvas.

## Files

Created:

- `src/components/lobby-wraith-effect.tsx` — client-only global canvas component.
- `src/lib/wraith-path.ts` — route generation, arc-length sampling and articulated poses.
- `src/lib/wraith-render.ts` — original variant geometry, glow, runes and bounded particles.
- `src/lib/wraith-controller.ts` — lifecycle, randomized waits, sizing and accessibility preferences.
- `src/lib/wraith.test.ts` — geometry/controller regression tests.
- `scripts/test-wraith.cjs` — SSR, hydration, navigation and interaction regression.
- `WRAITH-EFFECT.md` — this report.

Modified:

- `src/app/layout.tsx` — mount the effect once.
- `src/app/globals.css` — isolated canvas positioning and reduced-motion rule.
- `scripts/test-portable.cjs` — include the wraith unit tests.

No database, authentication, OpenDota, heroes, match logic, forms, screenshots or ranking implementation was changed.

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run test:portable` | Passed: 62 tests |
| `node scripts/test-wraith.cjs` | Passed |
| `npm run test:forms` | Passed: 11 existing regression groups |
| `npm test` | Blocked: Vitest worker `spawn EPERM` |
| `npm run build` | Blocked: Next.js subprocess `spawn EPERM` |

Automated checks cover independent variant selection, variable entry/exit edges, bounded duration, articulated poses, all segments starting/ending offscreen, one timer/RAF controller, fresh post-event delays, mobile sizing, resize, hidden-tab behavior, live reduced-motion changes and cleanup. JSDOM checks cover server rendering before browser globals exist, hydration without warnings, one canvas across simulated navigation, clickable controls, retained input and unchanged scroll styles. Existing form, award, hero, screenshot and leaderboard regressions pass.

Actual browser compositing, visual motion quality, touchscreen behavior and device frame rates were not measured. The canvas renderer was exercised with a recording/mock context; JSDOM cannot verify browser hit-testing or visual layout. To see it locally, run `npm run dev`, keep the tab visible with reduced motion off, and allow up to 22 seconds for the first appearance. Rerun the blocked commands in your normal terminal before release.

No commit, push, deployment or production operation was performed.


## Size/frequency update

The creature silhouettes, segmented-following algorithm, global controller and interaction protections are unchanged. Each spawn uses separate random draws for faction (50/50) and size (Small 45%, Medium 35%, Large 20%). The first and subsequent waits are now 8–22 seconds, starting only after the entire preceding event finishes.

| Size | Probability | Desktop multiplier | Mobile multiplier (width below 700px) |
| --- | --- | --- | --- |
| Small | 45% | 1× | 1× |
| Medium | 35% | 1.85× | 1.5× |
| Large | 20% | 3× | 2.15× |

Exact base scale remains 0.56 on mobile and clamp(width / 1440, 0.78, 1.12) on desktop. At 1440px the resulting scales are 1, 1.85 and 3; on mobile they are 0.56, 0.84 and 1.204. Head, body, tail and segment spacing scale together. The canvas itself is not scaled to enlarge the creature.

Medium events run for 1.15 times the original route-based duration; Large for 1.4 times. This gives the larger creatures more time to cross without pausing their movement. Small keeps the original duration. Large uses opposite edges so it crosses the viewport rather than taking a short corner route. Overscan accounts for the larger head, and the tail continues beyond the exit.

Only Large gets layered low-opacity clouds along the head/body plus an expanding entry ring and radial debris. The impact is timed to the head reaching the viewport boundary, with a 0.35-second pre-glow and a 1.2-second burst/fade. Dire uses dark crimson smoke and orange embers; Radiant uses gold/cyan luminous haze and diamond rune fragments. There is no screen shake, layout movement or full-screen opaque overlay. Effects fade with the same event and require no extra timer or RAF loop.

Steady particle counts are capped at 15/19/26 desktop and 7/9/12 mobile. The Large entry burst adds at most 12 desktop or 7 mobile fragments briefly, plus 5 desktop or 3 mobile clouds with three translucent layers each. Glow radii scale with size while staying bounded; the existing DPR/pixel budget remains intact.

Files changed in this update: src/lib/wraith-path.ts, src/lib/wraith-render.ts, src/lib/wraith.test.ts, and this report. The previously added controller, global mount, styles and interaction safeguards were left untouched.

Validation: typecheck and lint passed; 62 portable tests passed, including all six faction/size combinations, probability boundaries, proportional spacing, edge-crossing geometry, entry timing, single-event scheduling and cleanup. The hydration/interaction test and existing form regressions were rerun. Standard Vitest and build remain blocked by spawn EPERM. Actual visual appearance and frame rate on physical desktop/mobile devices remain for local browser review; no performance measurement is claimed.
