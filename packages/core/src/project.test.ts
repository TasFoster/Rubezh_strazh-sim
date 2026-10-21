import { describe, expect, it } from "vitest";
import { DeviceSpecSchema } from "./device";
import { createProject, InstanceSchema, parseProject, removeDevice, serializeProject } from "./project";

const model = DeviceSpecSchema.parse({
  id: "demo",
  name: "Demo",
  kind: "access_module",
  source: { document: "test", edition: "1" },
  supply: { minVoltage: 9, maxVoltage: 28, maxCurrentA: 0.15 },
  blocks: [{ id: "power", label: "Power" }],
  terminals: [{ id: "u", label: "U", block: "power", kind: "power_in" }],
});
const make = () => {
  const project = createProject();
  project.devices.push(InstanceSchema.parse({ id: "a", modelId: "demo", name: "A", position: { x: 10, y: 20 } }));
  project.devices.push(
    InstanceSchema.parse({ id: "b", modelId: "demo", name: "B", position: { x: 30, y: 40 }, settings: { address: 2 } }),
  );
  return project;
};
describe("project", () => {
  it("сохраняет независимые экземпляры и восстанавливает конфигурацию", () => {
    const project = make();
    expect(parseProject(JSON.parse(serializeProject(project)), [model])).toEqual(project);
    expect(project.devices.map((device) => device.settings.address)).toEqual([1, 2]);
  });
  it("не принимает неизвестную версию, модель, этаж и дубликаты", () => {
    expect(() => parseProject({ ...make(), version: 2 }, [model])).toThrow();
    expect(() => parseProject(make(), [])).toThrow(/модель/);
    const project = make();
    const first = project.devices[0];
    if (!first) throw new Error("fixture");
    project.devices.push(first);
    expect(() => parseProject(project, [model])).toThrow(/Повторный/);
    project.devices = [InstanceSchema.parse({ ...project.devices[0], floorId: "absent" })];
    expect(() => parseProject(project, [model])).toThrow(/этаж/);
  });
  it("проверяет ссылки клемм и удаляет зависимые жилы", () => {
    const project = make();
    project.cables.push({
      id: "c",
      name: "C",
      floorId: "floor_1",
      route: [],
      lengthM: 1,
      sectionMm2: 0.5,
      cores: [
        {
          id: "one",
          color: "#ff0000",
          from: { deviceId: "a", terminalId: "u" },
          to: { deviceId: "b", terminalId: "u" },
          broken: false,
        },
      ],
    });
    expect(parseProject(project, [model])).toEqual(project);
    expect(removeDevice(project, "a").cables).toEqual([]);
    const core = project.cables[0]?.cores[0];
    if (!core) throw new Error("fixture");
    core.to.terminalId = "absent";
    expect(() => parseProject(project, [model])).toThrow(/клемма/);
  });
});
