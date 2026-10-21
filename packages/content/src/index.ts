import { type DeviceSpec, DeviceSpecSchema } from "@strazh-sim/core";
import str1ap from "../devices/str-1ap.json";

/** Каталог устройств. Описания проверяются схемой при загрузке: битые данные не доходят до симуляции. */
export const devices: readonly DeviceSpec[] = [str1ap].map((raw) => DeviceSpecSchema.parse(raw));

export function getDevice(id: string): DeviceSpec {
  const device = devices.find((candidate) => candidate.id === id);
  if (!device) {
    throw new Error(`Устройство «${id}» отсутствует в каталоге`);
  }
  return device;
}
