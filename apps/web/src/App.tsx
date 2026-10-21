import {
  createDoorProject,
  createOsdpReaderProject,
  createScenarioProject,
  createTwoControllersProject,
  devices,
  getDevice,
} from "@strazh-sim/content";
import {
  backgroundFor,
  ControllerConfigSchema,
  createProject,
  type Endpoint,
  InstanceSchema,
  lockIsOpen,
  type Position,
  parseProject,
  removeDevice,
} from "@strazh-sim/core";
import { useEffect, useRef, useState } from "react";
import { CablePanel } from "./CablePanel";
import { ControllerWindow } from "./ControllerWindow";
import { DeviceSettings } from "./DeviceSettings";
import { LessonPanel } from "./LessonPanel";
import { PlanObjectPanel, type PlanSelection } from "./PlanObjectPanel";
import { PlanPanel } from "./PlanPanel";
import { SimulationPanel } from "./SimulationPanel";
import { downloadProject } from "./storage";
import { useEditor } from "./useEditor";
import { useSimulation } from "./useSimulation";
import { Workbench } from "./Workbench";

export function App() {
  const editor = useEditor();
  const { project, change, replace, undo, redo } = editor;
  const simulation = useSimulation(project);
  const [showSimulation, setShowSimulation] = useState(false);
  const [showLesson, setShowLesson] = useState(false);
  const [openControllers, setOpenControllers] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>();
  const [activeFloor, setActiveFloor] = useState("floor_1");
  const floorId = project.plan.floors.some((floor) => floor.id === activeFloor)
    ? activeFloor
    : (project.plan.floors[0]?.id ?? "floor_1");
  const [planTool, setPlanTool] = useState("select");
  const [selectedPlan, setSelectedPlan] = useState<PlanSelection>();
  const [wallStart, setWallStart] = useState<Position>();
  const [selectedCable, setSelectedCable] = useState<string>();
  const [detail, setDetail] = useState(false);
  const [pending, setPending] = useState<Endpoint>();
  const [route, setRoute] = useState<Position[]>([]);
  const [query, setQuery] = useState("");
  const [grid, setGrid] = useState(true);
  const [calibrating, setCalibrating] = useState(false);
  const [marks, setMarks] = useState<Position[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const instance = project.devices.find((device) => device.id === selected);
  const cable = project.cables.find((item) => item.id === selectedCable);
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
          floorId,
          settings: { currentA: spec.electrical?.power?.currentA || 0.1 },
          ...(spec.kind === "controller" ? { controller: ControllerConfigSchema.parse({}) } : {}),
        }),
      ),
    );
    setSelected(id);
  };
  const connect = (endpoint: Endpoint) => {
    if (!pending) {
      setPending(endpoint);
      setRoute([]);
      return;
    }
    if (pending.deviceId !== endpoint.deviceId || pending.terminalId !== endpoint.terminalId) {
      const cableId = crypto.randomUUID();
      const from = project.devices.find((device) => device.id === pending.deviceId)?.position;
      const to = project.devices.find((device) => device.id === endpoint.deviceId)?.position;
      const points = [from, ...route, to].filter((point): point is Position => Boolean(point));
      const length = points.slice(1).reduce((sum, point, i) => {
        const previous = points[i];
        return sum + (previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0);
      }, 0);
      change((draft) =>
        draft.cables.push({
          id: cableId,
          name: `Кабель ${draft.cables.length + 1}`,
          floorId,
          route: route.map((point) => ({ ...point, id: crypto.randomUUID() })),
          lengthM: Math.round(length * draft.plan.metersPerUnit * 10) / 10,
          sectionMm2: 0.5,
          cores: [{ id: crypto.randomUUID(), color: "#347b84", from: pending, to: endpoint, broken: false }],
        }),
      );
      setSelectedCable(cableId);
      setSelected(undefined);
    }
    setPending(undefined);
    setRoute([]);
  };
  const removePlan = () => {
    if (!selectedPlan) return;
    change((draft) => {
      if (selectedPlan.kind === "wall") {
        draft.plan.walls = draft.plan.walls.filter((item) => item.id !== selectedPlan.id);
        for (const door of draft.plan.doors) if (door.wallId === selectedPlan.id) delete door.wallId;
      }
      if (selectedPlan.kind === "door")
        draft.plan.doors = draft.plan.doors.filter((item) => item.id !== selectedPlan.id);
      if (selectedPlan.kind === "room")
        draft.plan.rooms = draft.plan.rooms.filter((item) => item.id !== selectedPlan.id);
    });
    setSelectedPlan(undefined);
  };
  const planClick = (point: Position) => {
    if (pending) {
      setRoute((current) => [...current, point]);
      return;
    }
    if (calibrating) {
      setMarks((current) => (current.length < 2 ? [...current, point] : [point]));
      return;
    }
    if (planTool === "wall") {
      if (wallStart && Math.hypot(point.x - wallStart.x, point.y - wallStart.y) > 1)
        change((draft) => draft.plan.walls.push({ id: crypto.randomUUID(), floorId, from: wallStart, to: point }));
      setWallStart(point);
    }
    if (planTool === "room") {
      const id = crypto.randomUUID();
      change((draft) =>
        draft.plan.rooms.push({
          id,
          floorId,
          name: `Помещение ${draft.plan.rooms.length + 1}`,
          position: point,
          width: 300,
          height: 200,
        }),
      );
      setSelectedPlan({ kind: "room", id });
    }
    if (planTool === "door") {
      let position = point,
        rotation = 0,
        wallId: string | undefined,
        nearest = 25;
      for (const wall of project.plan.walls.filter((wall) => wall.floorId === floorId)) {
        const dx = wall.to.x - wall.from.x,
          dy = wall.to.y - wall.from.y,
          squared = dx * dx + dy * dy;
        if (!squared) continue;
        const t = Math.max(0, Math.min(1, ((point.x - wall.from.x) * dx + (point.y - wall.from.y) * dy) / squared));
        const projection = { x: wall.from.x + t * dx, y: wall.from.y + t * dy },
          distance = Math.hypot(projection.x - point.x, projection.y - point.y);
        if (distance < nearest) {
          nearest = distance;
          position = projection;
          rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
          wallId = wall.id;
        }
      }
      const id = crypto.randomUUID();
      change((draft) =>
        draft.plan.doors.push({
          id,
          floorId,
          position,
          rotation,
          width: 0.9 / draft.plan.metersPerUnit,
          ...(wallId ? { wallId } : {}),
        }),
      );
      setSelectedPlan({ kind: "door", id });
    }
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
      if (event.key === "Escape") {
        setSelected(undefined);
        setPending(undefined);
        setRoute([]);
        setSelectedCable(undefined);
        setSelectedPlan(undefined);
        setPlanTool("select");
        setWallStart(undefined);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [project, selected, replace, undo, redo]);
  const importFile = async (picked: File | undefined) => {
    if (!picked) return;
    try {
      if (picked.size > 15000000) throw new Error("Файл слишком большой (максимум 15 МБ)");
      const parsed = parseProject(JSON.parse(await picked.text()), devices);
      simulation.stop();
      replace(parsed);
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
        <button
          type="button"
          onClick={() => {
            setSelected(undefined);
            setSelectedPlan(undefined);
            setSelectedCable(undefined);
          }}
        >
          План объекта
        </button>
        <button
          type="button"
          className={detail ? "active" : ""}
          onClick={() => {
            setDetail(!detail);
            setPending(undefined);
            setRoute([]);
          }}
        >
          {detail ? "К плану" : "Монтаж / клеммы"}
        </button>
        {pending && (
          <button
            type="button"
            onClick={() => {
              setPending(undefined);
              setRoute([]);
            }}
          >
            Отменить провод
          </button>
        )}
        <button
          type="button"
          className="primary"
          onClick={() => {
            simulation.toggle();
            setShowSimulation(true);
          }}
        >
          {simulation.status === "running" ? "Пауза" : simulation.status === "paused" ? "Продолжить" : "Запустить"}
        </button>
        <button type="button" disabled={!simulation.active} onClick={simulation.stop}>
          Сброс
        </button>
        <button type="button" onClick={() => setShowSimulation(!showSimulation)}>
          Приборы
        </button>
        <select
          className="tool-select"
          aria-label="Инструмент плана"
          value={planTool}
          onChange={(event) => {
            setPlanTool(event.target.value);
            setDetail(false);
            setPending(undefined);
            setWallStart(undefined);
            setSelected(undefined);
            setSelectedCable(undefined);
          }}
        >
          <option value="select">Выделение</option>
          <option value="wall">Стена</option>
          <option value="room">Помещение</option>
          <option value="door">Дверь</option>
        </select>
        <select
          className="floor-select"
          aria-label="Этаж"
          value={floorId}
          onChange={(event) => {
            setActiveFloor(event.target.value);
            setSelected(undefined);
            setSelectedCable(undefined);
            setSelectedPlan(undefined);
            setWallStart(undefined);
          }}
        >
          {project.plan.floors.map((floor) => (
            <option key={floor.id} value={floor.id}>
              {floor.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Добавить этаж"
          onClick={() => {
            const id = crypto.randomUUID();
            change((draft) => draft.plan.floors.push({ id, name: `Этаж ${draft.plan.floors.length + 1}` }));
            setActiveFloor(id);
            setSelected(undefined);
            setSelectedPlan(undefined);
          }}
        >
          + Этаж
        </button>
        <button type="button" onClick={() => setShowLesson(!showLesson)}>
          Задания
        </button>
        <span className="toolbar-spacer" />
        <span>{project.devices.length} устройств</span>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Создать пустой объект? Текущий проект останется в истории отмены.")) {
              simulation.stop();
              setPending(undefined);
              setRoute([]);
              setSelectedCable(undefined);
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
          <button
            type="button"
            onClick={() => {
              simulation.stop();
              replace(createDoorProject());
              setSelected(undefined);
              setSelectedCable(undefined);
            }}
          >
            Стенд одной двери
          </button>
          <button
            type="button"
            onClick={() => {
              simulation.stop();
              replace(createDoorProject(true));
              setSelected(undefined);
              setSelectedCable(undefined);
            }}
          >
            Готовый пример
          </button>
          <button
            type="button"
            onClick={() => {
              simulation.stop();
              replace(createTwoControllersProject());
              setSelected(undefined);
              setSelectedCable(undefined);
              setSelectedPlan(undefined);
              setOpenControllers([]);
            }}
          >
            Два контроллера
          </button>
          <button
            type="button"
            onClick={() => {
              simulation.stop();
              replace(createOsdpReaderProject());
              setSelected(undefined);
              setSelectedCable(undefined);
              setSelectedPlan(undefined);
              setOpenControllers([]);
            }}
          >
            Пример OSDP-считывателя
          </button>
          <div className="palette-footer">
            Свободный монтаж
            <br />
            <span>Расположите оборудование на плане объекта.</span>
          </div>
        </aside>
        <Workbench
          project={project}
          selected={selected}
          onSelect={(id) => {
            setSelected(id);
            setSelectedCable(undefined);
            setSelectedPlan(undefined);
          }}
          onAdd={addDevice}
          grid={grid}
          floorId={floorId}
          planTool={planTool}
          wallStart={wallStart}
          selectedPlan={selectedPlan}
          doorStates={Object.fromEntries(
            project.plan.doors.map((door) => {
              const controller = project.devices.find((item) => item.id === door.controllerId),
                point = controller?.controller?.points.find((item) => item.id === door.pointId);
              return [
                door.id,
                {
                  open:
                    simulation.active &&
                    simulation.state.inputStates[`${door.controllerId}/${door.pointId}`] === "open",
                  unlocked: Boolean(
                    point && simulation.active && lockIsOpen(project, simulation.circuit, point.lockId),
                  ),
                },
              ];
            }),
          )}
          onPlanSelect={(selection) => {
            setSelectedPlan(selection);
            setSelected(undefined);
            setSelectedCable(undefined);
          }}
          onPlanMove={(selection, point) =>
            change((draft) => {
              const wall = draft.plan.walls.find((item) => item.id === selection.id);
              if (wall) {
                const dx = point.x - wall.from.x,
                  dy = point.y - wall.from.y;
                wall.from = point;
                wall.to = { x: wall.to.x + dx, y: wall.to.y + dy };
                for (const door of draft.plan.doors.filter((door) => door.wallId === wall.id)) {
                  door.position.x += dx;
                  door.position.y += dy;
                }
              }
              const item =
                draft.plan.doors.find((item) => item.id === selection.id) ??
                draft.plan.rooms.find((item) => item.id === selection.id);
              if (item) item.position = point;
            })
          }
          powered={simulation.active ? simulation.circuit.powered : undefined}
          detail={detail}
          pending={pending}
          route={route}
          selectedCable={selectedCable}
          onTerminal={connect}
          onCable={(id) => {
            setSelectedCable(id);
            setSelected(undefined);
          }}
          onRouteMove={(id, index, point) =>
            change((draft) => {
              const item = draft.cables.find((item) => item.id === id);
              const previous = item?.route[index];
              if (item && previous) item.route[index] = { ...point, id: previous.id };
            })
          }
          onRouteAdd={(id, point) =>
            change((draft) => {
              draft.cables.find((item) => item.id === id)?.route.push({ ...point, id: crypto.randomUUID() });
            })
          }
          calibrating={calibrating}
          marks={marks}
          onPlanClick={planClick}
          onBackgroundMove={(point) =>
            change((draft) => {
              const bg = backgroundFor(draft, floorId);
              if (bg) Object.assign(bg, point);
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
          {selectedPlan ? (
            <PlanObjectPanel project={project} selection={selectedPlan} change={change} onDelete={removePlan} />
          ) : cable ? (
            <CablePanel
              cable={cable}
              project={project}
              change={change}
              onDelete={() => {
                change((draft) => {
                  draft.cables = draft.cables.filter((item) => item.id !== cable.id);
                });
                setSelectedCable(undefined);
              }}
            />
          ) : instance && model ? (
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
              {simulation.active && (
                <p className={simulation.circuit.powered[instance.id] ? "power-on" : "muted"}>
                  Питание: {simulation.circuit.powered[instance.id] ? "есть" : "нет"} ·{" "}
                  {simulation.circuit.voltages[instance.id]?.toFixed(2) ?? "—"} В
                </p>
              )}
              {model.electrical && model.electrical.buses.length > 0 && (
                <button
                  type="button"
                  disabled={simulation.status !== "running"}
                  onClick={() => simulation.dispatch({ type: "reboot", deviceId: instance.id })}
                >
                  Перезапустить модуль
                </button>
              )}
              {instance.controller && (
                <button
                  type="button"
                  className="primary wide"
                  onClick={() =>
                    setOpenControllers((current) => [...current.filter((id) => id !== instance.id), instance.id])
                  }
                >
                  Открыть веб-интерфейс
                </button>
              )}
              <DeviceSettings
                instance={instance}
                model={model}
                onChange={(settings) =>
                  change((draft) => {
                    const item = draft.devices.find((device) => device.id === selected);
                    if (item) Object.assign(item.settings, settings);
                  })
                }
              />
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
              floorId={floorId}
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
      {showSimulation && (
        <SimulationPanel project={project} simulation={simulation} onClose={() => setShowSimulation(false)} />
      )}
      {showLesson && (
        <LessonPanel
          project={project}
          simulation={simulation}
          onClose={() => setShowLesson(false)}
          onStart={(id) => {
            simulation.stop();
            replace(createScenarioProject(id));
            setSelected(undefined);
            setSelectedCable(undefined);
            setSelectedPlan(undefined);
            setPending(undefined);
            setPlanTool("select");
            setOpenControllers([]);
          }}
        />
      )}
      {openControllers.map((id, index) => {
        const controller = project.devices.find((device) => device.id === id);
        return controller?.controller ? (
          <ControllerWindow
            key={id}
            project={project}
            controller={controller}
            simulation={simulation}
            change={change}
            order={index}
            onClose={() => setOpenControllers((current) => current.filter((item) => item !== id))}
            onRaise={() =>
              setOpenControllers((current) =>
                current.at(-1) === id ? current : [...current.filter((item) => item !== id), id],
              )
            }
          />
        ) : null;
      })}
      <footer className="statusbar">
        <span>Объект / {project.plan.floors.find((floor) => floor.id === floorId)?.name}</span>
        <span>Локальный проект · Ctrl+Z — отмена · Ctrl+Shift+Z — повтор</span>
      </footer>
    </div>
  );
}
