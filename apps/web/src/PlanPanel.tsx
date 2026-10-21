import { backgroundFor, type Position, type Project } from "@strazh-sim/core";
import { useRef, useState } from "react";

type Props = {
  project: Project;
  floorId: string;
  change: (recipe: (draft: Project) => void) => void;
  onError: (message: string) => void;
  calibrating: boolean;
  marks: Position[];
  onCalibrate: (active: boolean) => void;
};
export function PlanPanel({ project, floorId, change, onError, calibrating, marks, onCalibrate }: Props) {
  const file = useRef<HTMLInputElement>(null);
  const [distance, setDistance] = useState(10);
  const background = backgroundFor(project, floorId);
  const load = async (picked: File | undefined) => {
    if (!picked) return;
    try {
      if (!["image/png", "image/jpeg"].includes(picked.type)) throw new Error("Поддерживаются PNG и JPEG");
      if (picked.size > 8000000) throw new Error("Размер изображения должен быть меньше 8 МБ");
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Ошибка чтения"));
        reader.readAsDataURL(picked);
      });
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      if (image.width > 15000 || image.height > 15000)
        throw new Error("Максимальная сторона изображения — 15000 пикселей");
      const width = Math.min(image.width, 1000);
      change((draft) => {
        draft.plan.backgrounds[floorId] = {
          floorId,
          dataUrl,
          x: 0,
          y: 0,
          width,
          height: (width * image.height) / image.width,
          rotation: 0,
          opacity: 0.5,
          locked: true,
        };
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : "Не удалось загрузить план");
    }
  };
  const number = (key: "x" | "y" | "rotation" | "opacity", value: number) => {
    if (Number.isFinite(value))
      change((draft) => {
        const bg = backgroundFor(draft, floorId);
        if (bg) bg[key] = value;
      });
  };
  return (
    <div className="plan-panel">
      <h2>План объекта</h2>
      <p className="muted">Загрузите чертёж или изображение. Оборудование и кабели размещаются поверх него.</p>
      <button type="button" className="wide" onClick={() => file.current?.click()}>
        {background ? "Заменить изображение" : "Загрузить PNG / JPEG"}
      </button>
      <input
        ref={file}
        hidden
        type="file"
        accept="image/png,image/jpeg"
        onChange={(event) => {
          void load(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {background && (
        <>
          <label>
            <input
              type="checkbox"
              checked={background.locked}
              onChange={(event) =>
                change((draft) => {
                  const bg = backgroundFor(draft, floorId);
                  if (bg) bg.locked = event.target.checked;
                })
              }
            />{" "}
            Закрепить фон
          </label>
          <div className="field-pair">
            <label>
              X
              <input type="number" value={background.x} onChange={(event) => number("x", Number(event.target.value))} />
            </label>
            <label>
              Y
              <input type="number" value={background.y} onChange={(event) => number("y", Number(event.target.value))} />
            </label>
          </div>
          <label>
            Ширина изображения
            <input
              type="number"
              min="1"
              max="15000"
              value={Math.round(background.width)}
              onChange={(event) => {
                const width = Number(event.target.value);
                if (width > 0 && width <= 15000)
                  change((draft) => {
                    const bg = backgroundFor(draft, floorId);
                    if (bg) {
                      bg.height *= width / bg.width;
                      bg.width = width;
                    }
                  });
              }}
            />
          </label>
          <label>
            Поворот, °
            <input
              type="number"
              value={background.rotation}
              onChange={(event) => number("rotation", Number(event.target.value))}
            />
          </label>
          <label>
            Прозрачность
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={background.opacity}
              onChange={(event) => number("opacity", Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            className="wide"
            onClick={() =>
              change((draft) => {
                delete draft.plan.backgrounds[floorId];
                if (draft.plan.background?.floorId === floorId) delete draft.plan.background;
              })
            }
          >
            Убрать изображение
          </button>
        </>
      )}
      <hr />
      <h3>Масштаб плана</h3>
      <p className="muted">1 единица = {(project.plan.metersPerUnit * 100).toLocaleString("ru-RU")} см</p>
      <button type="button" className="wide" onClick={() => onCalibrate(!calibrating)}>
        {calibrating ? "Отменить калибровку" : "Выбрать две точки"}
      </button>
      {calibrating && (
        <>
          <p>Отметьте две точки на плане: {marks.length}/2</p>
          <label>
            Расстояние между ними, м
            <input
              type="number"
              min="0.01"
              step="0.1"
              value={distance}
              onChange={(event) => setDistance(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            disabled={marks.length !== 2 || distance <= 0}
            onClick={() => {
              const [a, b] = marks;
              if (a && b) {
                const units = Math.hypot(a.x - b.x, a.y - b.y);
                if (units < 1) {
                  onError("Точки слишком близко");
                  return;
                }
                change((draft) => {
                  draft.plan.metersPerUnit = distance / units;
                });
                onCalibrate(false);
              }
            }}
          >
            Применить масштаб
          </button>
        </>
      )}
    </div>
  );
}
