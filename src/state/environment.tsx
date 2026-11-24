import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { EnvironmentVariable } from "../types";

interface EnvironmentContextValue {
  currentEnvironment: string;
  environments: string[];
  variables: EnvironmentVariable[];
  setCurrentEnvironment: (name: string) => void;
  createEnvironment: (name: string) => void;
  updateVariable: (index: number, updates: Partial<EnvironmentVariable>) => void;
  deleteVariable: (index: number) => void;
  addVariable: (variable: EnvironmentVariable) => void;
  resolveVariables: (text: string) => string;
}

const ENV_KEY = "endpoint-lab.environments";
const CURRENT_ENV_KEY = "endpoint-lab.current-environment";

interface StoredEnvironments {
  [envName: string]: EnvironmentVariable[];
}

function loadEnvironments(): { current: string; data: StoredEnvironments } {
  try {
    const stored = localStorage.getItem(ENV_KEY);
    const current = localStorage.getItem(CURRENT_ENV_KEY) || "Default";
    const data = stored ? JSON.parse(stored) : { Default: [] };
    return { current, data };
  } catch (error) {
    console.error("Failed to load environments:", error);
    return { current: "Default", data: { Default: [] } };
  }
}

function saveEnvironments(data: StoredEnvironments): void {
  try {
    localStorage.setItem(ENV_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save environments:", error);
  }
}

function saveCurrentEnvironment(name: string): void {
  try {
    localStorage.setItem(CURRENT_ENV_KEY, name);
  } catch (error) {
    console.error("Failed to save current environment:", error);
  }
}

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [environmentData, setEnvironmentData] = useState<StoredEnvironments>(() => loadEnvironments().data);
  const [currentEnvironment, setCurrentEnvironmentState] = useState<string>(() => loadEnvironments().current);

  const environments = Object.keys(environmentData);
  const variables = environmentData[currentEnvironment] || [];

  useEffect(() => {
    saveEnvironments(environmentData);
  }, [environmentData]);

  const setCurrentEnvironment = (name: string) => {
    setCurrentEnvironmentState(name);
    saveCurrentEnvironment(name);
  };

  const createEnvironment = (name: string) => {
    if (!environmentData[name]) {
      setEnvironmentData((prev) => ({ ...prev, [name]: [] }));
      setCurrentEnvironment(name);
    }
  };

  const updateVariable = (index: number, updates: Partial<EnvironmentVariable>) => {
    setEnvironmentData((prev) => {
      const envVars = [...(prev[currentEnvironment] || [])];
      envVars[index] = { ...envVars[index], ...updates };
      return { ...prev, [currentEnvironment]: envVars };
    });
  };

  const deleteVariable = (index: number) => {
    setEnvironmentData((prev) => {
      const envVars = [...(prev[currentEnvironment] || [])];
      envVars.splice(index, 1);
      return { ...prev, [currentEnvironment]: envVars };
    });
  };

  const addVariable = (variable: EnvironmentVariable) => {
    setEnvironmentData((prev) => {
      const envVars = [...(prev[currentEnvironment] || []), variable];
      return { ...prev, [currentEnvironment]: envVars };
    });
  };

  const resolveVariables = (text: string): string => {
    let resolved = text;
    const activeVars = variables.filter((v) => v.enabled && v.name.trim() !== "");
    
    for (const variable of activeVars) {
      const pattern = new RegExp(`\\{\\{\\s*${variable.name}\\s*\\}\\}`, "g");
      resolved = resolved.replace(pattern, variable.value);
    }
    
    return resolved;
  };

  return (
    <EnvironmentContext.Provider
      value={{
        currentEnvironment,
        environments,
        variables,
        setCurrentEnvironment,
        createEnvironment,
        updateVariable,
        deleteVariable,
        addVariable,
        resolveVariables,
      }}
    >
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment(): EnvironmentContextValue {
  const context = useContext(EnvironmentContext);
  if (!context) {
    throw new Error("useEnvironment must be used within EnvironmentProvider");
  }
  return context;
}
