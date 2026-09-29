import { makeWraithRoute, wraithDelay, type WraithRoute } from "./wraith-path";
import { drawWraith } from "./wraith-render";

export function startWraith(canvas: HTMLCanvasElement, win: Window, doc: Document) {
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const ctx = context;
  const motion = win.matchMedia("(prefers-reduced-motion: reduce)");
  let timer: number | undefined, frame: number | undefined, route: WraithRoute | undefined;
  let width = 0, height = 0, start: number | undefined, stopped = false;
  const allowed = () => !stopped && !motion.matches && !doc.hidden;
  const clear = () => ctx.clearRect(0, 0, width, height);
  function cancel() {
    if (timer !== undefined) win.clearTimeout(timer);
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    timer = undefined; frame = undefined; route = undefined; start = undefined; clear();
  }
  function schedule() {
    if (!allowed() || timer !== undefined || route) return;
    timer = win.setTimeout(() => {
      timer = undefined;
      if (!allowed()) return;
      route = makeWraithRoute(width, height); start = undefined;
      frame = win.requestAnimationFrame(tick);
    }, wraithDelay());
  }
  function tick(now: number) {
    frame = undefined;
    if (!allowed() || !route) { cancel(); return; }
    start ??= now;
    const progress = (now - start) / route.duration;
    clear();
    if (progress >= 1) { route = undefined; start = undefined; schedule(); return; }
    drawWraith(ctx, route, progress);
    frame = win.requestAnimationFrame(tick);
  }
  function resize() {
    cancel(); width = Math.max(1, win.innerWidth); height = Math.max(1, win.innerHeight);
    // Cap DPR and pixel budget on large/retina displays.
    const ratio = Math.min(win.devicePixelRatio || 1, 2, Math.sqrt(4000000 / (width * height)));
    canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); schedule();
  }
  function visibility() { cancel(); schedule(); }
  win.addEventListener("resize", resize);
  doc.addEventListener("visibilitychange", visibility);
  motion.addEventListener("change", visibility);
  resize();
  return () => {
    stopped = true; cancel();
    win.removeEventListener("resize", resize);
    doc.removeEventListener("visibilitychange", visibility);
    motion.removeEventListener("change", visibility);
  };
}
