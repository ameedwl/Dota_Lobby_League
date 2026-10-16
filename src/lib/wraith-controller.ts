import {birthdayChance} from "./special-event";
import { makeWraithBattle, drawWraithBattle, type WraithBattle } from "./wraith-battle";
import { SIZE_HISTORY_LENGTH, selectWeightedEvent, type WraithEventKind } from "./wraith-size";
import { makeWraithRoute, wraithDelay, type WraithRoute } from "./wraith-path";
import { drawWraith } from "./wraith-render";

export function startWraith(canvas: HTMLCanvasElement, win: Window, doc: Document, options: {birthday?:boolean;ceremonial?:boolean} = {}) {
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const ctx = context;
  const eventHistory: WraithEventKind[] = [];
  const motion = win.matchMedia("(prefers-reduced-motion: reduce)");
  let timer: number | undefined, frame: number | undefined, route: WraithRoute | undefined;
  let battle: WraithBattle | undefined;
  let birthday=false, previousBirthday=false, completed=false;
  let width = 0, height = 0, start: number | undefined, stopped = false;
  const allowed = () => !stopped && !motion.matches && !doc.hidden && !(options.ceremonial && completed);
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
      birthday=!!options.ceremonial || (!!options.birthday && birthdayChance(true,previousBirthday,Math.random()));
      previousBirthday=birthday;
      const event = birthday ? (Math.random()<0.65?"large":"medium") : selectWeightedEvent(eventHistory);
      if(!birthday)eventHistory.push(event);
      if (eventHistory.length > SIZE_HISTORY_LENGTH) eventHistory.shift();
      if (event === "battle") battle = makeWraithBattle(width, height);
      else route = makeWraithRoute(width, height, Math.random, [], event);
      if(birthday&&route){route.variant="radiant";}
      start = undefined;
      frame = win.requestAnimationFrame(tick);
    }, options.ceremonial?0:wraithDelay());
  }
  function tick(now: number) {
    frame = undefined;
    if (!allowed() || (!route && !battle)) { cancel(); return; }
    start ??= now;
    const progress = (now - start) / (battle?.duration ?? route!.duration);
    clear();
    if (progress >= 1) { completed=true; battle = undefined; route = undefined; start = undefined; schedule(); return; }
    if (battle) drawWraithBattle(ctx, battle, progress);
    else if (route) {
      drawWraith(ctx, route, progress, undefined, birthday);
      if(birthday){
        const fade=Math.sin(Math.PI*progress)**2;const x=width/2,y=height*0.58,r=Math.min(65,width*.15,height*.18);
        ctx.save();ctx.globalAlpha=fade*.8;ctx.translate(x,y);ctx.strokeStyle="#ac97e6";ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(r*.6,0);ctx.lineTo(0,r);ctx.lineTo(-r*.6,0);ctx.closePath();ctx.stroke();
        ctx.font="600 "+Math.min(20,width/24)+"px serif";ctx.textAlign="center";ctx.fillStyle="#d8d1ed";ctx.fillText("HAPPY BIRTHDAY LUNG",0,r+30);
        for(let i=0;i<(width<600?8:16);i++){const a=i*2.399+progress*2,reach=r+progress*80;ctx.save();ctx.translate(Math.cos(a)*reach,Math.sin(a)*reach);ctx.rotate(a);ctx.fillStyle=i%2?"#ad8cd9":"#95b9ef";ctx.fillRect(-2,-5,3,9);ctx.restore();}ctx.restore();
      }
    }
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
