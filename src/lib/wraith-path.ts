export type WraithVariant = "radiant" | "dire";
export type WraithSize = "small" | "medium" | "large";
export type Point = { x: number; y: number };
export type WraithRoute = {
  variant: WraithVariant; size: WraithSize; multiplier: number; particles: number; entryPoint: Point; entryProgress: number; mobile: boolean; points: Point[]; distances: number[]; length: number;
  segments: number; spacing: number; scale: number; duration: number; entry: number; exit: number; seed: number;
};
export const wraithDelay = (random = Math.random) => 8000 + random() * 14000;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function makeWraithRoute(width: number, height: number, random = Math.random): WraithRoute {
  const variant: WraithVariant = random() < 0.5 ? "dire" : "radiant";
  const roll = random(), size: WraithSize = roll < 0.45 ? "small" : roll < 0.8 ? "medium" : "large";
  const mobile = width < 700;
  const multiplier = size === "small" ? 1 : size === "medium" ? (mobile ? 1.5 : 1.85) : (mobile ? 2.15 : 3);
  const scale = (mobile ? 0.56 : Math.min(1.12, Math.max(0.78, width / 1440))) * multiplier;
  const particles = mobile ? (size === "small" ? 7 : size === "medium" ? 9 : 12) : (size === "small" ? 15 : size === "medium" ? 19 : 26);
  const segments = mobile ? 17 : 25, spacing = 12 * scale;
  const margin = size === "small" ? segments * spacing + 90 : 90 + 60 * scale;
  const edge = (side: number): Point => {
    const fraction = 0.12 + random() * 0.76;
    return side === 0 ? { x: -margin, y: height * fraction } : side === 1 ? { x: width + margin, y: height * fraction }
      : side === 2 ? { x: width * fraction, y: -margin } : { x: width * fraction, y: height + margin };
  };
  const entry = Math.floor(random() * 4), exit = size === "large" ? entry ^ 1 : (entry + 1 + Math.floor(random() * 3)) % 4;
  const start = edge(entry), end = edge(exit);
  const c1 = { x: width * (0.15 + random() * 0.7), y: height * (0.15 + random() * 0.7) };
  const c2 = { x: width * (0.15 + random() * 0.7), y: height * (0.15 + random() * 0.7) };
  const angle = Math.atan2(end.y - start.y, end.x - start.x), seed = random() * Math.PI * 2;
  const amplitude = Math.min(width, height) * (variant === "dire" ? 0.1 : 0.16);
  const points: Point[] = [], distances = [0];
  for (let i = 0; i <= 640; i++) {
    const t = i / 640, u = 1 - t;
    // Zero displacement/derivative at the edges; Dire has shorter, tighter waves.
    const wave = Math.sin(Math.PI * t) ** 2 * Math.sin(t * Math.PI * (variant === "dire" ? 5 : 2) + seed) * amplitude;
    const p = { x: u ** 3 * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * end.x - Math.sin(angle) * wave,
      y: u ** 3 * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * end.y + Math.cos(angle) * wave };
    if (i) distances.push(distances[i - 1] + Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y));
    points.push(p);
  }
  const length = distances[distances.length - 1];
  const baseDuration = Math.min(8000, Math.max(4800, 4400 + length * 0.8 + random() * 900 - (variant === "dire" ? 400 : 0)));
  const duration = baseDuration * (size === "small" ? 1 : size === "medium" ? 1.15 : 1.4);
  const entryIndex = points.findIndex(p => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height);
  const entryPoint = points[Math.max(0, entryIndex)];
  const entryProgress = distances[Math.max(0, entryIndex)] / (length + segments * spacing + 80);
  return { variant, size, multiplier, particles, mobile, entryPoint, entryProgress, points, distances, length, duration, segments, spacing, scale, entry, exit, seed };
}

export function sampleWraithPath(route: WraithRoute, distance: number): Point {
  const { points, distances, length } = route;
  if (distance < 0 || distance > length) {
    const first = distance < 0, a = points[first ? 0 : points.length - 2], b = points[first ? 1 : points.length - 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1, origin = first ? a : b, extra = first ? distance : distance - length;
    return { x: origin.x + (b.x - a.x) / d * extra, y: origin.y + (b.y - a.y) / d * extra };
  }
  let low = 0, high = distances.length - 1;
  while (low + 1 < high) { const mid = (low + high) >> 1; if (distances[mid] < distance) low = mid; else high = mid; }
  const t = (distance - distances[low]) / (distances[high] - distances[low] || 1);
  return { x: mix(points[low].x, points[high].x, t), y: mix(points[low].y, points[high].y, t) };
}
export function wraithPose(route: WraithRoute, progress: number) {
  const distance = progress * (route.length + route.segments * route.spacing + 80);
  return Array.from({ length: route.segments }, (_, i) => {
    const point = sampleWraithPath(route, distance - i * route.spacing);
    const ahead = sampleWraithPath(route, distance - i * route.spacing + 2);
    return { ...point, angle: Math.atan2(ahead.y - point.y, ahead.x - point.x) };
  });
}
