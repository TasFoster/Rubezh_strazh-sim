import { advanceSimulation, createSimulation, evaluateScenario, parseProject } from "@strazh-sim/core";
import { expect, it } from "vitest";
import { createDoorProject } from "./example";
import { devices } from "./index";
import { createScenarioProject, scenarios } from "./scenarios";

it("все учебные проекты валидны, неисправность связи действительно мешает работе", () => {
  for (const scenario of scenarios) parseProject(createScenarioProject(scenario.id), devices);
  const scenario = scenarios.find((item) => item.id === "repair_osdp");
  if (!scenario) throw new Error("fixture");
  const project = createScenarioProject(scenario.id);
  const state = advanceSimulation(project, devices, createSimulation(project), 0);
  expect(evaluateScenario(project, devices, state, scenario).find((goal) => goal.kind === "online")?.passed).toBe(
    false,
  );
  for (const cable of project.cables) for (const core of cable.cores) core.broken = false;
  const repaired = advanceSimulation(project, devices, state, 100);
  expect(evaluateScenario(project, devices, repaired, scenario).find((goal) => goal.kind === "online")?.passed).toBe(
    true,
  );
});
it("проверяет полный цикл прохода и кнопку по поведению", () => {
  const project = createDoorProject(true),
    scenario = scenarios.find((item) => item.id === "commission_door");
  if (!scenario) throw new Error("fixture");
  let state = advanceSimulation(project, devices, createSimulation(project), 0);
  const action = { type: "card" as const, controllerId: "controller", pointId: "door_1", cardId: "1001" };
  expect(advanceSimulation(project, devices, state, 100, [action])).toEqual(
    advanceSimulation(project, devices, state, 100, [action]),
  );
  state = advanceSimulation(project, devices, state, 0, [action]);
  state = advanceSimulation(project, devices, state, 100, [
    { type: "door", controllerId: "controller", pointId: "door_1", open: true },
  ]);
  state = advanceSimulation(project, devices, state, 100, [
    { type: "door", controllerId: "controller", pointId: "door_1", open: false },
  ]);
  state = advanceSimulation(project, devices, state, 100, [{ type: "button", deviceId: "button", pressed: true }]);
  state = advanceSimulation(project, devices, state, 100, [{ type: "button", deviceId: "button", pressed: false }]);
  state = advanceSimulation(project, devices, state, 4000);
  expect(evaluateScenario(project, devices, state, scenario).every((goal) => goal.passed)).toBe(true);
});
