import { makeWraithRoute, wraithPose, type Point, type WraithRoute, type WraithVariant } from "./wraith-path";
import { drawWraith } from "./wraith-render";

export const BATTLE_DURATION = 10000;
// Choreography uses an 11-unit timeline, played over ten real seconds.
const TIMELINE_END = 11;
const SAMPLES_PER_UNIT = 60;
const LAST_SAMPLE = TIMELINE_END * SAMPLES_PER_UNIT;
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export type WraithBattle = { duration: number; winner: WraithVariant; center: Point; routes: WraithRoute[]; deathPoint: Point; mobile: boolean };

export function makeWraithBattle(width: number, height: number, random = Math.random): WraithBattle {
  const winner: WraithVariant = random() < 0.5 ? "dire" : "radiant", mobile = width < 700;
  const center = { x: width * (0.43 + random() * 0.14), y: height * (0.43 + random() * 0.14) };
  const rx = width * 0.26, ry = height * 0.22, phase = random() * 0.6;
  const orbit = (time: number, side: number) => {
    const angle = phase + (time - 2) * 1.7 + side * Math.PI;
    const dive = Math.max(...[3.3, 4.6, 6].map(beat => Math.exp(-(((time - beat) / 0.2) ** 2))));
    const radius = 1 - dive * 0.84;
    return { x: center.x + Math.cos(angle) * rx * radius, y: center.y + Math.sin(angle) * ry * radius };
  };
  const loserSide = winner === "dire" ? 1 : 0, deathPoint = orbit(6.5, loserSide);
  const routes = (["dire", "radiant"] as const).map((variant, side) => {
    // Reuse the existing plates/head/particles at a comfortable duel scale.
    let call = 0;
    const base = makeWraithRoute(width, height, () => call++ === 0 ? (side ? 0.9 : 0.1) : call === 2 ? 0.5 : random());
    const scale = Math.min(base.scale, Math.min(width, height) / 320);
    const spacing = 12 * scale, margin = base.segments * spacing + 100;
    const start = { x: side ? width + margin : -margin, y: center.y - (side ? -1 : 1) * height * 0.18 };
    const end = { x: side ? -margin : width + margin, y: height * (0.25 + side * 0.5) };
    const at = (time: number): Point => {
      if (time < 2) return lerp(start, orbit(2, side), smooth(time / 2));
      if (time < 6.5) return orbit(time, side);
      const last = orbit(6.5, side);
      if (variant !== winner) return last;
      if (time < 7.1) return lerp(last, deathPoint, smooth((time - 6.5) / 0.6));
      if (time < 7.8) return lerp(deathPoint, { x: center.x, y: center.y - ry * 0.5 }, smooth((time - 7.1) / 0.7));
      if (time < 8.7) return { x: center.x, y: center.y - ry * 0.5 };
      return lerp({ x: center.x, y: center.y - ry * 0.5 }, end, smooth((time - 8.7) / 2.3));
    };
    const points = Array.from({ length: LAST_SAMPLE + 1 }, (_, i) => at(i / SAMPLES_PER_UNIT)), distances = [0];
    for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    return { ...base, variant, scale, spacing, particles: mobile ? 7 : 13, points, distances, length: distances[LAST_SAMPLE], duration: BATTLE_DURATION };
  });
  return { duration: BATTLE_DURATION, winner, center, routes, deathPoint, mobile };
}

export function battlePose(route: WraithRoute, time: number) {
  const sample = Math.max(0, Math.min(LAST_SAMPLE, time * SAMPLES_PER_UNIT)), low = Math.floor(sample), high = Math.min(LAST_SAMPLE, low + 1);
  const distance = route.distances[low] + (route.distances[high] - route.distances[low]) * (sample - low);
  return wraithPose(route, distance / (route.length + route.segments * route.spacing + 80));
}

export function drawWraithBattle(ctx: CanvasRenderingContext2D, battle: WraithBattle, progress: number) {
  const time = progress * TIMELINE_END;
  for (const route of battle.routes) {
    const death = route.variant === battle.winner ? 0 : smooth((time - 7.1) / 1.5);
    if (death >= 1) continue;
    const pose = battlePose(route, time).map((p, i) => ({ ...p,
      x: p.x + Math.cos(i * 2.399 + route.seed) * death * 95 * route.scale,
      y: p.y + Math.sin(i * 2.399 + route.seed) * death * 45 * route.scale + (route.variant === "dire" ? death * death * 95 : -death * 110),
      angle: p.angle + death * (i % 2 ? 1 : -1) * 2,
    }));
    drawWraith(ctx, route, progress, { pose, death });
  }
  ctx.save();
  // Three close passes strike sparks; the last impact shatters the losing armor.
  for (const beat of [3.3, 4.6, 6, 7.1]) {
    const age = time - beat;
    if (age < 0 || age > 1.2) continue;
    const final = beat === 7.1, point = final ? battle.deathPoint : battle.center;
    const color = final ? (battle.winner === "dire" ? "#f4ce82" : "#eb5b48") : "#e4c2a4";
    ctx.globalAlpha = (1 - age / 1.2) * 0.55; ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(point.x, point.y, 8 + age * 90, 5 + age * 55, -0.35, 0, Math.PI * 2); ctx.stroke();
    const count = battle.mobile ? 12 : 22;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399, radius = age * (35 + (i % 5) * 23);
      const x = point.x + Math.cos(angle) * radius, y = point.y + Math.sin(angle) * radius + (final && battle.winner === "radiant" ? age * age * 40 : -age * 15);
      ctx.fillStyle = final && battle.winner === "radiant" ? (i % 3 ? "#f87c43" : "#512334") : (i % 2 ? color : "#8be1df"); ctx.beginPath();
      if (final && battle.winner === "radiant") {
        // Dire collapses into falling embers and expanding corrupted ash.
        ctx.ellipse(x, y, i % 3 ? 2 : 4 + age * 9, i % 3 ? 3 : 7 + age * 12, angle, 0, Math.PI * 2);
      } else {
        // Radiant armor separates into rising, elongated light shards.
        ctx.moveTo(x, y - 6); ctx.lineTo(x + 2, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 2, y); ctx.closePath();
      }
      ctx.fill();
    }
  }
  // A brief pair of energy arcs links the opposing heads during their close passes.
  if (time > 2 && time < 6.5) {
    const heads = battle.routes.map(route => battlePose(route, time)[0]);
    const gap = Math.hypot(heads[0].x - heads[1].x, heads[0].y - heads[1].y);
    if (gap < 150) for (let i = 0; i < 2; i++) {
      ctx.globalAlpha = (1 - gap / 150) * 0.55; ctx.strokeStyle = i ? "#e7c46c" : "#ce4057"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(heads[0].x, heads[0].y);
      ctx.quadraticCurveTo(battle.center.x, battle.center.y + (i ? 1 : -1) * 28, heads[1].x, heads[1].y); ctx.stroke();
    }
  }
  if (time > 7.8 && time < 9.1) {
    const winner = battle.routes.find(route => route.variant === battle.winner)!;
    const head = battlePose(winner, time)[0], pulse = Math.sin((time - 7.8) / 1.3 * Math.PI);
    ctx.globalAlpha = pulse * 0.45; ctx.strokeStyle = battle.winner === "dire" ? "#ee5369" : "#e9d795";
    ctx.lineWidth = 2; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(head.x, head.y, 42 * winner.scale, 28 * winner.scale, head.angle, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
