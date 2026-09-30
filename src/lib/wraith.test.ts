import { calculateEventWeights, selectWeightedEvent, type WraithEventKind } from "./wraith-size";
import { makeWraithBattle, battlePose } from "./wraith-battle";
import { test } from "vitest";
import assert from "node:assert/strict";
import { makeWraithRoute, wraithDelay, wraithPose } from "./wraith-path";
import { calculateSizeWeights, selectWeightedSize } from "./wraith-size";
import type { WraithSize } from "./wraith-path";
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
    for (const faction of [0.1,0.9]) for (const [roll,index] of [[0,0],[0.33332,0],[0.33334,1],[0.66665,1],[0.66667,2],[0.999,2]]) {
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


test("adaptive size penalties recover, never force rotation, and forget old results", () => {
  assert.deepEqual(calculateSizeWeights([]),{small:1,medium:1,large:1});
  for(const size of ["small","medium","large"] as WraithSize[]) {
    const one=calculateSizeWeights([size]),two=calculateSizeWeights([size,size]);
    assert.ok(one[size]<1&&two[size]<one[size]);
    const other=size==="small"?"medium":"small";
    assert.ok(calculateSizeWeights([size,other])[size]>one[size]);
    assert.equal(calculateSizeWeights([other,other,other])[size],1.15);
    const streak=calculateSizeWeights(Array(20).fill(size));
    assert.ok(Object.values(streak).every(w=>w>=0.2));
    const weights=calculateSizeWeights([size,size,size,size]);
    let previous=0;const total=Object.values(weights).reduce((a,b)=>a+b,0);
    for(const result of ["small","medium","large"] as WraithSize[]){assert.equal(selectWeightedSize([size,size,size,size],()=> (previous+weights[result]/2)/total),result);previous+=weights[result];}
  }
  assert.deepEqual(calculateSizeWeights(["small","large","medium","large","medium"]),calculateSizeWeights(["large","medium","large","medium"]));
  assert.equal(calculateSizeWeights(["small","small","medium","large"]).small,0.92*0.97);
  for(const faction of [0.1,0.9]){
    let n=0;const a=makeWraithRoute(1440,900,()=>n++===0?faction:0.3,[]);
    n=0;const b=makeWraithRoute(1440,900,()=>n++===0?faction:0.3,["small","small"]);
    assert.equal(a.variant,b.variant);
  }
});

test("all sizes visibly cross nine viewport types with natural head/tail entry and exit", () => {
  const viewports=[[3440,1440],[1920,1080],[1366,768],[600,900],[1024,768],[768,1024],[390,844],[320,568],[844,390]];
  for(const [width,height] of viewports) for(const sizeRoll of [0.1,0.5,0.9]) for(const faction of [0.1,0.9]) {
    for(let seed=1;seed<=20;seed++) {
      const rng=random(seed*77);let call=0;
      const route=makeWraithRoute(width,height,()=>call++===0?faction:call===2?sizeRoll:rng());
      const inside=(p:{x:number;y:number})=>p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height;
      assert.ok(route.points.filter(inside).length>route.points.length*0.45);
      assert.ok(inside(route.entryPoint));assert.equal(route.exit,route.entry^1);
      assert.ok(wraithPose(route,0).every(p=>!inside(p)));assert.ok(wraithPose(route,1).every(p=>!inside(p)));
      let maximumVisible=0,headVisible=0;
      for(let frame=0;frame<=60;frame++){
        const pose=wraithPose(route,frame/60);maximumVisible=Math.max(maximumVisible,pose.filter(inside).length);
        if(inside(pose[0]))headVisible++;
      }
      assert.ok(maximumVisible>=Math.ceil(route.segments*0.45));assert.ok(headVisible>=12);
      if(route.size==="large") {
        const central=route.points.filter(p=>p.x>width*.2&&p.x<width*.8&&p.y>height*.2&&p.y<height*.8);
        assert.ok(central.length>50);
      }
    }
  }
});

test("aspect ratio biases crossings toward usable screen length",()=>{
  for(const [width,height] of [[1920,1080],[390,844]]){
    const rng=random(9);let aligned=0;
    for(let i=0;i<200;i++){const route=makeWraithRoute(width,height,rng);if((route.entry<2)===(width>height))aligned++;}
    assert.ok(aligned>140);
  }
});


test("battles keep both medium factions, fair winner boundaries and visible combat across viewports", () => {
  assert.equal(makeWraithBattle(1440, 900, () => 0.499).winner, "dire");
  assert.equal(makeWraithBattle(1440, 900, () => 0.5).winner, "radiant");
  for (const [width, height] of [[3440,1440],[1920,1080],[1366,768],[600,900],[1024,768],[768,1024],[390,844],[320,568],[844,390]]) {
    for (let seed = 1; seed <= 20; seed++) {
      const battle = makeWraithBattle(width, height, random(seed * 77));
      assert.equal(battle.duration, 10000);
      assert.deepEqual(battle.routes.map(r => r.variant), ["dire", "radiant"]);
      const inside = (p: {x:number;y:number}) => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height;
      for (const route of battle.routes) {
        assert.equal(route.size, "medium");
        assert.ok(battlePose(route, 0).every(p => !inside(p)));
        for (let time = 2.5; time <= 6.5; time += 0.1) {
          const pose = battlePose(route, time);
          assert.ok(inside(pose[0]));
          assert.ok(pose.every(p => Number.isFinite(p.x + p.y + p.angle)));
          assert.ok(pose.filter(inside).length >= route.segments * 0.6);
        }
        if (route.variant === battle.winner) assert.ok(battlePose(route, 11).every(p => !inside(p)));
      }
    }
  }
});

test("forced battles have one RAF, no overlapping spawns and cancel cleanly", () => {
  const original = Math.random;
  try {
    for (const winnerRoll of [0.1, 0.9]) {
      // First roll is wait, second event type, third independent winner.
      let roll = 0; Math.random = () => ++roll === 2 ? 0.99 : winnerRoll;
      const h = harness(), stop = h.start(); h.timer();
      h.frame(0);
      for (const now of [2000,3000,4200,5500,6500,7200,7800,8500,9500]) {
        h.frame(now); assert.equal(h.timers.size,0); assert.equal(h.frames.size,1);
      }
      h.frame(10000); assert.equal(h.frames.size,0); assert.equal(h.timers.size,1);
      Math.random = () => 0.99; h.timer(); h.frame(0); h.frame(7000);
      h.doc.hidden = true; h.doc.dispatchEvent(new Event("visibilitychange"));
      assert.equal(h.frames.size+h.timers.size,0);
      h.doc.hidden = false; h.doc.dispatchEvent(new Event("visibilitychange")); h.timer(); h.frame(0);
      h.motion.matches = true; h.motion.dispatchEvent(new Event("change"));
      assert.equal(h.frames.size+h.timers.size,0); stop();
    }
  } finally { Math.random = original; }
});


test("Large has slightly higher base odds than battle in shared smart random history", () => {
  const base = calculateEventWeights([]);
  assert.deepEqual(base, {small:1,medium:1,large:1.15,battle:1});
  assert.ok(base.large / 4.15 > base.battle / 4.15);
  assert.ok(calculateEventWeights(["battle"]).battle < base.battle);
  assert.ok(calculateEventWeights(["battle","battle"]).battle < calculateEventWeights(["battle"]).battle);
  assert.ok(calculateEventWeights(["battle","small"]).battle > calculateEventWeights(["battle"]).battle);
  assert.ok(calculateEventWeights(["small","medium","large"]).battle > base.battle);
  assert.deepEqual(calculateEventWeights(["battle","small","medium","large","small"]), calculateEventWeights(["small","medium","large","small"]));
  for (const event of ["small","medium","large","battle"] as WraithEventKind[]) {
    const weights = calculateEventWeights([event,event,event,event]);
    assert.ok(Object.values(weights).every(w => w >= 0.2));
    let before = 0; const total = Object.values(weights).reduce((a,b) => a+b,0);
    for (const choice of ["small","medium","large","battle"] as WraithEventKind[]) {
      assert.equal(selectWeightedEvent([event,event,event,event], () => (before + weights[choice]/2)/total),choice);
      before += weights[choice];
    }
  }
  for (const size of ["small","medium","large"] as WraithSize[]) for (const roll of [0.1,0.9]) {
    const route = makeWraithRoute(1440,900,() => roll,[],size);
    assert.equal(route.size,size); assert.equal(route.variant,roll < 0.5 ? "dire" : "radiant");
  }
});
