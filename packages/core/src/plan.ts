import type { Project } from "./project";
export function backgroundFor(project: Project, floorId: string) {
  return (
    project.plan.backgrounds[floorId] ??
    (project.plan.background?.floorId === floorId ? project.plan.background : undefined)
  );
}
