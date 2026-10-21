export type InputState = "closed" | "open" | "short" | "broken" | "invalid";
/** ПАСН.425728.007 РЭ ред. 12, с. 35. Неопределённые промежутки не округляются. */
export function classifyInput(ohms: number, supervised: boolean, kind: "door_exit" | "sens" = "door_exit"): InputState {
  if (Number.isNaN(ohms) || ohms < 0) return "invalid";
  if (!supervised) return ohms < 1000 ? "closed" : "open";
  if (kind === "sens") {
    if (ohms >= 56000) return "broken";
    if (ohms < 1400) return "short";
    if (ohms >= 1600 && ohms <= 3300) return "closed";
    if (ohms >= 3600 && ohms <= 6400) return "open";
  } else {
    if (ohms >= 8000) return "broken";
    if (ohms < 150) return "short";
    if (ohms >= 2000 && ohms <= 2700) return "closed";
    if (ohms >= 4150 && ohms <= 5350) return "open";
  }
  return "invalid";
}
