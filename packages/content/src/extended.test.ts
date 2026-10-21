import {
  advanceSimulation,
  createSimulation,
  discoverModules,
  lockIsOpen,
  parseProject,
  solveCircuit,
} from "@strazh-sim/core";
import { expect, it } from "vitest";
import { createBidirectionalProject, createTurnstileProject, createTwoControllersProject } from "./example";
import { devices } from "./index";

it("выходной считыватель двусторонней двери действительно управляет тем же замком", () => {
  const project = createBidirectionalProject();
  parseProject(project, devices);
  const state = advanceSimulation(project, devices, createSimulation(project), 0, [
    { type: "card", controllerId: "controller", pointId: "door_1", cardId: "1001", direction: "exit" },
  ]);
  expect(state.events.some((event) => event.cause === "card_exit")).toBe(true);
  expect(lockIsOpen(project, solveCircuit(project, devices, state), "lock")).toBe(true);
});
it("турникет питается постоянно и разрешает проход сухим контактом", () => {
  const project = createTurnstileProject();
  parseProject(project, devices);
  let state = advanceSimulation(project, devices, createSimulation(project), 0);
  expect(solveCircuit(project, devices, state).powered.lock).toBe(true);
  expect(lockIsOpen(project, solveCircuit(project, devices, state), "lock")).toBe(false);
  state = advanceSimulation(project, devices, state, 0, [
    { type: "card", controllerId: "controller", pointId: "door_1", cardId: "1001" },
  ]);
  const result = solveCircuit(project, devices, state);
  expect(result.powered.lock).toBe(true);
  expect(lockIsOpen(project, result, "lock")).toBe(true);
  state = advanceSimulation(project, devices, state, 3000);
  expect(lockIsOpen(project, solveCircuit(project, devices, state), "lock")).toBe(false);
});
it("контроллеры независимы по линиям, картам, реле и журналу", () => {
  const project = createTwoControllersProject();
  parseProject(project, devices);
  let state = advanceSimulation(project, devices, createSimulation(project), 0);
  const links = discoverModules(project, devices, solveCircuit(project, devices, state), state.addresses);
  expect(links.length).toBe(2);
  expect(links.every((link) => link.status === "online")).toBe(true);
  state = advanceSimulation(project, devices, state, 0, [
    { type: "card", controllerId: "a_controller", pointId: "a_door_1", cardId: "1001" },
  ]);
  const result = solveCircuit(project, devices, state);
  expect(lockIsOpen(project, result, "a_lock")).toBe(true);
  expect(lockIsOpen(project, result, "b_lock")).toBe(false);
  expect(state.events.filter((event) => event.code === "unlock").map((event) => event.controllerId)).toEqual([
    "a_controller",
  ]);
});
it("OSDP-считыватель обнаруживается отдельно и передаёт карту через свою линию", async () => {
  const { createOsdpReaderProject } = await import("./example");
  const project = createOsdpReaderProject();
  parseProject(project, devices);
  const state = advanceSimulation(project, devices, createSimulation(project), 0, [
    { type: "card", controllerId: "controller", pointId: "door_1", cardId: "1001" },
  ]);
  expect(
    discoverModules(project, devices, solveCircuit(project, devices, state), state.addresses).filter(
      (link) => link.status === "online",
    ).length,
  ).toBe(2);
  expect(lockIsOpen(project, solveCircuit(project, devices, state), "lock")).toBe(true);
});
