import { type Project, ScenarioSchema } from "@strazh-sim/core";
import { createBidirectionalProject, createDoorProject, createTurnstileProject } from "./example";

const common = [
  { id: "power", label: "Обеспечить питание модуля", kind: "power" },
  { id: "online", label: "Восстановить связь контроллера с модулем", kind: "online" },
  { id: "point", label: "Настроить точку доступа", kind: "point" },
  { id: "card", label: "Выдать действующую карту", kind: "card" },
  { id: "passage", label: "Пройти по карте: открыть и закрыть дверь", kind: "card_passage" },
  { id: "button", label: "Проверить кнопку выхода", kind: "button" },
  { id: "secured", label: "Закрыть дверь и дождаться запирания", kind: "secured" },
];
export const scenarios = [
  ScenarioSchema.parse({
    id: "two_way",
    title: "Двусторонняя дверь",
    description: "Проверьте проход по карте с обеих сторон двери, кнопку и запирание.",
    goals: [...common, { id: "exit", label: "Выполнить проход через выходной считыватель", kind: "exit_passage" }],
    hints: [
      "Для выхода используется READER 2 и та же точка доступа.",
      "В панели действий отдельно приложите карту на вход и на выход, в обоих случаях откройте и закройте дверь.",
    ],
  }),
  ScenarioSchema.parse({
    id: "turnstile",
    title: "Учебный турникет",
    description: "Проверьте питание, разрешение прохода сухим контактом реле и сигнал датчика прохода.",
    goals: common,
    hints: [
      "Турникет постоянно питается от БП; K1 NO замыкает вход разрешения прохода.",
      "Приложите карту 1001, начните и завершите проход, затем проверьте кнопку.",
    ],
  }),
  ScenarioSchema.parse({
    id: "commission_door",
    title: "Пусконаладка одной двери",
    description:
      "Монтаж выполнен. Настройте контроллер, добавьте модуль, точку и карту. Выполните проход и проверьте кнопку выхода.",
    goals: common,
    hints: [
      "Запустите симуляцию и проверьте питание.",
      "Откройте контроллер: Поиск устройств → Начать поиск → Добавить.",
      "Создайте точку доступа с K1, затем карту с правом на эту точку.",
      "В панели приборов приложите карту, откройте и закройте дверь. Проверьте кнопку и отпустите её. Дождитесь закрытия замка.",
    ],
  }),
  ScenarioSchema.parse({
    id: "repair_osdp",
    title: "Поиск неисправности связи",
    description:
      "Работавшая дверь потеряла связь с модулем. Найдите причину, восстановите работу и выполните контрольный проход.",
    goals: common.filter((goal) => ["online", "passage", "secured"].includes(goal.id)),
    hints: [
      "Сравните наличие питания и наличие связи.",
      "Проверьте все три проводника RS-485 между контроллером и модулем.",
      "В свойствах кабеля проверьте обрыв жилы. После исправления повторите проход картой 1001.",
    ],
  }),
  ScenarioSchema.parse({
    id: "repair_address",
    title: "Неверный адрес модуля",
    description:
      "Модуль питается, но контроллер не может использовать его. Проверьте настройки и восстановите работу двери.",
    goals: common.filter((goal) => ["online", "passage", "secured"].includes(goal.id)),
    hints: [
      "Проверьте действующий адрес в поиске устройств.",
      "Для STR-1AP допустимы адреса 1–31.",
      "Измените DIP и перезапустите модуль кнопкой в свойствах, затем проверьте карту 1001.",
    ],
  }),
];
export function createScenarioProject(id: string): Project {
  if (!scenarios.some((scenario) => scenario.id === id)) throw new Error("Неизвестное задание");
  const project =
    id === "two_way"
      ? createBidirectionalProject()
      : id === "turnstile"
        ? createTurnstileProject()
        : createDoorProject(id !== "commission_door");
  project.scenarioId = id;
  project.name = scenarios.find((scenario) => scenario.id === id)?.title ?? "Задание";
  if (id === "repair_osdp") {
    const core = project.cables
      .flatMap((cable) => cable.cores)
      .find((core) => core.to.deviceId === "module" && core.to.terminalId === "rs1_neg");
    if (core) core.broken = true;
  }
  if (id === "repair_address") {
    const module = project.devices.find((device) => device.id === "module");
    if (module) module.settings.address = 0;
  }
  return project;
}
