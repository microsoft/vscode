/**
 * useAgentRegistry - React hook for accessing the agent registry
 */

import { useState, useCallback, useMemo } from 'react';
import { AgentRegistry, InvokeOptions } from './AgentRegistry';
import type { AgentPersona, AgentResponse } from '../chat/types';

export interface UseAgentRegistryResult {
  agents: AgentPersona[];
  invokeAgent: (
    agentId: string,
    query: string,
    options: Omit<InvokeOptions, 'context'> & { context: any }
  ) => Promise<AgentResponse>;
  isLoading: boolean;
  error: Error | null;
}

export function useAgentRegistry(): UseAgentRegistryResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const registry = useMemo(() => AgentRegistry.getInstance(), []);
  const agents = useMemo(() => registry.getAll(), [registry]);

  const invokeAgent = useCallback(
    async (
      agentId: string,
      query: string,
      options: Omit<InvokeOptions, 'context'> & { context: any }
    ): Promise<AgentResponse> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await registry.invoke(agentId, query, options);
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [registry]
  );

  return {
    agents,
    invokeAgent,
    isLoading,
    error,
  };
}

export default useAgentRegistry;

