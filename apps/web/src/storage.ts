import { devices } from "@strazh-sim/content";
import { type Project, parseProject, serializeProject } from "@strazh-sim/core";

const KEY = "strazh-sim.project.v1";
export class StorageConflictError extends Error {}
export const savedProjectText = () => localStorage.getItem(KEY);
export function loadProject(saved = savedProjectText()): Project | undefined {
  return saved !== null ? parseProject(JSON.parse(saved), devices) : undefined;
}
export function saveProject(project: Project, expected?: string | null): string {
  const payload = serializeProject(parseProject(project, devices));
  if (expected !== undefined && savedProjectText() !== expected)
    throw new StorageConflictError("Сохранение изменено другой вкладкой");
  localStorage.setItem(KEY, payload);
  return payload;
}
export function downloadProject(project: Project): void {
  const url = URL.createObjectURL(new Blob([serializeProject(project)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "strazh-project.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
