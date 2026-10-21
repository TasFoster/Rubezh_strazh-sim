import { z } from "zod";
import type { DeviceSpec } from "./device";

const id = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .refine((value) => !Object.hasOwn(Object.prototype, value), "Зарезервированный ID");
const finite = z.number().finite();
export const PositionSchema = z.object({ x: finite, y: finite });
export type Position = z.infer<typeof PositionSchema>;
const ipv4 = z.string().refine((value) => {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}, "Некорректный IPv4-адрес");
const subnetMask = ipv4.refine((value) => {
  const bits = value
    .split(".")
    .map((part) => Number(part).toString(2).padStart(8, "0"))
    .join("");
  return /^1*0*$/.test(bits);
}, "Маска подсети должна содержать непрерывную последовательность единиц");

export const AccessPointSchema = z.object({
  id,
  name: z.string().min(1),
  moduleId: id,
  readerId: id,
  exitReaderId: id.optional(),
  lockId: id,
  buttonId: id,
  contactId: id,
  relay: z.union([z.literal(1), z.literal(2)]).default(1),
  unlockMs: z.number().int().min(100).max(120000).default(3000),
});
export type AccessPoint = z.infer<typeof AccessPointSchema>;
export const ControllerConfigSchema = z.object({
  networkMode: z.enum(["dynamic", "static"]).default("dynamic"),
  lines: z
    .array(
      z.object({
        id,
        baudRate: z.number().int().positive(),
        pollMs: z.number().int().min(1).max(10000),
        timeoutMs: z.number().int().min(1).max(10000),
      }),
    )
    .default([
      { id: "rs485_1", baudRate: 115200, pollMs: 100, timeoutMs: 100 },
      { id: "rs485_2", baudRate: 115200, pollMs: 100, timeoutMs: 100 },
    ]),
  ip: ipv4.default("192.168.0.100"),
  mask: subnetMask.default("255.255.255.0"),
  gateway: ipv4.default("192.168.0.1"),
  time: z
    .string()
    .refine((value) => Number.isFinite(Date.parse(value)), "Некорректная дата")
    .default("2026-01-01T12:00"),
  modules: z.array(id).default([]),
  points: z.array(AccessPointSchema).default([]),
  cards: z
    .array(
      z.object({
        id,
        owner: z.string().min(1),
        enabled: z.boolean().default(true),
        pointIds: z.array(id),
      }),
    )
    .default([]),
});
export type ControllerConfig = z.infer<typeof ControllerConfigSchema>;
export const InstanceSchema = z.object({
  id,
  modelId: id,
  name: z.string().min(1),
  position: PositionSchema,
  rotation: finite.default(0),
  floorId: id.default("floor_1"),
  settings: z
    .object({
      resistanceOhm: finite.positive().max(10000000).default(4700),
      supervision: z.record(z.string(), z.boolean()).default({}),
      baudRate: z.number().int().positive().default(115200),
      address: z.number().int().min(0).max(127).default(1),
      voltage: z.number().positive().max(60).default(12),
      maxCurrentA: z.number().positive().max(30).default(3),
      currentA: z.number().positive().max(30).default(0.1),
      enabled: z.boolean().default(true),
      lockMode: z.enum(["fail_safe", "fail_secure"]).default("fail_safe"),
      jumpers: z.record(z.string(), z.boolean()).default({}),
    })
    .prefault({}),
  controller: ControllerConfigSchema.optional(),
});
export type DeviceInstance = z.infer<typeof InstanceSchema>;
const EndpointSchema = z.object({ deviceId: id, terminalId: id });
export type Endpoint = z.infer<typeof EndpointSchema>;
export const CableSchema = z.object({
  id,
  name: z.string().min(1),
  floorId: id.default("floor_1"),
  route: z.array(PositionSchema.extend({ id })).default([]),
  routing: z.enum(["auto", "manual"]).optional(),
  lengthM: finite.min(0).max(10000).default(1),
  sectionMm2: finite.positive().max(100).default(0.5),
  cores: z
    .array(
      z.object({
        id,
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        from: EndpointSchema,
        to: EndpointSchema,
        broken: z.boolean().default(false),
      }),
    )
    .min(1),
});
export type Cable = z.infer<typeof CableSchema>;
const BackgroundSchema = z.object({
  floorId: id.default("floor_1"),
  dataUrl: z
    .string()
    .max(12000000)
    .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/),
  x: finite.default(0),
  y: finite.default(0),
  width: finite.positive(),
  height: finite.positive(),
  rotation: finite.default(0),
  opacity: finite.min(0).max(1).default(0.5),
  locked: z.boolean().default(true),
});
export const ProjectSchema = z
  .object({
    scenarioId: id.optional(),
    version: z.literal(1),
    id,
    name: z.string().min(1).max(200),
    plan: z.object({
      metersPerUnit: finite.positive().max(100).default(0.01),
      floors: z.array(z.object({ id, name: z.string().min(1) })).min(1),
      background: BackgroundSchema.optional(),
      backgrounds: z.record(z.string(), BackgroundSchema).default({}),
      walls: z.array(z.object({ id, floorId: id, from: PositionSchema, to: PositionSchema })).default([]),
      doors: z
        .array(
          z.object({
            id,
            floorId: id,
            position: PositionSchema,
            width: finite.positive().default(90),
            rotation: finite.default(0),
            pointId: id.optional(),
            controllerId: id.optional(),
            wallId: id.optional(),
          }),
        )
        .default([]),
      rooms: z
        .array(
          z.object({
            id,
            floorId: id,
            position: PositionSchema,
            name: z.string().min(1),
            width: finite.positive().default(300),
            height: finite.positive().default(200),
          }),
        )
        .default([]),
    }),
    devices: z.array(InstanceSchema),
    cables: z.array(CableSchema),
  })
  .strict();
export type Project = z.infer<typeof ProjectSchema>;

export function createProject(): Project {
  return ProjectSchema.parse({
    version: 1,
    id: "project_1",
    name: "Новый объект",
    plan: { floors: [{ id: "floor_1", name: "Этаж 1" }] },
    devices: [],
    cables: [],
  });
}

/** Проверяет и структуру, и ссылки. Некорректный импорт не заменяет текущий проект. */
export function parseProject(raw: unknown, catalog: readonly DeviceSpec[]): Project {
  const project = ProjectSchema.parse(raw);
  const errors: string[] = [];
  const unique = (items: readonly { id: string }[], name: string) => {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.id)) errors.push(`Повторный ID ${name}: ${item.id}`);
      seen.add(item.id);
    }
  };
  unique(project.devices, "устройства");
  unique(project.cables, "кабеля");
  unique(project.plan.floors, "этажа");
  unique(project.plan.walls, "стены");
  unique(project.plan.doors, "двери");
  unique(project.plan.rooms, "помещения");
  const floors = new Set(project.plan.floors.map((floor) => floor.id));
  const instances = new Map(project.devices.map((device) => [device.id, device]));
  const models = new Map(catalog.map((model) => [model.id, model]));
  const checkKind = (deviceId: string, kind: DeviceSpec["kind"]) => {
    const instance = instances.get(deviceId);
    if (!instance || models.get(instance.modelId)?.kind !== kind) errors.push(`Неверная ссылка ${kind}: ${deviceId}`);
  };
  for (const item of [
    ...project.devices,
    ...project.cables,
    ...project.plan.walls,
    ...project.plan.doors,
    ...project.plan.rooms,
  ]) {
    if (!floors.has(item.floorId)) errors.push(`Неизвестный этаж: ${item.floorId}`);
  }
  for (const device of project.devices) {
    const model = models.get(device.modelId);
    if (!model) errors.push(`Неизвестная модель: ${device.modelId}`);
    if (device.controller && model?.kind !== "controller") errors.push(`Настройки контроллера у ${device.id}`);
    if (device.controller) {
      const config = device.controller;
      const usedRelays = new Set<string>();
      unique(config.lines, "линии");
      unique(config.points, "точки доступа");
      unique(config.cards, "карты");
      if (new Set(config.modules).size !== config.modules.length) errors.push("Повторный модуль контроллера");
      for (const moduleId of config.modules) {
        const instance = instances.get(moduleId),
          spec = models.get(instance?.modelId ?? "");
        if (!instance || !spec?.electrical?.buses.length || !["access_module", "reader"].includes(spec.kind))
          errors.push(`Неверное OSDP-устройство: ${moduleId}`);
      }
      for (const point of config.points) {
        checkKind(point.moduleId, "access_module");
        const relayKey = `${point.moduleId}/${point.relay}`;
        if (usedRelays.has(relayKey)) errors.push(`Реле назначено нескольким точкам: ${relayKey}`);
        usedRelays.add(relayKey);
        const module = instances.get(point.moduleId),
          spec = models.get(module?.modelId ?? "");
        if (!spec?.electrical?.relays.some((relay) => relay.id === `k${point.relay}`))
          errors.push(`Неизвестное реле: ${relayKey}`);
        checkKind(point.readerId, "reader");
        if (point.exitReaderId) checkKind(point.exitReaderId, "reader");
        const actuator = instances.get(point.lockId);
        if (!actuator || !["lock", "turnstile"].includes(models.get(actuator.modelId)?.kind ?? ""))
          errors.push(`Неверное исполнительное устройство: ${point.lockId}`);
        checkKind(point.buttonId, "exit_button");
        checkKind(point.contactId, "door_contact");
        if (!config.modules.includes(point.moduleId)) errors.push(`Модуль точки ${point.id} не добавлен в контроллер`);
      }
      for (const card of config.cards)
        for (const pointId of card.pointIds) {
          if (!config.points.some((point) => point.id === pointId)) errors.push(`Неизвестная точка карты: ${pointId}`);
        }
    }
  }
  for (const [floorId, background] of Object.entries(project.plan.backgrounds)) {
    if (!floors.has(floorId) || background.floorId !== floorId)
      errors.push(`Некорректный этаж фонового плана: ${floorId}`);
  }
  if (project.plan.background && !floors.has(project.plan.background.floorId))
    errors.push("Неизвестный этаж фонового плана");
  for (const door of project.plan.doors) {
    if (door.wallId && !project.plan.walls.some((wall) => wall.id === door.wallId && wall.floorId === door.floorId))
      errors.push(`Неизвестная стена двери: ${door.wallId}`);
    if (door.pointId || door.controllerId) {
      const controller = instances.get(door.controllerId ?? "");
      if (!controller?.controller?.points.some((point) => point.id === door.pointId))
        errors.push(`Неизвестная точка двери: ${door.pointId}`);
    }
  }
  for (const cable of project.cables) {
    unique(cable.cores, "жилы");
    unique(cable.route, "узла маршрута");
    for (const core of cable.cores) {
      for (const end of [core.from, core.to]) {
        const instance = instances.get(end.deviceId);
        if (!instance || !models.get(instance.modelId)?.terminals.some((terminal) => terminal.id === end.terminalId)) {
          errors.push(`Неизвестная клемма: ${end.deviceId}/${end.terminalId}`);
        }
      }
      if (core.from.deviceId === core.to.deviceId && core.from.terminalId === core.to.terminalId)
        errors.push("Жила замкнута на ту же клемму");
    }
  }
  if (errors.length) throw new Error(errors.join("; "));
  return project;
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

/** Удаление экземпляра одновременно убирает зависимые соединения и настройки. */
export function removeDevice(project: Project, id: string): Project {
  const next = cloneProject(project);
  next.devices = next.devices.filter((device) => device.id !== id);
  next.cables = next.cables.flatMap((cable) => {
    cable.cores = cable.cores.filter((core) => core.from.deviceId !== id && core.to.deviceId !== id);
    return cable.cores.length ? [cable] : [];
  });
  for (const device of next.devices)
    if (device.controller) {
      device.controller.modules = device.controller.modules.filter((moduleId) => moduleId !== id);
      device.controller.points = device.controller.points.filter(
        (point) =>
          ![point.moduleId, point.readerId, point.exitReaderId, point.lockId, point.buttonId, point.contactId].includes(
            id,
          ),
      );
      const pointIds = new Set(device.controller.points.map((point) => point.id));
      for (const card of device.controller.cards)
        card.pointIds = card.pointIds.filter((pointId) => pointIds.has(pointId));
    }
  for (const door of next.plan.doors) {
    const controller = next.devices.find((item) => item.id === door.controllerId);
    if (door.pointId && !controller?.controller?.points.some((point) => point.id === door.pointId)) {
      delete door.pointId;
      delete door.controllerId;
    }
  }
  return next;
}

/** Проект состоит исключительно из JSON-данных; работает без API браузера. */
export function cloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project;
}

/** После удаления точки её изображение на плане остаётся свободной дверью. */
export function prunePlanBindings(project: Project): void {
  for (const door of project.plan.doors) {
    if (
      (door.pointId || door.controllerId) &&
      !project.devices.some(
        (device) =>
          device.id === door.controllerId && device.controller?.points.some((point) => point.id === door.pointId),
      )
    ) {
      delete door.pointId;
      delete door.controllerId;
    }
  }
}
