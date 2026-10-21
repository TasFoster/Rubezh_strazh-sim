import { expect, it } from "vitest";
import { classifyInput } from "./inputs";

it("определяет состояния входа с контролем линии", () => {
  expect(classifyInput(4700, true)).toBe("open");
  expect(classifyInput(2350, true)).toBe("closed");
  expect(classifyInput(0, true)).toBe("short");
  expect(classifyInput(Number.POSITIVE_INFINITY, true)).toBe("broken");
  expect(classifyInput(3200, true)).toBe("invalid");
  expect(classifyInput(3200, true, "sens")).toBe("closed");
  expect(classifyInput(0.1, false)).toBe("closed");
});
