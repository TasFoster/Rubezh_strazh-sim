import { getDevice } from "@strazh-sim/content";
import { backgroundFor, type Endpoint, type Position, type Project } from "@strazh-sim/core";
import { useEffect, useRef, useState } from "react";
import { cardSize, endpointPosition, terminalPoint } from "./geometry";
import { kindLabel } from "./labels";
import type { PlanSelection } from "./PlanObjectPanel";
export type Camera = { x: number; y: number; zoom: number };
type Props = {
  project: Project;
  selected: string | undefined;
  onSelect: (id: string | undefined) => void;
  onMove: (id: string, point: Position) => void;
  onAdd: (modelId: string, point: Position) => void;
  grid: boolean;
  floorId: string;
  planTool: string;
  selectedPlan: PlanSelection | undefined;
  wallStart: Position | undefined;
  doorStates: Readonly<Record<string, { open: boolean; unlocked: boolean }>>;
  onPlanSelect: (selection: PlanSelection) => void;
  onPlanMove: (selection: PlanSelection, point: Position) => void;
  detail: boolean;
  powered: Readonly<Record<string, boolean>> | undefined;
  pending: Endpoint | undefined;
  route: Position[];
  selectedCable: string | undefined;
  onTerminal: (endpoint: Endpoint) => void;
  onCable: (id: string) => void;
  onRouteMove: (cableId: string, index: number, point: Position) => void;
  onRouteAdd: (cableId: string, point: Position) => void;
  calibrating: boolean;
  marks: Position[];
  onPlanClick: (point: Position) => void;
  onBackgroundMove: (point: Position) => void;
};
export function Workbench({
  project,
  selected,
  onSelect,
  onMove,
  onAdd,
  grid,
  floorId,
  planTool,
  selectedPlan,
  wallStart,
  doorStates,
  onPlanSelect,
  onPlanMove,
  detail,
  powered,
  pending,
  route,
  selectedCable,
  onTerminal,
  onCable,
  onRouteMove,
  onRouteAdd,
  calibrating,
  marks,
  onPlanClick,
  onBackgroundMove,
}: Props) {
  const background = backgroundFor(project, floorId);
  const svg = useRef<SVGSVGElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const [drag, setDrag] = useState<{ id: string; offset: Position; point: Position }>();
  const pan = useRef<{ x: number; y: number; camera: Camera } | undefined>(undefined);
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const pointAt = (clientX: number, clientY: number) => {
    const rect = svg.current?.getBoundingClientRect();
    return {
      x: camera.x + (clientX - (rect?.left ?? 0)) / camera.zoom,
      y: camera.y + (clientY - (rect?.top ?? 0)) / camera.zoom,
    };
  };
  const snap = (point: Position) =>
    grid ? { x: Math.round(point.x / 20) * 20, y: Math.round(point.y / 20) * 20 } : point;
  const zoomAt = (factor: number, x = size.width / 2, y = size.height / 2) => {
    setCamera((old) => {
      const zoom = Math.max(0.2, Math.min(3, old.zoom * factor));
      return { zoom, x: old.x + x / old.zoom - x / zoom, y: old.y + y / old.zoom - y / zoom };
    });
  };
  return (
    <div className="workspace">
      <div className="canvas-tools">
        <button type="button" onClick={() => zoomAt(1.25)} aria-label="Увеличить">
          +
        </button>
        <span>{Math.round(camera.zoom * 100)}%</span>
        <button type="button" onClick={() => zoomAt(0.8)} aria-label="Уменьшить">
          −
        </button>
        <button
          type="button"
          onClick={() => {
            if (!project.devices.length) return;
            const minX = Math.min(...project.devices.map((device) => device.position.x)) - 30;
            const minY = Math.min(...project.devices.map((device) => device.position.y)) - 60;
            const maxX =
              Math.max(
                ...project.devices.map(
                  (device) => device.position.x + cardSize(getDevice(device.modelId), detail).width,
                ),
              ) + 30;
            const maxY =
              Math.max(
                ...project.devices.map(
                  (device) => device.position.y + cardSize(getDevice(device.modelId), detail).height,
                ),
              ) + 30;
            setCamera({
              x: minX,
              y: minY,
              zoom: Math.max(0.2, Math.min(1.5, size.width / (maxX - minX), size.height / (maxY - minY))),
            });
          }}
        >
          Весь объект
        </button>
        <button type="button" onClick={() => setCamera({ x: 0, y: 0, zoom: 1 })}>
          К началу
        </button>
      </div>
      <svg
        ref={svg}
        className="workbench"
        aria-label="План объекта"
        role="img"
        viewBox={`${camera.x} ${camera.y} ${size.width / camera.zoom} ${size.height / camera.zoom}`}
        onPointerDownCapture={(event) => {
          if (
            event.button === 0 &&
            (planTool !== "select" || ((calibrating || pending) && event.target === event.currentTarget))
          ) {
            event.stopPropagation();
            onPlanClick(snap(pointAt(event.clientX, event.clientY)));
          }
        }}
        onContextMenu={(event) => event.preventDefault()}
        onWheel={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          zoomAt(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - rect.left, event.clientY - rect.top);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const model = event.dataTransfer.getData("application/strazh-model");
          if (model) onAdd(model, snap(pointAt(event.clientX, event.clientY)));
        }}
        onPointerDown={(event) => {
          if (event.button === 1 || event.button === 2 || (event.target === event.currentTarget && event.altKey)) {
            pan.current = { x: event.clientX, y: event.clientY, camera };
            event.currentTarget.setPointerCapture(event.pointerId);
          } else if (event.target === event.currentTarget) onSelect(undefined);
        }}
        onPointerMove={(event) => {
          if (pan.current) {
            const origin = pan.current;
            setCamera({
              ...origin.camera,
              x: origin.camera.x - (event.clientX - origin.x) / camera.zoom,
              y: origin.camera.y - (event.clientY - origin.y) / camera.zoom,
            });
          } else if (drag) {
            const point = pointAt(event.clientX, event.clientY);
            setDrag({ ...drag, point: snap({ x: point.x - drag.offset.x, y: point.y - drag.offset.y }) });
          }
        }}
        onPointerUp={() => {
          if (drag) {
            if (drag.id.startsWith("__plan|")) {
              const [, kind, id] = drag.id.split("|");
              if (id && (kind === "wall" || kind === "room" || kind === "door")) onPlanMove({ kind, id }, drag.point);
            } else if (drag.id.startsWith("__route|")) {
              const [, cableId, index] = drag.id.split("|");
              if (cableId && index) onRouteMove(cableId, Number(index), drag.point);
            } else if (drag.id === "__background") onBackgroundMove(drag.point);
            else onMove(drag.id, drag.point);
          }
          setDrag(undefined);
          pan.current = undefined;
        }}
        onPointerCancel={() => {
          setDrag(undefined);
          pan.current = undefined;
        }}
      >
        <title>Рабочее поле: колесо — масштаб, правая кнопка — перемещение камеры</title>
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#c5d1dd" />
          </pattern>
        </defs>
        {grid && (
          <rect
            x={camera.x}
            y={camera.y}
            width={size.width / camera.zoom}
            height={size.height / camera.zoom}
            fill="url(#grid)"
            pointerEvents="none"
          />
        )}
        {background &&
          (() => {
            const bg = background;
            const pos = drag?.id === "__background" ? drag.point : bg;
            return (
              <image
                href={bg.dataUrl}
                x={pos.x}
                y={pos.y}
                width={bg.width}
                height={bg.height}
                transform={`rotate(${bg.rotation} ${pos.x + bg.width / 2} ${pos.y + bg.height / 2})`}
                opacity={bg.opacity}
                pointerEvents={bg.locked ? "none" : "auto"}
                onPointerDown={(event) => {
                  if (event.button !== 0 || bg.locked) return;
                  event.stopPropagation();
                  const point = pointAt(event.clientX, event.clientY);
                  setDrag({
                    id: "__background",
                    offset: { x: point.x - bg.x, y: point.y - bg.y },
                    point: { x: bg.x, y: bg.y },
                  });
                  svg.current?.setPointerCapture(event.pointerId);
                }}
              />
            );
          })()}
        {marks.length === 2 && (
          <line
            x1={marks[0]?.x}
            y1={marks[0]?.y}
            x2={marks[1]?.x}
            y2={marks[1]?.y}
            stroke="#d88a20"
            strokeWidth="2"
            strokeDasharray="6 4"
            pointerEvents="none"
          />
        )}
        {marks.map((point, index) => (
          <circle
            key={index === 0 ? "first" : "second"}
            cx={point.x}
            cy={point.y}
            r="6"
            fill="#d88a20"
            pointerEvents="none"
          />
        ))}
        {project.plan.rooms
          .filter((room) => room.floorId === floorId)
          .map((room) => {
            const position = drag?.id === `__plan|room|${room.id}` ? drag.point : room.position;
            return (
              <g key={room.id}>
                <rect
                  x={position.x}
                  y={position.y}
                  width={room.width}
                  height={room.height}
                  fill="#ddeae5"
                  fillOpacity="0.45"
                  stroke={selectedPlan?.id === room.id ? "#27838a" : "#aabdb4"}
                  strokeWidth="2"
                  strokeDasharray="5 3"
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.stopPropagation();
                    onPlanSelect({ kind: "room", id: room.id });
                    const p = pointAt(event.clientX, event.clientY);
                    setDrag({
                      id: `__plan|room|${room.id}`,
                      offset: { x: p.x - position.x, y: p.y - position.y },
                      point: position,
                    });
                    svg.current?.setPointerCapture(event.pointerId);
                  }}
                />
                <text x={position.x + 12} y={position.y + 22} fontSize="12" fill="#647b71" pointerEvents="none">
                  {room.name}
                </text>
              </g>
            );
          })}
        {project.plan.walls
          .filter((wall) => wall.floorId === floorId)
          .map((wall) => {
            const from = drag?.id === `__plan|wall|${wall.id}` ? drag.point : wall.from;
            const to = { x: wall.to.x + from.x - wall.from.x, y: wall.to.y + from.y - wall.from.y };
            return (
              <g key={wall.id}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={selectedPlan?.id === wall.id ? "#27838a" : "#81939d"}
                  strokeWidth="9"
                  strokeLinecap="round"
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.stopPropagation();
                    onPlanSelect({ kind: "wall", id: wall.id });
                    const p = pointAt(event.clientX, event.clientY);
                    setDrag({
                      id: `__plan|wall|${wall.id}`,
                      offset: { x: p.x - from.x, y: p.y - from.y },
                      point: from,
                    });
                    svg.current?.setPointerCapture(event.pointerId);
                  }}
                />
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2 - 12}
                  fontSize="10"
                  fill="#5f7480"
                  pointerEvents="none"
                >
                  {(Math.hypot(to.x - from.x, to.y - from.y) * project.plan.metersPerUnit).toFixed(2)} м
                </text>
              </g>
            );
          })}
        {wallStart && <circle cx={wallStart.x} cy={wallStart.y} r="7" fill="#e2af40" pointerEvents="none" />}
        {project.plan.doors
          .filter((door) => door.floorId === floorId)
          .map((door) => {
            const position = drag?.id === `__plan|door|${door.id}` ? drag.point : door.position;
            const state = doorStates[door.id];
            return (
              <g
                key={door.id}
                transform={`translate(${position.x} ${position.y}) rotate(${door.rotation})`}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.stopPropagation();
                  onPlanSelect({ kind: "door", id: door.id });
                  const p = pointAt(event.clientX, event.clientY);
                  setDrag({
                    id: `__plan|door|${door.id}`,
                    offset: { x: p.x - position.x, y: p.y - position.y },
                    point: position,
                  });
                  svg.current?.setPointerCapture(event.pointerId);
                }}
              >
                <rect
                  x="-6"
                  y="-12"
                  width={door.width + 12}
                  height="25"
                  fill="#edf2f6"
                  stroke={selectedPlan?.id === door.id ? "#27838a" : "none"}
                />
                <path
                  d={`M ${door.width} 0 A ${door.width} ${door.width} 0 0 0 0 ${-door.width}`}
                  fill="none"
                  stroke="#96aab0"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />
                <line
                  x1="0"
                  y1="0"
                  x2={state?.open ? 0 : door.width}
                  y2={state?.open ? -door.width : 0}
                  stroke={state?.unlocked ? "#409e79" : "#657f8c"}
                  strokeWidth="5"
                />
                <circle r="5" fill="#657f8c" />
                <text x="8" y="20" fontSize="9" fill="#657f8c">
                  Дверь
                </text>
              </g>
            );
          })}
        {project.cables
          .filter((cable) => cable.floorId === floorId)
          .map((cable) => (
            <g key={cable.id}>
              {cable.cores.map((core) => {
                const from = endpointPosition(project, core.from, detail, drag),
                  to = endpointPosition(project, core.to, detail, drag);
                const nodes = cable.route.map((point, index) =>
                  drag?.id === `__route|${cable.id}|${index}` ? drag.point : point,
                );
                const points = [from, ...nodes, to].map((point) => `${point.x},${point.y}`).join(" ");
                return (
                  <g key={core.id}>
                    <polyline
                      points={points}
                      fill="none"
                      stroke={selectedCable === cable.id ? "#e2af40" : "#fff"}
                      strokeWidth={selectedCable === cable.id ? 7 : 5}
                      pointerEvents="none"
                    />
                    {/* biome-ignore lint/a11y/useSemanticElements: SVG cable has keyboard interaction. */}
                    <polyline
                      role="button"
                      tabIndex={0}
                      aria-label={`Кабель ${cable.name}`}
                      points={points}
                      fill="none"
                      stroke={core.color}
                      strokeWidth="2.5"
                      strokeDasharray={core.broken ? "5 4" : undefined}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        onCable(cable.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") onCable(cable.id);
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        onRouteAdd(cable.id, snap(pointAt(event.clientX, event.clientY)));
                      }}
                    />
                  </g>
                );
              })}
              {selectedCable === cable.id &&
                cable.route.map((point, index) => (
                  <circle
                    key={point.id}
                    cx={drag?.id === `__route|${cable.id}|${index}` ? drag.point.x : point.x}
                    cy={drag?.id === `__route|${cable.id}|${index}` ? drag.point.y : point.y}
                    r="6"
                    fill="#e2af40"
                    stroke="#fff"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setDrag({ id: `__route|${cable.id}|${index}`, offset: { x: 0, y: 0 }, point });
                      svg.current?.setPointerCapture(event.pointerId);
                    }}
                  />
                ))}
            </g>
          ))}
        {pending && (
          <polyline
            points={[endpointPosition(project, pending, detail, drag), ...route]
              .map((point) => `${point.x},${point.y}`)
              .join(" ")}
            fill="none"
            stroke="#df9b2b"
            strokeWidth="3"
            strokeDasharray="6 4"
            pointerEvents="none"
          />
        )}
        {project.devices
          .filter((instance) => instance.floorId === floorId)
          .map((instance) => {
            const model = getDevice(instance.modelId);
            const position = drag?.id === instance.id ? drag.point : instance.position;
            const size = cardSize(model, detail);
            return (
              // biome-ignore lint/a11y/useSemanticElements: SVG device group supports keyboard selection.
              <g
                key={instance.id}
                transform={`translate(${position.x} ${position.y}) rotate(${instance.rotation} ${size.width / 2} ${size.height / 2})`}
                role="button"
                tabIndex={0}
                aria-label={`Устройство ${instance.name}`}
                aria-pressed={selected === instance.id}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSelect(instance.id);
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.stopPropagation();
                  onSelect(instance.id);
                  const point = pointAt(event.clientX, event.clientY);
                  setDrag({
                    id: instance.id,
                    offset: { x: point.x - position.x, y: point.y - position.y },
                    point: position,
                  });
                  svg.current?.setPointerCapture(event.pointerId);
                }}
              >
                <rect
                  width={size.width}
                  height={size.height}
                  rx="10"
                  fill="white"
                  stroke={selected === instance.id ? "#206f76" : "#bccad5"}
                  strokeWidth={selected === instance.id ? 3 : 1.5}
                />
                <rect
                  x="12"
                  y="14"
                  width="5"
                  height="24"
                  rx="2"
                  fill={powered ? (powered[instance.id] ? "#46ad7e" : "#c4cfd7") : "#206f76"}
                />
                <text x="26" y="28" fontSize="12" fontWeight="700">
                  {instance.name.length > (detail ? 32 : 20)
                    ? `${instance.name.slice(0, detail ? 30 : 18)}…`
                    : instance.name}
                </text>
                <text x="14" y="52" fontSize="11" fill="#657786">
                  {model.kind === "access_module" ? `OSDP · адрес ${instance.settings.address}` : kindLabel[model.kind]}
                </text>
                {detail ? (
                  model.terminals.map((terminal, index) => {
                    const point = terminalPoint(model, index, detail);
                    const right = index % 2 === 1;
                    return (
                      <g key={terminal.id}>
                        <text
                          x={right ? size.width - 10 : 10}
                          y={point.y + 3}
                          fontSize="9"
                          textAnchor={right ? "end" : "start"}
                          fill="#5f7383"
                          pointerEvents="none"
                        >
                          {terminal.label} <tspan fill="#9caab3">{terminal.block}</tspan>
                        </text>
                        {/* biome-ignore lint/a11y/useSemanticElements: SVG terminal supports keyboard wiring. */}
                        <circle
                          role="button"
                          tabIndex={0}
                          aria-label={`Клемма ${instance.id}/${terminal.id}`}
                          cx={point.x}
                          cy={point.y}
                          r="5"
                          fill={
                            pending?.deviceId === instance.id && pending.terminalId === terminal.id
                              ? "#e2af40"
                              : "#3c8589"
                          }
                          stroke="white"
                          strokeWidth="1.5"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            onTerminal({ deviceId: instance.id, terminalId: terminal.id });
                          }}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onTerminal({ deviceId: instance.id, terminalId: terminal.id });
                            }
                          }}
                        >
                          <title>
                            {terminal.id}: {terminal.note ?? terminal.label}
                          </title>
                        </circle>
                      </g>
                    );
                  })
                ) : (
                  <text x="14" y="74" fontSize="10" fill="#8795a3">
                    {model.terminals.length} клемм · {instance.rotation}°
                  </text>
                )}
              </g>
            );
          })}
      </svg>
      {!project.devices.length && (
        <div className="empty-state">
          <strong>Начните с оборудования</strong>
          <p>
            Перетащите компонент из панели на план
            <br />
            или нажмите на его название.
          </p>
        </div>
      )}
      <div className="canvas-hint">Колесо — масштаб · Правая кнопка — камера · Delete — удалить</div>
    </div>
  );
}
