import { devices } from "@strazh-sim/content";
import { createProject, type Project, parseProject } from "@strazh-sim/core";
import { useCallback, useEffect, useState } from "react";
import { loadProject, saveProject } from "./storage";

type History = { past: Project[]; present: Project; future: Project[] };
export function useEditor() {
  const [initial] = useState(() => {
    try {
      return { project: loadProject() ?? createProject(), error: "" };
    } catch {
      return {
        project: createProject(),
        error:
          "Сохранённый проект повреждён. Автосохранение отключено до открытия или создания объекта; исходная запись сохранена.",
      };
    }
  });
  const [error, setManualError] = useState(initial.error);
  const [saveError, setSaveError] = useState("");
  const setError = useCallback((message: string) => {
    setManualError(message);
    setSaveError("");
  }, []);
  const [saveBlocked, setSaveBlocked] = useState(Boolean(initial.error));
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<History>({ past: [], present: initial.project, future: [] });
  const change = useCallback((recipe: (draft: Project) => void) => {
    setHistory((current) => {
      const next = structuredClone(current.present);
      recipe(next);
      if (JSON.stringify(next) === JSON.stringify(current.present)) return current;
      return { past: [...current.past.slice(-49), current.present], present: next, future: [] };
    });
  }, []);
  const replace = useCallback((project: Project) => {
    setSaveBlocked(false);
    setHistory((current) => ({ past: [...current.past.slice(-49), current.present], present: project, future: [] }));
  }, []);
  const undo = useCallback(
    () =>
      setHistory((current) => {
        const previous = current.past.at(-1);
        return previous
          ? { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future] }
          : current;
      }),
    [],
  );
  const redo = useCallback(
    () =>
      setHistory((current) => {
        const next = current.future[0];
        return next
          ? { past: [...current.past, current.present], present: next, future: current.future.slice(1) }
          : current;
      }),
    [],
  );
  useEffect(() => {
    setSaved(false);
    if (saveBlocked) return;
    const timeout = window.setTimeout(() => {
      try {
        parseProject(history.present, devices);
      } catch {
        setSaveError("Проект не сохранён: проверьте обязательные названия и связи. Предыдущее сохранение не изменено.");
        return;
      }
      try {
        saveProject(history.present);
        setSaved(true);
        setSaveError("");
      } catch {
        setSaveError("Автосохранение не выполнено: хранилище недоступно или заполнено. Экспортируйте проект.");
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [history.present, saveBlocked]);
  return {
    project: history.present,
    change,
    replace,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    error: error || saveError,
    setError,
    saved,
  };
}
