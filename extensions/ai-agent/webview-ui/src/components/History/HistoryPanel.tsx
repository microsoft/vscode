/**
 * History Panel Component
 * Displays list of available sessions with ability to switch or create new
 */

import React, { useCallback } from 'react';
import { HistoryItem } from './HistoryItem';
import { useTranslation } from '../../hooks/useLocale';
import type { SessionMeta } from '../../stores/chatStore';

interface HistoryPanelProps {
    sessions: SessionMeta[];
    currentSessionId: string | null;
    isOpen: boolean;
    onClose: () => void;
    onSelectSession: (sessionId: string) => void;
    onCreateSession: () => void;
    onDeleteSession: (sessionId: string) => void;
}

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        zIndex: 999
    },
    panel: {
        position: 'fixed',
        top: '40px',
        left: 0,
        right: 0,
        maxHeight: '350px',
        backgroundColor: 'var(--vscode-sideBar-background, #252526)',
        borderBottom: '1px solid var(--vscode-dropdown-border, #454545)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        zIndex: 1000,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid var(--vscode-dropdown-border, #454545)'
    },
    title: {
        fontSize: '12px',
        fontWeight: 600,
        textTransform: 'uppercase',
        opacity: 0.7
    },
    newButton: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        backgroundColor: 'var(--vscode-button-background, #0e639c)',
        color: 'var(--vscode-button-foreground, #ffffff)',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '12px'
    },
    list: {
        flex: 1,
        overflowY: 'auto',
        padding: '8px'
    },
    empty: {
        textAlign: 'center',
        padding: '24px 16px',
        opacity: 0.6,
        fontSize: '13px'
    }
};

export function HistoryPanel({
    sessions,
    currentSessionId,
    isOpen,
    onClose,
    onSelectSession,
    onCreateSession,
    onDeleteSession
}: HistoryPanelProps) {
    const { t } = useTranslation();

    const handleOverlayClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }, [onClose]);

    const handleSelectSession = useCallback((sessionId: string) => {
        if (sessionId !== currentSessionId) {
            onSelectSession(sessionId);
        }
        onClose();
    }, [currentSessionId, onSelectSession, onClose]);

    const handleCreateSession = useCallback(() => {
        onCreateSession();
        onClose();
    }, [onCreateSession, onClose]);

    if (!isOpen) {
        return null;
    }

    // Sort sessions by lastUpdated (newest first)
    const sortedSessions = [...sessions].sort(
        (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    );

    return (
        <>
            <div style={styles.overlay} onClick={handleOverlayClick} />
            <div style={styles.panel}>
                <div style={styles.header}>
                    <span style={styles.title}>{t('history')}</span>
                    <button
                        style={styles.newButton}
                        onClick={handleCreateSession}
                        title={t('newChat')}
                    >
                        <span>+</span>
                        <span>{t('newChat')}</span>
                    </button>
                </div>
                <div style={styles.list}>
                    {sortedSessions.length === 0 ? (
                        <div style={styles.empty}>{t('noSessions')}</div>
                    ) : (
                        sortedSessions.map(session => (
                            <HistoryItem
                                key={session.sessionId}
                                session={session}
                                isActive={session.sessionId === currentSessionId}
                                onSelect={handleSelectSession}
                                onDelete={onDeleteSession}
                            />
                        ))
                    )}
                </div>
            </div>
        </>
    );
}
