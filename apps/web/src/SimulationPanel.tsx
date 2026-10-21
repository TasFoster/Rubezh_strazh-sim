import { getDevice } from "@strazh-sim/content";
import { lockIsOpen, type Project } from "@strazh-sim/core";
import { useState } from "react";
import type { SimulationController } from "./useSimulation";

type Props = { project: Project; simulation: SimulationController; onClose: () => void };
export function SimulationPanel({ project, simulation: sim, onClose }: Props) {
  const [tab, setTab] = useState("actions");
  const [red, setRed] = useState("");
  const [black, setBlack] = useState("");
  const [mode, setMode] = useState("voltage");
  const [cardId, setCardId] = useState("1001");
  const options = project.devices.flatMap((device) =>
    getDevice(device.modelId).terminals.map((terminal) => ({
      value: JSON.stringify({ deviceId: device.id, terminalId: terminal.id }),
      label: `${device.name} / ${terminal.id}`,
    })),
  );
  let reading = "Выберите два щупа";
  if (red && black) {
    if (mode === "resistance" && sim.active) reading = "Остановите симуляцию перед измерением сопротивления";
    else if (mode === "voltage" && !sim.active) reading = "Симуляция остановлена";
    else {
      const a = JSON.parse(red),
        b = JSON.parse(black);
      const value = mode === "voltage" ? sim.circuit.voltage(a, b) : sim.circuit.resistance(a, b);
      reading =
        value === undefined
          ? "Нет общего электрического отсчёта"
          : !Number.isFinite(value)
            ? "OL · цепь разомкнута или расчёт недоступен"
            : `${value.toFixed(mode === "voltage" ? 3 : 2)} ${mode === "voltage" ? "В" : "Ом"}`;
    }
  }
  return (
    <section className="simulation-panel" aria-label="Панель симуляции">
      <div className="simulation-tabs">
        {[
          ["actions", "Действия"],
          ["meter", "Мультиметр"],
          ["diagnostics", "Диагностика"],
          ["events", "Журнал"],
        ].map(([id, label]) => (
          <button type="button" key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id ?? "actions")}>
            {label}
          </button>
        ))}
        <span className="toolbar-spacer" />
        <span>{(sim.state.timeMs / 1000).toFixed(1)} с</span>
        <button type="button" onClick={onClose}>
          Скрыть
        </button>
      </div>
      <div className="simulation-content">
        {tab === "actions" && (
          <>
            <label className="card-field">
              Код карты
              <input value={cardId} maxLength={80} onChange={(event) => setCardId(event.target.value)} />
            </label>
            {project.devices.flatMap(
              (controller) =>
                controller.controller?.points.map((point) => (
                  <div className="point-actions" key={`${controller.id}/${point.id}`}>
                    <div>
                      <strong>{point.name}</strong>
                      <small>
                        {controller.name} ·{" "}
                        {sim.active && lockIsOpen(project, sim.circuit, point.lockId)
                          ? "Замок отпущен"
                          : "Замок удерживает"}
                      </small>
                    </div>
                    <button
                      type="button"
                      disabled={sim.status !== "running"}
                      onClick={() =>
                        sim.dispatch({ type: "card", controllerId: controller.id, pointId: point.id, cardId })
                      }
                    >
                      Приложить карту
                    </button>
                    <button
                      type="button"
                      disabled={sim.status !== "running"}
                      onClick={() =>
                        sim.dispatch({
                          type: "button",
                          deviceId: point.buttonId,
                          pressed: !sim.state.contacts[point.buttonId],
                        })
                      }
                    >
                      {sim.state.contacts[point.buttonId] ? "Отпустить кнопку" : "Нажать кнопку"}
                    </button>
                    <button
                      type="button"
                      disabled={sim.status !== "running"}
                      onClick={() =>
                        sim.dispatch({
                          type: "door",
                          controllerId: controller.id,
                          pointId: point.id,
                          open: sim.state.contacts[point.contactId] !== false,
                        })
                      }
                    >
                      {sim.state.contacts[point.contactId] === false ? "Закрыть дверь" : "Открыть дверь"}
                    </button>
                  </div>
                )) ?? [],
            )}
            {!project.devices.some((device) => device.controller?.points.length) && (
              <p className="muted">Создайте точку доступа в интерфейсе контроллера.</p>
            )}
          </>
        )}
        {tab === "meter" && (
          <div className="meter">
            <label>
              Режим
              <select value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="voltage">Напряжение DC</option>
                <option value="resistance">Сопротивление / целостность</option>
              </select>
            </label>
            {[
              ["Красный щуп", red, setRed],
              ["Чёрный щуп", black, setBlack],
            ].map(([label, value, setter]) => (
              <label key={String(label)}>
                {String(label)}
                <select
                  value={String(value)}
                  onChange={(event) => {
                    if (typeof setter === "function") setter(event.target.value);
                  }}
                >
                  <option value="">Выберите клемму</option>
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <output>{reading}</output>
          </div>
        )}
        {tab === "diagnostics" && (
          <div className="diagnostic-list">
            {!sim.active ? (
              <p>Запустите симуляцию для проверки питания и связи.</p>
            ) : (
              <>
                {sim.circuit.diagnostics.map((item) => (
                  <p key={`${item.code}/${item.deviceId ?? item.message}`}>⚠ {item.message}</p>
                ))}
                {sim.links
                  .filter((link) => link.status !== "online")
                  .map((link) => (
                    <p key={`${link.controllerId}/${link.moduleId}/${link.line}`}>
                      OSDP {link.address}: {link.status}
                    </p>
                  ))}
                {!sim.circuit.diagnostics.length && sim.links.every((link) => link.status === "online") && (
                  <p>Ошибок в поддерживаемых электрических цепях не обнаружено.</p>
                )}
              </>
            )}
          </div>
        )}
        {tab === "events" && (
          <div className="event-list">
            {sim.state.events
              .slice()
              .reverse()
              .map((event) => (
                <div key={event.sequence}>
                  <time>{(event.timeMs / 1000).toFixed(1)} с</time>
                  <span>{project.devices.find((device) => device.id === event.controllerId)?.name ?? "Система"}</span>
                  <span>{event.message}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}
