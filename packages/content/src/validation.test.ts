import { ControllerConfigSchema, DeviceSpecSchema, parseProject } from "@strazh-sim/core";
import { expect, it } from "vitest";
import { createDoorProject, devices } from "./index";

it("импорт не принимает две точки на одном реле или отсутствующее реле", () => {
  const project = createDoorProject(true),
    config = project.devices.find((device) => device.controller)?.controller;
  const point = config?.points[0];
  if (!config || !point) throw new Error("fixture");
  config.points.push({ ...point, id: "another", name: "Другая дверь" });
  expect(() => parseProject(project, devices)).toThrow(/Реле назначено нескольким/);
  config.points.pop();
  const withoutRelays = devices.map((device) =>
    device.id === "str_1ap"
      ? DeviceSpecSchema.parse({ ...device, electrical: { ...device.electrical, relays: [] } })
      : device,
  );
  expect(() => parseProject(project, withoutRelays)).toThrow(/Неизвестное реле/);
});
it("маска подсети должна иметь непрерывные единичные биты", () => {
  expect(ControllerConfigSchema.safeParse({ mask: "255.0.255.0" }).success).toBe(false);
  expect(ControllerConfigSchema.safeParse({ mask: "255.255.252.0" }).success).toBe(true);
});
it("проверяет этаж старого формата фонового плана", () => {
  const project = createDoorProject(true);
  project.plan.background = {
    floorId: "missing",
    dataUrl: "data:image/png;base64,AAAA",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 0.5,
    locked: true,
  };
  expect(() => parseProject(project, devices)).toThrow(/этаж фонового плана/);
});
