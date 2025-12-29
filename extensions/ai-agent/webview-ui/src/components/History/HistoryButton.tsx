/**
 * History Button Component
 * Button to toggle the history panel
 */

import React, { useCallback, useRef } from 'react';
import { HistoryPanel } from './HistoryPanel';
import { useTranslation } from '../../hooks/useLocale';
import type { SessionMeta } from '../../stores/chatStore';

interface HistoryButtonProps {
    sessions: SessionMeta[];
    currentSessionId: string | null;
    isOpen: boolean;
    onToggle: () => void;
    onSelectSession: (sessionId: string) => void;
    onCreateSession: () => void;
    onDeleteSession: (sessionId: string) => void;
    disabled?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        position: 'relative'
    },
    button: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '6px 10px',
        backgroundColor: 'var(--vscode-button-secondaryBackground, #3a3d41)',
        color: 'var(--vscode-button-secondaryForeground, #cccccc)',
        border: '1px solid var(--vscode-button-border, transparent)',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: 'var(--vscode-font-size, 13px)',
        fontFamily: 'var(--vscode-font-family, inherit)',
        transition: 'background-color 0.15s'
    },
    buttonDisabled: {
        opacity: 0.5,
        cursor: 'not-allowed'
    },
    icon: {
        fontSize: '14px'
    },
    badge: {
        backgroundColor: 'var(--vscode-badge-background, #4d4d4d)',
        color: 'var(--vscode-badge-foreground, #ffffff)',
        padding: '1px 5px',
        borderRadius: '8px',
        fontSize: '10px',
        marginLeft: '4px'
    }
};

export function HistoryButton({
    sessions,
    currentSessionId,
    isOpen,
    onToggle,
    onSelectSession,
    onCreateSession,
    onDeleteSession,
    disabled
}: HistoryButtonProps) {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);

    const handleClick = useCallback(() => {
        if (!disabled) {
            onToggle();
        }
    }, [disabled, onToggle]);

    const buttonStyle: React.CSSProperties = {
        ...styles.button,
        ...(disabled ? styles.buttonDisabled : {})
    };

    return (
        <div ref={containerRef} style={styles.container}>
            <button
                style={buttonStyle}
                onClick={handleClick}
                disabled={disabled}
                aria-label={t('history')}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
            >
                <span style={styles.icon} aria-hidden="true">{'\uD83D\uDCCB'}</span>
                <span>{t('history')}</span>
                {sessions.length > 1 && (
                    <span style={styles.badge}>{sessions.length}</span>
                )}
            </button>
            <HistoryPanel
                sessions={sessions}
                currentSessionId={currentSessionId}
                isOpen={isOpen}
                onClose={onToggle}
                onSelectSession={onSelectSession}
                onCreateSession={onCreateSession}
                onDeleteSession={onDeleteSession}
            />
        </div>
    );
}
