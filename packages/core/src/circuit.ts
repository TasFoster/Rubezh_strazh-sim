import type { DeviceSpec } from "./device";
import type { Endpoint, Project } from "./project";

export type CircuitControls = {
  trippedOutputs?: readonly string[];
  relays?: Readonly<Record<string, boolean>>;
  contacts?: Readonly<Record<string, boolean>>;
};
export type Diagnostic = { code: string; deviceId?: string; message: string };
export const terminalKey = (end: Endpoint): string => `${end.deviceId}/${end.terminalId}`;
const key = (deviceId: string, terminalId: string) => terminalKey({ deviceId, terminalId });
class Nets {
  private parents = new Map<string, string>();
  find(value: string): string {
    const parent = this.parents.get(value);
    if (!parent) {
      this.parents.set(value, value);
      return value;
    }
    if (parent === value) return value;
    const root = this.find(parent);
    this.parents.set(value, root);
    return root;
  }
  join(a: string, b: string) {
    const left = this.find(a),
      right = this.find(b);
    if (left !== right) this.parents.set(left, right);
  }
}
type Resistor = { a: string; b: string; ohms: number };
type Source = { a: string; b: string; volts: number; id: string; maxCurrentA: number };

/** Gaussian elimination with pivoting; undefined means an unsupported/singular circuit. */
function solve(matrix: number[][], rhs: number[]): number[] | undefined {
  const size = rhs.length;
  for (let col = 0; col < size; col++) {
    let pivot = col;
    for (let row = col + 1; row < size; row++)
      if (Math.abs(matrix[row]?.[col] ?? 0) > Math.abs(matrix[pivot]?.[col] ?? 0)) pivot = row;
    const pivotRow = matrix[pivot];
    if (!pivotRow || Math.abs(pivotRow[col] ?? 0) < 1e-10) return undefined;
    const currentRow = matrix[col];
    if (!currentRow) return undefined;
    matrix[col] = pivotRow;
    matrix[pivot] = currentRow;
    const rhsValue = rhs[col] ?? 0;
    rhs[col] = rhs[pivot] ?? 0;
    rhs[pivot] = rhsValue;
    const divisor = pivotRow[col] ?? 1;
    for (let row = col + 1; row < size; row++) {
      const target = matrix[row];
      if (!target) continue;
      const factor = (target[col] ?? 0) / divisor;
      if (factor === 0) continue;
      for (let column = col; column < size; column++)
        target[column] = (target[column] ?? 0) - factor * (pivotRow[column] ?? 0);
      rhs[row] = (rhs[row] ?? 0) - factor * (rhs[col] ?? 0);
    }
  }
  const values = Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row--) {
    const line = matrix[row];
    if (!line) return undefined;
    let value = rhs[row] ?? 0;
    for (let column = row + 1; column < size; column++) value -= (line[column] ?? 0) * (values[column] ?? 0);
    values[row] = value / (line[row] ?? 1);
    if (!Number.isFinite(values[row])) return undefined;
  }
  return values;
}
function stampResistors(matrix: number[][], resistors: Resistor[], index: Map<string, number>) {
  const add = (row: number | undefined, col: number | undefined, value: number) => {
    if (row === undefined || col === undefined) return;
    const line = matrix[row];
    if (line) line[col] = (line[col] ?? 0) + value;
  };
  for (const resistor of resistors) {
    const a = index.get(resistor.a),
      b = index.get(resistor.b),
      g = 1 / resistor.ohms;
    add(a, a, g);
    add(b, b, g);
    add(a, b, -g);
    add(b, a, -g);
  }
}
function build(project: Project, catalog: readonly DeviceSpec[], controls: CircuitControls) {
  const models = new Map(catalog.map((model) => [model.id, model]));
  const ideal = new Nets(),
    wired = new Nets();
  const resistors: Resistor[] = [],
    sources: Source[] = [];
  for (const device of project.devices) {
    const model = models.get(device.modelId);
    if (!model) continue;
    for (const terminal of model.terminals) {
      ideal.find(key(device.id, terminal.id));
      wired.find(key(device.id, terminal.id));
    }
    const e = model.electrical;
    if (!e) continue;
    for (const [a, b] of e.links) {
      const output = e.readers.some((reader) => reader.positive === b || reader.positive === a);
      if (!output || !controls.trippedOutputs?.includes(device.id)) {
        resistors.push({ a: key(device.id, a), b: key(device.id, b), ohms: 0.001 });
        wired.join(key(device.id, a), key(device.id, b));
      }
    }
    if (e.power) {
      const a = key(device.id, e.power.positive),
        b = key(device.id, e.power.negative);
      if (model.kind === "power_supply") {
        if (device.settings.enabled)
          sources.push({
            a,
            b,
            volts: device.settings.voltage,
            id: device.id,
            maxCurrentA: device.settings.maxCurrentA,
          });
      } else if (device.settings.enabled) {
        const current = model.kind === "lock" ? device.settings.currentA : e.power.currentA;
        if (current > 0) resistors.push({ a, b, ohms: 12 / current });
      }
    }
    if (e.contact) {
      const closed = controls.contacts?.[device.id] ?? e.contact.normallyClosed;
      if (model.kind === "resistor" || closed)
        resistors.push({
          a: key(device.id, e.contact.a),
          b: key(device.id, e.contact.b),
          ohms: model.kind === "resistor" ? device.settings.resistanceOhm : 0.001,
        });
    }
    for (const relay of e.relays) {
      const on = Boolean(controls.relays?.[key(device.id, relay.id)]) && device.settings.enabled;
      const a = key(device.id, relay.com),
        b = key(device.id, on ? relay.no : relay.nc);
      ideal.join(a, b);
      wired.join(a, b);
    }
  }
  for (const cable of project.cables)
    for (const core of cable.cores)
      if (!core.broken) {
        const a = terminalKey(core.from),
          b = terminalKey(core.to);
        wired.join(a, b);
        resistors.push({ a, b, ohms: Math.max(0.0001, (0.0175 * cable.lengthM) / cable.sectionMm2) });
      }
  const mapped = resistors.map((r) => ({ ...r, a: ideal.find(r.a), b: ideal.find(r.b) })).filter((r) => r.a !== r.b);
  const voltageSources = sources.map((source) => ({ ...source, a: ideal.find(source.a), b: ideal.find(source.b) }));
  return { ideal, wired, resistors: mapped, sources: voltageSources, models };
}
export type CircuitResult = {
  actuatorsOpen: Readonly<Record<string, boolean>>;
  powered: Readonly<Record<string, boolean>>;
  voltages: Readonly<Record<string, number | undefined>>;
  sourceCurrents: Readonly<Record<string, number>>;
  diagnostics: Diagnostic[];
  voltage: (a: Endpoint, b: Endpoint) => number | undefined;
  wiredTogether: (a: Endpoint, b: Endpoint) => boolean;
  resistance: (a: Endpoint, b: Endpoint) => number;
};

/** Limited DC model: ideal supplies, resistive loads, copper conductors and dry contacts. */
export function solveCircuit(
  project: Project,
  catalog: readonly DeviceSpec[],
  controls: CircuitControls = {},
): CircuitResult {
  const network = build(project, catalog, controls);
  const components = new Nets();
  for (const edge of [...network.resistors, ...network.sources]) components.join(edge.a, edge.b);
  const diagnostics: Diagnostic[] = [];
  const disabled = new Set<string>();
  const calculate = () => {
    const values = new Map<string, number>(),
      sourceCurrents: Record<string, number> = Object.create(null);
    const groups = new Map<string, Set<string>>();
    for (const edge of [...network.resistors, ...network.sources]) {
      const root = components.find(edge.a);
      const nodes = groups.get(root) ?? new Set<string>();
      nodes.add(edge.a);
      nodes.add(edge.b);
      groups.set(root, nodes);
    }
    for (const [root, nodes] of groups) {
      const sources = network.sources.filter((source) => components.find(source.a) === root);
      if (!sources.length) continue;
      const resistors = network.resistors.filter((resistor) => components.find(resistor.a) === root);
      const ground = sources[0]?.b;
      if (!ground) continue;
      const index = new Map([...nodes].filter((node) => node !== ground).map((node, i) => [node, i]));
      const n = index.size,
        dimension = n + sources.length;
      if (dimension > 256) {
        diagnostics.push({ code: "unsupported", message: "Цепь превышает предел 256 узлов расчёта" });
        continue;
      }
      const matrix = Array.from({ length: dimension }, () => Array<number>(dimension).fill(0));
      const rhs = Array<number>(dimension).fill(0);
      stampResistors(matrix, resistors, index);
      sources.forEach((source, i) => {
        const sourceRow = n + i;
        for (const [node, sign] of [
          [source.a, 1],
          [source.b, -1],
        ] as const) {
          const nodeIndex = index.get(node);
          if (nodeIndex === undefined) continue;
          const row = matrix[nodeIndex],
            constraint = matrix[sourceRow];
          if (row && constraint) {
            row[sourceRow] = (row[sourceRow] ?? 0) + sign;
            constraint[nodeIndex] = (constraint[nodeIndex] ?? 0) + sign;
          }
        }
        rhs[sourceRow] = disabled.has(source.id) ? 0 : source.volts;
      });
      const result = solve(matrix, rhs);
      if (!result) {
        diagnostics.push({ code: "unsupported", message: "Противоречивое соединение источников или вырожденная цепь" });
        continue;
      }
      values.set(ground, 0);
      for (const [node, i] of index) values.set(node, result[i] ?? 0);
      sources.forEach((source, i) => {
        sourceCurrents[source.id] = Math.abs(result[n + i] ?? 0);
      });
    }
    return { values, sourceCurrents };
  };
  let calculated = calculate();
  for (const source of network.sources) {
    const current = calculated.sourceCurrents[source.id] ?? 0;
    if (current > source.maxCurrentA) {
      disabled.add(source.id);
      diagnostics.push({
        code: current > source.maxCurrentA * 3 ? "short_circuit" : "overload",
        deviceId: source.id,
        message: `${current > source.maxCurrentA * 3 ? "Короткое замыкание" : "Перегрузка"}: ${current.toFixed(2)} А; источник отключён`,
      });
    }
  }
  if (disabled.size) calculated = calculate();
  const voltage = (a: Endpoint, b: Endpoint): number | undefined => {
    const left = network.ideal.find(terminalKey(a)),
      right = network.ideal.find(terminalKey(b));
    if (components.find(left) !== components.find(right)) return undefined;
    const va = calculated.values.get(left),
      vb = calculated.values.get(right);
    return va === undefined || vb === undefined ? undefined : va - vb;
  };
  const powered: Record<string, boolean> = Object.create(null),
    voltages: Record<string, number | undefined> = Object.create(null);
  for (const device of project.devices) {
    const model = network.models.get(device.modelId),
      power = model?.electrical?.power;
    if (!model || !power) {
      powered[device.id] = false;
      continue;
    }
    const volts = voltage(
      { deviceId: device.id, terminalId: power.positive },
      { deviceId: device.id, terminalId: power.negative },
    );
    voltages[device.id] = volts;
    powered[device.id] =
      device.settings.enabled &&
      (model.kind === "power_supply"
        ? !disabled.has(device.id) && volts !== undefined && Math.abs(volts - device.settings.voltage) < 0.01
        : volts !== undefined && volts >= model.supply.minVoltage && volts <= model.supply.maxVoltage);
    if (model.kind !== "power_supply" && device.settings.enabled) {
      if (volts !== undefined && volts < -0.5)
        diagnostics.push({ code: "polarity", deviceId: device.id, message: `${device.name}: переполюсовка` });
      else if (!powered[device.id])
        diagnostics.push({
          code: "power",
          deviceId: device.id,
          message: `${device.name}: питание отсутствует или вне диапазона`,
        });
    }
  }
  for (const device of project.devices) {
    const e = network.models.get(device.modelId)?.electrical;
    if (!e?.power || !e.readerCurrentLimitA || controls.trippedOutputs?.includes(device.id)) continue;
    let outputCurrent = 0;
    for (const reader of e.readers) {
      const drop = voltage(
        { deviceId: device.id, terminalId: e.power.positive },
        { deviceId: device.id, terminalId: reader.positive },
      );
      outputCurrent += Math.abs(drop ?? 0) / 0.001;
    }
    if (outputCurrent > e.readerCurrentLimitA) {
      const retry = solveCircuit(project, catalog, {
        ...controls,
        trippedOutputs: [...(controls.trippedOutputs ?? []), device.id],
      });
      return {
        ...retry,
        diagnostics: [
          {
            code: "reader_overload",
            deviceId: device.id,
            message: `${device.name}: перегрузка выхода считывателей, ${outputCurrent.toFixed(2)} А`,
          },
          ...retry.diagnostics,
        ],
      };
    }
  }
  const invalidRelays = project.devices.filter(
    (device) =>
      !powered[device.id] &&
      network.models
        .get(device.modelId)
        ?.electrical?.relays.some((relay) => controls.relays?.[key(device.id, relay.id)]),
  );
  if (invalidRelays.length) {
    const relays = { ...controls.relays };
    for (const device of invalidRelays)
      for (const relay of network.models.get(device.modelId)?.electrical?.relays ?? [])
        relays[key(device.id, relay.id)] = false;
    return solveCircuit(project, catalog, { ...controls, relays });
  }
  const resistance = (a: Endpoint, b: Endpoint): number => {
    const left = network.ideal.find(terminalKey(a)),
      right = network.ideal.find(terminalKey(b));
    if (left === right) return 0;
    const passive = new Nets();
    for (const edge of network.resistors) passive.join(edge.a, edge.b);
    if (passive.find(left) !== passive.find(right)) return Number.POSITIVE_INFINITY;
    const resistors = network.resistors.filter((edge) => passive.find(edge.a) === passive.find(left));
    const nodes = new Set(resistors.flatMap((edge) => [edge.a, edge.b]));
    if (nodes.size > 256) return Number.NaN;
    const index = new Map([...nodes].filter((node) => node !== right).map((node, i) => [node, i]));
    const matrix = Array.from({ length: index.size }, () => Array<number>(index.size).fill(0)),
      rhs = Array<number>(index.size).fill(0);
    stampResistors(matrix, resistors, index);
    const probe = index.get(left);
    if (probe === undefined) return 0;
    rhs[probe] = 1;
    return solve(matrix, rhs)?.[probe] ?? Number.NaN;
  };
  const actuatorsOpen: Record<string, boolean> = Object.create(null);
  for (const device of project.devices) {
    const model = network.models.get(device.modelId);
    if (model?.kind === "lock")
      actuatorsOpen[device.id] =
        device.settings.lockMode === "fail_safe" ? !powered[device.id] : Boolean(powered[device.id]);
    if (model?.kind === "turnstile")
      actuatorsOpen[device.id] = Boolean(
        powered[device.id] &&
          model.electrical?.inputs.some(
            (input) =>
              resistance(
                { deviceId: device.id, terminalId: input.signal },
                { deviceId: device.id, terminalId: input.ground },
              ) < 10,
          ),
      );
  }
  return {
    actuatorsOpen,
    powered,
    voltages,
    sourceCurrents: calculated.sourceCurrents,
    diagnostics,
    voltage,
    resistance,
    wiredTogether: (a, b) => network.wired.find(terminalKey(a)) === network.wired.find(terminalKey(b)),
  };
}
