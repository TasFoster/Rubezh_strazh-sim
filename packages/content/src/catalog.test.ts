import { describe, expect, it } from "vitest";
import { devices, getDevice } from "./index";

describe("каталог устройств", () => {
  it("не содержит повторяющихся идентификаторов", () => {
    const ids = devices.map((device) => device.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getDevice сообщает об отсутствующем устройстве", () => {
    expect(() => getDevice("nope")).toThrow(/отсутствует/);
  });
});

describe("STR-1AP", () => {
  const module = getDevice("str_1ap");
  const count = (block: string) => module.terminals.filter((terminal) => terminal.block === block).length;

  it("имеет два семиконтактных разъёма Wiegand", () => {
    expect(count("reader1")).toBe(7);
    expect(count("reader2")).toBe(7);
  });

  it("имеет шесть входов с контролем линии: DOOR1/2, EXIT1/2, SENS1/2", () => {
    const inputs = module.terminals.filter((terminal) => terminal.kind === "supervised_input");
    expect(inputs.map((terminal) => terminal.id).sort()).toEqual([
      "in_door1",
      "in_door2",
      "in_exit1",
      "in_exit2",
      "sens1_pos",
      "sens2_pos",
    ]);
  });

  it("имеет два реле с контактами NC, COM, NO и две линии RS-485", () => {
    for (const relay of ["relay_k1", "relay_k2"]) {
      const kinds = module.terminals.filter((terminal) => terminal.block === relay).map((terminal) => terminal.kind);
      expect(kinds).toEqual(expect.arrayContaining(["relay_nc", "relay_com", "relay_no"]));
    }
    expect(count("rs485_1")).toBe(3);
    expect(count("rs485_2")).toBe(3);
  });

  it("питается от 9–28 В и адресуется в диапазоне 1–31", () => {
    expect(module.supply).toMatchObject({ minVoltage: 9, maxVoltage: 28 });
    expect(module.dipAddress).toEqual({ min: 1, max: 31 });
  });
});
