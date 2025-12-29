/**
 * CASidebar - Workspace Cognitive Architect sidebar panel
 *
 * Displays proactive suggestions, quick actions, and CA status.
 */

import React, { useState, useEffect } from 'react';
import { WorkspaceCA, Suggestion } from '../workspace-ca/WorkspaceCA';

import './CASidebar.css';

export interface CASidebarProps {
  workspacePath: string;
  onSuggestionApply?: (suggestion: Suggestion) => void;
}

export const CASidebar: React.FC<CASidebarProps> = ({
  workspacePath,
  onSuggestionApply,
}) => {
  const [ca, setCA] = useState<WorkspaceCA | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState<string>('initializing');
  const [usf, setUSF] = useState<number>(0.85);

  // Deploy CA on mount
  useEffect(() => {
    WorkspaceCA.deploy(workspacePath).then((instance) => {
      if (instance) {
        setCA(instance);
        setStatus(instance.getStatus());

        // Subscribe to events
        instance.on('suggestions', (newSuggestions: Suggestion[]) => {
          setSuggestions((prev) => [...newSuggestions, ...prev].slice(0, 20));
        });

        instance.on('status', ({ status: newStatus }: { status: string }) => {
          setStatus(newStatus);
        });
      }
    });
  }, [workspacePath]);

  const handleAccept = async (suggestion: Suggestion) => {
    if (ca) {
      await ca.applySuggestion(suggestion);
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
      onSuggestionApply?.(suggestion);
    }
  };

  const handleDismiss = async (suggestion: Suggestion) => {
    if (ca) {
      await ca.dismissSuggestion(suggestion);
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    }
  };

  const handleGenerateDocs = async () => {
    if (ca) {
      const readme = await ca.generateREADME();
      console.log('[CASidebar] Generated README:', readme);
      // Would open in editor or preview panel
    }
  };

  const handleShowArchitecture = async () => {
    if (ca) {
      const diagram = await ca.generateArchitectureDiagram();
      console.log('[CASidebar] Generated diagram:', diagram);
      // Would open diagram preview
    }
  };

  const handleExplainCodebase = async () => {
    if (ca) {
      const explanation = await ca.explainCodebase();
      console.log('[CASidebar] Generated explanation:', explanation);
      // Would open onboarding panel
    }
  };

  return (
    <div className="logos-ca-sidebar">
      {/* Status indicator */}
      <CAStatusIndicator status={status} usf={usf} />

      {/* Suggestions section */}
      <Section title="Suggestions" count={suggestions.length}>
        {suggestions.length === 0 ? (
          <div className="empty-state">
            <p>No suggestions yet. Keep coding!</p>
          </div>
        ) : (
          <div className="suggestion-list">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onAccept={() => handleAccept(suggestion)}
                onDismiss={() => handleDismiss(suggestion)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Quick actions */}
      <Section title="Quick Actions">
        <div className="quick-actions">
          <button
            className="action-button"
            onClick={handleGenerateDocs}
            disabled={!ca}
          >
            📝 Generate Docs
          </button>
          <button
            className="action-button"
            onClick={handleShowArchitecture}
            disabled={!ca}
          >
            🏗️ Architecture
          </button>
          <button
            className="action-button"
            onClick={handleExplainCodebase}
            disabled={!ca}
          >
            💡 Explain Project
          </button>
        </div>
      </Section>

      {/* Project insights */}
      <Section title="Project Insights">
        <ProjectInsights ca={ca} />
      </Section>
    </div>
  );
};

interface CAStatusIndicatorProps {
  status: string;
  usf: number;
}

const CAStatusIndicator: React.FC<CAStatusIndicatorProps> = ({ status, usf }) => {
  const statusColors: Record<string, string> = {
    initializing: '#f59e0b',
    scanning: '#3b82f6',
    active: '#10b981',
    hibernating: '#6b7280',
  };

  const usfColor = usf > 0.85 ? '#10b981' : usf > 0.7 ? '#f59e0b' : '#ef4444';

  return (
    <div className="ca-status-indicator">
      <div className="status-row">
        <span
          className="status-dot"
          style={{ backgroundColor: statusColors[status] || '#6b7280' }}
        />
        <span className="status-text">CA: {status}</span>
      </div>
      <div className="usf-row">
        <span className="usf-label">USF:</span>
        <span className="usf-value" style={{ color: usfColor }}>
          {usf.toFixed(2)}
        </span>
      </div>
    </div>
  );
};

interface SectionProps {
  title: string;
  count?: number;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, count, children }) => (
  <div className="ca-section">
    <div className="section-header">
      <h3>{title}</h3>
      {count !== undefined && <span className="count">{count}</span>}
    </div>
    <div className="section-content">{children}</div>
  </div>
);

interface SuggestionCardProps {
  suggestion: Suggestion;
  onAccept: () => void;
  onDismiss: () => void;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({
  suggestion,
  onAccept,
  onDismiss,
}) => {
  const severityColors: Record<string, string> = {
    info: '#3b82f6',
    warning: '#f59e0b',
    critical: '#ef4444',
  };

  const typeIcons: Record<string, string> = {
    documentation_gap: '📝',
    refactoring_opportunity: '🔧',
    test_coverage: '🧪',
    architecture_drift: '🏗️',
    security_concern: '🔒',
    performance_issue: '⚡',
  };

  return (
    <div
      className="suggestion-card"
      style={{ borderLeftColor: severityColors[suggestion.severity] }}
    >
      <div className="suggestion-header">
        <span className="suggestion-icon">
          {typeIcons[suggestion.type] || '💡'}
        </span>
        <span className="suggestion-title">{suggestion.title}</span>
        <span
          className="suggestion-confidence"
          title={`Confidence: ${(suggestion.confidence * 100).toFixed(0)}%`}
        >
          {suggestion.confidence > 0.8 ? '●●●' : suggestion.confidence > 0.6 ? '●●○' : '●○○'}
        </span>
      </div>
      <p className="suggestion-description">{suggestion.description}</p>
      {suggestion.affectedFiles.length > 0 && (
        <div className="suggestion-files">
          {suggestion.affectedFiles.slice(0, 3).map((file) => (
            <span key={file} className="file-chip">
              {file.split('/').pop()}
            </span>
          ))}
          {suggestion.affectedFiles.length > 3 && (
            <span className="file-chip more">
              +{suggestion.affectedFiles.length - 3} more
            </span>
          )}
        </div>
      )}
      <div className="suggestion-actions">
        <button className="accept-button" onClick={onAccept}>
          {suggestion.suggestedFix ? 'Apply Fix' : 'View'}
        </button>
        <button className="dismiss-button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
};

interface ProjectInsightsProps {
  ca: WorkspaceCA | null;
}

const ProjectInsights: React.FC<ProjectInsightsProps> = ({ ca }) => {
  const model = ca?.getProjectModel();

  if (!model) {
    return <div className="empty-state">Analyzing project...</div>;
  }

  return (
    <div className="project-insights">
      <div className="insight-row">
        <span className="insight-label">Languages:</span>
        <span className="insight-value">{model.languages.join(', ') || 'Unknown'}</span>
      </div>
      <div className="insight-row">
        <span className="insight-label">Frameworks:</span>
        <span className="insight-value">{model.frameworks.join(', ') || 'None detected'}</span>
      </div>
      <div className="insight-row">
        <span className="insight-label">Modules:</span>
        <span className="insight-value">{model.modules.length}</span>
      </div>
      <div className="insight-row">
        <span className="insight-label">Doc Coverage:</span>
        <span className="insight-value">{(model.documentationCoverage * 100).toFixed(0)}%</span>
      </div>
      {model.conventions.length > 0 && (
        <div className="insight-row">
          <span className="insight-label">Conventions:</span>
          <span className="insight-value">{model.conventions.length} learned</span>
        </div>
      )}
    </div>
  );
};

export default CASidebar;

