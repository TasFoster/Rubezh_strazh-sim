import { type CircuitResult, solveCircuit } from "./circuit";
import type { DeviceSpec } from "./device";
import { classifyInput, type InputState } from "./inputs";
import type { AccessPoint, DeviceInstance, Project } from "./project";

export type Link = {
  controllerId: string;
  moduleId: string;
  line: string;
  address: number;
  status: "online" | "conflict" | "invalid_address" | "master_conflict";
};
export type SimEvent = {
  sequence: number;
  timeMs: number;
  controllerId: string;
  code: string;
  message: string;
  pointId?: string;
};
export type Simulation = {
  timeMs: number;
  sequence: number;
  addresses: Record<string, number>;
  contacts: Record<string, boolean>;
  relays: Record<string, boolean>;
  unlockUntil: Record<string, number>;
  powered: Record<string, boolean>;
  inputStates: Record<string, InputState>;
  doorOpenedAt: Record<string, number>;
  heldReported: Record<string, boolean>;
  events: SimEvent[];
};
export type SimAction =
  | { type: "card"; controllerId: string; pointId: string; cardId: string }
  | { type: "unlock"; controllerId: string; pointId: string }
  | { type: "button"; deviceId: string; pressed: boolean }
  | { type: "door"; controllerId: string; pointId: string; open: boolean; force?: boolean }
  | { type: "reboot"; deviceId: string };
const endpoint = (deviceId: string, terminalId: string) => ({ deviceId, terminalId });
export const pointKey = (controllerId: string, pointId: string) => `${controllerId}/${pointId}`;
export function createSimulation(project: Project): Simulation {
  return {
    timeMs: 0,
    sequence: 0,
    addresses: Object.fromEntries(project.devices.map((device) => [device.id, device.settings.address])),
    contacts: {},
    relays: {},
    unlockUntil: {},
    powered: {},
    inputStates: {},
    doorOpenedAt: {},
    heldReported: {},
    events: [],
  };
}

export function discoverModules(
  project: Project,
  catalog: readonly DeviceSpec[],
  circuit: CircuitResult,
  addresses: Readonly<Record<string, number>>,
): Link[] {
  const models = new Map(catalog.map((model) => [model.id, model])),
    links: Link[] = [];
  for (const controller of project.devices.filter(
    (device) => models.get(device.modelId)?.kind === "controller" && circuit.powered[device.id],
  )) {
    for (const module of project.devices.filter(
      (device) => models.get(device.modelId)?.kind === "access_module" && circuit.powered[device.id],
    )) {
      const model = models.get(module.modelId),
        address = addresses[module.id] ?? module.settings.address;
      for (const line of models.get(controller.modelId)?.electrical?.buses ?? []) {
        const connected = model?.electrical?.buses.some(
          (bus) =>
            circuit.wiredTogether(endpoint(controller.id, line.positive), endpoint(module.id, bus.positive)) &&
            circuit.wiredTogether(endpoint(controller.id, line.negative), endpoint(module.id, bus.negative)) &&
            circuit.wiredTogether(endpoint(controller.id, line.ground), endpoint(module.id, bus.ground)) &&
            !circuit.wiredTogether(endpoint(controller.id, line.positive), endpoint(controller.id, line.negative)),
        );
        if (connected)
          links.push({
            controllerId: controller.id,
            moduleId: module.id,
            line: line.id,
            address,
            status:
              model?.dipAddress && address >= model.dipAddress.min && address <= model.dipAddress.max
                ? "online"
                : "invalid_address",
          });
      }
    }
  }
  for (const link of links) {
    if (
      links.some(
        (other) =>
          other !== link &&
          other.controllerId === link.controllerId &&
          other.line === link.line &&
          other.address === link.address &&
          other.moduleId !== link.moduleId,
      )
    )
      link.status = "conflict";
    if (links.some((other) => other.moduleId === link.moduleId && other.controllerId !== link.controllerId))
      link.status = "master_conflict";
  }
  return links;
}
export function lockIsOpen(project: Project, circuit: CircuitResult, lockId: string): boolean {
  const lock = project.devices.find((device) => device.id === lockId);
  if (!lock) return false;
  return lock.settings.lockMode === "fail_safe" ? !circuit.powered[lockId] : Boolean(circuit.powered[lockId]);
}
export function pointInput(
  project: Project,
  catalog: readonly DeviceSpec[],
  circuit: CircuitResult,
  point: AccessPoint,
  kind: "door" | "exit",
): InputState {
  const module = project.devices.find((device) => device.id === point.moduleId);
  const input = catalog
    .find((model) => model.id === module?.modelId)
    ?.electrical?.inputs.find((input) => input.id === `${kind}${point.relay}`);
  if (!module || !input || !circuit.powered[module.id]) return "invalid";
  return classifyInput(
    circuit.resistance(endpoint(module.id, input.signal), endpoint(module.id, input.ground)),
    module.settings.supervision[input.id] ?? false,
  );
}
export function pointReady(
  circuit: CircuitResult,
  links: Link[],
  controller: DeviceInstance,
  point: AccessPoint,
): boolean {
  return Boolean(
    circuit.powered[controller.id] &&
      controller.controller?.modules.includes(point.moduleId) &&
      links.some(
        (link) => link.controllerId === controller.id && link.moduleId === point.moduleId && link.status === "online",
      ),
  );
}
function readerReady(
  project: Project,
  catalog: readonly DeviceSpec[],
  circuit: CircuitResult,
  point: AccessPoint,
): boolean {
  const module = project.devices.find((device) => device.id === point.moduleId),
    reader = project.devices.find((device) => device.id === point.readerId);
  const port = catalog
    .find((model) => model.id === module?.modelId)
    ?.electrical?.readers.find((port) => port.id === `reader${point.relay}`);
  const readerPort = catalog.find((model) => model.id === reader?.modelId)?.electrical?.readers[0];
  return Boolean(
    module &&
      reader &&
      port &&
      readerPort &&
      circuit.powered[reader.id] &&
      circuit.wiredTogether(endpoint(module.id, port.d0), endpoint(reader.id, readerPort.d0)) &&
      circuit.wiredTogether(endpoint(module.id, port.d1), endpoint(reader.id, readerPort.d1)) &&
      !circuit.wiredTogether(endpoint(module.id, port.d0), endpoint(module.id, port.d1)),
  );
}

/** Fixed simulated time, no browser APIs or wall-clock dependency. */
export function advanceSimulation(
  project: Project,
  catalog: readonly DeviceSpec[],
  previous: Simulation,
  deltaMs: number,
  actions: readonly SimAction[] = [],
): Simulation {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError("Некорректный шаг времени");
  const state = JSON.parse(JSON.stringify(previous)) as Simulation;
  state.timeMs += deltaMs;
  const event = (controllerId: string, code: string, message: string, pointId?: string) => {
    state.events.push({
      sequence: ++state.sequence,
      timeMs: state.timeMs,
      controllerId,
      code,
      message,
      ...(pointId ? { pointId } : {}),
    });
    state.events = state.events.slice(-1000);
  };
  for (const action of actions) {
    if (action.type === "button") state.contacts[action.deviceId] = action.pressed;
    if (action.type === "reboot") {
      const device = project.devices.find((device) => device.id === action.deviceId);
      if (device) {
        state.addresses[device.id] = device.settings.address;
        event(device.controller ? device.id : "", "restart", `${device.name}: перезапуск`);
      }
    }
  }
  let circuit = solveCircuit(project, catalog, state);
  for (const device of project.devices)
    if (circuit.powered[device.id] && !previous.powered[device.id])
      state.addresses[device.id] = device.settings.address;
  let links = discoverModules(project, catalog, circuit, state.addresses);
  const controllers = project.devices.filter((device) => device.controller);
  const unlock = (controller: DeviceInstance, point: AccessPoint, reason: string) => {
    if (!pointReady(circuit, links, controller, point)) {
      event(controller.id, "offline", "Открытие невозможно: нет связи с модулем", point.id);
      return;
    }
    state.unlockUntil[pointKey(controller.id, point.id)] = state.timeMs + point.unlockMs;
    event(controller.id, "unlock", `Открытие: ${reason}`, point.id);
  };
  for (const controller of controllers)
    for (const point of controller.controller?.points ?? []) {
      const key = `${pointKey(controller.id, point.id)}/exit`,
        input = pointInput(project, catalog, circuit, point, "exit");
      if (input === "closed" && previous.inputStates[key] !== "closed") unlock(controller, point, "кнопка выхода");
      state.inputStates[key] = input;
    }
  for (const action of actions) {
    if (action.type !== "card" && action.type !== "unlock") continue;
    const controller = controllers.find((device) => device.id === action.controllerId),
      point = controller?.controller?.points.find((point) => point.id === action.pointId);
    if (!controller || !point) continue;
    if (action.type === "unlock") unlock(controller, point, "оператор");
    else {
      const card = controller.controller?.cards.find((card) => card.id === action.cardId);
      if (!readerReady(project, catalog, circuit, point))
        event(controller.id, "reader_offline", "Считыватель не подключён или без питания", point.id);
      else if (!card?.enabled || !card.pointIds.includes(point.id))
        event(controller.id, "denied", `Доступ запрещён: карта ${action.cardId}`, point.id);
      else unlock(controller, point, `карта ${action.cardId}, ${card.owner}`);
    }
  }
  state.relays = {};
  for (const controller of controllers)
    for (const point of controller.controller?.points ?? []) {
      if (
        (state.unlockUntil[pointKey(controller.id, point.id)] ?? 0) > state.timeMs &&
        pointReady(circuit, links, controller, point)
      )
        state.relays[`${point.moduleId}/k${point.relay}`] = true;
    }
  circuit = solveCircuit(project, catalog, state);
  for (const action of actions)
    if (action.type === "door") {
      const controller = controllers.find((device) => device.id === action.controllerId),
        point = controller?.controller?.points.find((point) => point.id === action.pointId);
      if (!controller || !point) continue;
      if (action.open && !action.force && !lockIsOpen(project, circuit, point.lockId)) {
        event(controller.id, "door_blocked", "Дверь удерживается замком", point.id);
        continue;
      }
      state.contacts[point.contactId] = !action.open;
    }
  circuit = solveCircuit(project, catalog, state);
  links = discoverModules(project, catalog, circuit, state.addresses);
  for (const controller of controllers) {
    for (const device of [
      controller,
      ...project.devices.filter((device) => controller.controller?.modules.includes(device.id)),
    ]) {
      const online =
        device.id === controller.id
          ? Boolean(circuit.powered[device.id])
          : links.some(
              (link) => link.moduleId === device.id && link.controllerId === controller.id && link.status === "online",
            );
      const key = `${controller.id}/${device.id}`;
      if (previous.powered[key] !== online)
        event(controller.id, online ? "online" : "offline", `${device.name}: ${online ? "на связи" : "нет связи"}`);
      state.powered[key] = online;
    }
    for (const point of controller.controller?.points ?? []) {
      const key = pointKey(controller.id, point.id),
        input = pointInput(project, catalog, circuit, point, "door");
      if (input !== previous.inputStates[key]) {
        event(controller.id, `door_${input}`, `Дверной вход: ${input}`, point.id);
        if (input === "open") {
          state.doorOpenedAt[key] = state.timeMs;
          state.heldReported[key] = false;
        } else {
          delete state.doorOpenedAt[key];
          delete state.heldReported[key];
        }
      }
      state.inputStates[key] = input;
      const openedAt = state.doorOpenedAt[key];
      if (openedAt !== undefined && state.timeMs - openedAt > 10000 && !state.heldReported[key]) {
        state.heldReported[key] = true;
        event(controller.id, "door_held", "Дверь удерживается открытой более 10 с", point.id);
      }
    }
  }
  Object.assign(state.powered, circuit.powered);
  return state;
}
