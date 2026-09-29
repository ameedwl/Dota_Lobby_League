import { test } from "vitest";
import assert from "node:assert/strict";
import { makeWraithRoute, wraithDelay, wraithPose } from "./wraith-path";
import { startWraith } from "./wraith-controller";

function random(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
test("wraith events choose independent variants, randomized waits, edges and bounded durations", () => {
  assert.equal(wraithDelay(() => 0), 8000); assert.equal(wraithDelay(() => 1), 22000);
  const rng = random(12), routes = Array.from({ length: 100 }, () => makeWraithRoute(1440, 900, rng));
  assert.deepEqual(new Set(routes.map(r => r.variant)), new Set(["radiant", "dire"]));
  assert.equal(new Set(routes.map(r => r.entry)).size, 4); assert.equal(new Set(routes.map(r => r.exit)).size, 4);
  assert.ok(routes.some((r, i) => i && r.variant === routes[i - 1].variant));
  assert.ok(routes.every(r => r.entry !== r.exit && r.duration >= 4000 && r.duration <= 11200));
  assert.equal(makeWraithRoute(1000, 800, () => 0.499).variant, "dire");
  assert.equal(makeWraithRoute(1000, 800, () => 0.5).variant, "radiant");
});
test("arc-length following bends the chain and every segment starts/ends beyond the viewport", () => {
  for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
    const rng = random(44);
    for (let i = 0; i < 40; i++) {
      const route = makeWraithRoute(width, height, rng);
      const outside = (p: { x: number; y: number }) => p.x < -35 || p.x > width + 35 || p.y < -35 || p.y > height + 35;
      assert.ok(wraithPose(route, 0).every(outside)); assert.ok(wraithPose(route, 1).every(outside));
      const pose = wraithPose(route, 0.5);
      assert.ok(pose.every(p => Number.isFinite(p.x + p.y + p.angle)));
      assert.ok(pose.some(p => Math.abs(p.angle - pose[0].angle) > 0.005));
      for (let n = 1; n < pose.length; n++) {
        const gap = Math.hypot(pose[n].x - pose[n - 1].x, pose[n].y - pose[n - 1].y);
        assert.ok(gap <= route.spacing * 1.001);
      }
    }
  }
  assert.ok(makeWraithRoute(390, 844).segments < makeWraithRoute(1440, 900).segments);
});

function harness(reduced = false) {
  const timers = new Map<number, { fn: () => void; delay: number }>(), frames = new Map<number, FrameRequestCallback>();
  let id = 0, draws = 0;
  const context = new Proxy({}, { get: () => () => { draws++; }, set: () => true });
  const canvas = { width: 0, height: 0, getContext: () => context };
  const motion = Object.assign(new EventTarget(), { matches: reduced });
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const win = Object.assign(new EventTarget(), { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 3,
    matchMedia: () => motion,
    setTimeout: (fn: () => void, delay: number) => { timers.set(++id, { fn, delay }); return id; },
    clearTimeout: (key: number) => timers.delete(key),
    requestAnimationFrame: (fn: FrameRequestCallback) => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: (key: number) => frames.delete(key),
  });
  const start = () => startWraith(canvas as unknown as HTMLCanvasElement, win as unknown as Window, doc as unknown as Document);
  const timer = () => { assert.equal(timers.size, 1); const [key, entry] = [...timers][0]; timers.delete(key); entry.fn(); };
  const frame = (now: number) => { assert.equal(frames.size, 1); const [key, fn] = [...frames][0]; frames.delete(key); fn(now); };
  return { timers, frames, canvas, motion, doc, win, start, timer, frame, draws: () => draws };
}
test("one controller waits without RAF, renders bounded events then schedules a fresh wait", () => {
  const h = harness(), stop = h.start();
  assert.equal(h.timers.size, 1); assert.equal(h.frames.size, 0);
  assert.ok(h.canvas.width * h.canvas.height <= 4010000);
  for (let event = 0; event < 8; event++) {
    const delay = [...h.timers.values()][0].delay; assert.ok(delay >= 8000 && delay <= 22000);
    h.timer(); assert.equal(h.timers.size, 0); h.frame(0); h.frame(3000); h.frame(12000);
    assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 1);
  }
  assert.ok(h.draws() > 100); stop(); assert.equal(h.frames.size + h.timers.size, 0);
});
test("visibility, resize, reduced motion and Strict Mode cleanup never duplicate work", () => {
  const h = harness(true), stop = h.start(); assert.equal(h.timers.size + h.frames.size, 0);
  h.motion.matches = false; h.motion.dispatchEvent(new Event("change")); h.timer(); h.frame(0);
  h.doc.hidden = true; h.doc.dispatchEvent(new Event("visibilitychange")); assert.equal(h.frames.size + h.timers.size, 0);
  h.doc.hidden = false; h.doc.dispatchEvent(new Event("visibilitychange")); assert.equal(h.timers.size, 1);
  h.timer(); h.win.innerWidth = 390; h.win.dispatchEvent(new Event("resize")); assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 1);
  h.timer(); h.frame(0); h.motion.matches = true; h.motion.dispatchEvent(new Event("change")); assert.equal(h.frames.size + h.timers.size, 0);
  stop(); h.motion.matches = false; h.motion.dispatchEvent(new Event("change")); h.win.dispatchEvent(new Event("resize")); assert.equal(h.timers.size, 0);
  const stopAgain = h.start(); assert.equal(h.timers.size, 1); stopAgain(); assert.equal(h.timers.size + h.frames.size, 0);
});


test("sizes have independent weighted boundaries and proportional desktop/mobile spacing", () => {
  for (const [width, height, base, multipliers] of [[1440,900,1,[1,1.85,3]],[390,844,0.56,[1,1.5,2.15]]] as const) {
    for (const faction of [0.1,0.9]) for (const [roll,index] of [[0,0],[0.44999,0],[0.45,1],[0.79999,1],[0.8,2],[0.999,2]]) {
      let calls=0;const route=makeWraithRoute(width,height,()=>calls++===0?faction:calls===2?roll:0.3);
      assert.equal(route.variant,faction<0.5?"dire":"radiant");assert.equal(route.size,["small","medium","large"][index]);
      assert.equal(route.scale,base*multipliers[index]);assert.equal(route.spacing,12*route.scale);
      assert.ok(route.particles<=(width<700?12:26));
      if(route.size==="large") {
        assert.equal(route.exit,route.entry^1);
        assert.ok(route.length>Math.min(width,height));
        assert.ok(route.entryProgress>0&&route.entryProgress<0.5);
        assert.ok(route.entryPoint.x>=0&&route.entryPoint.x<=width&&route.entryPoint.y>=0&&route.entryPoint.y<=height);
      }
    }
  }
});
