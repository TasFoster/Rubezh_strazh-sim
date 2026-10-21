import { describe, expect, it } from "vitest";
import { DeviceSpecSchema } from "./device";

const valid = {
  id: "demo",
  name: "Демо",
  kind: "access_module",
  source: { document: "Паспорт", edition: "1" },
  supply: { minVoltage: 9, maxVoltage: 28, maxCurrentA: 0.15 },
  blocks: [{ id: "power", label: "Питание" }],
  terminals: [
    { id: "power_u", label: "+U", block: "power", kind: "power_in" },
    { id: "power_gnd", label: "GND", block: "power", kind: "ground" },
  ],
};

describe("DeviceSpecSchema", () => {
  it("принимает корректное описание и подставляет пустые jumpers и leds", () => {
    const device = DeviceSpecSchema.parse(valid);
    expect(device.jumpers).toEqual([]);
    expect(device.leds).toEqual([]);
  });

  it("отклоняет повторяющийся идентификатор клеммы", () => {
    const result = DeviceSpecSchema.safeParse({
      ...valid,
      terminals: [...valid.terminals, { id: "power_u", label: "+U", block: "power", kind: "power_in" }],
    });
    expect(result.success).toBe(false);
  });

  it("отклоняет клемму на необъявленной колодке", () => {
    const result = DeviceSpecSchema.safeParse({
      ...valid,
      terminals: [{ id: "x", label: "X", block: "missing", kind: "bridge" }],
    });
    expect(result.success).toBe(false);
  });

  it("отклоняет перевёрнутый диапазон напряжения питания", () => {
    const result = DeviceSpecSchema.safeParse({
      ...valid,
      supply: { minVoltage: 28, maxVoltage: 9, maxCurrentA: 0.15 },
    });
    expect(result.success).toBe(false);
  });
});
