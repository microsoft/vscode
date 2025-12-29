/**
 * Phase Selector Component
 * Allows switching between development phases with rollback confirmation
 */

import React, { useState, useCallback } from 'react';
import { RollbackDialog, ForwardPhaseDialog } from './Dialog';
import { useTranslation } from '../hooks/useLocale';
import type { Phase } from '../stores/chatStore';

interface PhaseSelectorProps {
    /** Current phase */
    currentPhase: Phase;
    /** Callback when phase is changed (forward) */
    onPhaseChange: (phase: Phase) => void;
    /** Callback when phase is rolled back */
    onPhaseRollback?: (from: Phase, to: Phase) => void;
    /** Whether selector is disabled */
    disabled?: boolean;
}

const phaseOrder: Phase[] = ['design', 'implementation', 'review'];

const phaseConfig: { value: Phase; icon: string }[] = [
    { value: 'design', icon: '\uD83C\uDFA8' }, // Artist palette
    { value: 'implementation', icon: '\u26A1' }, // Lightning
    { value: 'review', icon: '\uD83D\uDD0D' } // Magnifying glass
];

/**
 * Check if target phase is earlier than current phase (rollback)
 */
function isRollback(from: Phase, to: Phase): boolean {
    const fromIndex = phaseOrder.indexOf(from);
    const toIndex = phaseOrder.indexOf(to);
    return toIndex < fromIndex;
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        gap: '4px',
        padding: '8px'
    },
    button: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '6px 12px',
        border: '1px solid var(--vscode-button-border, transparent)',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: 'var(--vscode-font-size, 13px)',
        fontFamily: 'var(--vscode-font-family, inherit)',
        transition: 'background-color 0.2s'
    },
    activeButton: {
        backgroundColor: 'var(--vscode-button-background, #0e639c)',
        color: 'var(--vscode-button-foreground, #ffffff)'
    },
    inactiveButton: {
        backgroundColor: 'var(--vscode-button-secondaryBackground, #3a3d41)',
        color: 'var(--vscode-button-secondaryForeground, #cccccc)'
    },
    disabledButton: {
        opacity: 0.5,
        cursor: 'not-allowed'
    }
};

export function PhaseSelector({
    currentPhase,
    onPhaseChange,
    onPhaseRollback,
    disabled
}: PhaseSelectorProps) {
    const { t } = useTranslation();
    const [rollbackTarget, setRollbackTarget] = useState<Phase | null>(null);
    const [forwardTarget, setForwardTarget] = useState<Phase | null>(null);

    const getPhaseName = useCallback((phase: Phase): string => {
        switch (phase) {
            case 'design':
                return t('phaseDesign');
            case 'implementation':
                return t('phaseImplementation');
            case 'review':
                return t('phaseReview');
        }
    }, [t]);

    const handlePhaseClick = useCallback((targetPhase: Phase) => {
        if (disabled || targetPhase === currentPhase) {
            return;
        }

        if (isRollback(currentPhase, targetPhase) && onPhaseRollback) {
            // Show confirmation dialog for rollback
            setRollbackTarget(targetPhase);
        } else {
            // Show confirmation dialog for forward phase change
            setForwardTarget(targetPhase);
        }
    }, [currentPhase, disabled, onPhaseRollback]);

    const handleRollbackConfirm = useCallback(() => {
        if (rollbackTarget && onPhaseRollback) {
            onPhaseRollback(currentPhase, rollbackTarget);
        }
        setRollbackTarget(null);
    }, [currentPhase, rollbackTarget, onPhaseRollback]);

    const handleRollbackCancel = useCallback(() => {
        setRollbackTarget(null);
    }, []);

    const handleForwardConfirm = useCallback(() => {
        if (forwardTarget) {
            onPhaseChange(forwardTarget);
        }
        setForwardTarget(null);
    }, [forwardTarget, onPhaseChange]);

    const handleForwardCancel = useCallback(() => {
        setForwardTarget(null);
    }, []);

    return (
        <>
            <div style={styles.container} role="tablist" aria-label="Development Phase">
                {phaseConfig.map(({ value, icon }) => {
                    const isActive = currentPhase === value;
                    const buttonStyle = {
                        ...styles.button,
                        ...(isActive ? styles.activeButton : styles.inactiveButton),
                        ...(disabled ? styles.disabledButton : {})
                    };

                    return (
                        <button
                            key={value}
                            role="tab"
                            aria-selected={isActive}
                            aria-controls={`phase-${value}`}
                            style={buttonStyle}
                            onClick={() => handlePhaseClick(value)}
                            disabled={disabled}
                        >
                            <span aria-hidden="true">{icon}</span>
                            <span>{getPhaseName(value)}</span>
                        </button>
                    );
                })}
            </div>

            {rollbackTarget && (
                <RollbackDialog
                    isOpen={true}
                    fromPhase={currentPhase}
                    toPhase={rollbackTarget}
                    onConfirm={handleRollbackConfirm}
                    onCancel={handleRollbackCancel}
                />
            )}

            {forwardTarget && (
                <ForwardPhaseDialog
                    isOpen={true}
                    fromPhase={currentPhase}
                    toPhase={forwardTarget}
                    onConfirm={handleForwardConfirm}
                    onCancel={handleForwardCancel}
                />
            )}
        </>
    );
}
