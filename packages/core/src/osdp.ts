export type LinkQuality = "green" | "yellow" | "red";

/**
 * Цвет строки состояния в «Контроле связи OSDP» по доле неудачных ответов модуля
 * (руководство по эксплуатации ПАСН.425728.007 РЭ, раздел «Контроль связи OSDP»):
 * менее 5 % — зелёный, от 5 до 40 % — жёлтый, более 40 % — красный.
 * Поведение ровно на границах в руководстве не описано; здесь 5 % — уже жёлтый, 40 % — ещё жёлтый.
 */
export function osdpLinkQuality(failedShare: number): LinkQuality {
  if (!(failedShare >= 0 && failedShare <= 1)) {
    throw new RangeError(`Доля неудачных ответов должна быть от 0 до 1, получено ${failedShare}`);
  }
  if (failedShare < 0.05) return "green";
  if (failedShare <= 0.4) return "yellow";
  return "red";
}
