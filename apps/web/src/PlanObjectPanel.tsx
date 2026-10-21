import type { Project } from "@strazh-sim/core";
export type PlanSelection = { kind: "wall" | "door" | "room"; id: string };
type Props = {
  project: Project;
  selection: PlanSelection;
  change: (recipe: (draft: Project) => void) => void;
  onDelete: () => void;
};
export function PlanObjectPanel({ project, selection, change, onDelete }: Props) {
  const wall = selection.kind === "wall" ? project.plan.walls.find((item) => item.id === selection.id) : undefined;
  const door = selection.kind === "door" ? project.plan.doors.find((item) => item.id === selection.id) : undefined;
  const room = selection.kind === "room" ? project.plan.rooms.find((item) => item.id === selection.id) : undefined;
  const item = wall ?? door ?? room;
  if (!item) return <p>Объект удалён</p>;
  const update = (recipe: (draft: Project) => void) => change(recipe);
  const position = wall?.from ?? door?.position ?? room?.position;
  const move = (axis: "x" | "y", value: number) =>
    update((draft) => {
      if (!Number.isFinite(value)) return;
      const wall = draft.plan.walls.find((item) => item.id === selection.id);
      if (wall) {
        const delta = value - wall.from[axis];
        wall.from[axis] += delta;
        wall.to[axis] += delta;
        for (const door of draft.plan.doors.filter((door) => door.wallId === wall.id)) door.position[axis] += delta;
      }
      const object =
        draft.plan.doors.find((item) => item.id === selection.id) ??
        draft.plan.rooms.find((item) => item.id === selection.id);
      if (object) object.position[axis] = value;
    });
  return (
    <>
      <h2>{wall ? "Стена" : door ? "Дверь" : "Помещение"}</h2>
      {position && (
        <div className="field-pair">
          {(["x", "y"] as const).map((axis) => (
            <label key={axis}>
              {axis.toUpperCase()}
              <input
                type="number"
                value={position[axis]}
                onChange={(event) => move(axis, Number(event.target.value))}
              />
            </label>
          ))}
        </div>
      )}
      {wall && (
        <label>
          Длина стены, м
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={Number(
              (Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y) * project.plan.metersPerUnit).toFixed(2),
            )}
            onChange={(event) => {
              const meters = Number(event.target.value);
              if (meters <= 0) return;
              update((draft) => {
                const item = draft.plan.walls.find((item) => item.id === wall.id);
                if (item) {
                  const angle = Math.atan2(item.to.y - item.from.y, item.to.x - item.from.x),
                    length = meters / draft.plan.metersPerUnit;
                  item.to = { x: item.from.x + Math.cos(angle) * length, y: item.from.y + Math.sin(angle) * length };
                }
              });
            }}
          />
        </label>
      )}
      {room && (
        <>
          <label>
            Название помещения
            <input
              value={room.name}
              onChange={(event) =>
                update((draft) => {
                  const item = draft.plan.rooms.find((item) => item.id === room.id);
                  if (item) item.name = event.target.value;
                })
              }
            />
          </label>
          {(["width", "height"] as const).map((field) => (
            <label key={field}>
              {field === "width" ? "Ширина, м" : "Высота, м"}
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={Number((room[field] * project.plan.metersPerUnit).toFixed(2))}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (value > 0)
                    update((draft) => {
                      const item = draft.plan.rooms.find((item) => item.id === room.id);
                      if (item) item[field] = value / draft.plan.metersPerUnit;
                    });
                }}
              />
            </label>
          ))}
        </>
      )}
      {door && (
        <>
          <label>
            Ширина проёма, м
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={Number((door.width * project.plan.metersPerUnit).toFixed(2))}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (value > 0)
                  update((draft) => {
                    const item = draft.plan.doors.find((item) => item.id === door.id);
                    if (item) item.width = value / draft.plan.metersPerUnit;
                  });
              }}
            />
          </label>
          <label>
            Поворот, °
            <input
              type="number"
              value={door.rotation}
              onChange={(event) =>
                update((draft) => {
                  const item = draft.plan.doors.find((item) => item.id === door.id);
                  if (item) item.rotation = Number(event.target.value);
                })
              }
            />
          </label>
          <label>
            Точка доступа
            <select
              value={door.pointId && door.controllerId ? `${door.controllerId}/${door.pointId}` : ""}
              onChange={(event) =>
                update((draft) => {
                  const item = draft.plan.doors.find((item) => item.id === door.id);
                  if (!item) return;
                  const [controllerId, pointId] = event.target.value.split("/");
                  if (controllerId && pointId) {
                    item.controllerId = controllerId;
                    item.pointId = pointId;
                  } else {
                    delete item.controllerId;
                    delete item.pointId;
                  }
                })
              }
            >
              <option value="">Не назначена</option>
              {project.devices.flatMap(
                (controller) =>
                  controller.controller?.points.map((point) => (
                    <option key={`${controller.id}/${point.id}`} value={`${controller.id}/${point.id}`}>
                      {controller.name} / {point.name}
                    </option>
                  )) ?? [],
              )}
            </select>
          </label>
        </>
      )}
      <button type="button" className="danger" onClick={onDelete}>
        Удалить {wall ? "стену" : door ? "дверь" : "помещение"}
      </button>
    </>
  );
}
