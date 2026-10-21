import { z } from "zod";

const DeviceKindSchema = z.enum([
  "controller",
  "access_module",
  "reader",
  "lock",
  "exit_button",
  "door_contact",
  "power_supply",
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
]);
export type TerminalKind = z.infer<typeof TerminalKindSchema>;

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
export type DeviceSpec = z.infer<typeof DeviceSpecSchema>;
