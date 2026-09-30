# Radiant / Dire battle events

## Selection and sizes
Each existing 8–22-second idle wait selects from one adaptive pool: Small, Medium, Battle (base weight 1 each) and Large (base weight 1.15). With empty history, that is about 27.7% Large solo versus 24.1% each for Battle, Small and Medium. The last four events share the existing recency penalties, streak suppression and absence recovery; actual odds change after each event. Large solos are slightly favored at baseline; actual odds still respond to recent repeats. Solo faction randomness, paths, particles and Large disturbance remain intact. Both battle participants use Medium art, with scale capped by the shorter viewport dimension. Winner selection is a separate fair 50/50 roll.

## Ten-second sequence
1. Opposite-edge entry into a slightly randomized central battle zone.
2. Counterposed orbit with articulated bodies following their heads.
3. Three inward lunges, sparks, expanding shockwaves and brief connecting energy arcs.
4. Winner lunges into the losing head for the finishing hit.
5. Radiant defeat: separating armor plates, upward spectral drift and cyan/gold light shards. Dire defeat: falling spinning plates, orange embers and expanding dark ash clouds.
6. Winner pulls away, pauses with a faction-colored aura, then exits fully beyond the opposite edge.

Effects are analytical and bounded (7/13 trail particles and 12/22 impact particles on mobile/desktop). Paths are sampled once when the event starts. Rendering uses the existing canvas and one RAF; no React frame updates. Combat scales to viewport dimensions. Resize, hidden tabs, reduced motion and unmount cancel the entire event. The next idle wait starts only after completion. Pointer-event and layout behavior remain unchanged.

## Files in this change
- src/lib/wraith-battle.ts: choreography, random winner and battle-only effects.
- src/lib/wraith-controller.ts: shared solo/battle scheduling and cleanup.
- src/lib/wraith-render.ts: optional battle pose/death opacity; original creature geometry retained.
- src/lib/wraith.test.ts: outcome boundaries, 180 battles across nine viewports, finite articulated poses, visible combat, offscreen entry/exit, forced outcome rendering and scheduler cleanup.
- WRAITH-BATTLES.md: implementation and validation report.

Earlier uncommitted adaptive-size/responsive-path work is preserved. No database, forms, league logic, styling or storage changes were made for this event.

## Validation
- Typecheck and lint: passed.
- Portable unit tests: 68 passed.
- Wraith SSR/hydration/navigation/interaction regression: passed.
- Form regressions: all 11 passed.
- npm test: blocked before tests by worker spawn EPERM.
- npm run build: blocked by spawn EPERM during production build.
- Isolated real-browser canvas preview: inspected mobile combat and both faction destruction effects; no warning/error logs. This used the actual TypeScript renderer, without connecting to league data.
- Desktop/tablet/mobile geometry is covered numerically; full-site end-to-end battle playback and device FPS profiling were not completed. Browser snapshots do not prove smooth frame rates.

No commit, push or deployment performed.
