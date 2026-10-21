import { getDevice } from "@strazh-sim/content";
import type { Cable, Endpoint, Project } from "@strazh-sim/core";

type Props = {
  cable: Cable;
  project: Project;
  change: (recipe: (draft: Project) => void) => void;
  onDelete: () => void;
};
export function CablePanel({ cable, project, change, onDelete }: Props) {
  const edit = (recipe: (draft: Cable) => void) =>
    change((draft) => {
      const item = draft.cables.find((item) => item.id === cable.id);
      if (item) recipe(item);
    });
  const options = project.devices.flatMap((device) =>
    getDevice(device.modelId).terminals.map((terminal) => ({
      label: `${device.name} / ${terminal.id} (${terminal.label})`,
      value: JSON.stringify({ deviceId: device.id, terminalId: terminal.id }),
    })),
  );
  return (
    <>
      <h2>Кабель</h2>
      <label>
        Название
        <input
          value={cable.name}
          onChange={(event) =>
            edit((draft) => {
              draft.name = event.target.value;
            })
          }
        />
      </label>
      <label>
        Длина, м
        <input
          type="number"
          min="0"
          max="10000"
          step="0.1"
          value={cable.lengthM}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (value >= 0 && value <= 10000)
              edit((draft) => {
                draft.lengthM = value;
              });
          }}
        />
      </label>
      <label>
        Сечение жилы, мм²
        <input
          type="number"
          min="0.01"
          max="100"
          step="0.05"
          value={cable.sectionMm2}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (value > 0 && value <= 100)
              edit((draft) => {
                draft.sectionMm2 = value;
              });
          }}
        />
      </label>
      <p className="muted">
        Длина задаётся отдельно от схемы. Маршрут: двойной щелчок по кабелю добавляет точку, узлы можно двигать.
      </p>
      {cable.route.map((point, index) => (
        <div className="route-row" key={point.id}>
          <span>
            {index + 1}: {Math.round(point.x)}, {Math.round(point.y)}
          </span>
          <button
            type="button"
            aria-label={`Удалить узел ${index + 1}`}
            onClick={() =>
              edit((draft) => {
                draft.route.splice(index, 1);
              })
            }
          >
            ×
          </button>
        </div>
      ))}
      {cable.cores.map((core) => (
        <div className="core-editor" key={core.id}>
          <div className="section-heading">
            Жила {cable.cores.indexOf(core) + 1}
            <input
              aria-label="Цвет жилы"
              type="color"
              value={core.color}
              onChange={(event) =>
                edit((draft) => {
                  const item = draft.cores.find((item) => item.id === core.id);
                  if (item) item.color = event.target.value;
                })
              }
            />
          </div>
          {(["from", "to"] as const).map((end) => (
            <label key={end}>
              {end === "from" ? "Откуда" : "Куда"}
              <select
                value={JSON.stringify(core[end])}
                onChange={(event) => {
                  const value = JSON.parse(event.target.value) as Endpoint;
                  const other = core[end === "from" ? "to" : "from"];
                  if (value.deviceId === other.deviceId && value.terminalId === other.terminalId) return;
                  edit((draft) => {
                    const item = draft.cores.find((item) => item.id === core.id);
                    if (item) item[end] = value;
                  });
                }}
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              checked={core.broken}
              onChange={(event) =>
                edit((draft) => {
                  const item = draft.cores.find((item) => item.id === core.id);
                  if (item) item.broken = event.target.checked;
                })
              }
            />{" "}
            Обрыв жилы
          </label>
          {cable.cores.length > 1 && (
            <button
              type="button"
              onClick={() =>
                edit((draft) => {
                  draft.cores = draft.cores.filter((item) => item.id !== core.id);
                })
              }
            >
              Удалить жилу
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="wide"
        onClick={() =>
          edit((draft) => {
            const first = draft.cores[0];
            if (first)
              draft.cores.push({ ...structuredClone(first), id: crypto.randomUUID(), color: "#3366cc", broken: false });
          })
        }
      >
        Добавить жилу
      </button>
      <button type="button" className="danger" onClick={onDelete}>
        Удалить кабель
      </button>
    </>
  );
}
