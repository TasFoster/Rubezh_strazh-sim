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

export function createBidirectionalProject(): Project {
  const project = createDoorProject(true);
  project.id = "two_way_door";
  project.name = "Двусторонняя дверь";
  project.devices.push(
    InstanceSchema.parse({
      id: "reader_exit",
      modelId: "training_reader",
      name: "Считыватель · выход",
      position: { x: 1150, y: 70 },
    }),
  );
  const point = project.devices.find((device) => device.id === "controller")?.controller?.points[0];
  if (point) point.exitReaderId = "reader_exit";
  for (const [port, terminal, color] of [
    ["r2_u", "pos", "#ba4f4f"],
    ["r2_gnd", "neg", "#596879"],
    ["r2_d0", "d0", "#347b84"],
    ["r2_d1", "d1", "#347b84"],
  ]) {
    project.cables.push(
      CableSchema.parse({
        id: `exit_${terminal}`,
        name: `Считыватель выхода: ${terminal}`,
        cores: [
          {
            id: "core_1",
            color,
            from: { deviceId: "module", terminalId: port },
            to: { deviceId: "reader_exit", terminalId: terminal },
          },
        ],
      }),
    );
  }
  return project;
}
export function createTurnstileProject(): Project {
  const project = createDoorProject(true);
  project.id = "turnstile_demo";
  project.name = "Учебный турникет";
  const actuator = project.devices.find((device) => device.id === "lock");
  if (actuator) {
    actuator.modelId = "training_turnstile";
    actuator.name = "Турникет";
  }
  project.cables = project.cables.filter(
    (cable) =>
      !cable.cores.some((core) =>
        [core.from, core.to].some(
          (end) =>
            end.deviceId === "lock" || (end.deviceId === "module" && ["k1_com", "k1_nc"].includes(end.terminalId)),
        ),
      ),
  );
  const pairs = [
    ["psu", "pos", "lock", "pos"],
    ["psu", "neg", "lock", "neg"],
    ["module", "k1_com", "lock", "release_a"],
    ["module", "k1_no", "lock", "control_gnd"],
  ];
  pairs.forEach(([a, ta, b, tb], index) => {
    project.cables.push(
      CableSchema.parse({
        id: `gate_${index}`,
        name: `Турникет ${index + 1}`,
        cores: [
          {
            id: "core_1",
            color: "#886eac",
            from: { deviceId: a, terminalId: ta },
            to: { deviceId: b, terminalId: tb },
          },
        ],
      }),
    );
  });
  const point = project.devices.find((device) => device.id === "controller")?.controller?.points[0];
  if (point) point.name = "Турникет · вход";
  return project;
}
export function createTwoControllersProject(): Project {
  const project = createProject();
  project.id = "two_controllers";
  project.name = "Два независимых контроллера";
  for (const [prefix, offset, ip] of [
    ["a_", 0, "192.168.0.101"],
    ["b_", 1150, "192.168.0.102"],
  ] as const) {
    const source = createDoorProject(true);
    for (const device of source.devices) {
      device.id = prefix + device.id;
      device.position.x += offset;
      device.name = `${prefix === "a_" ? "А" : "Б"} · ${device.name}`;
      if (device.controller) {
        device.controller.ip = ip;
        device.controller.modules = device.controller.modules.map((id) => prefix + id);
        for (const point of device.controller.points) {
          point.id = prefix + point.id;
          point.moduleId = prefix + point.moduleId;
          point.readerId = prefix + point.readerId;
          point.lockId = prefix + point.lockId;
          point.buttonId = prefix + point.buttonId;
          point.contactId = prefix + point.contactId;
        }
        for (const card of device.controller.cards) {
          card.id = prefix === "a_" ? "1001" : "2001";
          card.pointIds = card.pointIds.map((id) => prefix + id);
        }
      }
      project.devices.push(device);
    }
    for (const cable of source.cables) {
      cable.id = prefix + cable.id;
      for (const point of cable.route) {
        point.id = prefix + point.id;
        point.x += offset;
      }
      for (const core of cable.cores) {
        core.from.deviceId = prefix + core.from.deviceId;
        core.to.deviceId = prefix + core.to.deviceId;
      }
      project.cables.push(cable);
    }
  }
  return project;
}
