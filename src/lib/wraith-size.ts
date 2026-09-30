import type { WraithSize } from "./wraith-path";

export const SIZE_HISTORY_LENGTH = 4;
export type WraithEventKind = WraithSize | "battle";
const events: WraithEventKind[] = ["small", "medium", "large", "battle"];
const sizes: WraithSize[] = ["small", "medium", "large"];
export function calculateSizeWeights(history: readonly WraithSize[]): Record<WraithSize, number> {
  return adaptiveWeights(sizes, history);
}
function adaptiveWeights<T extends WraithEventKind>(choices: readonly T[], history: readonly T[], baseline: Partial<Record<T, number>> = {}): Record<T, number> {
  const recent = history.slice(-SIZE_HISTORY_LENGTH).reverse();
  return Object.fromEntries(choices.map(size => {
    let weight = baseline[size] ?? 1;
    // Recent selections have a decaying influence, independent of viewport/faction.
    recent.forEach((result, age) => { if (result === size) weight *= [0.65, 0.82, 0.92, 0.97][age]; });
    let streak = 0;
    while (recent[streak] === size) streak++;
    weight *= 0.78 ** Math.max(0, streak - 1);
    if (recent.length >= 3 && !recent.includes(size)) weight *= 1.15;
    return [size, Math.max(0.2, weight)];
  })) as Record<T, number>;
}
export function selectWeightedSize(history: readonly WraithSize[], random = Math.random): WraithSize {
  const weights = calculateSizeWeights(history);
  let ticket = random() * sizes.reduce((sum, size) => sum + weights[size], 0);
  for (const size of sizes) { ticket -= weights[size]; if (ticket < 0) return size; }
  return "large";
}

// One shared pool lets battles participate in the same recency/recovery rules.
export function calculateEventWeights(history: readonly WraithEventKind[]): Record<WraithEventKind, number> {
  return adaptiveWeights(events, history, { large: 1.15 });
}
export function selectWeightedEvent(history: readonly WraithEventKind[], random = Math.random): WraithEventKind {
  const weights = calculateEventWeights(history);
  let ticket = random() * events.reduce((sum, event) => sum + weights[event], 0);
  for (const event of events) { ticket -= weights[event]; if (ticket < 0) return event; }
  return "battle";
}
