import { makeWraithBattle, drawWraithBattle, type WraithBattle } from "./wraith-battle";
import { SIZE_HISTORY_LENGTH, selectWeightedEvent, type WraithEventKind } from "./wraith-size";
import { makeWraithRoute, wraithDelay, type WraithRoute } from "./wraith-path";
import { drawWraith } from "./wraith-render";

export function startWraith(canvas: HTMLCanvasElement, win: Window, doc: Document) {
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const ctx = context;
  const eventHistory: WraithEventKind[] = [];
  const motion = win.matchMedia("(prefers-reduced-motion: reduce)");
  let timer: number | undefined, frame: number | undefined, route: WraithRoute | undefined;
  let battle: WraithBattle | undefined;
  let width = 0, height = 0, start: number | undefined, stopped = false;
  const allowed = () => !stopped && !motion.matches && !doc.hidden;
  const clear = () => ctx.clearRect(0, 0, width, height);
  function cancel() {
    if (timer !== undefined) win.clearTimeout(timer);
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    timer = undefined; frame = undefined; route = undefined; battle = undefined; start = undefined; clear();
  }
  function schedule() {
    if (!allowed() || timer !== undefined || route || battle) return;
    timer = win.setTimeout(() => {
      timer = undefined;
      if (!allowed()) return;
      const event = selectWeightedEvent(eventHistory);
      eventHistory.push(event);
      if (eventHistory.length > SIZE_HISTORY_LENGTH) eventHistory.shift();
      if (event === "battle") battle = makeWraithBattle(width, height);
      else route = makeWraithRoute(width, height, Math.random, [], event);
      start = undefined;
      frame = win.requestAnimationFrame(tick);
    }, wraithDelay());
  }
  function tick(now: number) {
    frame = undefined;
    if (!allowed() || (!route && !battle)) { cancel(); return; }
    start ??= now;
    const progress = (now - start) / (battle?.duration ?? route!.duration);
    clear();
    if (progress >= 1) { battle = undefined; route = undefined; start = undefined; schedule(); return; }
    if (battle) drawWraithBattle(ctx, battle, progress);
    else if (route) drawWraith(ctx, route, progress);
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
