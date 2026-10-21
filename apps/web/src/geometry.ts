import { getDevice } from "@strazh-sim/content";
import type { DeviceSpec, Endpoint, Position, Project } from "@strazh-sim/core";

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
