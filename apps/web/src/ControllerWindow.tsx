import { devices, getDevice } from "@strazh-sim/content";
import {
  AccessPointSchema,
  type ControllerConfig,
  ControllerConfigSchema,
  type DeviceInstance,
  lockIsOpen,
  type Project,
  parseProject,
  prunePlanBindings,
} from "@strazh-sim/core";
import { useEffect, useRef, useState } from "react";
import { linkLabel } from "./labels";
import type { SimulationController } from "./useSimulation";

type Props = {
  project: Project;
  controller: DeviceInstance;
  simulation: SimulationController;
  change: (recipe: (draft: Project) => void) => void;
  onClose: () => void;
  onRaise: () => void;
  order: number;
};
const pages = [
  ["system", "О системе"],
  ["network", "Сеть"],
  ["time", "Дата/Время"],
  ["osdp", "Настройки OSDP"],
  ["search", "Поиск устройств"],
  ["devices", "Карта устройств"],
  ["points", "Точки доступа"],
  ["cards", "Сотрудники и карты"],
  ["events", "Журнал событий"],
] as const;
function clampWindow(point: { x: number; y: number }) {
  const width = Math.min(1050, window.innerWidth - 32),
    height = Math.min(620, window.innerHeight - 100);
  return {
    x: Math.max(12, Math.min(window.innerWidth - width - 12, point.x)),
    y: Math.max(12, Math.min(window.innerHeight - height - 12, point.y)),
  };
}
export function ControllerWindow({ project, controller, simulation: sim, change, onClose, onRaise, order }: Props) {
  const [position, setPosition] = useState(() => clampWindow({ x: 120 + (order % 3) * 24, y: 125 + (order % 3) * 18 }));
  useEffect(() => {
    const resize = () => setPosition((point) => clampWindow(point));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const drag = useRef<{ x: number; y: number; origin: { x: number; y: number } } | undefined>(undefined);
  const config = controller.controller ?? ControllerConfigSchema.parse({});
  const [page, setPage] = useState("system");
  const [message, setMessage] = useState("");
  const [network, setNetwork] = useState({
    ip: config.ip,
    mask: config.mask,
    gateway: config.gateway,
    networkMode: config.networkMode,
  });
  const [time, setTime] = useState(config.time);
  const [scan, setScan] = useState(false);
  const [pointName, setPointName] = useState("Дверь 1");
  const [relay, setRelay] = useState(1);
  const [exitReaderId, setExitReaderId] = useState("");
  const [unlockMs, setUnlockMs] = useState(3000);
  const find = (kind: string) => project.devices.find((device) => getDevice(device.modelId).kind === kind)?.id ?? "";
  const [bindings, setBindings] = useState({
    moduleId: config.modules[0] ?? find("access_module"),
    readerId: find("reader"),
    lockId: find("lock"),
    buttonId: find("exit_button"),
    contactId: find("door_contact"),
  });
  const [cardId, setCardId] = useState("1001");
  const [owner, setOwner] = useState("");
  const [rights, setRights] = useState<string[]>([]);
  const online = sim.active && sim.circuit.powered[controller.id];
  const update = (recipe: (next: ControllerConfig) => void) =>
    change((draft) => {
      const item = draft.devices.find((item) => item.id === controller.id);
      if (item?.controller) recipe(item.controller);
      prunePlanBindings(draft);
    });
  const saveNetwork = () => {
    const result = ControllerConfigSchema.safeParse({ ...config, ...network });
    if (!result.success) {
      setMessage("Проверьте IPv4-адрес, маску и шлюз");
      return;
    }
    update((next) => Object.assign(next, network));
    setMessage("Сетевые настройки сохранены");
  };
  const addPoint = () => {
    const point = AccessPointSchema.safeParse({
      id: crypto.randomUUID(),
      name: pointName,
      ...bindings,
      ...(exitReaderId ? { exitReaderId } : {}),
      relay,
      unlockMs,
    });
    if (!point.success) {
      setMessage("Заполните все поля точки доступа");
      return;
    }
    if (config.points.some((item) => item.moduleId === bindings.moduleId && item.relay === relay)) {
      setMessage("Это реле уже назначено точке доступа");
      return;
    }
    const draft = structuredClone(project),
      device = draft.devices.find((item) => item.id === controller.id);
    device?.controller?.points.push(point.data);
    try {
      parseProject(draft, devices);
      update((next) => next.points.push(point.data));
      setMessage("Точка доступа создана");
    } catch {
      setMessage("Модуль нужно сначала добавить в конфигурацию; проверьте привязки устройств");
    }
  };
  const removePoint = (pointId: string) =>
    update((next) => {
      next.points = next.points.filter((point) => point.id !== pointId);
      for (const card of next.cards) card.pointIds = card.pointIds.filter((id) => id !== pointId);
    });
  const addCard = () => {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(cardId) || !owner.trim() || !rights.length) {
      setMessage("Укажите код карты, сотрудника и хотя бы одну точку доступа");
      return;
    }
    if (config.cards.some((card) => card.id === cardId)) {
      setMessage("Карта уже добавлена");
      return;
    }
    const pointIds = rights.filter((id) => config.points.some((point) => point.id === id));
    const card = { id: cardId, owner: owner.trim(), pointIds, enabled: true };
    if (!pointIds.length || !ControllerConfigSchema.safeParse({ ...config, cards: [...config.cards, card] }).success) {
      setMessage("Проверьте код карты и выберите существующую точку доступа");
      return;
    }
    update((next) => next.cards.push(card));
    setMessage("Карта добавлена");
  };
  const currentLinks = sim.links.filter((link) => link.controllerId === controller.id);
  return (
    <section
      className="controller-window"
      role="dialog"
      aria-label={`Веб-интерфейс ${controller.name}`}
      style={{ zIndex: 30 + order, top: position.y, left: position.x }}
      onPointerDown={onRaise}
    >
      <div
        className="window-title"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          drag.current = { x: event.clientX, y: event.clientY, origin: position };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const origin = drag.current;
          if (origin)
            setPosition({
              ...clampWindow({
                x: origin.origin.x + event.clientX - origin.x,
                y: origin.origin.y + event.clientY - origin.y,
              }),
            });
        }}
        onPointerUp={() => {
          drag.current = undefined;
        }}
        onPointerCancel={() => {
          drag.current = undefined;
        }}
      >
        <span>Контроллер · {controller.name}</span>
        <span className="window-address">{config.ip}</span>
        <button type="button" aria-label={`Закрыть интерфейс ${controller.name}`} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="controller-nav">
        <strong>
          RUBEZH <span>STRAZH</span>
        </strong>
        <span>Система контроля доступа</span>
        <span className="toolbar-spacer" />
        <span className={online ? "online" : "offline"}>
          {online ? "На связи" : "Нет питания / симуляция остановлена"}
        </span>
      </div>
      <div className="controller-body">
        <nav>
          {pages.map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={page === id ? "current" : ""}
              onClick={() => {
                setPage(id);
                setMessage("");
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="controller-page">
          <div className="controller-page-title">
            <h2>{pages.find(([id]) => id === page)?.[1]}</h2>
            <span>Учебная эмуляция · ПО 1.7</span>
          </div>
          {message && (
            <p className="controller-message" role="status">
              {message}
            </p>
          )}
          {page === "system" && (
            <>
              <dl className="system-info">
                <dt>Модель</dt>
                <dd>{getDevice(controller.modelId).name}</dd>
                <dt>Имя</dt>
                <dd>{controller.name}</dd>
                <dt>IP-адрес</dt>
                <dd>{config.ip}</dd>
                <dt>Модули в конфигурации</dt>
                <dd>{config.modules.length}</dd>
                <dt>Точки доступа</dt>
                <dd>{config.points.length}</dd>
                <dt>Состояние</dt>
                <dd>{online ? "Работает" : "Недоступен"}</dd>
              </dl>
              <p className="muted">
                Настройте линии, найдите модуль и создайте точку доступа. Разделы представлены в объёме учебного стенда.
              </p>
            </>
          )}
          {page === "network" && (
            <div className="controller-form">
              <label>
                Установка IP-адреса
                <select
                  value={network.networkMode}
                  onChange={(event) =>
                    setNetwork({ ...network, networkMode: event.target.value === "dynamic" ? "dynamic" : "static" })
                  }
                >
                  <option value="dynamic">Динамический (учебная сеть)</option>
                  <option value="static">Статический</option>
                </select>
              </label>
              {(["ip", "mask", "gateway"] as const).map((field) => (
                <label key={field}>
                  {field === "ip" ? "IP-адрес" : field === "mask" ? "Маска подсети" : "Шлюз"}
                  <input
                    value={network[field]}
                    onChange={(event) => setNetwork({ ...network, [field]: event.target.value })}
                  />
                </label>
              ))}
              <button type="button" onClick={saveNetwork}>
                Установить
              </button>
            </div>
          )}
          {page === "time" && (
            <div className="controller-form">
              <label>
                Дата и время
                <input type="datetime-local" value={time} onChange={(event) => setTime(event.target.value)} />
              </label>
              <div className="button-row">
                <button
                  type="button"
                  onClick={() => {
                    if (!time || !Number.isFinite(Date.parse(time))) {
                      setMessage("Укажите корректную дату");
                      return;
                    }
                    update((next) => {
                      next.time = time;
                    });
                    setMessage("Время установлено");
                  }}
                >
                  Установить время
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setTime(new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                  }}
                >
                  Синхронизировать с ПК
                </button>
              </div>
            </div>
          )}
          {page === "osdp" && (
            <>
              {config.lines.map((line) => (
                <div className="line-settings" key={line.id}>
                  <h3>{line.id}</h3>
                  <label>
                    Скорость
                    <select
                      value={line.baudRate}
                      onChange={(event) =>
                        update((next) => {
                          const item = next.lines.find((item) => item.id === line.id);
                          if (item) item.baudRate = Number(event.target.value);
                        })
                      }
                    >
                      {[9600, 19200, 38400, 57600, 115200].map((rate) => (
                        <option value={rate} key={rate}>
                          {rate}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Интервал опроса, мс
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={line.pollMs}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (value >= 1 && value <= 10000)
                          update((next) => {
                            const item = next.lines.find((item) => item.id === line.id);
                            if (item) item.pollMs = value;
                          });
                      }}
                    />
                  </label>
                  <label>
                    Таймаут, мс
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={line.timeoutMs}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (value >= 1 && value <= 10000)
                          update((next) => {
                            const item = next.lines.find((item) => item.id === line.id);
                            if (item) item.timeoutMs = value;
                          });
                      }}
                    />
                  </label>
                </div>
              ))}
              <p className="muted">
                Скорости линии и модуля должны совпадать. Временные параметры сохранены; побитовый обмен OSDP пока не
                моделируется.
              </p>
            </>
          )}
          {page === "search" && (
            <>
              <button
                type="button"
                disabled={!online}
                onClick={() => {
                  setScan(true);
                  setMessage(
                    currentLinks.length
                      ? `Найдено модулей: ${new Set(currentLinks.map((link) => link.moduleId)).size}`
                      : "Модули не найдены. Проверьте питание, клеммы и скорость линии.",
                  );
                }}
              >
                Начать поиск
              </button>
              <table>
                <thead>
                  <tr>
                    <th>Модель / имя</th>
                    <th>Адрес</th>
                    <th>Линия</th>
                    <th>Состояние</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {scan && (
                    <tr>
                      <td>Плата контроллера</td>
                      <td>0</td>
                      <td>Внутренняя</td>
                      <td>{online ? "На связи" : "Нет связи"}</td>
                      <td>—</td>
                    </tr>
                  )}
                  {scan &&
                    currentLinks.map((link) => (
                      <tr key={`${link.moduleId}/${link.line}`}>
                        <td>{project.devices.find((device) => device.id === link.moduleId)?.name}</td>
                        <td>{link.address}</td>
                        <td>{link.line}</td>
                        <td>{linkLabel[link.status]}</td>
                        <td>
                          <button
                            type="button"
                            disabled={link.status !== "online" || config.modules.includes(link.moduleId)}
                            onClick={() =>
                              update((next) => {
                                if (!next.modules.includes(link.moduleId)) next.modules.push(link.moduleId);
                              })
                            }
                          >
                            {config.modules.includes(link.moduleId) ? "Добавлено" : "Добавить"}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}
          {page === "devices" && (
            <table>
              <thead>
                <tr>
                  <th>Модуль</th>
                  <th>Адрес</th>
                  <th>Связь</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {config.modules.map((moduleId) => (
                  <tr key={moduleId}>
                    <td>{project.devices.find((device) => device.id === moduleId)?.name}</td>
                    <td>{sim.state.addresses[moduleId]}</td>
                    <td>
                      {currentLinks.some((link) => link.moduleId === moduleId && link.status === "online")
                        ? "На связи"
                        : "Нет связи"}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          update((next) => {
                            next.modules = next.modules.filter((id) => id !== moduleId);
                            next.points = next.points.filter((point) => point.moduleId !== moduleId);
                            for (const card of next.cards)
                              card.pointIds = card.pointIds.filter((id) =>
                                next.points.some((point) => point.id === id),
                              );
                          })
                        }
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {page === "points" && (
            <>
              <div className="controller-form">
                <label>
                  Название точки
                  <input value={pointName} onChange={(event) => setPointName(event.target.value)} />
                </label>
                {(
                  [
                    ["moduleId", "Модуль", "access_module"],
                    ["readerId", "Считыватель", "reader"],
                    ["lockId", "Замок", "lock"],
                    ["buttonId", "Кнопка", "exit_button"],
                    ["contactId", "Геркон", "door_contact"],
                  ] as const
                ).map(([field, label, kind]) => (
                  <label key={field}>
                    {label}
                    <select
                      value={bindings[field]}
                      onChange={(event) => setBindings({ ...bindings, [field]: event.target.value })}
                    >
                      <option value="">Выберите устройство</option>
                      {project.devices
                        .filter(
                          (device) =>
                            (getDevice(device.modelId).kind === kind ||
                              (kind === "lock" && getDevice(device.modelId).kind === "turnstile")) &&
                            (kind !== "access_module" || config.modules.includes(device.id)),
                        )
                        .map((device) => (
                          <option key={device.id} value={device.id}>
                            {device.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
                <label>
                  Выходной считыватель
                  <select value={exitReaderId} onChange={(event) => setExitReaderId(event.target.value)}>
                    <option value="">Не используется</option>
                    {project.devices
                      .filter((device) => getDevice(device.modelId).kind === "reader")
                      .map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Реле
                  <select value={relay} onChange={(event) => setRelay(Number(event.target.value))}>
                    <option value="1">K1 / READER 1 / DOOR1 / EXIT1</option>
                    <option value="2">K2 / READER 2 / DOOR2 / EXIT2</option>
                  </select>
                </label>
                <label>
                  Время открытия, мс
                  <input
                    type="number"
                    min="100"
                    max="120000"
                    value={unlockMs}
                    onChange={(event) => setUnlockMs(Number(event.target.value))}
                  />
                </label>
                <button type="button" disabled={!config.modules.length} onClick={addPoint}>
                  Создать точку
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Точка</th>
                    <th>Замок</th>
                    <th>Команды</th>
                  </tr>
                </thead>
                <tbody>
                  {config.points.map((point) => (
                    <tr key={point.id}>
                      <td>{point.name}</td>
                      <td>{sim.active && lockIsOpen(project, sim.circuit, point.lockId) ? "Отпущен" : "Удерживает"}</td>
                      <td>
                        <button
                          type="button"
                          disabled={sim.status !== "running" || !online}
                          onClick={() =>
                            sim.dispatch({ type: "unlock", controllerId: controller.id, pointId: point.id })
                          }
                        >
                          Открыть
                        </button>{" "}
                        <button type="button" onClick={() => removePoint(point.id)}>
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {page === "cards" && (
            <>
              <div className="controller-form">
                <label>
                  Код карты
                  <input value={cardId} maxLength={80} onChange={(event) => setCardId(event.target.value)} />
                </label>
                <label>
                  Сотрудник
                  <input value={owner} onChange={(event) => setOwner(event.target.value)} />
                </label>
                <fieldset>
                  <legend>Доступ к точкам</legend>
                  {config.points.map((point) => (
                    <label key={point.id}>
                      <input
                        type="checkbox"
                        checked={rights.includes(point.id)}
                        onChange={(event) =>
                          setRights((current) =>
                            event.target.checked ? [...current, point.id] : current.filter((id) => id !== point.id),
                          )
                        }
                      />{" "}
                      {point.name}
                    </label>
                  ))}
                </fieldset>
                <button type="button" onClick={addCard}>
                  Добавить карту
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Карта</th>
                    <th>Сотрудник</th>
                    <th>Действует</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {config.cards.map((card) => (
                    <tr key={card.id}>
                      <td>{card.id}</td>
                      <td>{card.owner}</td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Карта ${card.id} активна`}
                          checked={card.enabled}
                          onChange={(event) =>
                            update((next) => {
                              const item = next.cards.find((item) => item.id === card.id);
                              if (item) item.enabled = event.target.checked;
                            })
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() =>
                            update((next) => {
                              next.cards = next.cards.filter((item) => item.id !== card.id);
                            })
                          }
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {page === "events" && (
            <>
              <button
                type="button"
                onClick={() => {
                  const events = sim.state.events.filter((event) => event.controllerId === controller.id);
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(events, null, 2)], { type: "application/json" }),
                  );
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "controller-events.json";
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Экспорт журнала
              </button>
              <table>
                <thead>
                  <tr>
                    <th>Время контроллера</th>
                    <th>Событие</th>
                    <th>Точка</th>
                  </tr>
                </thead>
                <tbody>
                  {sim.state.events
                    .filter((event) => event.controllerId === controller.id)
                    .slice()
                    .reverse()
                    .map((event) => (
                      <tr key={event.sequence}>
                        <td>{new Date(Date.parse(config.time) + event.timeMs).toLocaleString("ru-RU")}</td>
                        <td>{event.message}</td>
                        <td>{config.points.find((point) => point.id === event.pointId)?.name ?? "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
