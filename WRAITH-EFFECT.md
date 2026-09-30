# Wraith responsive paths and adaptive sizes

## Scope

The Radiant/Dire artwork, segmented sampling, particles, glow, Large dust/entry effects, scale multipliers, global canvas, pointer-events protection and reduced-motion behavior are unchanged. This refinement changes route generation and size choice only. No business logic, database, authentication or other feature was edited.

## Visibility diagnosis and correction

The previous generator selected edges without considering aspect ratio. Small/Medium could enter and exit nearby adjacent edges; their offscreen endpoints could keep much of the cubic curve outside the screen even when its control points were inside. Small overscan also included the whole body length, which spent too much of a phone-sized event offscreen. There was no visible-crossing invariant. These are code-level causes; the exact user's unseen event could not be replayed.

Routes now use the canvas's current width/height and choose opposite edges. Longitudinal movement is monotone from outside one edge to beyond the opposite edge, guaranteeing the head crosses the screen rather than just a tail/glow fragment. Across the other axis, randomized cubic control points plus the existing faction-specific waves stay within a bounded interior corridor. Random offsets, direction, control points and phase retain diagonals, bends and edge skims without sending every route through the exact center.

### Aspect ratio

- Wide viewports prefer horizontal travel; portrait viewports prefer vertical travel, with an 80% long-axis preference.
- Nearly square viewports (absolute log aspect ratio below 0.15) choose either axis equally.
- On non-square viewports, Large uses the long axis whenever its body length exceeds 60% of the shorter dimension. Otherwise it keeps the 80% preference.
- No user-agent checks or device-specific size probabilities are used.

### Size-aware bounds

The cross-axis inset is the larger of 24 × actual visual scale and a fraction of the available cross dimension: Small 6%, Medium 13%, Large 21%, capped at 30% on tight screens. Control points lie between 16% and 84% of the remaining corridor; waves use at most 15% of that corridor. This leaves Small room to skim edges, puts Medium farther inside and keeps Large's centerline clearly visible.

Entry/exit overscan is max(45px, 62 × visual scale), allowing room for the head/horns and glow. It no longer includes the entire body length. Segments start farther back along the extrapolated entry tangent. The existing head-to-tail sampling and post-exit travel still pull every segment fully offscreen before the next timer begins.

Size scales stay unchanged: desktop Small/Medium/Large = 1×/1.85×/3× the desktop base; narrow screens = 1×/1.5×/2.15× the 0.56 mobile base. Body length and actual scale inform route choice and clearance. The Large entry impact is still timed from the first visible head sample, now guaranteed to exist.

Resize/rotation clears the old event, resizes the canvas backing store and schedules the next event using fresh dimensions. Recent size history survives resize, visibility changes and normal page navigation. No duplicate timer or RAF loop is introduced.

## Adaptive size selection

A separate helper, wraith-size.ts, computes weights from the last four selections, oldest first in storage. The controller owns this short history for its mounted lifetime. Reload/unmount may reset it. Faction still uses its own independent 50/50 draw before size selection, and the same size algorithm is used on every viewport.

1. Base weights: Small = Medium = Large = 1.
2. Each occurrence multiplies that size's weight by its age factor: newest 0.65, then 0.82, 0.92 and 0.97.
3. Consecutive repeats add a factor of 0.78 for each repeat beyond the first, bounded by the four-result window.
4. If a size is absent from a history containing at least three results, its weight gets a modest 1.15 multiplier.
5. Every final weight is floored at 0.20.
6. One weighted random draw chooses the result. No size is forbidden or forced; even repeated Large appearances remain possible.

As a result ages its penalty weakens, and after four newer results it disappears completely. The absence bonus is bounded, not a growing debt. Very long streaks remain unlikely but their penalty does not grow forever.

Example unnormalized weights:

| Recent results (oldest first) | Small | Medium | Large |
| --- | ---: | ---: | ---: |
| None | 1.00000 | 1.00000 | 1.00000 |
| Small | 0.65000 | 1.00000 | 1.00000 |
| Small, Small | 0.41574 | 1.00000 | 1.00000 |
| Small, Medium | 0.82000 | 0.65000 | 1.00000 |
| Small, Small, Medium, Large | 0.89240 | 0.82000 | 0.65000 |

Probabilities are each weight divided by the total. There is no fixed 45/35/20 split anymore and no rotation. Spawn timing is unchanged: a randomized **8–22 seconds**, initially and after each completed event. Existing size-dependent durations remain unchanged.

## Files changed

- Created src/lib/wraith-size.ts: pure adaptive weight/selection helpers.
- Modified src/lib/wraith-path.ts: responsive crossing corridors and helper integration.
- Modified src/lib/wraith-controller.ts: bounded, controller-local size history.
- Modified src/lib/wraith.test.ts: weight, viewport and regression tests.
- Updated WRAITH-EFFECT.md: this report.

The renderer, creature component, root layout, stylesheet and interaction architecture were not changed in this refinement.

## Validation

- npm run typecheck: passed.
- npm run lint: passed.
- npm run test:portable: 65 tests passed.
- node scripts/test-wraith.cjs: SSR/hydration, navigation, interaction and cleanup regression.
- npm run test:forms: existing 11 UI regression groups.
- npm test: blocked by Vitest worker spawn EPERM.
- npm run build: blocked by Next.js child-process spawn EPERM.

The new viewport matrix exercises 1,080 deterministic routes: both factions, all three sizes, 20 random seeds, and nine sizes (3440×1440, 1920×1080, 1366×768, 600×900, 1024×768, 768×1024, 390×844, 320×568, 844×390). It checks visible head travel, at least 45% of segments simultaneously visible, actual entry coordinates, natural full exit and stronger Large interior coverage. Existing tests check articulation/spacing, canvas sizing, resize, reduced motion, single-loop behavior and cleanup. Probability tests cover balanced bases, penalties for each size, stronger repeat penalties, recovery, absence bonus, minimum weights, all outcomes remaining possible, history truncation and independent faction selection.

These are numerical/Canvas-mock and JSDOM checks, not real-device visual/FPS measurements. Physical device rendering, touch hit-testing and subjective movement quality remain for local browser review. No production changes, commits, pushes or deployments were performed.
