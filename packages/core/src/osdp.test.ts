import { describe, expect, it } from "vitest";
import { osdpLinkQuality } from "./osdp";

describe("osdpLinkQuality", () => {
  it("менее 5 % неудачных ответов — зелёный", () => {
    expect(osdpLinkQuality(0)).toBe("green");
    expect(osdpLinkQuality(0.049)).toBe("green");
  });

  it("от 5 до 40 % — жёлтый", () => {
    expect(osdpLinkQuality(0.05)).toBe("yellow");
    expect(osdpLinkQuality(0.4)).toBe("yellow");
  });

  it("более 40 % — красный", () => {
    expect(osdpLinkQuality(0.41)).toBe("red");
    expect(osdpLinkQuality(1)).toBe("red");
  });

  it("отклоняет значения вне диапазона 0–1", () => {
    expect(() => osdpLinkQuality(-0.1)).toThrow(RangeError);
    expect(() => osdpLinkQuality(1.1)).toThrow(RangeError);
    expect(() => osdpLinkQuality(Number.NaN)).toThrow(RangeError);
  });
});
