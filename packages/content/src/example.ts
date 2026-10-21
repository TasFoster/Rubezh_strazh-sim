import { CableSchema, ControllerConfigSchema, createProject, InstanceSchema, type Project } from "@strazh-sim/core";

/** Рабочий учебный стенд. Периферия условная; настройки контроллера можно выполнить самостоятельно. */
export function createDoorProject(configured = false): Project {
  const project = createProject();
  project.id = "door_demo";
  project.name = "Стенд · одна дверь";
  const entries = [
    ["psu", "training_psu", "БП 12 В", 40, 70],
    ["controller", "str20_ip", "STR20-IP · пост охраны", 40, 240],
    ["module", "str_1ap", "STR-1AP · дверь 1", 410, 70],
    ["reader", "training_reader", "Считыватель · вход", 800, 70],
    ["lock", "training_lock", "Замок двери", 800, 260],
    ["button", "training_button", "Кнопка выхода", 800, 430],
    ["contact", "training_contact", "Геркон двери", 800, 580],
  ] as const;
  project.devices = entries.map(([id, modelId, name, x, y]) =>
    InstanceSchema.parse({
      id,
      modelId,
      name,
      position: { x, y },
      settings: { currentA: modelId === "training_lock" ? 0.5 : 0.1 },
      ...(id === "controller"
        ? {
            controller: ControllerConfigSchema.parse(
              configured
                ? {
                    modules: ["module"],
                    points: [
                      {
                        id: "door_1",
                        name: "Дверь 1",
                        moduleId: "module",
                        readerId: "reader",
                        lockId: "lock",
                        buttonId: "button",
                        contactId: "contact",
                      },
                    ],
                    cards: [{ id: "1001", owner: "Учебный сотрудник", pointIds: ["door_1"] }],
                  }
                : {},
            ),
          }
        : {}),
    }),
  );
  const wire = (a: string, ta: string, b: string, tb: string, color = "#347b84") => {
    project.cables.push(
      CableSchema.parse({
        id: `cable_${project.cables.length + 1}`,
        name: `${a} → ${b}`,
        lengthM: 1,
        sectionMm2: 0.75,
        cores: [{ id: "core_1", color, from: { deviceId: a, terminalId: ta }, to: { deviceId: b, terminalId: tb } }],
      }),
    );
  };
  wire("psu", "pos", "controller", "power_u", "#ba4f4f");
  wire("psu", "neg", "controller", "power_gnd", "#596879");
  wire("psu", "pos", "module", "power_u", "#ba4f4f");
  wire("psu", "neg", "module", "power_gnd", "#596879");
  wire("module", "r1_u", "reader", "pos", "#ba4f4f");
  wire("module", "r1_gnd", "reader", "neg", "#596879");
  wire("module", "r1_d0", "reader", "d0");
  wire("module", "r1_d1", "reader", "d1");
  wire("controller", "rs1_pos", "module", "rs1_pos");
  wire("controller", "rs1_neg", "module", "rs1_neg");
  wire("controller", "rs1_gnd", "module", "rs1_gnd", "#596879");
  wire("psu", "pos", "module", "k1_com", "#ba4f4f");
  wire("module", "k1_nc", "lock", "pos", "#ba4f4f");
  wire("lock", "neg", "psu", "neg", "#596879");
  wire("module", "in_exit1", "button", "a");
  wire("module", "in_gnd1", "button", "b");
  wire("module", "in_door1", "contact", "a");
  wire("module", "in_gnd1", "contact", "b");
  return project;
}
