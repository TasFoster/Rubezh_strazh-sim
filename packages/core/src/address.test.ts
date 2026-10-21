import { describe, expect, it } from "vitest";
import { dipAddress, dipForAddress, isValidOsdpAddress } from "./address";

describe("dipAddress", () => {
  it("складывает веса включённых переключателей (пример из паспорта: 1+2+8=11)", () => {
    expect(dipAddress([true, true, false, true, false])).toBe(11);
  });

  it("даёт 31 при всех включённых и 0 при всех выключенных", () => {
    expect(dipAddress([true, true, true, true, true])).toBe(31);
    expect(dipAddress([false, false, false, false, false])).toBe(0);
  });

  it("отклоняет неверное число переключателей", () => {
    expect(() => dipAddress([true, false])).toThrow(RangeError);
  });
});

describe("isValidOsdpAddress", () => {
  it("допускает 1–31 и запрещает 0, 32 и дробные", () => {
    expect(isValidOsdpAddress(1)).toBe(true);
    expect(isValidOsdpAddress(31)).toBe(true);
    expect(isValidOsdpAddress(0)).toBe(false);
    expect(isValidOsdpAddress(32)).toBe(false);
    expect(isValidOsdpAddress(1.5)).toBe(false);
  });
});

describe("dipForAddress", () => {
  it("обратна dipAddress на всём диапазоне адресов", () => {
    for (let address = 1; address <= 31; address++) {
      expect(dipAddress(dipForAddress(address))).toBe(address);
    }
  });

  it("отклоняет адрес 0", () => {
    expect(() => dipForAddress(0)).toThrow(RangeError);
  });
});
