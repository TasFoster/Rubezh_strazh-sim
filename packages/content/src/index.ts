import { type DeviceSpec, DeviceSpecSchema } from "@strazh-sim/core";
import str1ap from "../devices/str-1ap.json";
import controller from "../devices/str20-ip.json";
import training from "../devices/training.json";

/** Паспортные данные общие для всех экземпляров и неизменяемы также во время выполнения. */
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Каталог устройств. Описания проверяются схемой при загрузке: битые данные не доходят до симуляции. */
export const devices: readonly DeviceSpec[] = freeze(
  [controller, str1ap, ...training].map((raw) => DeviceSpecSchema.parse(raw)),
);

export function getDevice(id: string): DeviceSpec {
  const device = devices.find((candidate) => candidate.id === id);
  if (!device) {
    throw new Error(`Устройство «${id}» отсутствует в каталоге`);
  }
  return device;
}
