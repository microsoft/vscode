/**
 * History Item Component
 * Displays a single session in the history list
 */

import React, { useCallback } from 'react';
import { useTranslation } from '../../hooks/useLocale';
import type { SessionMeta, Phase } from '../../stores/chatStore';

interface HistoryItemProps {
    session: SessionMeta;
    isActive: boolean;
    onSelect: (sessionId: string) => void;
    onDelete?: (sessionId: string) => void;
}

const phaseIcons: Record<Phase, string> = {
    design: '\uD83C\uDFA8',
    implementation: '\u26A1',
    review: '\uD83D\uDD0D'
};

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        cursor: 'pointer',
        borderRadius: '4px',
        marginBottom: '4px',
        transition: 'background-color 0.15s'
    },
    containerHover: {
        backgroundColor: 'var(--vscode-list-hoverBackground, rgba(255,255,255,0.1))'
    },
    containerActive: {
        backgroundColor: 'var(--vscode-list-activeSelectionBackground, #094771)',
        color: 'var(--vscode-list-activeSelectionForeground, #ffffff)'
    },
    icon: {
        marginRight: '8px',
        fontSize: '16px'
    },
    content: {
        flex: 1,
        overflow: 'hidden'
    },
    title: {
        fontSize: '13px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
    },
    meta: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '11px',
        opacity: 0.7,
        marginTop: '2px'
    },
    badge: {
        backgroundColor: 'var(--vscode-badge-background, #4d4d4d)',
        color: 'var(--vscode-badge-foreground, #ffffff)',
        padding: '1px 6px',
        borderRadius: '10px',
        fontSize: '10px'
    },
    deleteButton: {
        background: 'none',
        border: 'none',
        padding: '4px',
        cursor: 'pointer',
        opacity: 0.6,
        fontSize: '14px',
        color: 'inherit',
        borderRadius: '4px'
    },
    confirmOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100
    },
    confirmDialog: {
        backgroundColor: 'var(--vscode-editorWidget-background, #252526)',
        border: '1px solid var(--vscode-editorWidget-border, #454545)',
        borderRadius: '6px',
        padding: '16px 20px',
        minWidth: '280px',
        textAlign: 'center'
    },
    confirmText: {
        margin: '0 0 16px 0',
        fontSize: '13px'
    },
    confirmButtons: {
        display: 'flex',
        gap: '8px',
        justifyContent: 'center'
    },
    cancelButton: {
        padding: '6px 12px',
        border: '1px solid var(--vscode-button-border, #454545)',
        borderRadius: '4px',
        backgroundColor: 'transparent',
        color: 'inherit',
        cursor: 'pointer'
    },
    deleteConfirmButton: {
        padding: '6px 12px',
        border: 'none',
        borderRadius: '4px',
        backgroundColor: 'var(--vscode-inputValidation-errorBackground, #5a1d1d)',
        color: 'var(--vscode-inputValidation-errorForeground, #f48771)',
        cursor: 'pointer'
    }
};

function formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
        return 'Yesterday';
    } else if (days < 7) {
        return date.toLocaleDateString([], { weekday: 'short' });
    } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
}

export function HistoryItem({ session, isActive, onSelect, onDelete }: HistoryItemProps) {
    const { t } = useTranslation();
    const [isHovered, setIsHovered] = React.useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

    const handleClick = useCallback(() => {
        onSelect(session.sessionId);
    }, [session.sessionId, onSelect]);

    const handleDeleteClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setShowDeleteConfirm(true);
    }, []);

    const handleConfirmDelete = useCallback(() => {
        if (onDelete) {
            onDelete(session.sessionId);
        }
        setShowDeleteConfirm(false);
    }, [session.sessionId, onDelete]);

    const handleCancelDelete = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setShowDeleteConfirm(false);
    }, []);

    const containerStyle: React.CSSProperties = {
        ...styles.container,
        ...(isHovered && !isActive ? styles.containerHover : {}),
        ...(isActive ? styles.containerActive : {})
    };

    return (
        <div
            style={containerStyle}
            onClick={handleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            role="button"
            tabIndex={0}
            aria-selected={isActive}
        >
            <span style={styles.icon} aria-hidden="true">
                {phaseIcons[session.phase]}
            </span>
            <div style={styles.content}>
                <div style={styles.title}>{session.title}</div>
                <div style={styles.meta}>
                    <span>{formatDate(session.lastUpdated)}</span>
                    <span>{t('sessionMessages').replace('{count}', String(session.messageCount))}</span>
                    {isActive && (
                        <span style={styles.badge}>{t('currentSession')}</span>
                    )}
                </div>
            </div>
            {!isActive && onDelete && isHovered && (
                <button
                    style={styles.deleteButton}
                    onClick={handleDeleteClick}
                    title={t('deleteSession')}
                    aria-label={t('deleteSession')}
                >
                    🗑️
                </button>
            )}
            {showDeleteConfirm && (
                <div style={styles.confirmOverlay} onClick={handleCancelDelete}>
                    <div style={styles.confirmDialog} onClick={e => e.stopPropagation()}>
                        <p style={styles.confirmText}>{t('deleteSessionConfirm')}</p>
                        <div style={styles.confirmButtons}>
                            <button style={styles.cancelButton} onClick={handleCancelDelete}>
                                {t('cancel')}
                            </button>
                            <button style={styles.deleteConfirmButton} onClick={handleConfirmDelete}>
                                {t('delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
