import { devices } from "@strazh-sim/content";
import {
  advanceSimulation,
  createSimulation,
  discoverModules,
  type Project,
  type SimAction,
  solveCircuit,
} from "@strazh-sim/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
export function useSimulation(project: Project) {
  const currentProject = useRef(project);
  currentProject.current = project;
  const [status, setStatus] = useState<"stopped" | "running" | "paused">("stopped");
  const [state, setState] = useState(() => createSimulation(project));
  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(
      () => setState((current) => advanceSimulation(currentProject.current, devices, current, 100)),
      100,
    );
    return () => window.clearInterval(timer);
  }, [status]);
  const dispatch = useCallback(
    (action: SimAction) => {
      if (status === "running")
        setState((current) => advanceSimulation(currentProject.current, devices, current, 0, [action]));
    },
    [status],
  );
  const stop = useCallback(() => {
    setStatus("stopped");
    setState(createSimulation(currentProject.current));
  }, []);
  const toggle = () => {
    if (status === "running") setStatus("paused");
    else {
      if (status === "stopped") setState(advanceSimulation(project, devices, createSimulation(project), 0));
      setStatus("running");
    }
  };
  const circuit = useMemo(() => solveCircuit(project, devices, state), [project, state]);
  const links = useMemo(
    () => discoverModules(project, devices, circuit, state.addresses),
    [project, circuit, state.addresses],
  );
  return { status, state, circuit, links, dispatch, stop, toggle, active: status !== "stopped" };
}
export type SimulationController = ReturnType<typeof useSimulation>;
