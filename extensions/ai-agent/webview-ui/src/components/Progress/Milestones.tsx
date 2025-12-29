/**
 * Milestones Component
 * Displays phase history with collapsible milestone lists
 */

import { Phase, PhaseHistoryEntry, Milestone, MilestoneStatus } from '../../stores/chatStore';
import { useTranslation } from '../../hooks/useLocale';
import './Milestones.css';

interface MilestonesProps {
    phaseHistory: PhaseHistoryEntry[];
    expandedPhases: Phase[];
    onTogglePhase: (phase: Phase) => void;
}

interface MilestoneItemProps {
    milestone: Milestone;
}

/**
 * Get status icon for milestone
 */
function getStatusIcon(status: MilestoneStatus): string {
    switch (status) {
        case 'complete':
            return '\u2713'; // checkmark
        case 'active':
            return '\u25B6'; // play
        case 'pending':
            return '\u25CB'; // circle
    }
}

/**
 * Get phase display name
 */
function getPhaseName(phase: Phase, t: (key: string) => string): string {
    switch (phase) {
        case 'design':
            return t('phaseDesign');
        case 'implementation':
            return t('phaseImplementation');
        case 'review':
            return t('phaseReview');
    }
}

function MilestoneItem({ milestone }: MilestoneItemProps) {
    return (
        <div
            className={`milestone milestone--${milestone.status}`}
            data-testid={`milestone-${milestone.id}`}
        >
            <span className="milestone__icon">{getStatusIcon(milestone.status)}</span>
            <span className="milestone__label">{milestone.label}</span>
            {milestone.duration !== undefined && (
                <span className="milestone__duration">{milestone.duration}s</span>
            )}
        </div>
    );
}

export function Milestones({ phaseHistory, expandedPhases, onTogglePhase }: MilestonesProps) {
    const { t } = useTranslation();

    if (phaseHistory.length === 0) {
        return null;
    }

    return (
        <div className="milestones" data-testid="milestones">
            {phaseHistory.map((entry) => {
                const isExpanded = expandedPhases.includes(entry.phase);
                const completedCount = entry.milestones.filter(
                    (m) => m.status === 'complete'
                ).length;
                const totalCount = entry.milestones.length;
                const isPhaseComplete = entry.completedAt !== undefined;

                return (
                    <div
                        key={entry.phase}
                        className={`milestones__phase ${isExpanded ? 'milestones__phase--expanded' : ''}`}
                    >
                        <button
                            type="button"
                            className="milestones__phase-header"
                            onClick={() => onTogglePhase(entry.phase)}
                            aria-expanded={isExpanded}
                        >
                            <span
                                className={`milestones__phase-icon ${isPhaseComplete ? 'milestones__phase-icon--complete' : 'milestones__phase-icon--active'}`}
                            >
                                {isPhaseComplete ? '\u2713' : '\u25B6'}
                            </span>
                            <span className="milestones__phase-name">
                                {getPhaseName(entry.phase, t)}
                            </span>
                            <span className="milestones__phase-count">
                                {completedCount}/{totalCount}
                            </span>
                            <span className="milestones__chevron">
                                {isExpanded ? '\u25BC' : '\u25B6'}
                            </span>
                        </button>
                        {isExpanded && (
                            <div className="milestones__list">
                                {entry.milestones.map((milestone) => (
                                    <MilestoneItem key={milestone.id} milestone={milestone} />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
