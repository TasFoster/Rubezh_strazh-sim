import { devices, getDevice } from "@strazh-sim/content";
import {
  ControllerConfigSchema,
  createProject,
  InstanceSchema,
  type Position,
  parseProject,
  removeDevice,
} from "@strazh-sim/core";
import { useEffect, useRef, useState } from "react";
import { PlanPanel } from "./PlanPanel";
import { downloadProject } from "./storage";
import { useEditor } from "./useEditor";
import { Workbench } from "./Workbench";

export function App() {
  const editor = useEditor();
  const { project, change, replace, undo, redo } = editor;
  const [selected, setSelected] = useState<string>();
  const [query, setQuery] = useState("");
  const [grid, setGrid] = useState(true);
  const [calibrating, setCalibrating] = useState(false);
  const [marks, setMarks] = useState<Position[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const instance = project.devices.find((device) => device.id === selected);
  const model = instance ? getDevice(instance.modelId) : undefined;
  const addDevice = (modelId: string, position: Position) => {
    const spec = getDevice(modelId);
    const id = crypto.randomUUID();
    change((draft) =>
      draft.devices.push(
        InstanceSchema.parse({
          id,
          modelId,
          name: spec.name,
          position,
          ...(spec.kind === "controller" ? { controller: ControllerConfigSchema.parse({}) } : {}),
        }),
      ),
    );
    setSelected(id);
  };
  const remove = () => {
    if (selected) {
      replace(removeDevice(project, selected));
      setSelected(undefined);
    }
  };
  const copy = () => {
    if (!instance) return;
    const clone = structuredClone(instance);
    clone.id = crypto.randomUUID();
    clone.name += " (копия)";
    clone.position.x += 40;
    clone.position.y += 40;
    if (clone.controller) {
      clone.controller = ControllerConfigSchema.parse({});
    }
    change((draft) => draft.devices.push(clone));
    setSelected(clone.id);
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
      if (event.key === "Delete" && selected) {
        replace(removeDevice(project, selected));
        setSelected(undefined);
      }
      if (event.key === "Escape") setSelected(undefined);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [project, selected, replace, undo, redo]);
  const importFile = async (picked: File | undefined) => {
    if (!picked) return;
    try {
      if (picked.size > 15000000) throw new Error("Файл слишком большой (максимум 15 МБ)");
      replace(parseProject(JSON.parse(await picked.text()), devices));
      setSelected(undefined);
      editor.setError("");
    } catch (error) {
      editor.setError(error instanceof Error ? error.message : "Не удалось открыть проект");
    }
  };
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <div>
            STRAZH<span>Лаборатория СКУД</span>
          </div>
        </div>
        <input
          className="project-name"
          aria-label="Название проекта"
          value={project.name}
          onChange={(event) =>
            change((draft) => {
              draft.name = event.target.value;
            })
          }
        />
        <span className="save-status">{editor.saved ? "● Сохранено" : "Сохранение…"}</span>
        <button type="button" onClick={() => file.current?.click()}>
          Открыть
        </button>
        <button type="button" onClick={() => downloadProject(project)}>
          Экспорт
        </button>
        <input
          ref={file}
          hidden
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            void importFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </header>
      <div className="toolbar">
        <span className="mode-badge">РЕДАКТОР ОБЪЕКТА</span>
        <button type="button" onClick={undo} disabled={!editor.canUndo}>
          ↶ Отменить
        </button>
        <button type="button" onClick={redo} disabled={!editor.canRedo}>
          ↷ Повторить
        </button>
        <label>
          <input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} /> Сетка
        </label>
        <button type="button" onClick={() => setSelected(undefined)}>
          План объекта
        </button>
        <span className="toolbar-spacer" />
        <span>{project.devices.length} устройств</span>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Создать пустой объект? Текущий проект останется в истории отмены.")) {
              replace(createProject());
              setSelected(undefined);
            }
          }}
        >
          Новый объект
        </button>
      </div>
      {editor.error && (
        <div className="error-banner" role="alert">
          {editor.error}
          <button type="button" onClick={() => editor.setError("")}>
            Закрыть
          </button>
        </div>
      )}
      <div className="editor-layout">
        <aside className="palette">
          <div className="section-heading">
            Оборудование <span>{devices.length}</span>
          </div>
          <input
            aria-label="Поиск оборудования"
            placeholder="Найти компонент…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="muted">Перетащите на рабочее поле</p>
          {devices
            .filter((device) => device.name.toLowerCase().includes(query.toLowerCase()))
            .map((device) => (
              <button
                className="palette-item"
                key={device.id}
                type="button"
                draggable
                onDragStart={(event) => event.dataTransfer.setData("application/strazh-model", device.id)}
                onClick={() =>
                  addDevice(device.id, {
                    x: 80 + (project.devices.length % 3) * 220,
                    y: 80 + Math.floor(project.devices.length / 3) * 130,
                  })
                }
              >
                <span className="component-icon">▣</span>
                <span>
                  {device.name}
                  <small>{device.kind}</small>
                </span>
                <span>＋</span>
              </button>
            ))}
          <div className="palette-footer">
            Свободный монтаж
            <br />
            <span>Расположите оборудование на плане объекта.</span>
          </div>
        </aside>
        <Workbench
          project={project}
          selected={selected}
          onSelect={setSelected}
          onAdd={addDevice}
          grid={grid}
          calibrating={calibrating}
          marks={marks}
          onPlanClick={(point) => setMarks((current) => (current.length < 2 ? [...current, point] : [point]))}
          onBackgroundMove={(point) =>
            change((draft) => {
              if (draft.plan.background) Object.assign(draft.plan.background, point);
            })
          }
          onMove={(id, position) =>
            change((draft) => {
              const item = draft.devices.find((device) => device.id === id);
              if (item) item.position = position;
            })
          }
        />
        <aside className="inspector">
          <div className="section-heading">Свойства</div>
          {instance && model ? (
            <>
              <span className="eyebrow">{model.kind}</span>
              <h2>{instance.name}</h2>
              <label>
                Название
                <input
                  value={instance.name}
                  onChange={(event) =>
                    change((draft) => {
                      const item = draft.devices.find((device) => device.id === selected);
                      if (item) item.name = event.target.value;
                    })
                  }
                />
              </label>
              <div className="button-row">
                <button
                  type="button"
                  onClick={() =>
                    change((draft) => {
                      const item = draft.devices.find((device) => device.id === selected);
                      if (item) item.rotation = (item.rotation + 90) % 360;
                    })
                  }
                >
                  ↻ Повернуть
                </button>
                <button type="button" onClick={copy}>
                  Копия
                </button>
              </div>
              {model.dipAddress && (
                <label>
                  Адрес OSDP
                  <input
                    type="number"
                    min={0}
                    max={model.dipAddress.max}
                    value={instance.settings.address}
                    onChange={(event) =>
                      change((draft) => {
                        const item = draft.devices.find((device) => device.id === selected);
                        if (item) item.settings.address = Number(event.target.value);
                      })
                    }
                  />
                </label>
              )}
              <div className="spec-note">
                {model.source.document}
                <br />
                {model.source.edition}
              </div>
              <button type="button" className="danger" onClick={remove}>
                Удалить устройство
              </button>
            </>
          ) : (
            <PlanPanel
              project={project}
              change={change}
              onError={editor.setError}
              calibrating={calibrating}
              marks={marks}
              onCalibrate={(active) => {
                setCalibrating(active);
                setMarks([]);
              }}
            />
          )}
        </aside>
      </div>
      <footer className="statusbar">
        <span>Объект / Этаж 1</span>
        <span>Локальный проект · Ctrl+Z — отмена · Ctrl+Shift+Z — повтор</span>
      </footer>
    </div>
  );
}
