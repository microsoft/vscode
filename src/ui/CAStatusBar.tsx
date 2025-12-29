/**
 * CAStatusBar - Status bar component for Workspace CA
 *
 * Shows CA status, pending suggestions, and quick access to CA features.
 */

import React, { useState, useEffect } from 'react';
import { WorkspaceCA, Suggestion } from '../workspace-ca/WorkspaceCA';

import './CAStatusBar.css';

export interface CAStatusBarProps {
  workspacePath: string;
  onClick?: () => void;
}

export const CAStatusBar: React.FC<CAStatusBarProps> = ({
  workspacePath,
  onClick,
}) => {
  const [status, setStatus] = useState<string>('initializing');
  const [pendingSuggestions, setPendingSuggestions] = useState<number>(0);
  const [usf, setUSF] = useState<number>(0.85);

  useEffect(() => {
    // Get CA instance
    WorkspaceCA.deploy(workspacePath).then((ca) => {
      if (ca) {
        setStatus(ca.getStatus());

        ca.on('status', ({ status: newStatus }: { status: string }) => {
          setStatus(newStatus);
        });

        ca.on('suggestions', (suggestions: Suggestion[]) => {
          setPendingSuggestions((prev) => prev + suggestions.length);
        });
      }
    });
  }, [workspacePath]);

  const statusIcons: Record<string, string> = {
    initializing: '⏳',
    scanning: '🔍',
    active: '✓',
    hibernating: '💤',
  };

  const statusColors: Record<string, string> = {
    initializing: 'var(--color-warning)',
    scanning: 'var(--color-info)',
    active: 'var(--color-success)',
    hibernating: 'var(--color-muted)',
  };

  return (
    <button className="ca-status-bar" onClick={onClick}>
      <span
        className="ca-indicator"
        style={{ color: statusColors[status] || 'var(--color-muted)' }}
      >
        {statusIcons[status] || '?'} CA
      </span>
      {pendingSuggestions > 0 && (
        <span className="suggestion-badge">{pendingSuggestions}</span>
      )}
      <span className="usf-indicator">
        USF: {usf.toFixed(2)}
      </span>
    </button>
  );
};

export default CAStatusBar;

