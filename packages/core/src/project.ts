import { z } from "zod";
import type { DeviceSpec } from "./device";

const id = z.string().min(1).max(120);
const finite = z.number().finite();
export const PositionSchema = z.object({ x: finite, y: finite });
export type Position = z.infer<typeof PositionSchema>;
const ipv4 = z.string().refine((value) => {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}, "Некорректный IPv4-адрес");

export const AccessPointSchema = z.object({
  id,
  name: z.string().min(1),
  moduleId: id,
  readerId: id,
  lockId: id,
  buttonId: id,
  contactId: id,
  relay: z.union([z.literal(1), z.literal(2)]).default(1),
  unlockMs: z.number().int().min(100).max(120000).default(3000),
});
export type AccessPoint = z.infer<typeof AccessPointSchema>;
export const ControllerConfigSchema = z.object({
  ip: ipv4.default("192.168.0.100"),
  mask: ipv4.default("255.255.255.0"),
  gateway: ipv4.default("192.168.0.1"),
  time: z.string().default("2026-01-01T12:00"),
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
  route: z.array(PositionSchema).default([]),
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
    version: z.literal(1),
    id,
    name: z.string().min(1).max(200),
    plan: z.object({
      metersPerUnit: finite.positive().max(100).default(0.01),
      floors: z.array(z.object({ id, name: z.string().min(1) })).min(1),
      background: BackgroundSchema.optional(),
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
          }),
        )
        .default([]),
      rooms: z.array(z.object({ id, floorId: id, position: PositionSchema, name: z.string().min(1) })).default([]),
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
      unique(config.points, "точки доступа");
      unique(config.cards, "карты");
      if (new Set(config.modules).size !== config.modules.length) errors.push("Повторный модуль контроллера");
      for (const moduleId of config.modules) checkKind(moduleId, "access_module");
      for (const point of config.points) {
        checkKind(point.moduleId, "access_module");
        checkKind(point.readerId, "reader");
        checkKind(point.lockId, "lock");
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
  for (const cable of project.cables) {
    unique(cable.cores, "жилы");
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
        (point) => ![point.moduleId, point.readerId, point.lockId, point.buttonId, point.contactId].includes(id),
      );
      const pointIds = new Set(device.controller.points.map((point) => point.id));
      for (const card of device.controller.cards)
        card.pointIds = card.pointIds.filter((pointId) => pointIds.has(pointId));
    }
  return next;
}

/** Проект состоит исключительно из JSON-данных; работает без API браузера. */
export function cloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project;
}
