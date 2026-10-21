import type { DeviceKind, Link } from "@strazh-sim/core";
export const kindLabel: Record<DeviceKind, string> = {
  controller: "Контроллер",
  access_module: "Модуль доступа",
  reader: "Считыватель",
  lock: "Замок",
  exit_button: "Кнопка",
  door_contact: "Геркон",
  power_supply: "Питание",
  resistor: "Резистор",
  turnstile: "Турникет",
};
export const linkLabel: Record<Link["status"], string> = {
  online: "На связи",
  conflict: "Конфликт адресов",
  invalid_address: "Недопустимый адрес",
  master_conflict: "Два контроллера на линии",
  baud_mismatch: "Не совпадает скорость",
};
