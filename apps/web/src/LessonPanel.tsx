import { devices, scenarios } from "@strazh-sim/content";
import { evaluateScenario, type Project } from "@strazh-sim/core";
import { useState } from "react";
import type { SimulationController } from "./useSimulation";

type Props = { project: Project; simulation: SimulationController; onStart: (id: string) => void; onClose: () => void };
export function LessonPanel({ project, simulation: sim, onStart, onClose }: Props) {
  const [chosen, setChosen] = useState(project.scenarioId ?? "commission_door");
  const [hintCount, setHintCount] = useState(0);
  const scenario = scenarios.find((scenario) => scenario.id === project.scenarioId);
  const checks = scenario ? evaluateScenario(project, devices, sim.state, scenario, sim.active) : [];
  const complete = checks.length > 0 && checks.every((check) => check.passed);
  const report = () => {
    const result = {
      scenario: scenario?.title,
      completed: complete,
      hintsUsed: hintCount,
      simulationTimeMs: sim.state.timeMs,
      checks: checks.map(({ label, passed }) => ({ label, passed })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "strazh-training-report.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="lesson-panel" aria-label="Учебное задание">
      <div className="lesson-heading">
        <strong>Учебные задания</strong>
        <button type="button" onClick={onClose}>
          Скрыть
        </button>
      </div>
      <label>
        Выберите задание
        <select value={chosen} onChange={(event) => setChosen(event.target.value)}>
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.title}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="primary wide"
        onClick={() => {
          onStart(chosen);
          setHintCount(0);
        }}
      >
        Начать задание
      </button>
      {scenario ? (
        <>
          <h2>{scenario.title}</h2>
          <p>{scenario.description}</p>
          <ul className="goal-list">
            {checks.map((check) => (
              <li key={check.id} className={check.passed ? "passed" : ""}>
                <span>{check.passed ? "✓" : "○"}</span>
                {check.label}
              </li>
            ))}
          </ul>
          <p className={complete ? "lesson-complete" : "muted"}>
            {complete
              ? "Все условия выполнены"
              : `${checks.filter((check) => check.passed).length} из ${checks.length} условий выполнено`}
          </p>
          <button
            type="button"
            disabled={hintCount >= scenario.hints.length}
            onClick={() => setHintCount((count) => count + 1)}
          >
            Следующая подсказка
          </button>
          {scenario.hints.slice(0, hintCount).map((hint) => (
            <p key={hint} className="lesson-hint">
              {hint}
            </p>
          ))}
          <button type="button" className="wide" onClick={report}>
            Скачать отчёт
          </button>
        </>
      ) : (
        <p className="muted">
          Свободный режим. Начало задания загрузит отдельный учебный объект; текущий останется в истории отмены.
        </p>
      )}
    </section>
  );
}
