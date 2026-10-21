import { devices } from "@strazh-sim/content";
import { createProject, type Project, parseProject } from "@strazh-sim/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadProject, StorageConflictError, savedProjectText, saveProject } from "./storage";

type History = { past: Project[]; present: Project; future: Project[] };
export function useEditor() {
  const [initial] = useState(() => {
    try {
      const raw = savedProjectText();
      return { project: loadProject(raw) ?? createProject(), error: "", raw };
    } catch {
      return {
        project: createProject(),
        raw: undefined,
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
  const expectedSave = useRef(initial.raw);
  const lastSaved = useRef<Project | undefined>(initial.raw !== null && !initial.error ? initial.project : undefined);
  const latest = useRef({ project: history.present, blocked: saveBlocked });
  latest.current = { project: history.present, blocked: saveBlocked };
  useEffect(() => {
    const flush = () => {
      if (latest.current.blocked || latest.current.project === lastSaved.current) return;
      try {
        expectedSave.current = saveProject(latest.current.project, expectedSave.current);
        lastSaved.current = latest.current.project;
      } catch {
        // Invalid drafts and full storage must leave the last valid save untouched.
      }
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  const change = useCallback((recipe: (draft: Project) => void) => {
    setHistory((current) => {
      const next = structuredClone(current.present);
      recipe(next);
      if (JSON.stringify(next) === JSON.stringify(current.present)) return current;
      return { past: [...current.past.slice(-49), current.present], present: next, future: [] };
    });
  }, []);
  const replace = useCallback((project: Project) => {
    try {
      expectedSave.current = savedProjectText();
    } catch {
      expectedSave.current = undefined;
    }
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
        expectedSave.current = saveProject(history.present, expectedSave.current);
        lastSaved.current = history.present;
        setSaved(true);
        setSaveError("");
      } catch (error) {
        setSaveError(
          error instanceof StorageConflictError
            ? "Проект изменён в другой вкладке. Текущие правки не перезаписали сохранение; экспортируйте их или откройте объект заново."
            : "Автосохранение не выполнено: хранилище недоступно или заполнено. Экспортируйте проект.",
        );
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
