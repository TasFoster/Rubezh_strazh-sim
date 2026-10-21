import { z } from "zod";
import { solveCircuit } from "./circuit";
import type { DeviceSpec } from "./device";
import type { Project } from "./project";
import { discoverModules, lockIsOpen, pointReady, type Simulation } from "./simulation";
export const GoalSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["power", "online", "point", "card", "card_passage", "exit_passage", "button", "secured", "healthy"]),
});
export type Goal = z.infer<typeof GoalSchema>;
export const ScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  goals: z.array(GoalSchema).min(1),
  hints: z.array(z.string()).min(1),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
export type GoalResult = Goal & { passed: boolean };
/** Проверяется поведение, а не совпадение списка проводов с шаблоном. */
export function evaluateScenario(
  project: Project,
  catalog: readonly DeviceSpec[],
  state: Simulation,
  scenario: Scenario,
  active = true,
): GoalResult[] {
  const circuit = solveCircuit(project, catalog, state),
    links = discoverModules(project, catalog, circuit, state.addresses);
  const controllers = project.devices.filter((device) => device.controller);
  const points = controllers.flatMap(
    (controller) => controller.controller?.points.map((point) => ({ controller, point })) ?? [],
  );
  const validPoint = points.some(({ controller, point }) => pointReady(circuit, links, controller, point));
  const passage = (cause: "card" | "card_exit") =>
    state.events.some(
      (event) =>
        event.code === "unlock" &&
        event.cause === cause &&
        state.events.some(
          (open) =>
            open.sequence > event.sequence &&
            open.controllerId === event.controllerId &&
            open.pointId === event.pointId &&
            open.code === "door_open" &&
            state.events.some(
              (closed) =>
                closed.sequence > open.sequence &&
                closed.controllerId === open.controllerId &&
                closed.pointId === open.pointId &&
                closed.code === "door_closed",
            ),
        ),
    );
  const flags: Record<Goal["kind"], boolean> = {
    power:
      active &&
      project.devices.some(
        (device) =>
          catalog.find((model) => model.id === device.modelId)?.kind === "access_module" && circuit.powered[device.id],
      ),
    online: active && links.some((link) => link.status === "online"),
    point: validPoint && active,
    card: controllers.some((controller) =>
      controller.controller?.cards.some(
        (card) =>
          card.enabled && card.pointIds.some((id) => controller.controller?.points.some((point) => point.id === id)),
      ),
    ),
    card_passage: active && passage("card"),
    exit_passage: active && passage("card_exit"),
    button: active && state.events.some((event) => event.code === "unlock" && event.cause === "button"),
    secured:
      active &&
      points.some(
        ({ controller, point }) =>
          pointReady(circuit, links, controller, point) &&
          state.inputStates[`${controller.id}/${point.id}`] === "closed" &&
          !lockIsOpen(project, circuit, point.lockId),
      ),
    healthy: active && !circuit.diagnostics.length && links.every((link) => link.status === "online"),
  };
  return scenario.goals.map((goal) => ({ ...goal, passed: flags[goal.kind] }));
}
