import { CableSchema, parseProject, solveCircuit } from "@strazh-sim/core";
import { describe, expect, it } from "vitest";
import { createDoorProject } from "./example";
import { devices } from "./index";

const endpoint = (deviceId: string, terminalId: string) => ({ deviceId, terminalId });
describe("электрическая модель двери", () => {
  it("питает комплект с учётом сопротивления кабеля", () => {
    const project = createDoorProject();
    parseProject(project, devices);
    const circuit = solveCircuit(project, devices);
    expect(circuit.diagnostics).toEqual([]);
    for (const id of ["controller", "module", "reader", "lock"]) expect(circuit.powered[id]).toBe(true);
    expect(circuit.voltages.lock).toBeLessThan(12);
    expect(circuit.voltages.lock).toBeGreaterThan(11.9);
    expect(circuit.sourceCurrents.psu).toBeGreaterThan(1.5);
  });
  it("обрыв и переключение NC-реле снимают питание замка", () => {
    const project = createDoorProject();
    const relay = solveCircuit(project, devices, { relays: { "module/k1": true } });
    expect(relay.powered.lock).toBe(false);
    const wire = project.cables.find((cable) => cable.cores.some((core) => core.to.deviceId === "lock"));
    const core = wire?.cores[0];
    if (!core) throw new Error("fixture");
    core.broken = true;
    expect(solveCircuit(project, devices).powered.lock).toBe(false);
  });
  it("выявляет переполюсовку", () => {
    const project = createDoorProject();
    for (const cable of project.cables)
      for (const core of cable.cores)
        for (const end of [core.from, core.to])
          if (end.deviceId === "lock") end.terminalId = end.terminalId === "pos" ? "neg" : "pos";
    const result = solveCircuit(project, devices);
    expect(result.powered.lock).toBe(false);
    expect(result.diagnostics.some((item) => item.code === "polarity")).toBe(true);
  });
  it("защита источника отключает КЗ и перегрузку", () => {
    const project = createDoorProject();
    const psu = project.devices.find((device) => device.id === "psu");
    if (!psu) throw new Error("fixture");
    psu.settings.maxCurrentA = 1;
    expect(solveCircuit(project, devices).diagnostics.some((item) => item.code === "overload")).toBe(true);
    psu.settings.maxCurrentA = 3;
    project.cables.push(
      CableSchema.parse({
        id: "short",
        name: "КЗ",
        cores: [{ id: "s", color: "#000000", from: endpoint("psu", "pos"), to: endpoint("psu", "neg") }],
      }),
    );
    const result = solveCircuit(project, devices);
    expect(result.powered.controller).toBe(false);
    expect(result.diagnostics.some((item) => item.code === "short_circuit")).toBe(true);
  });
  it("длинный тонкий кабель снижает напряжение", () => {
    const project = createDoorProject();
    for (const cable of project.cables)
      if (cable.cores.some((core) => core.from.deviceId === "lock" || core.to.deviceId === "lock")) {
        cable.lengthM = 100;
        cable.sectionMm2 = 0.1;
      }
    const result = solveCircuit(project, devices);
    expect(result.powered.lock).toBe(false);
    expect(result.voltages.lock).toBeLessThan(9);
  });
  it("прозванивает сухой контакт и различает независимые цепи", () => {
    const project = createDoorProject();
    const a = endpoint("button", "a"),
      b = endpoint("button", "b");
    expect(solveCircuit(project, devices).resistance(a, b)).toBe(Number.POSITIVE_INFINITY);
    expect(solveCircuit(project, devices, { contacts: { button: true } }).resistance(a, b)).toBeCloseTo(0.001, 3);
    expect(
      solveCircuit(project, devices).voltage(endpoint("controller", "rs1_pos"), endpoint("psu", "neg")),
    ).toBeUndefined();
  });
});
