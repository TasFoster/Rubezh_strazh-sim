import { describe, expect, it } from "vitest";
import {
  orthogonalRoute,
  placeRectangle,
  rectanglesOverlap,
  rotatedBounds,
  segmentCrossing,
  segmentIntersectsRect,
  segments,
} from "./layout";

describe("автоматическая геометрия", () => {
  it("выбирает ближайшее свободное место, учитывая поворот и зазор", () => {
    const a = rotatedBounds({ x: 0, y: 0, width: 280, height: 100 }, 90);
    const b = { x: 100, y: 30, width: 180, height: 90 };
    expect(rectanglesOverlap(a, b)).toBe(true);
    const moved = { ...b, ...placeRectangle(b, [a]) };
    expect(rectanglesOverlap(a, moved, 40)).toBe(false);
    expect(placeRectangle(moved, [a])).toEqual({ x: moved.x, y: moved.y });
  });
  it("обходит несколько препятствий ортогональными отрезками", () => {
    const obstacles = [
      { x: 60, y: -20, width: 80, height: 120 },
      { x: 180, y: -100, width: 40, height: 100 },
    ];
    const route = orthogonalRoute({ x: 0, y: 0 }, { x: 300, y: 0 }, obstacles);
    expect(route).toBeDefined();
    expect(route?.[0]).toEqual({ x: 0, y: 0 });
    expect(route?.at(-1)).toEqual({ x: 300, y: 0 });
    for (const edge of segments(route ?? [])) {
      expect(edge.from.x === edge.to.x || edge.from.y === edge.to.y).toBe(true);
      expect(obstacles.some((obstacle) => segmentIntersectsRect(edge, obstacle))).toBe(false);
    }
    expect(orthogonalRoute({ x: 0, y: 0 }, { x: 300, y: 0 }, obstacles)).toEqual(route);
  });
  it("не рисует выдуманный маршрут из точки внутри препятствия", () => {
    expect(
      orthogonalRoute({ x: 50, y: 50 }, { x: 200, y: 0 }, [{ x: 0, y: 0, width: 100, height: 100 }]),
    ).toBeUndefined();
  });
  it("отличает пересечение от общей клеммы и касания корпуса", () => {
    expect(
      segmentCrossing(
        { from: { x: 0, y: 0 }, to: { x: 100, y: 0 } },
        { from: { x: 50, y: -50 }, to: { x: 50, y: 50 } },
      ),
    ).toEqual({ x: 50, y: 0 });
    expect(
      segmentCrossing(
        { from: { x: 0, y: 0 }, to: { x: 100, y: 0 } },
        { from: { x: 100, y: 0 }, to: { x: 100, y: 50 } },
      ),
    ).toBeUndefined();
    expect(
      segmentIntersectsRect({ from: { x: -20, y: 0 }, to: { x: 120, y: 0 } }, { x: 0, y: 0, width: 100, height: 100 }),
    ).toBe(false);
  });
});
