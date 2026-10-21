import { devices } from "@strazh-sim/content";
import { type Project, parseProject, serializeProject } from "@strazh-sim/core";

const KEY = "strazh-sim.project.v1";
export function loadProject(): Project | undefined {
  const saved = localStorage.getItem(KEY);
  return saved ? parseProject(JSON.parse(saved), devices) : undefined;
}
export function saveProject(project: Project): void {
  localStorage.setItem(KEY, serializeProject(project));
}
export function downloadProject(project: Project): void {
  const url = URL.createObjectURL(new Blob([serializeProject(project)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "strazh-project.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
