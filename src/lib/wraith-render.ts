import { wraithPose, type WraithRoute } from "./wraith-path";

function largeDisturbance(ctx: CanvasRenderingContext2D, route: WraithRoute, pose: ReturnType<typeof wraithPose>, progress: number) {
  const dire = route.variant === "dire", fade = Math.min(1, progress * 12, (1 - progress) * 12);
  const time = progress * route.duration / 1000;
  ctx.save();
  // A few translucent layered clouds, not a viewport-sized blur or an emitter.
  for (let i = 0; i < (route.mobile ? 3 : 5); i++) {
    const p = pose[Math.floor(i * (pose.length - 1) / 5)];
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
    for (let layer = 2; layer >= 0; layer--) {
      ctx.globalAlpha = fade * (dire ? 0.055 : 0.035);
      ctx.fillStyle = dire ? (layer === 0 ? "#9e2337" : "#2e142a") : (layer === 0 ? "#9cebf0" : "#e7c982");
      ctx.beginPath(); ctx.ellipse(-12 * route.scale, Math.sin(time * 1.7 + i) * 5 * route.scale,
        (28 + layer * 11) * route.scale, (15 + layer * 8) * route.scale, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // Time the impact to the actual edge crossing, not the offscreen event start.
  const age = (progress - route.entryProgress) * route.duration / 1000;
  if (age > -0.35 && age < 1.2) {
    const phase = Math.max(0, age) / 1.2, strength = age < 0 ? (age + 0.35) / 0.35 : (1 - phase) ** 2;
    const p = route.entryPoint, radius = (18 + phase * 85) * route.scale;
    ctx.globalAlpha = strength * 0.22; ctx.strokeStyle = dire ? "#d44848" : "#c9f5ec";
    ctx.lineWidth = 2 * route.scale;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, radius, radius * (dire ? 0.65 : 0.85), 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < (route.mobile ? 7 : 12); i++) {
      const angle = i * 2.399 + route.seed, reach = radius * (0.45 + (i % 3) * 0.2);
      const x = p.x + Math.cos(angle) * reach, y = p.y + Math.sin(angle) * reach;
      ctx.globalAlpha = strength * (dire ? 0.18 : 0.3); ctx.fillStyle = dire ? (i % 2 ? "#ff9954" : "#692534") : (i % 2 ? "#e8ca79" : "#a4edeb");
      ctx.beginPath();
      if (dire) ctx.ellipse(x, y, (i % 2 ? 1.5 : 5) * route.scale, (2 + phase * 4) * route.scale, angle, 0, Math.PI * 2);
      else { const r = 2 * route.scale; ctx.moveTo(x, y - r * 2); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 2); ctx.lineTo(x - r, y); ctx.closePath(); }
      ctx.fill();
    }
  }
  ctx.restore();
}

// Original vector geometry, drawn independently at each articulated joint.
export function drawWraith(ctx: CanvasRenderingContext2D, route: WraithRoute, progress: number) {
  const pose = wraithPose(route, progress), dire = route.variant === "dire", time = progress * route.duration / 1000;
  const energy = dire ? "#b82c45" : "#dfbd70", light = dire ? "#ff9b56" : "#a0edec";
  if (route.size === "large") largeDisturbance(ctx, route, pose, progress);
  ctx.save();
  ctx.globalAlpha = 0.72 * Math.min(1, progress * 12, (1 - progress) * 12);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  // A faint spine ties the floating plates together, without a full-screen blur.
  ctx.beginPath(); pose.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.strokeStyle = energy; ctx.lineWidth = 5 * route.scale; ctx.shadowColor = energy; ctx.shadowBlur = 10 * route.multiplier; ctx.stroke(); ctx.shadowBlur = 0;
  for (let i = pose.length - 1; i >= 0; i--) {
    const p = pose[i], taper = 1 - i / pose.length, s = route.scale * (0.22 + 0.78 * taper);
    const pulse = (Math.sin(time * (dire ? 5 : 2.5) - i * 0.48) + 1) / 2;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.scale(s, s);
    ctx.lineWidth = 1.2; ctx.strokeStyle = energy; ctx.fillStyle = dire ? "#1c111dcc" : "#243c4288";
    if (i === 0) {
      // Dire: split, angular antlers and a narrow predatory mask.
      // Radiant: swept diadem, open crescent horns and an elongated lantern crest.
      ctx.beginPath();
      if (dire) {
        ctx.moveTo(24, 0); ctx.lineTo(9, -10); ctx.lineTo(-8, -13); ctx.lineTo(-30, -29); ctx.lineTo(-18, -9);
        ctx.lineTo(-23, 0); ctx.lineTo(-18, 9); ctx.lineTo(-30, 29); ctx.lineTo(-8, 13); ctx.lineTo(9, 10);
      } else {
        ctx.moveTo(30, 0); ctx.quadraticCurveTo(0, -18, -23, -9); ctx.quadraticCurveTo(-39, -21, -22, -31);
        ctx.quadraticCurveTo(-54, -17, -23, 0); ctx.quadraticCurveTo(-54, 17, -22, 31);
        ctx.quadraticCurveTo(-39, 21, -23, 9); ctx.quadraticCurveTo(0, 18, 30, 0);
      }
      ctx.closePath(); ctx.fill(); ctx.shadowColor = energy; ctx.shadowBlur = 9 * route.multiplier; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.moveTo(19, 0); ctx.lineTo(2, -5); ctx.lineTo(-8, 0); ctx.lineTo(2, 5); ctx.closePath();
      ctx.fillStyle = light; ctx.globalAlpha *= 0.6 + pulse * 0.35; ctx.fill();
      ctx.beginPath(); ctx.moveTo(8, -7); ctx.lineTo(-3, -8); ctx.moveTo(8, 7); ctx.lineTo(-3, 8); ctx.strokeStyle = light; ctx.lineWidth = 2; ctx.stroke();
    } else {
      ctx.beginPath();
      if (dire) {
        ctx.moveTo(7, 0); ctx.lineTo(0, -9); ctx.lineTo(-15, -17 - pulse * 2); ctx.lineTo(-8, -3);
        ctx.lineTo(-12, 0); ctx.lineTo(-8, 3); ctx.lineTo(-15, 17 + pulse * 2); ctx.lineTo(0, 9);
      } else {
        ctx.moveTo(8, 0); ctx.quadraticCurveTo(-1, -13, -16, -17); ctx.quadraticCurveTo(-9, -4, -13, 0);
        ctx.quadraticCurveTo(-9, 4, -16, 17); ctx.quadraticCurveTo(-1, 13, 8, 0);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Etched chevrons/runes pulse from head to tail, rather than flashing together.
      ctx.strokeStyle = light; ctx.globalAlpha *= 0.3 + pulse * 0.6;
      ctx.beginPath(); ctx.moveTo(2, -4); ctx.lineTo(-3, 0); ctx.lineTo(2, 4); ctx.moveTo(-5, -3); ctx.lineTo(-5, 3); ctx.stroke();
      if (!dire && i % 3 === 0) { ctx.beginPath(); ctx.ellipse(-3, 0, 5, 20, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.restore();
  }
  // Bounded analytical particles: no emitters, allocations or lingering particle loops.
  const count = route.particles;
  for (let i = 0; i < count; i++) {
    const age = (time * (dire ? 0.75 : 0.4) + i * 0.618) % 1;
    const anchor = pose[1 + i % (pose.length - 1)], side = i % 2 ? 1 : -1;
    const drift = (8 + age * 34) * route.scale * side;
    const x = anchor.x - Math.sin(anchor.angle) * drift - Math.cos(anchor.angle) * age * 18;
    const y = anchor.y + Math.cos(anchor.angle) * drift + Math.sin(time + i) * 5 * route.scale;
    ctx.globalAlpha = (1 - age) * 0.35 * Math.min(1, progress * 12, (1 - progress) * 12);
    ctx.fillStyle = dire ? (i % 3 ? light : "#873847") : (i % 3 ? energy : light);
    ctx.beginPath();
    if (dire && i % 3 === 0) ctx.ellipse(x, y, 6 * age * route.multiplier, 10 * age * route.multiplier, -0.4, 0, Math.PI * 2);
    else if (dire) ctx.rect(x, y, 2 * route.scale, (2 + age * 3) * route.scale);
    else { const r = 2 * route.scale; ctx.moveTo(x, y - r * 2); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 2); ctx.lineTo(x - r, y); ctx.closePath(); }
    ctx.fill();
  }
  ctx.restore();
}
