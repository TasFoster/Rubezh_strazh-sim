import { getDevice } from "@strazh-sim/content";
import {
  backgroundFor,
  type DeviceSpec,
  type Endpoint,
  inflateRect,
  orthogonalRoute,
  type Position,
  type Project,
  placeRectangle,
  type Rect,
  rotatedBounds,
  type Segment,
  segmentCrossing,
  segmentIntersectsRect,
  segments,
  simplifyRoute,
} from "@strazh-sim/core";

export function cardSize(model: DeviceSpec, detail: boolean) {
  return {
    width: detail ? 280 : 180,
    height: detail ? Math.max(100, 84 + Math.ceil(model.terminals.length / 2) * 18) : 90,
  };
}
export function terminalPoint(model: DeviceSpec, index: number, detail: boolean): Position {
  if (!detail) return { x: index % 2 ? 180 : 0, y: 45 };
  return { x: index % 2 ? cardSize(model, detail).width : 0, y: 80 + Math.floor(index / 2) * 18 };
}
export function endpointPosition(
  project: Project,
  endpoint: Endpoint,
  detail: boolean,
  preview?: { id: string; point: Position },
): Position {
  const device = project.devices.find((item) => item.id === endpoint.deviceId);
  if (!device) return { x: 0, y: 0 };
  const model = getDevice(device.modelId);
  const size = cardSize(model, detail);
  const local = terminalPoint(
    model,
    model.terminals.findIndex((terminal) => terminal.id === endpoint.terminalId),
    detail,
  );
  const theta = (device.rotation * Math.PI) / 180;
  const dx = local.x - size.width / 2,
    dy = local.y - size.height / 2;
  const position = preview?.id === device.id ? preview.point : device.position;
  return {
    x: position.x + size.width / 2 + dx * Math.cos(theta) - dy * Math.sin(theta),
    y: position.y + size.height / 2 + dx * Math.sin(theta) + dy * Math.cos(theta),
  };
}

export function deviceBounds(device: Project["devices"][number], detail: boolean): Rect {
  return rotatedBounds({ ...device.position, ...cardSize(getDevice(device.modelId), detail) }, device.rotation);
}
export function freeDevicePosition(project: Project, device: Project["devices"][number], detail: boolean): Position {
  const bounds = deviceBounds(device, detail);
  const obstacles = project.devices
    .filter((other) => other.id !== device.id && other.floorId === device.floorId)
    .map((other) => deviceBounds(other, detail));
  const free = placeRectangle(bounds, obstacles);
  return { x: device.position.x + free.x - bounds.x, y: device.position.y + free.y - bounds.y };
}
/** Stable order preserves the first card and moves only cards that overlap earlier ones. */
export function arrangeDevices(project: Project, detail: boolean, floorId: string): void {
  const occupied: Rect[] = [];
  for (const device of project.devices.filter((device) => device.floorId === floorId)) {
    const bounds = deviceBounds(device, detail),
      free = placeRectangle(bounds, occupied);
    device.position = { x: device.position.x + free.x - bounds.x, y: device.position.y + free.y - bounds.y };
    occupied.push({ ...bounds, ...free });
  }
}
export function floorBounds(project: Project, detail: boolean, floorId: string): Rect | undefined {
  const rects = project.devices
    .filter((device) => device.floorId === floorId)
    .map((device) => deviceBounds(device, detail));
  const bg = backgroundFor(project, floorId);
  if (bg) rects.push(rotatedBounds(bg, bg.rotation));
  for (const room of project.plan.rooms.filter((room) => room.floorId === floorId))
    rects.push({ ...room.position, width: room.width, height: room.height });
  for (const wall of project.plan.walls.filter((wall) => wall.floorId === floorId))
    rects.push({
      x: Math.min(wall.from.x, wall.to.x),
      y: Math.min(wall.from.y, wall.to.y),
      width: Math.abs(wall.to.x - wall.from.x),
      height: Math.abs(wall.to.y - wall.from.y),
    });
  for (const door of project.plan.doors.filter((door) => door.floorId === floorId))
    rects.push({
      x: door.position.x - door.width,
      y: door.position.y - door.width,
      width: door.width * 2,
      height: door.width * 2,
    });
  if (!rects.length) return undefined;
  const x = Math.min(...rects.map((r) => r.x)),
    y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
}
export type RoutedWire = {
  cableId: string;
  coreId: string;
  color: string;
  broken: boolean;
  points: Position[];
  warning?: string;
  from: Endpoint;
  to: Endpoint;
};
export const automaticCable = (cable: Project["cables"][number]) =>
  cable.routing === "auto" || (cable.routing !== "manual" && cable.route.length === 0);
function escapePort(project: Project, endpoint: Endpoint, detail: boolean): Position {
  const device = project.devices.find((item) => item.id === endpoint.deviceId);
  const point = endpointPosition(project, endpoint, detail);
  if (!device) return point;
  const model = getDevice(device.modelId),
    bounds = deviceBounds(device, detail);
  const index = model.terminals.findIndex((terminal) => terminal.id === endpoint.terminalId);
  const angle = (device.rotation * Math.PI) / 180,
    sign = index % 2 ? 1 : -1;
  const dx = Math.cos(angle) * sign,
    dy = Math.sin(angle) * sign;
  return Math.abs(dx) >= Math.abs(dy)
    ? { x: dx > 0 ? bounds.x + bounds.width + 18 : bounds.x - 18, y: point.y }
    : { x: point.x, y: dy > 0 ? bounds.y + bounds.height + 18 : bounds.y - 18 };
}
export function routeCables(project: Project, detail: boolean, floorId: string): RoutedWire[] {
  const obstacles = project.devices
    .filter((device) => device.floorId === floorId)
    .map((device) => ({
      id: device.id,
      rect: inflateRect(deviceBounds(device, detail), 12),
      body: deviceBounds(device, detail),
    }));
  const occupied: Segment[] = [],
    result: RoutedWire[] = [];
  const cables = project.cables
    .filter((cable) => cable.floorId === floorId)
    .slice()
    .sort((a, b) => Number(automaticCable(a)) - Number(automaticCable(b)));
  for (const cable of cables)
    for (const core of cable.cores) {
      const from = endpointPosition(project, core.from, detail),
        to = endpointPosition(project, core.to, detail);
      let points: Position[], warning: string | undefined;
      if (automaticCable(cable)) {
        const start = escapePort(project, core.from, detail),
          end = escapePort(project, core.to, detail);
        const path = orthogonalRoute(
          start,
          end,
          obstacles.map((item) => item.rect),
          occupied,
        );
        const stubs = [
          { from, to: start, own: core.from.deviceId },
          { from: end, to, own: core.to.deviceId },
        ];
        if (
          path &&
          !stubs.some((stub) =>
            obstacles.some((obstacle) => obstacle.id !== stub.own && segmentIntersectsRect(stub, obstacle.rect)),
          )
        )
          points = simplifyRoute([from, ...path, to]);
        else {
          points = [];
          warning = "Нет свободного маршрута: раздвиньте компоненты или измените клеммы";
        }
      } else {
        points = [from, ...cable.route, to];
        const edges = segments(points);
        if (
          edges.some((edge, index) =>
            obstacles.some((obstacle) =>
              segmentIntersectsRect(
                edge,
                (index === 0 && obstacle.id === core.from.deviceId) ||
                  (index === edges.length - 1 && obstacle.id === core.to.deviceId)
                  ? obstacle.body
                  : obstacle.rect,
              ),
            ),
          )
        )
          warning = "Ручной маршрут пересекает компонент";
      }
      result.push({
        cableId: cable.id,
        coreId: core.id,
        color: core.color,
        broken: core.broken,
        points,
        ...(warning ? { warning } : {}),
        from: core.from,
        to: core.to,
      });
      occupied.push(...segments(points));
    }
  return result;
}
export function wireBridges(
  wires: readonly RoutedWire[],
): { key: string; point: Position; angle: number; color: string }[] {
  const result: { key: string; point: Position; angle: number; color: string }[] = [];
  for (let i = 0; i < wires.length; i++) {
    const wire = wires[i];
    if (!wire) continue;
    const seen = new Set<string>();
    for (const edge of segments(wire.points))
      for (const previous of wires.slice(0, i))
        for (const other of segments(previous.points)) {
          const point = segmentCrossing(edge, other, true);
          if (!point) continue;
          const key = `${wire.cableId}/${wire.coreId}/${point.x.toFixed(3)}/${point.y.toFixed(3)}`;
          if (
            seen.has(key) ||
            Math.hypot(point.x - edge.from.x, point.y - edge.from.y) < 7 ||
            Math.hypot(point.x - edge.to.x, point.y - edge.to.y) < 7
          )
            continue;
          seen.add(key);
          result.push({
            key,
            point,
            angle: (Math.atan2(edge.to.y - edge.from.y, edge.to.x - edge.from.x) * 180) / Math.PI,
            color: wire.color,
          });
        }
  }
  return result;
}

export function closestSegmentIndex(points: readonly Position[], target: Position): number {
  let best = 0,
    distance = Infinity;
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index],
      to = points[index + 1];
    if (!from || !to) continue;
    const edge = { from, to };
    const dx = edge.to.x - edge.from.x,
      dy = edge.to.y - edge.from.y,
      length = dx * dx + dy * dy;
    const t = length
      ? Math.max(0, Math.min(1, ((target.x - edge.from.x) * dx + (target.y - edge.from.y) * dy) / length))
      : 0;
    const value = Math.hypot(target.x - edge.from.x - t * dx, target.y - edge.from.y - t * dy);
    if (value < distance) {
      distance = value;
      best = index;
    }
  }
  return best;
}
