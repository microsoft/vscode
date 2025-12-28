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
import type { Phase, ChatMessage } from '../stores/chatStore';

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
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
    }
};

export function ChatView() {
    const {
        messages,
        phase,
        isLoading,
        inputValue,
        error,
        addMessage,
        setMessages,
        clearMessages,
        setPhase,
        setLoading,
        setInputValue,
        setError
    } = useChatStore();

    const handleExtensionMessage = useCallback((message: ExtensionMessage) => {
        switch (message.type) {
            case 'message':
                addMessage(message.data as ChatMessage);
                setLoading(false);
                break;

            case 'history':
                setMessages(message.data as ChatMessage[]);
                break;

            case 'phase-changed':
                setPhase(message.data as Phase);
                break;

            case 'output':
                // Output is handled by the message type
                break;

            case 'error':
                setError(message.data);
                setLoading(false);
                break;

            case 'clear':
                clearMessages();
                break;

            case 'ready':
                // Extension is ready
                break;
        }
    }, [addMessage, setMessages, clearMessages, setPhase, setLoading, setError]);

    const {
        sendMessage,
        switchPhase,
        cancel,
        clearHistory,
        signalReady
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

        // Send to extension
        sendMessage(content);
    }, [addMessage, setLoading, sendMessage]);

    const handlePhaseChange = useCallback((newPhase: Phase) => {
        switchPhase(newPhase);
    }, [switchPhase]);

    const handleCancel = useCallback(() => {
        cancel();
        setLoading(false);
    }, [cancel, setLoading]);

    const handleClear = useCallback(() => {
        clearHistory();
    }, [clearHistory]);

    const dismissError = useCallback(() => {
        setError(null);
    }, [setError]);

    return (
        <div style={styles.container}>
            <PhaseSelector
                currentPhase={phase}
                onPhaseChange={handlePhaseChange}
                disabled={isLoading}
            />

            {error && (
                <div style={styles.errorBanner} role="alert">
                    <span>{error}</span>
                    <button
                        onClick={dismissError}
                        style={styles.errorDismiss}
                        aria-label="Dismiss error"
                    >
                        ×
                    </button>
                </div>
            )}

            <MessageList
                messages={messages}
                isLoading={isLoading}
            />

            <InputArea
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSendMessage}
                onCancel={handleCancel}
                onClear={handleClear}
                isLoading={isLoading}
            />
        </div>
    );
}
