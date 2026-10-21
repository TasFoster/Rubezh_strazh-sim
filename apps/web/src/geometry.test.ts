import { createDoorProject, createTwoControllersProject } from "@strazh-sim/content";
import { rectanglesOverlap, segmentIntersectsRect, segments } from "@strazh-sim/core";
import { describe, expect, it } from "vitest";
import { arrangeDevices, closestSegmentIndex, deviceBounds, floorBounds, routeCables, wireBridges } from "./geometry";

describe("компоновка стенда", () => {
  it.each([false, true])("компоненты и автопровода не пересекают корпуса; клеммы=%s", (detail) => {
    const project = createDoorProject(true);
    arrangeDevices(project, detail, "floor_1");
    for (let i = 0; i < project.devices.length; i++)
      for (const other of project.devices.slice(i + 1)) {
        const device = project.devices[i];
        if (device)
          expect(rectanglesOverlap(deviceBounds(device, detail), deviceBounds(other, detail), 40)).toBe(false);
      }
    const wires = routeCables(project, detail, "floor_1");
    expect(wires.length).toBe(18);
    for (const wire of wires) {
      expect(wire.warning, wire.coreId).toBeUndefined();
      for (const device of project.devices.filter(
        (item) => item.id !== wire.from.deviceId && item.id !== wire.to.deviceId,
      )) {
        expect(
          segments(wire.points).some((edge) => segmentIntersectsRect(edge, deviceBounds(device, detail))),
          wire.coreId,
        ).toBe(false);
      }
    }
  });
  it("разделяет этажи и сохраняет ручные узлы", () => {
    const project = createDoorProject(true),
      cable = project.cables[0];
    if (!cable) throw new Error("fixture");
    cable.route = [{ id: "waypoint", x: -200, y: -200 }];
    const before = JSON.stringify(cable);
    expect(routeCables(project, false, "floor_1")[0]?.points).toContainEqual({ id: "waypoint", x: -200, y: -200 });
    expect(JSON.stringify(cable)).toBe(before);
    project.plan.floors.push({ id: "floor_2", name: "Этаж 2" });
    expect(floorBounds(project, false, "floor_2")).toBeUndefined();
    expect(routeCables(project, false, "floor_2")).toEqual([]);
  });
  it("разводит два контроллера без изменения электрических соединений", () => {
    const project = createTwoControllersProject(),
      connections = JSON.stringify(project.cables);
    arrangeDevices(project, true, "floor_1");
    expect(routeCables(project, true, "floor_1").every((wire) => !wire.warning)).toBe(true);
    expect(JSON.stringify(project.cables)).toBe(connections);
  });
});

it("ручной узел вставляется в выбранный сегмент, включая повторные точки", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];
  expect(closestSegmentIndex(points, { x: 100, y: 50 })).toBe(2);
});
it("дуги имеют уникальные ключи даже при одинаковых ID жил в разных кабелях", () => {
  const project = createDoorProject(true);
  arrangeDevices(project, false, "floor_1");
  const bridges = wireBridges(routeCables(project, false, "floor_1"));
  expect(bridges.length).toBeGreaterThan(0);
  expect(new Set(bridges.map((item) => item.key)).size).toBe(bridges.length);
});

it("предупреждает о ручной трассе, уходящей внутрь собственного корпуса", () => {
  const project = createDoorProject(true),
    cable = project.cables[0];
  if (!cable?.cores[0]) throw new Error("fixture");
  cable.routing = "manual";
  cable.route = [];
  cable.cores[0].from = { deviceId: "psu", terminalId: "pos" };
  cable.cores[0].to = { deviceId: "lock", terminalId: "pos" };
  expect(routeCables(project, false, "floor_1").find((wire) => wire.cableId === cable.id)?.warning).toContain(
    "пересекает компонент",
  );
});
