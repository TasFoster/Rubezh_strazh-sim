import {
  advanceSimulation,
  createSimulation,
  discoverModules,
  InstanceSchema,
  lockIsOpen,
  solveCircuit,
} from "@strazh-sim/core";
import { expect, it } from "vitest";
import { createDoorProject } from "./example";
import { devices } from "./index";

it("карта открывает реле на заданное время, чужая карта запрещена", () => {
  const project = createDoorProject(true);
  let state = createSimulation(project);
  state = advanceSimulation(project, devices, state, 0, [
    { type: "card", controllerId: "controller", pointId: "door_1", cardId: "bad" },
  ]);
  expect(state.events.some((event) => event.code === "denied")).toBe(true);
  expect(lockIsOpen(project, solveCircuit(project, devices, state), "lock")).toBe(false);
  state = advanceSimulation(project, devices, state, 0, [
    { type: "card", controllerId: "controller", pointId: "door_1", cardId: "1001" },
  ]);
  expect(lockIsOpen(project, solveCircuit(project, devices, state), "lock")).toBe(true);
  state = advanceSimulation(project, devices, state, 3000);
  expect(lockIsOpen(project, solveCircuit(project, devices, state), "lock")).toBe(false);
});
it("DIP применяется после перезапуска и конфликт адресов обнаруживается на одной линии", () => {
  const project = createDoorProject(true);
  let state = advanceSimulation(project, devices, createSimulation(project), 0);
  const module = project.devices.find((device) => device.id === "module");
  if (!module) throw new Error("fixture");
  module.settings.address = 3;
  state = advanceSimulation(project, devices, state, 100);
  expect(state.addresses.module).toBe(1);
  state = advanceSimulation(project, devices, state, 0, [{ type: "reboot", deviceId: "module" }]);
  expect(state.addresses.module).toBe(3);
  const twin = InstanceSchema.parse({ ...module, id: "twin" });
  project.devices.push(twin);
  const cables = project.cables.filter((cable) =>
    cable.cores.some(
      (core) =>
        core.to.deviceId === "module" &&
        ["power_u", "power_gnd", "rs1_pos", "rs1_neg", "rs1_gnd"].includes(core.to.terminalId),
    ),
  );
  for (const cable of cables)
    project.cables.push({
      ...cable,
      id: `twin_${cable.id}`,
      cores: cable.cores.map((core) => ({ ...core, to: { ...core.to, deviceId: "twin" } })),
    });
  const circuit = solveCircuit(project, devices);
  const links = discoverModules(project, devices, circuit, state.addresses);
  expect(links.every((link) => link.status === "conflict")).toBe(true);
  expect(links.length).toBe(2);
});
it("кнопка действует через проводку, закрытый замок удерживает дверь", () => {
  const project = createDoorProject(true);
  let state = createSimulation(project);
  state = advanceSimulation(project, devices, state, 0, [
    { type: "door", controllerId: "controller", pointId: "door_1", open: true },
  ]);
  expect(state.events.some((event) => event.code === "door_blocked")).toBe(true);
  state = advanceSimulation(project, devices, state, 0, [{ type: "button", deviceId: "button", pressed: true }]);
  expect(state.relays["module/k1"]).toBe(true);
  state = advanceSimulation(project, devices, state, 0, [
    { type: "door", controllerId: "controller", pointId: "door_1", open: true },
  ]);
  expect(state.inputStates["controller/door_1"]).toBe("open");
  state = advanceSimulation(project, devices, state, 11000);
  expect(state.events.some((event) => event.code === "door_held")).toBe(true);
});
