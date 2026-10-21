import { z } from "zod";

const DeviceKindSchema = z.enum([
  "controller",
  "access_module",
  "reader",
  "lock",
  "exit_button",
  "door_contact",
  "power_supply",
  "resistor",
  "turnstile",
]);
export type DeviceKind = z.infer<typeof DeviceKindSchema>;

const TerminalKindSchema = z.enum([
  "power_in",
  "power_out",
  "ground",
  "rs485_pos",
  "rs485_neg",
  "wiegand_d0",
  "wiegand_d1",
  "indicator_out",
  "supervised_input",
  "relay_nc",
  "relay_com",
  "relay_no",
  "bridge",
  "passive",
]);
export type TerminalKind = z.infer<typeof TerminalKindSchema>;

export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

const idSchema = z.string().regex(/^[a-z0-9_]+$/, "идентификатор: строчные латинские буквы, цифры и _");

const TerminalSchema = z.object({
  id: idSchema,
  /** Маркировка клеммы так, как она нанесена на плату или указана в паспорте. */
  label: z.string().min(1),
  block: idSchema,
  kind: TerminalKindSchema,
  note: z.string().min(1).optional(),
});
export type Terminal = z.infer<typeof TerminalSchema>;

export const DeviceSpecSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    kind: DeviceKindSchema,
    /** Документ, по которому составлено описание: без него данные каталога не проверить. */
    source: z.object({
      document: z.string().min(1),
      edition: z.string().min(1),
    }),
    supply: z.object({
      minVoltage: z.number().positive(),
      maxVoltage: z.number().positive(),
      maxCurrentA: z.number().positive(),
    }),
    blocks: z.array(z.object({ id: idSchema, label: z.string().min(1) })).min(1),
    terminals: z.array(TerminalSchema).min(1),
    electrical: z
      .object({
        readerCurrentLimitA: z.number().positive().optional(),
        power: z.object({ positive: idSchema, negative: idSchema, currentA: z.number().nonnegative() }).optional(),
        links: z.array(z.tuple([idSchema, idSchema])).default([]),
        buses: z
          .array(z.object({ id: idSchema, positive: idSchema, negative: idSchema, ground: idSchema }))
          .default([]),
        relays: z.array(z.object({ id: idSchema, com: idSchema, nc: idSchema, no: idSchema })).default([]),
        readers: z
          .array(z.object({ id: idSchema, d0: idSchema, d1: idSchema, positive: idSchema, ground: idSchema }))
          .default([]),
        inputs: z.array(z.object({ id: idSchema, signal: idSchema, ground: idSchema })).default([]),
        contact: z.object({ a: idSchema, b: idSchema, normallyClosed: z.boolean() }).optional(),
      })
      .optional(),
    dipAddress: z
      .object({
        min: z.number().int().nonnegative(),
        max: z.number().int().positive(),
      })
      .optional(),
    jumpers: z
      .array(
        z.object({
          id: idSchema,
          label: z.string().min(1),
          purpose: z.string().min(1),
        }),
      )
      .default([]),
    leds: z.array(z.object({ id: idSchema, label: z.string().min(1) })).default([]),
  })
  .superRefine((device, ctx) => {
    if (device.supply.minVoltage > device.supply.maxVoltage) {
      ctx.addIssue({ code: "custom", path: ["supply"], message: "minVoltage больше maxVoltage" });
    }
    if (device.dipAddress && device.dipAddress.min > device.dipAddress.max) {
      ctx.addIssue({ code: "custom", path: ["dipAddress"], message: "min больше max" });
    }
    for (const key of ["blocks", "jumpers", "leds"] as const) {
      const ids = new Set<string>();
      device[key].forEach((entry, index) => {
        if (ids.has(entry.id)) {
          ctx.addIssue({ code: "custom", path: [key, index, "id"], message: `Повторный ID «${entry.id}»` });
        }
        ids.add(entry.id);
      });
    }
    if (device.electrical) {
      const terminalIds = new Set(device.terminals.map((terminal) => terminal.id));
      const e = device.electrical;
      const refs = [
        ...(e.power ? [e.power.positive, e.power.negative] : []),
        ...e.links.flat(),
        ...e.buses.flatMap((bus) => [bus.positive, bus.negative, bus.ground]),
        ...e.relays.flatMap((relay) => [relay.com, relay.nc, relay.no]),
        ...e.readers.flatMap((reader) => [reader.d0, reader.d1, reader.positive, reader.ground]),
        ...e.inputs.flatMap((input) => [input.signal, input.ground]),
        ...(e.contact ? [e.contact.a, e.contact.b] : []),
      ];
      for (const ref of refs)
        if (!terminalIds.has(ref))
          ctx.addIssue({ code: "custom", path: ["electrical"], message: `Неизвестная электрическая клемма: ${ref}` });
    }
    const blockIds = new Set(device.blocks.map((block) => block.id));
    const seen = new Set<string>();
    device.terminals.forEach((terminal, index) => {
      if (seen.has(terminal.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["terminals", index, "id"],
          message: `клемма «${terminal.id}» описана дважды`,
        });
      }
      seen.add(terminal.id);
      if (!blockIds.has(terminal.block)) {
        ctx.addIssue({
          code: "custom",
          path: ["terminals", index, "block"],
          message: `колодка «${terminal.block}» не объявлена в blocks`,
        });
      }
    });
  });
export type DeviceSpec = DeepReadonly<z.infer<typeof DeviceSpecSchema>>;
