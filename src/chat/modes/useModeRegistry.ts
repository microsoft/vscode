/**
 * useModeRegistry - React hook for accessing the mode registry
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ModeRegistry } from './ModeRegistry';
import type {
  AriaModeId,
  AriaModeConfig,
  AriaModeState,
  ModeChangeEvent,
} from './types';

export interface UseModeRegistryReturn {
  /** All available modes */
  modes: AriaModeConfig[];

  /** Current mode configuration */
  currentMode: AriaModeConfig;

  /** Current mode state */
  state: AriaModeState;

  /** Switch to a different mode */
  switchMode: (modeId: AriaModeId, reason?: 'user' | 'auto' | 'system') => void;

  /** Check if a tool is allowed in current mode */
  isToolAllowed: (toolId: string) => boolean;

  /** Get system prompt addition for current mode */
  getSystemPromptAddition: () => string;

  /** Detect recommended mode from query */
  detectModeFromQuery: (query: string) => AriaModeId | null;

  /** Set the active plan ID */
  setActivePlan: (planId: string | undefined) => void;
}

/**
 * React hook for interacting with the ModeRegistry
 */
export function useModeRegistry(): UseModeRegistryReturn {
  const registry = useMemo(() => ModeRegistry.getInstance(), []);

  const [modes] = useState<AriaModeConfig[]>(() => registry.getAllModes());
  const [currentMode, setCurrentMode] = useState<AriaModeConfig>(() =>
    registry.getCurrentMode()
  );
  const [state, setState] = useState<AriaModeState>(() => registry.getState());

  // Subscribe to mode changes
  useEffect(() => {
    const handleModeChange = (event: ModeChangeEvent) => {
      setCurrentMode(registry.getCurrentMode());
      setState(registry.getState());
    };

    registry.on('modeChange', handleModeChange);

    return () => {
      registry.off('modeChange', handleModeChange);
    };
  }, [registry]);

  const switchMode = useCallback(
    (modeId: AriaModeId, reason: 'user' | 'auto' | 'system' = 'user') => {
      registry.switchMode(modeId, reason);
    },
    [registry]
  );

  const isToolAllowed = useCallback(
    (toolId: string) => {
      return registry.isToolAllowed(toolId);
    },
    [registry]
  );

  const getSystemPromptAddition = useCallback(() => {
    return registry.getSystemPromptAddition();
  }, [registry]);

  const detectModeFromQuery = useCallback(
    (query: string) => {
      return registry.detectModeFromQuery(query);
    },
    [registry]
  );

  const setActivePlan = useCallback(
    (planId: string | undefined) => {
      registry.setActivePlan(planId);
    },
    [registry]
  );

  return {
    modes,
    currentMode,
    state,
    switchMode,
    isToolAllowed,
    getSystemPromptAddition,
    detectModeFromQuery,
    setActivePlan,
  };
}

export default useModeRegistry;


