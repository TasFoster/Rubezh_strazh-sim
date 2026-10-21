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
  type Project,
  parseProject,
  removeDevice,
} from "@strazh-sim/core";
import { useEffect, useRef, useState } from "react";
import { ActionMenu } from "./ActionMenu";
import { CablePanel } from "./CablePanel";
import { ControllerWindow } from "./ControllerWindow";
import { DeviceSettings } from "./DeviceSettings";
import {
  arrangeDevices,
  automaticCable,
  closestSegmentIndex,
  endpointPosition,
  freeDevicePosition,
  routeCables,
} from "./geometry";
import { HelpDialog } from "./HelpDialog";
import { LessonPanel } from "./LessonPanel";
import { kindLabel } from "./labels";
import { PlanObjectPanel, type PlanSelection } from "./PlanObjectPanel";
import { PlanPanel } from "./PlanPanel";
import { SimulationPanel } from "./SimulationPanel";
import { downloadProject } from "./storage";
import { useEditor } from "./useEditor";
import { useSimulation } from "./useSimulation";
import { Workbench } from "./Workbench";

export function App() {
  const [offlineReady, setOfflineReady] = useState(false);
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      void navigator.serviceWorker.ready.then(() => setOfflineReady(true));
  }, []);
  const editor = useEditor();
  const { project, change, replace, undo, redo } = editor;
  const simulation = useSimulation(project);
  const [showSimulation, setShowSimulation] = useState(false);
  const [showLesson, setShowLesson] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
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
  const [category, setCategory] = useState("");
  const [grid, setGrid] = useState(true);
  const [avoidCollisions, setAvoidCollisions] = useState(true);
  const [fitRequest, setFitRequest] = useState(0);
  const [calibrating, setCalibrating] = useState(false);
  const [marks, setMarks] = useState<Position[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const initialLayout = useRef(false);
  useEffect(() => {
    if (initialLayout.current) return;
    initialLayout.current = true;
    if (avoidCollisions)
      change((draft) => {
        for (const floor of draft.plan.floors) arrangeDevices(draft, detail, floor.id);
      });
  }, [avoidCollisions, detail, change]);
  const instance = project.devices.find((device) => device.id === selected);
  const cable = project.cables.find((item) => item.id === selectedCable);
  const model = instance ? getDevice(instance.modelId) : undefined;
  const cancelInteraction = () => {
    setPending(undefined);
    setRoute([]);
    setWallStart(undefined);
    setCalibrating(false);
    setMarks([]);
  };
  const clearSelection = () => {
    setSelected(undefined);
    setSelectedCable(undefined);
    setSelectedPlan(undefined);
  };
  const openProject = (next: Project) => {
    if (avoidCollisions) for (const floor of next.plan.floors) arrangeDevices(next, detail, floor.id);
    simulation.stop();
    replace(next);
    cancelInteraction();
    clearSelection();
    setPlanTool("select");
    setOpenControllers([]);
    setActiveFloor(next.plan.floors[0]?.id ?? "floor_1");
    editor.setError("");
    setFitRequest((value) => value + 1);
  };
  const chooseMode = (next: boolean) => {
    cancelInteraction();
    setPlanTool("select");
    setDetail(next);
    if (avoidCollisions)
      change((draft) => {
        for (const floor of draft.plan.floors) arrangeDevices(draft, next, floor.id);
      });
    setFitRequest((value) => value + 1);
  };
  const selectFloor = (id: string) => {
    setActiveFloor(id);
    clearSelection();
    cancelInteraction();
  };
  const addFloor = () => {
    const id = crypto.randomUUID();
    change((draft) => draft.plan.floors.push({ id, name: `Этаж ${draft.plan.floors.length + 1}` }));
    selectFloor(id);
  };
  const newProject = () => {
    if (window.confirm("Создать пустой объект? Текущий проект останется в истории отмены."))
      openProject(createProject());
  };
  const exportProject = () => {
    try {
      downloadProject(parseProject(project, devices));
    } catch {
      editor.setError("Экспорт невозможен: заполните обязательные названия и проверьте связи.");
    }
  };
  const showPlan = () => {
    clearSelection();
    cancelInteraction();
    setPlanTool("select");
  };
  const openController = (id: string) =>
    setOpenControllers((current) => [...current.filter((item) => item !== id), id]);
  const addDevice = (modelId: string, position: Position) => {
    const spec = getDevice(modelId);
    const id = crypto.randomUUID();
    const item = InstanceSchema.parse({
      id,
      modelId,
      name: spec.name,
      position,
      floorId,
      settings: { currentA: spec.electrical?.power?.currentA || 0.1 },
      ...(spec.kind === "controller" ? { controller: ControllerConfigSchema.parse({}) } : {}),
    });
    if (avoidCollisions) item.position = freeDevicePosition(project, item, detail);
    change((draft) => {
      draft.devices.push(item);
    });
    setFitRequest((value) => value + 1);
    setSelected(id);
    setSelectedPlan(undefined);
    setSelectedCable(undefined);
  };
  const connect = (endpoint: Endpoint) => {
    if (!pending) {
      setPending(endpoint);
      setRoute([]);
      return;
    }
    if (pending.deviceId !== endpoint.deviceId || pending.terminalId !== endpoint.terminalId) {
      const cableId = crypto.randomUUID();
      const from = endpointPosition(project, pending, detail);
      const to = endpointPosition(project, endpoint, detail);
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
          routing: route.length ? "manual" : "auto",
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
    if (avoidCollisions) clone.position = freeDevicePosition(project, clone, detail);
    change((draft) => draft.devices.push(clone));
    setFitRequest((value) => value + 1);
    setSelected(clone.id);
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          'input, textarea, select, [contenteditable], [role="dialog"], [role="menu"], [role="region"][aria-label="Учебное задание"]',
        )
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
      if (event.key === "Delete" && selectedCable) {
        change((draft) => {
          draft.cables = draft.cables.filter((item) => item.id !== selectedCable);
        });
        setSelectedCable(undefined);
      }
      if (event.key === "Delete" && selectedPlan) {
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
        setCalibrating(false);
        setMarks([]);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [project, selected, selectedCable, selectedPlan, change, replace, undo, redo]);
  const importFile = async (picked: File | undefined) => {
    if (!picked) return;
    try {
      if (picked.size > 15000000) throw new Error("Файл слишком большой (максимум 15 МБ)");
      const parsed = parseProject(JSON.parse(await picked.text()), devices);
      openProject(parsed);
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
        <span className="save-status" role="status">
          {editor.saved ? "● Сохранено" : editor.error ? "Не сохранено" : "Сохранение…"}
        </span>
        <ActionMenu
          label="Проект"
          items={[
            { label: "Новый объект", action: newProject },
            { label: "Открыть", action: () => file.current?.click() },
            { label: "Экспорт", action: exportProject },
            { heading: "Примеры" },
            { label: "Стенд одной двери", action: () => openProject(createDoorProject()) },
            { label: "Готовый пример", action: () => openProject(createDoorProject(true)) },
            { label: "Два контроллера", action: () => openProject(createTwoControllersProject()) },
            { label: "Пример OSDP-считывателя", action: () => openProject(createOsdpReaderProject()) },
          ]}
        />
        <ActionMenu
          label="Помощь"
          items={[
            { label: "Справка", action: () => setShowHelp(true) },
            { label: "Задания", checked: showLesson, action: () => setShowLesson(!showLesson) },
          ]}
        />
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
      <div className="toolbar" role="toolbar" aria-label="Инструменты редактора">
        <div className="history-tools">
          <button
            type="button"
            aria-label="Отменить"
            title="Отменить · Ctrl+Z"
            onClick={undo}
            disabled={!editor.canUndo}
          >
            ↶
          </button>
          <button
            type="button"
            aria-label="Повторить"
            title="Повторить · Ctrl+Shift+Z"
            onClick={redo}
            disabled={!editor.canRedo}
          >
            ↷
          </button>
        </div>
        <select
          className="mode-select"
          aria-label="Режим редактора"
          value={detail ? "wiring" : "plan"}
          onChange={(event) => chooseMode(event.target.value === "wiring")}
        >
          <option value="plan">План объекта</option>
          <option value="wiring">Монтаж / клеммы</option>
        </select>
        {!detail && (
          <select
            className="tool-select"
            aria-label="Инструмент плана"
            value={planTool}
            onChange={(event) => {
              cancelInteraction();
              clearSelection();
              setPlanTool(event.target.value);
            }}
          >
            <option value="select">Выделение</option>
            <option value="wall">Стена</option>
            <option value="room">Помещение</option>
            <option value="door">Дверь</option>
          </select>
        )}
        <ActionMenu
          label="Вид"
          items={[
            { label: "Сетка", checked: grid, action: () => setGrid(!grid) },
            { label: "Свойства плана", action: showPlan },
            { label: "Добавить этаж", action: addFloor },
            { heading: "Компоновка" },
            {
              label: "Раздвигать компоненты",
              checked: avoidCollisions,
              action: () => {
                setAvoidCollisions(!avoidCollisions);
                if (!avoidCollisions) change((draft) => arrangeDevices(draft, detail, floorId));
              },
            },
            {
              label: "Развести компоненты",
              action: () => {
                change((draft) => arrangeDevices(draft, detail, floorId));
                setFitRequest((value) => value + 1);
              },
            },
            { label: "Показать весь этаж", action: () => setFitRequest((value) => value + 1) },
          ]}
        />
        <select
          className="floor-select"
          aria-label="Этаж"
          value={floorId}
          onChange={(event) => selectFloor(event.target.value)}
        >
          {project.plan.floors.map((floor) => (
            <option key={floor.id} value={floor.id}>
              {floor.name}
            </option>
          ))}
        </select>
        <span className="toolbar-spacer" />
        {pending && <span className="pending-hint">Выберите вторую клемму · Esc — отмена</span>}
        <button
          type="button"
          className="primary"
          onClick={() => {
            cancelInteraction();
            setPlanTool("select");
            simulation.toggle();
            setShowSimulation(true);
          }}
        >
          {simulation.status === "running" ? "Пауза" : simulation.status === "paused" ? "Продолжить" : "Запустить"}
        </button>
        <ActionMenu
          label="Симуляция"
          items={[
            { label: "Приборы", checked: showSimulation, action: () => setShowSimulation(!showSimulation) },
            { label: "Сброс", disabled: !simulation.active, action: simulation.stop },
            { heading: "Контроллеры" },
            ...project.devices
              .filter((device) => device.controller)
              .map((device) => ({ label: device.name, action: () => openController(device.id) })),
          ]}
        />
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
          <select
            aria-label="Категория оборудования"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">Все категории</option>
            {Object.entries(kindLabel).map(([kind, label]) => (
              <option key={kind} value={kind}>
                {label}
              </option>
            ))}
          </select>
          <p className="muted">Перетащите на рабочее поле</p>
          {devices
            .filter(
              (device) =>
                device.name.toLowerCase().includes(query.toLowerCase()) && (!category || device.kind === category),
            )
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
                  <small>{kindLabel[device.kind]}</small>
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
          onSelect={(id) => {
            setSelected(id);
            setSelectedCable(undefined);
            setSelectedPlan(undefined);
          }}
          onAdd={addDevice}
          grid={grid}
          avoidCollisions={avoidCollisions}
          fitRequest={fitRequest}
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
            setSelectedPlan(undefined);
          }}
          onRouteMove={(id, index, point) =>
            change((draft) => {
              const item = draft.cables.find((item) => item.id === id);
              const previous = item?.route[index];
              if (item && previous) {
                item.routing = "manual";
                item.route[index] = { ...point, id: previous.id };
              }
            })
          }
          onRouteAdd={(id, point) =>
            change((draft) => {
              const cable = draft.cables.find((item) => item.id === id),
                core = cable?.cores[0];
              if (!cable || !core) return;
              if (automaticCable(cable)) {
                const path = routeCables(draft, detail, floorId).find((wire) => wire.cableId === id)?.points ?? [];
                cable.route = path.slice(1, -1).map((node) => ({ ...node, id: crypto.randomUUID() }));
              }
              const points = [
                endpointPosition(draft, core.from, detail),
                ...cable.route,
                endpointPosition(draft, core.to, detail),
              ];
              const index = closestSegmentIndex(points, point);
              cable.routing = "manual";
              cable.route.splice(index, 0, { ...point, id: crypto.randomUUID() });
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
              if (item)
                item.position = avoidCollisions ? freeDevicePosition(draft, { ...item, position }, detail) : position;
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
              <span className="eyebrow">{kindLabel[model.kind]}</span>
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
                      if (item) {
                        item.rotation = (item.rotation + 90) % 360;
                        if (avoidCollisions) item.position = freeDevicePosition(draft, item, detail);
                      }
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
                <button type="button" className="primary wide" onClick={() => openController(instance.id)}>
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
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
      {showLesson && (
        <LessonPanel
          project={project}
          simulation={simulation}
          onClose={() => setShowLesson(false)}
          onStart={(id) => openProject(createScenarioProject(id))}
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
        <span>
          Объект / {project.plan.floors.find((floor) => floor.id === floorId)?.name} ·{" "}
          {project.devices.filter((device) => device.floorId === floorId).length} устройств
        </span>
        <span>{offlineReady ? "Офлайн готов · " : ""}Ctrl+Z — отмена · Ctrl+Shift+Z — повтор</span>
      </footer>
    </div>
  );
}
