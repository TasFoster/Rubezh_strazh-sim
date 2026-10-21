import { type DeviceInstance, type DeviceSpec, DIP_WEIGHTS } from "@strazh-sim/core";

type Props = {
  instance: DeviceInstance;
  model: DeviceSpec;
  onChange: (settings: Partial<DeviceInstance["settings"]>) => void;
};
export function DeviceSettings({ instance, model, onChange }: Props) {
  const settings = instance.settings;
  return (
    <div className="device-settings">
      {model.electrical?.power && (
        <label>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />{" "}
          Питание включено
        </label>
      )}
      {model.dipAddress && (
        <>
          <h3>DIP · адрес {settings.address}</h3>
          <div className="dip-switches">
            {DIP_WEIGHTS.map((weight, index) => (
              <label key={weight}>
                <input
                  type="checkbox"
                  aria-label={`DIP ${index + 1}`}
                  checked={(settings.address & weight) !== 0}
                  onChange={() => onChange({ address: settings.address ^ weight })}
                />
                <span>{index + 1}</span>
              </label>
            ))}
          </div>
          {settings.address === 0 && <p className="warning">Адрес 0 запрещён.</p>}
          <p className="muted">Новый адрес применяется при запуске или перезапуске модуля.</p>
        </>
      )}
      {model.kind === "power_supply" && (
        <>
          <label>
            Напряжение, В
            <input
              type="number"
              min="1"
              max="60"
              value={settings.voltage}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (value > 0 && value <= 60) onChange({ voltage: value });
              }}
            />
          </label>
          <label>
            Предельный ток, А
            <input
              type="number"
              min="0.01"
              max="30"
              step="0.1"
              value={settings.maxCurrentA}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (value > 0 && value <= 30) onChange({ maxCurrentA: value });
              }}
            />
          </label>
        </>
      )}
      {model.kind === "lock" && (
        <>
          <label>
            Режим замка
            <select
              value={settings.lockMode}
              onChange={(event) =>
                onChange({ lockMode: event.target.value === "fail_safe" ? "fail_safe" : "fail_secure" })
              }
            >
              <option value="fail_safe">Открывается без питания</option>
              <option value="fail_secure">Открывается при подаче питания</option>
            </select>
          </label>
          <label>
            Ток при 12 В, А
            <input
              type="number"
              min="0.01"
              max="30"
              step="0.05"
              value={settings.currentA}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (value > 0 && value <= 30) onChange({ currentA: value });
              }}
            />
          </label>
        </>
      )}
      {model.kind === "resistor" && (
        <label>
          Сопротивление, Ом
          <input
            type="number"
            min="1"
            max="10000000"
            value={settings.resistanceOhm}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (value > 0 && value <= 10000000) onChange({ resistanceOhm: value });
            }}
          />
        </label>
      )}
      {model.electrical && model.electrical.inputs.length > 0 && (
        <details>
          <summary>Контроль линий входов</summary>
          {model.electrical.inputs.map((input) => (
            <label key={input.id}>
              <input
                type="checkbox"
                checked={settings.supervision[input.id] ?? false}
                onChange={(event) =>
                  onChange({ supervision: { ...settings.supervision, [input.id]: event.target.checked } })
                }
              />{" "}
              {input.id}
            </label>
          ))}
        </details>
      )}
      {model.jumpers.length > 0 && (
        <>
          <h3>Перемычки</h3>
          {model.jumpers.map((jumper) => (
            <label key={jumper.id} title={jumper.purpose}>
              <input
                type="checkbox"
                checked={settings.jumpers[jumper.id] ?? false}
                onChange={(event) => onChange({ jumpers: { ...settings.jumpers, [jumper.id]: event.target.checked } })}
              />{" "}
              {jumper.label}
            </label>
          ))}
        </>
      )}
    </div>
  );
}
