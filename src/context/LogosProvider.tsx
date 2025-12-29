/**
 * LogosProvider - Root context provider for Logos IDE
 *
 * Combines all context providers into a single wrapper component.
 */

import React, { ReactNode } from 'react';
import { EditorContextProvider } from './EditorContextProvider';
import { AuditLogger } from '../governance/AuditLogger';
import { PersonaAuth } from '../governance/PersonaAuth';

interface LogosProviderProps {
  workspaceId: string;
  children: ReactNode;
}

export const LogosProvider: React.FC<LogosProviderProps> = ({
  workspaceId,
  children,
}) => {
  // Initialize services on mount
  React.useEffect(() => {
    initializeLogos(workspaceId);
  }, [workspaceId]);

  return (
    <EditorContextProvider workspaceId={workspaceId}>
      {children}
    </EditorContextProvider>
  );
};

/**
 * Initialize Logos services
 */
async function initializeLogos(workspaceId: string): Promise<void> {
  try {
    // Initialize PERSONA auth
    const auth = await PersonaAuth.fromSession();
    const personaId = auth.getPersonaId();
    const sessionId = auth.getSession()?.id || 'unknown';

    // Initialize audit logger
    AuditLogger.initialize(personaId, sessionId, workspaceId);

    console.log('[Logos] Initialized with persona:', personaId);
  } catch (error) {
    console.error('[Logos] Failed to initialize:', error);
  }
}

export default LogosProvider;

