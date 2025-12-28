/**
 * Phase Selector Component
 * Allows switching between development phases
 */

import React from 'react';
import type { Phase } from '../stores/chatStore';

interface PhaseSelectorProps {
    /** Current phase */
    currentPhase: Phase;
    /** Callback when phase is changed */
    onPhaseChange: (phase: Phase) => void;
    /** Whether selector is disabled */
    disabled?: boolean;
}

const phases: { value: Phase; label: string; icon: string }[] = [
    { value: 'design', label: 'Design', icon: '🎨' },
    { value: 'implementation', label: 'Implementation', icon: '⚡' },
    { value: 'review', label: 'Review', icon: '🔍' }
];

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        gap: '4px',
        padding: '8px',
        borderBottom: '1px solid var(--vscode-panel-border, #454545)'
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

export function PhaseSelector({ currentPhase, onPhaseChange, disabled }: PhaseSelectorProps) {
    return (
        <div style={styles.container} role="tablist" aria-label="Development Phase">
            {phases.map(({ value, label, icon }) => {
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
                        onClick={() => !disabled && onPhaseChange(value)}
                        disabled={disabled}
                    >
                        <span aria-hidden="true">{icon}</span>
                        <span>{label}</span>
                    </button>
                );
            })}
        </div>
    );
}
