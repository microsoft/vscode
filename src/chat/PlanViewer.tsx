/**
 * PlanViewer - Component for displaying, editing, and executing plans
 *
 * Shows plan items with checkboxes, progress tracking, and
 * the ability to execute plans in Agent mode.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { usePlanningService } from './planning/usePlanningService';
import { PlanExecutor, ExecutionState, ItemExecutionResult } from './planning/PlanExecutor';
import type { Plan, PlanItem, PlanItemStatus } from './modes/types';

import './PlanViewer.css';

export interface PlanViewerProps {
  plan: Plan;
  sessionId?: string;
  className?: string;
  editable?: boolean;
  onExecutePlan?: () => void;
  onClose?: () => void;
}

export const PlanViewer: React.FC<PlanViewerProps> = ({
  plan,
  sessionId,
  className,
  editable = true,
  onExecutePlan,
  onClose,
}) => {
  const { updateItemStatus, getProgress, serializePlan } = usePlanningService(sessionId);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // Execution state
  const [executionState, setExecutionState] = useState<ExecutionState>('idle');
  const [executionProgress, setExecutionProgress] = useState({ current: 0, total: 0 });
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [executionResults, setExecutionResults] = useState<ItemExecutionResult[]>([]);
  const [showExecutionPanel, setShowExecutionPanel] = useState(false);

  const progress = useMemo(() => getProgress(plan.id), [getProgress, plan.id, plan.items]);

  // Set up executor event listeners
  useEffect(() => {
    const executor = PlanExecutor.getInstance();

    const handleExecutionStarted = (planId: string) => {
      if (planId === plan.id) {
        setExecutionState('running');
        setShowExecutionPanel(true);
        setExecutionResults([]);
      }
    };

    const handleItemStarted = (planId: string, itemId: string) => {
      if (planId === plan.id) {
        setCurrentItemId(itemId);
      }
    };

    const handleItemCompleted = (planId: string, result: ItemExecutionResult) => {
      if (planId === plan.id) {
        setExecutionResults((prev) => [...prev, result]);
      }
    };

    const handleProgressUpdated = (planId: string, completed: number, total: number) => {
      if (planId === plan.id) {
        setExecutionProgress({ current: completed, total });
      }
    };

    const handleExecutionCompleted = (planId: string) => {
      if (planId === plan.id) {
        setExecutionState('completed');
        setCurrentItemId(null);
      }
    };

    const handleExecutionPaused = (planId: string) => {
      if (planId === plan.id) {
        setExecutionState('paused');
      }
    };

    const handleExecutionFailed = (planId: string, error: string) => {
      if (planId === plan.id) {
        setExecutionState('failed');
        setCurrentItemId(null);
      }
    };

    const handleExecutionCancelled = (planId: string) => {
      if (planId === plan.id) {
        setExecutionState('cancelled');
        setCurrentItemId(null);
      }
    };

    executor.on('executionStarted', handleExecutionStarted);
    executor.on('itemStarted', handleItemStarted);
    executor.on('itemCompleted', handleItemCompleted);
    executor.on('progressUpdated', handleProgressUpdated);
    executor.on('executionCompleted', handleExecutionCompleted);
    executor.on('executionPaused', handleExecutionPaused);
    executor.on('executionFailed', handleExecutionFailed);
    executor.on('executionCancelled', handleExecutionCancelled);

    return () => {
      executor.off('executionStarted', handleExecutionStarted);
      executor.off('itemStarted', handleItemStarted);
      executor.off('itemCompleted', handleItemCompleted);
      executor.off('progressUpdated', handleProgressUpdated);
      executor.off('executionCompleted', handleExecutionCompleted);
      executor.off('executionPaused', handleExecutionPaused);
      executor.off('executionFailed', handleExecutionFailed);
      executor.off('executionCancelled', handleExecutionCancelled);
    };
  }, [plan.id]);

  const handleStatusChange = useCallback(
    (itemId: string, currentStatus: PlanItemStatus) => {
      if (!editable || executionState === 'running') return;

      // Cycle through statuses: pending -> in_progress -> completed -> pending
      const nextStatus: Record<PlanItemStatus, PlanItemStatus> = {
        pending: 'in_progress',
        in_progress: 'completed',
        completed: 'pending',
        cancelled: 'pending',
        blocked: 'pending',
        failed: 'pending',
      };

      updateItemStatus(plan.id, itemId, nextStatus[currentStatus]);
    },
    [editable, executionState, plan.id, updateItemStatus]
  );

  const handleCopyPlan = useCallback(async () => {
    const markdown = serializePlan(plan);
    await navigator.clipboard.writeText(markdown);
    setCopiedToClipboard(true);
    setTimeout(() => setCopiedToClipboard(false), 2000);
  }, [plan, serializePlan]);

  const handleSavePlan = useCallback(() => {
    // Would trigger file save dialog
    console.log('Save plan:', plan.id);
  }, [plan.id]);

  const handleExecute = useCallback(async () => {
    const executor = PlanExecutor.getInstance();
    try {
      await executor.execute(plan.id, {
        sessionId: sessionId || '',
        stopOnError: true,
        stepByStep: false,
      });
    } catch (error) {
      console.error('Execution failed:', error);
    }

    if (onExecutePlan) {
      onExecutePlan();
    }
  }, [plan.id, sessionId, onExecutePlan]);

  const handlePause = useCallback(() => {
    const executor = PlanExecutor.getInstance();
    executor.pause();
  }, []);

  const handleResume = useCallback(async () => {
    const executor = PlanExecutor.getInstance();
    await executor.resume();
  }, []);

  const handleCancel = useCallback(() => {
    const executor = PlanExecutor.getInstance();
    executor.cancel();
  }, []);

  const handleCloseExecutionPanel = useCallback(() => {
    if (executionState !== 'running') {
      setShowExecutionPanel(false);
      setExecutionState('idle');
    }
  }, [executionState]);

  const isExecuting = executionState === 'running' || executionState === 'paused';

  return (
    <div className={`logos-plan-viewer ${className || ''} ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Header */}
      <div className="plan-header">
        <button
          className="collapse-toggle"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Expand plan' : 'Collapse plan'}
        >
          {isCollapsed ? '▶' : '▼'}
        </button>

        <div className="plan-title-section">
          <span className="plan-icon">📋</span>
          <h4 className="plan-title">{plan.name}</h4>
          {plan.createdByMode && (
            <span className="plan-mode-badge">{plan.createdByMode}</span>
          )}
          {isExecuting && (
            <span className="execution-badge running">Executing...</span>
          )}
        </div>

        <div className="plan-actions">
          <button
            className="plan-action-btn"
            onClick={handleCopyPlan}
            title="Copy plan as markdown"
            disabled={isExecuting}
          >
            {copiedToClipboard ? '✓' : '📋'}
          </button>
          <button
            className="plan-action-btn"
            onClick={handleSavePlan}
            title="Save plan to file"
            disabled={isExecuting}
          >
            💾
          </button>
          {!isExecuting && (
            <button
              className="plan-action-btn primary"
              onClick={handleExecute}
              title="Execute plan in Agent mode"
            >
              ▶ Execute
            </button>
          )}
          {isExecuting && (
            <>
              {executionState === 'running' ? (
                <button
                  className="plan-action-btn warning"
                  onClick={handlePause}
                  title="Pause execution"
                >
                  ⏸ Pause
                </button>
              ) : (
                <button
                  className="plan-action-btn primary"
                  onClick={handleResume}
                  title="Resume execution"
                >
                  ▶ Resume
                </button>
              )}
              <button
                className="plan-action-btn danger"
                onClick={handleCancel}
                title="Cancel execution"
              >
                ⏹ Cancel
              </button>
            </>
          )}
          {onClose && !isExecuting && (
            <button
              className="plan-action-btn close"
              onClick={onClose}
              title="Close plan"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="plan-progress">
        <div className="progress-bar">
          <div
            className={`progress-fill ${isExecuting ? 'executing' : ''}`}
            style={{ width: `${isExecuting ? (executionProgress.current / executionProgress.total) * 100 : progress.percentage}%` }}
          />
        </div>
        <span className="progress-text">
          {isExecuting
            ? `${executionProgress.current}/${executionProgress.total} executing`
            : `${progress.completed}/${progress.total} (${progress.percentage}%)`}
        </span>
      </div>

      {/* Plan content */}
      {!isCollapsed && (
        <div className="plan-content">
          {/* Overview */}
          {plan.overview && (
            <div className="plan-overview">
              <p>{plan.overview}</p>
            </div>
          )}

          {/* Items */}
          <div className="plan-items">
            {plan.items.map((item) => (
              <PlanItemRow
                key={item.id}
                item={item}
                editable={editable && !isExecuting}
                isCurrentlyExecuting={currentItemId === item.id}
                executionResult={executionResults.find((r) => r.itemId === item.id)}
                onStatusChange={() => handleStatusChange(item.id, item.status)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Execution Panel */}
      {showExecutionPanel && (
        <ExecutionPanel
          state={executionState}
          progress={executionProgress}
          results={executionResults}
          onClose={handleCloseExecutionPanel}
        />
      )}
    </div>
  );
};

interface PlanItemRowProps {
  item: PlanItem;
  editable: boolean;
  isCurrentlyExecuting: boolean;
  executionResult?: ItemExecutionResult;
  onStatusChange: () => void;
}

const PlanItemRow: React.FC<PlanItemRowProps> = ({
  item,
  editable,
  isCurrentlyExecuting,
  executionResult,
  onStatusChange,
}) => {
  const statusIcons: Record<PlanItemStatus, string> = {
    pending: '○',
    in_progress: '◐',
    completed: '●',
    cancelled: '⊘',
    blocked: '⊗',
    failed: '✕',
  };

  const statusColors: Record<PlanItemStatus, string> = {
    pending: 'var(--text-muted)',
    in_progress: 'var(--color-warning, #f59e0b)',
    completed: 'var(--color-success, #10b981)',
    cancelled: 'var(--text-muted)',
    blocked: 'var(--color-error, #ef4444)',
    failed: 'var(--color-error, #ef4444)',
  };

  return (
    <div
      className={`plan-item ${item.status} ${editable ? 'editable' : ''} ${isCurrentlyExecuting ? 'executing' : ''}`}
      onClick={editable ? onStatusChange : undefined}
    >
      <span
        className={`item-status ${isCurrentlyExecuting ? 'pulse' : ''}`}
        style={{ color: isCurrentlyExecuting ? 'var(--color-info, #3b82f6)' : statusColors[item.status] }}
        title={`Status: ${item.status}`}
      >
        {isCurrentlyExecuting ? '◉' : statusIcons[item.status]}
      </span>
      <span className={`item-content ${item.status === 'completed' ? 'completed' : ''}`}>
        {item.content}
      </span>
      {item.complexity && (
        <span className="item-complexity" title={`Complexity: ${item.complexity}/5`}>
          {'★'.repeat(item.complexity)}{'☆'.repeat(5 - item.complexity)}
        </span>
      )}
      {executionResult && !executionResult.success && (
        <span className="item-error" title={executionResult.error}>
          ⚠️
        </span>
      )}
      {executionResult?.duration && (
        <span className="item-duration" title={`Duration: ${executionResult.duration}ms`}>
          {executionResult.duration}ms
        </span>
      )}
    </div>
  );
};

/**
 * Execution Panel - Shows detailed execution progress and output
 */
interface ExecutionPanelProps {
  state: ExecutionState;
  progress: { current: number; total: number };
  results: ItemExecutionResult[];
  onClose: () => void;
}

const ExecutionPanel: React.FC<ExecutionPanelProps> = ({
  state,
  progress,
  results,
  onClose,
}) => {
  const getStateIcon = () => {
    switch (state) {
      case 'running':
        return '⚡';
      case 'paused':
        return '⏸️';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      case 'cancelled':
        return '⏹️';
      default:
        return '⏳';
    }
  };

  const getStateLabel = () => {
    switch (state) {
      case 'running':
        return 'Executing...';
      case 'paused':
        return 'Paused';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Idle';
    }
  };

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  return (
    <div className="execution-panel">
      <div className="execution-panel-header">
        <span className="execution-state-icon">{getStateIcon()}</span>
        <span className="execution-state-label">{getStateLabel()}</span>
        <span className="execution-stats">
          {successCount} passed, {failedCount} failed
        </span>
        {state !== 'running' && (
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      <div className="execution-progress-detail">
        <div className="progress-bar large">
          <div
            className={`progress-fill ${state}`}
            style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }}
          />
        </div>
        <span className="progress-label">
          {progress.current} / {progress.total} items
        </span>
      </div>

      {results.length > 0 && (
        <div className="execution-results">
          {results.slice(-5).map((result, index) => (
            <div key={result.itemId} className={`result-row ${result.success ? 'success' : 'failed'}`}>
              <span className="result-icon">{result.success ? '✓' : '✗'}</span>
              <span className="result-item">Item {index + 1}</span>
              <span className="result-duration">{result.duration}ms</span>
              {!result.success && result.error && (
                <span className="result-error" title={result.error}>
                  {result.error.slice(0, 50)}...
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Compact plan progress indicator
 */
export const PlanProgressIndicator: React.FC<{
  plan: Plan;
  onClick?: () => void;
}> = ({ plan, onClick }) => {
  const { getProgress } = usePlanningService();
  const progress = useMemo(() => getProgress(plan.id), [getProgress, plan.id]);

  return (
    <button
      className="logos-plan-progress-indicator"
      onClick={onClick}
      title={`Plan: ${plan.name} (${progress.percentage}% complete)`}
    >
      <span className="progress-icon">📋</span>
      <span className="progress-mini-bar">
        <span
          className="progress-mini-fill"
          style={{ width: `${progress.percentage}%` }}
        />
      </span>
      <span className="progress-count">
        {progress.completed}/{progress.total}
      </span>
    </button>
  );
};

export default PlanViewer;
