/**
 * PlanViewer - Component for displaying and editing plans
 *
 * Shows plan items with checkboxes, progress tracking, and
 * the ability to mark items as complete or in-progress.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { usePlanningService } from './planning/usePlanningService';
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

  const progress = useMemo(() => getProgress(plan.id), [getProgress, plan.id, plan.items]);

  const handleStatusChange = useCallback(
    (itemId: string, currentStatus: PlanItemStatus) => {
      if (!editable) return;

      // Cycle through statuses: pending -> in_progress -> completed -> pending
      const nextStatus: Record<PlanItemStatus, PlanItemStatus> = {
        pending: 'in_progress',
        in_progress: 'completed',
        completed: 'pending',
        cancelled: 'pending',
        blocked: 'pending',
      };

      updateItemStatus(plan.id, itemId, nextStatus[currentStatus]);
    },
    [editable, plan.id, updateItemStatus]
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
        </div>

        <div className="plan-actions">
          <button
            className="plan-action-btn"
            onClick={handleCopyPlan}
            title="Copy plan as markdown"
          >
            {copiedToClipboard ? '✓' : '📋'}
          </button>
          <button
            className="plan-action-btn"
            onClick={handleSavePlan}
            title="Save plan to file"
          >
            💾
          </button>
          {onExecutePlan && (
            <button
              className="plan-action-btn primary"
              onClick={onExecutePlan}
              title="Execute plan in Agent mode"
            >
              ▶ Execute
            </button>
          )}
          {onClose && (
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
            className="progress-fill"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
        <span className="progress-text">
          {progress.completed}/{progress.total} ({progress.percentage}%)
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
                editable={editable}
                onStatusChange={() => handleStatusChange(item.id, item.status)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface PlanItemRowProps {
  item: PlanItem;
  editable: boolean;
  onStatusChange: () => void;
}

const PlanItemRow: React.FC<PlanItemRowProps> = ({
  item,
  editable,
  onStatusChange,
}) => {
  const statusIcons: Record<PlanItemStatus, string> = {
    pending: '○',
    in_progress: '◐',
    completed: '●',
    cancelled: '⊘',
    blocked: '⊗',
  };

  const statusColors: Record<PlanItemStatus, string> = {
    pending: 'var(--text-muted)',
    in_progress: 'var(--color-warning, #f59e0b)',
    completed: 'var(--color-success, #10b981)',
    cancelled: 'var(--text-muted)',
    blocked: 'var(--color-error, #ef4444)',
  };

  return (
    <div
      className={`plan-item ${item.status} ${editable ? 'editable' : ''}`}
      onClick={editable ? onStatusChange : undefined}
    >
      <span
        className="item-status"
        style={{ color: statusColors[item.status] }}
        title={`Status: ${item.status}`}
      >
        {statusIcons[item.status]}
      </span>
      <span className={`item-content ${item.status === 'completed' ? 'completed' : ''}`}>
        {item.content}
      </span>
      {item.complexity && (
        <span className="item-complexity" title={`Complexity: ${item.complexity}/5`}>
          {'★'.repeat(item.complexity)}{'☆'.repeat(5 - item.complexity)}
        </span>
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

