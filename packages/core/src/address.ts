/**
 * Адрес модуля на шине OSDP задаётся DIP-переключателями 1–5: адрес равен сумме
 * весов включённых переключателей (паспорт STR-1AP, п. 5.4, рис. 3).
 */
export const DIP_WEIGHTS = [1, 2, 4, 8, 16] as const;

const MIN_ADDRESS = 1;
const MAX_ADDRESS = 31;

/** `switches[i]` — положение переключателя с номером `i + 1` (true = ON). */
export function dipAddress(switches: readonly boolean[]): number {
  if (switches.length !== DIP_WEIGHTS.length) {
    throw new RangeError(`Ожидается ${DIP_WEIGHTS.length} переключателей, получено ${switches.length}`);
  }
  return DIP_WEIGHTS.reduce((sum, weight, i) => (switches[i] ? sum + weight : sum), 0);
}

/** Адрес 0 использовать нельзя (паспорт STR-1AP, п. 5.2, поз. 9). */
export function isValidOsdpAddress(address: number): boolean {
  return Number.isInteger(address) && address >= MIN_ADDRESS && address <= MAX_ADDRESS;
}

/** Положения переключателей 1–5 для заданного адреса. */
export function dipForAddress(address: number): boolean[] {
  if (!isValidOsdpAddress(address)) {
    throw new RangeError(`Адрес OSDP должен быть целым от ${MIN_ADDRESS} до ${MAX_ADDRESS}, получено ${address}`);
  }
  return DIP_WEIGHTS.map((weight) => (address & weight) !== 0);
}
