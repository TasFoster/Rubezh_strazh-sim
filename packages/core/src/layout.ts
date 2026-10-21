import type { Position } from "./project";

export type Rect = { x: number; y: number; width: number; height: number };
export type Segment = { from: Position; to: Position };
const EPSILON = 1e-6;
export const samePoint = (a: Position, b: Position) => Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
export function inflateRect(rect: Rect, margin: number): Rect {
  return { x: rect.x - margin, y: rect.y - margin, width: rect.width + 2 * margin, height: rect.height + 2 * margin };
}
export function rectanglesOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.x < b.x + b.width + gap - EPSILON &&
    a.x + a.width + gap > b.x + EPSILON &&
    a.y < b.y + b.height + gap - EPSILON &&
    a.y + a.height + gap > b.y + EPSILON
  );
}
export function rotatedBounds(rect: Rect, degrees: number): Rect {
  const angle = (degrees * Math.PI) / 180;
  const width = Math.abs(rect.width * Math.cos(angle)) + Math.abs(rect.height * Math.sin(angle));
  const height = Math.abs(rect.width * Math.sin(angle)) + Math.abs(rect.height * Math.cos(angle));
  return { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
}
/** Move only the edited card, choosing the closest free candidate around existing cards. */
export function placeRectangle(rect: Rect, obstacles: readonly Rect[], gap = 40): Position {
  if (!obstacles.some((other) => rectanglesOverlap(rect, other, gap))) return { x: rect.x, y: rect.y };
  const xs = new Set([rect.x]),
    ys = new Set([rect.y]);
  for (const other of obstacles) {
    xs.add(other.x - rect.width - gap);
    xs.add(other.x + other.width + gap);
    ys.add(other.y - rect.height - gap);
    ys.add(other.y + other.height + gap);
  }
  const candidates = [...xs].flatMap((x) => [...ys].map((y) => ({ x, y })));
  candidates.sort(
    (a, b) => Math.hypot(a.x - rect.x, a.y - rect.y) - Math.hypot(b.x - rect.x, b.y - rect.y) || a.y - b.y || a.x - b.x,
  );
  return (
    candidates.find((point) => !obstacles.some((other) => rectanglesOverlap({ ...rect, ...point }, other, gap))) ?? rect
  );
}
export function segments(points: readonly Position[]): Segment[] {
  return points.slice(1).flatMap((to, index) => {
    const from = points[index];
    return from && !samePoint(from, to) ? [{ from, to }] : [];
  });
}
/** Includes diagonal manual wires; touching a rectangle boundary is allowed. */
export function segmentIntersectsRect({ from, to }: Segment, rect: Rect): boolean {
  let low = 0,
    high = 1;
  for (const [start, delta, min, max] of [
    [from.x, to.x - from.x, rect.x + EPSILON, rect.x + rect.width - EPSILON],
    [from.y, to.y - from.y, rect.y + EPSILON, rect.y + rect.height - EPSILON],
  ] as const) {
    if (Math.abs(delta) < EPSILON) {
      if (start <= min || start >= max) return false;
    } else {
      const a = (min - start) / delta,
        b = (max - start) / delta;
      low = Math.max(low, Math.min(a, b));
      high = Math.min(high, Math.max(a, b));
      if (low >= high) return false;
    }
  }
  return low < high;
}
/** Strict interior intersection: shared endpoints are electrical contacts, not wire crossings. */
export function segmentCrossing(a: Segment, b: Segment, includeEnds = false): Position | undefined {
  const dx = a.to.x - a.from.x,
    dy = a.to.y - a.from.y;
  const ex = b.to.x - b.from.x,
    ey = b.to.y - b.from.y;
  const cross = dx * ey - dy * ex;
  if (Math.abs(cross) < EPSILON) return undefined;
  const ox = b.from.x - a.from.x,
    oy = b.from.y - a.from.y;
  const t = (ox * ey - oy * ex) / cross,
    u = (ox * dy - oy * dx) / cross;
  if (
    includeEnds
      ? t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON
      : t <= EPSILON || t >= 1 - EPSILON || u <= EPSILON || u >= 1 - EPSILON
  )
    return undefined;
  return { x: a.from.x + t * dx, y: a.from.y + t * dy };
}
function overlapLength(a: Segment, b: Segment): number {
  const horizontal =
    Math.abs(a.from.y - a.to.y) < EPSILON &&
    Math.abs(b.from.y - b.to.y) < EPSILON &&
    Math.abs(a.from.y - b.from.y) < EPSILON;
  const vertical =
    Math.abs(a.from.x - a.to.x) < EPSILON &&
    Math.abs(b.from.x - b.to.x) < EPSILON &&
    Math.abs(a.from.x - b.from.x) < EPSILON;
  if (!horizontal && !vertical) return 0;
  const axis = horizontal ? "x" : "y";
  return Math.max(
    0,
    Math.min(Math.max(a.from[axis], a.to[axis]), Math.max(b.from[axis], b.to[axis])) -
      Math.max(Math.min(a.from[axis], a.to[axis]), Math.min(b.from[axis], b.to[axis])),
  );
}
export function simplifyRoute(points: readonly Position[]): Position[] {
  const result: Position[] = [];
  for (const point of points) {
    if (result.length && samePoint(result[result.length - 1] as Position, point)) continue;
    const a = result.at(-2),
      b = result.at(-1);
    if (
      a &&
      b &&
      ((Math.abs(a.x - b.x) < EPSILON && Math.abs(b.x - point.x) < EPSILON && (b.y - a.y) * (point.y - b.y) >= 0) ||
        (Math.abs(a.y - b.y) < EPSILON && Math.abs(b.y - point.y) < EPSILON && (b.x - a.x) * (point.x - b.x) >= 0))
    )
      result.pop();
    result.push(point);
  }
  return result;
}
type Entry = { state: number; cost: number; rank: number };
class Queue {
  private entries: Entry[] = [];
  push(entry: Entry) {
    let index = this.entries.length;
    this.entries.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1,
        other = this.entries[parent];
      if (!other || other.rank <= entry.rank) break;
      this.entries[index] = other;
      index = parent;
    }
    this.entries[index] = entry;
  }
  pop(): Entry | undefined {
    const first = this.entries[0],
      last = this.entries.pop();
    if (!this.entries.length || !last) return first;
    let index = 0;
    while (index * 2 + 1 < this.entries.length) {
      let child = index * 2 + 1;
      if ((this.entries[child + 1]?.rank ?? Infinity) < (this.entries[child]?.rank ?? Infinity)) child++;
      const other = this.entries[child];
      if (!other || other.rank >= last.rank) break;
      this.entries[index] = other;
      index = child;
    }
    this.entries[index] = last;
    return first;
  }
}
/** Bounded A* on obstacle edge coordinates. Penalize bends, crossings and shared tracks. */
export function orthogonalRoute(
  start: Position,
  end: Position,
  obstacles: readonly Rect[],
  occupied: readonly Segment[] = [],
): Position[] | undefined {
  if (samePoint(start, end)) return [start];
  const xSet = new Set([start.x, end.x]),
    ySet = new Set([start.y, end.y]);
  for (const rect of obstacles) {
    for (const x of [rect.x - 8, rect.x, rect.x + rect.width, rect.x + rect.width + 8]) xSet.add(x);
    for (const y of [rect.y - 8, rect.y, rect.y + rect.height, rect.y + rect.height + 8]) ySet.add(y);
  }
  // Nearby alternative tracks keep parallel wires distinguishable without unbounded grid growth.
  for (const segment of occupied.slice(-12)) {
    if (Math.abs(segment.from.x - segment.to.x) < EPSILON) {
      xSet.add(segment.from.x - 8);
      xSet.add(segment.from.x + 8);
    }
    if (Math.abs(segment.from.y - segment.to.y) < EPSILON) {
      ySet.add(segment.from.y - 8);
      ySet.add(segment.from.y + 8);
    }
  }
  const xs = [...xSet].sort((a, b) => a - b),
    ys = [...ySet].sort((a, b) => a - b);
  const width = xs.length,
    count = width * ys.length;
  if (count > 180000) return undefined;
  const startIndex = ys.indexOf(start.y) * width + xs.indexOf(start.x),
    endIndex = ys.indexOf(end.y) * width + xs.indexOf(end.x);
  const point = (index: number): Position => ({ x: xs[index % width] ?? 0, y: ys[Math.floor(index / width)] ?? 0 });
  const queue = new Queue(),
    scores = new Map<number, number>(),
    parents = new Map<number, number>();
  for (const direction of [0, 1]) {
    const state = startIndex * 2 + direction;
    scores.set(state, 0);
    queue.push({ state, cost: 0, rank: 0 });
  }
  const clear = new Map<string, boolean>();
  const edgeCosts = new Map<string, number>();
  for (let visited = 0; visited < 25000; visited++) {
    const entry = queue.pop();
    if (!entry) return undefined;
    if (entry.cost !== scores.get(entry.state)) continue;
    const index = Math.floor(entry.state / 2),
      a = point(index);
    if (index === endIndex) {
      const path: Position[] = [];
      let state: number | undefined = entry.state;
      while (state !== undefined) {
        path.push(point(Math.floor(state / 2)));
        state = parents.get(state);
      }
      return simplifyRoute(path.reverse());
    }
    for (const next of [
      index % width > 0 ? index - 1 : -1,
      index % width < width - 1 ? index + 1 : -1,
      index >= width ? index - width : -1,
      index + width < count ? index + width : -1,
    ]) {
      if (next < 0) continue;
      const b = point(next),
        edge = { from: a, to: b },
        key = `${Math.min(index, next)}/${Math.max(index, next)}`;
      let allowed = clear.get(key);
      if (allowed === undefined) {
        allowed = !obstacles.some((rect) => segmentIntersectsRect(edge, rect));
        clear.set(key, allowed);
      }
      if (!allowed) continue;
      const direction = Math.abs(a.x - b.x) < EPSILON ? 1 : 0,
        state = next * 2 + direction;
      let edgeCost = edgeCosts.get(key);
      if (edgeCost === undefined) {
        edgeCost = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        for (const previous of occupied)
          edgeCost += (segmentCrossing(edge, previous, true) ? 100 : 0) + overlapLength(edge, previous) * 1.8;
        edgeCosts.set(key, edgeCost);
      }
      const cost = entry.cost + edgeCost + (entry.state % 2 === direction ? 0 : 18);
      if (cost >= (scores.get(state) ?? Infinity)) continue;
      scores.set(state, cost);
      parents.set(state, entry.state);
      queue.push({ state, cost, rank: cost + Math.abs(b.x - end.x) + Math.abs(b.y - end.y) });
    }
  }
  return undefined;
}
