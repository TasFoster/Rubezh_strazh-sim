import { getDevice } from "@strazh-sim/content";
import { DIP_WEIGHTS, dipAddress, isValidOsdpAddress } from "@strazh-sim/core";
import { useState } from "react";

const device = getDevice("str_1ap");

export function App() {
  const [switches, setSwitches] = useState<boolean[]>(DIP_WEIGHTS.map(() => false));
  const address = dipAddress(switches);
  const valid = isValidOsdpAddress(address);

  const toggle = (index: number) => {
    setSwitches((current) => current.map((on, i) => (i === index ? !on : on)));
  };

  return (
    <main className="page">
      <header className="page__header">
        <h1>{device.name}</h1>
        <p>
          Питание {device.supply.minVoltage}–{device.supply.maxVoltage} В, до{" "}
          {device.supply.maxCurrentA.toLocaleString("ru-RU")} А. Источник: {device.source.document},{" "}
          {device.source.edition}.
        </p>
      </header>

      <section className="panel">
        <h2>Адрес на шине OSDP</h2>
        <div className="dip">
          {DIP_WEIGHTS.map((weight, index) => (
            <label className="dip__switch" key={weight}>
              <input type="checkbox" checked={switches[index] ?? false} onChange={() => toggle(index)} />
              <span>
                {index + 1} <small>(= {weight})</small>
              </span>
            </label>
          ))}
        </div>
        <p className={valid ? "dip__result" : "dip__result dip__result--error"}>
          Адрес: <strong>{address}</strong>
          {valid ? "" : " — адрес 0 использовать нельзя, включите хотя бы один переключатель"}
        </p>
      </section>

      <section className="panel">
        <h2>Клеммные колодки</h2>
        <div className="blocks">
          {device.blocks.map((block) => (
            <div className="block" key={block.id}>
              <h3>{block.label}</h3>
              <ul>
                {device.terminals
                  .filter((terminal) => terminal.block === block.id)
                  .map((terminal) => (
                    <li key={terminal.id} title={terminal.note}>
                      {terminal.label}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
