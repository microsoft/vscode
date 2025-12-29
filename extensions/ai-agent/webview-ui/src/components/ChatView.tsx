/**
 * Chat View Component
 * Main chat container combining all chat components
 */

import React, { useCallback, useEffect } from 'react';
import { useChatStore, createChatMessage } from '../stores/chatStore';
import { useVSCodeApi, ExtensionMessage } from '../hooks/useVSCodeApi';
import { PhaseSelector } from './PhaseSelector';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { TokenUsage, ProgressIndicator, Milestones } from './Progress';
import { HistoryPanel } from './History';
import type { Phase, ChatMessage, ProgressState, TokenUsage as TokenUsageType, SessionMeta } from '../stores/chatStore';

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid var(--vscode-panel-border, #454545)',
        padding: '4px 8px',
        gap: '8px'
    },
    tokenUsageRow: {
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '4px 8px',
        borderBottom: '1px solid var(--vscode-panel-border, #454545)'
    },
    errorBanner: {
        padding: '8px 12px',
        backgroundColor: 'var(--vscode-inputValidation-errorBackground, #5a1d1d)',
        color: 'var(--vscode-inputValidation-errorForeground, #f48771)',
        borderBottom: '1px solid var(--vscode-inputValidation-errorBorder, #be1100)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    errorDismiss: {
        background: 'none',
        border: 'none',
        color: 'inherit',
        cursor: 'pointer',
        padding: '4px',
        fontSize: '1.2em'
    },
    mainContent: {
        display: 'flex',
        flex: 1,
        overflow: 'hidden'
    },
    chatColumn: {
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'hidden'
    },
    sidebar: {
        width: '240px',
        borderLeft: '1px solid var(--vscode-panel-border, #454545)',
        overflowY: 'auto'
    }
};

export function ChatView() {
    const {
        messages,
        phase,
        isLoading,
        inputValue,
        error,
        progress,
        tokenUsage,
        phaseHistory,
        expandedPhases,
        sessions,
        currentSessionId,
        isHistoryOpen,
        addMessage,
        setMessages,
        clearMessages,
        setPhase,
        setLoading,
        setInputValue,
        setError,
        setProgress,
        setTokenUsage,
        togglePhaseExpanded,
        setSessions,
        setCurrentSessionId,
        toggleHistoryPanel,
        setHistoryOpen
    } = useChatStore();

    const handleExtensionMessage = useCallback((message: ExtensionMessage) => {
        switch (message.type) {
            case 'message':
                addMessage(message.data as ChatMessage);
                setLoading(false);
                setProgress({ type: 'idle' });
                break;

            case 'history':
                setMessages(message.data as ChatMessage[]);
                break;

            case 'phase-changed': {
                // Handle both simple phase string and object with isRollback
                const data = message.data as Phase | { phase: Phase; isRollback?: boolean };
                if (typeof data === 'object' && data !== null && 'phase' in data) {
                    setPhase(data.phase);
                } else {
                    setPhase(data);
                }
                break;
            }

            case 'output':
                // Output is handled by the message type
                break;

            case 'error':
                setError(message.data);
                setLoading(false);
                setProgress({ type: 'error', message: message.data });
                break;

            case 'clear':
                clearMessages();
                break;

            case 'ready':
                // Extension is ready
                break;

            case 'locale':
                // Locale is handled by useLocale hook
                break;

            case 'progress':
                setProgress(message.data as ProgressState);
                break;

            case 'token-usage':
                setTokenUsage(message.data as TokenUsageType);
                break;

            case 'sessions-list':
                setSessions(message.data as SessionMeta[]);
                break;

            case 'session-switched': {
                const data = message.data as { sessionId: string; messages: ChatMessage[]; phase: Phase };
                setMessages(data.messages);
                setPhase(data.phase);
                setCurrentSessionId(data.sessionId);
                setHistoryOpen(false);
                break;
            }

            case 'session-created': {
                const data = message.data as { sessionId: string };
                setCurrentSessionId(data.sessionId);
                clearMessages();
                setHistoryOpen(false);
                break;
            }

            case 'session-deleted':
                // Sessions list will be updated via 'sessions-list' message
                break;

            case 'toggle-history':
                toggleHistoryPanel();
                break;
        }
    }, [addMessage, setMessages, clearMessages, setPhase, setLoading, setError, setProgress, setTokenUsage, setSessions, setCurrentSessionId, setHistoryOpen, toggleHistoryPanel]);

    const {
        sendMessage,
        switchPhase,
        rollbackPhase,
        cancel,
        signalReady,
        createSession,
        switchSession,
        deleteSession
    } = useVSCodeApi(handleExtensionMessage);

    // Signal ready on mount
    useEffect(() => {
        signalReady();
    }, [signalReady]);

    const handleSendMessage = useCallback((content: string) => {
        // Add user message locally for immediate feedback
        const userMessage = createChatMessage(content, 'user');
        addMessage(userMessage);
        setLoading(true);
        setProgress({ type: 'thinking' });

        // Send to extension
        sendMessage(content);
    }, [addMessage, setLoading, setProgress, sendMessage]);

    const handlePhaseChange = useCallback((newPhase: Phase) => {
        switchPhase(newPhase);
    }, [switchPhase]);

    const handlePhaseRollback = useCallback((from: Phase, to: Phase) => {
        rollbackPhase(from, to);
    }, [rollbackPhase]);

    const handleCancel = useCallback(() => {
        cancel();
        setLoading(false);
        setProgress({ type: 'idle' });
    }, [cancel, setLoading, setProgress]);

    const handleCreateSession = useCallback(() => {
        createSession();
    }, [createSession]);

    const handleSelectSession = useCallback((sessionId: string) => {
        switchSession(sessionId);
    }, [switchSession]);

    const handleDeleteSession = useCallback((sessionId: string) => {
        deleteSession(sessionId);
    }, [deleteSession]);

    const dismissError = useCallback(() => {
        setError(null);
        if (progress.type === 'error') {
            setProgress({ type: 'idle' });
        }
    }, [setError, progress, setProgress]);

    const showSidebar = phaseHistory.length > 0;

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <PhaseSelector
                    currentPhase={phase}
                    onPhaseChange={handlePhaseChange}
                    onPhaseRollback={handlePhaseRollback}
                    disabled={isLoading}
                />
            </div>

            {/* History Panel - controlled by title bar button */}
            <HistoryPanel
                sessions={sessions}
                currentSessionId={currentSessionId}
                isOpen={isHistoryOpen}
                onClose={() => setHistoryOpen(false)}
                onSelectSession={handleSelectSession}
                onDeleteSession={handleDeleteSession}
                onCreateSession={handleCreateSession}
            />

            {tokenUsage && (
                <div style={styles.tokenUsageRow}>
                    <TokenUsage used={tokenUsage.used} limit={tokenUsage.limit} />
                </div>
            )}

            {error && (
                <div style={styles.errorBanner} role="alert">
                    <span>{error}</span>
                    <button
                        onClick={dismissError}
                        style={styles.errorDismiss}
                        aria-label="Dismiss error"
                    >
                        &times;
                    </button>
                </div>
            )}

            <div style={styles.mainContent}>
                <div style={styles.chatColumn}>
                    <MessageList
                        messages={messages}
                        isLoading={isLoading}
                    />

                    {progress.type !== 'idle' && progress.type !== 'error' && (
                        <ProgressIndicator
                            progress={progress}
                            onCancel={handleCancel}
                        />
                    )}

                    <InputArea
                        value={inputValue}
                        onChange={setInputValue}
                        onSubmit={handleSendMessage}
                        onCancel={handleCancel}
                        isLoading={isLoading}
                    />
                </div>

                {showSidebar && (
                    <div style={styles.sidebar}>
                        <Milestones
                            phaseHistory={phaseHistory}
                            expandedPhases={expandedPhases}
                            onTogglePhase={togglePhaseExpanded}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
