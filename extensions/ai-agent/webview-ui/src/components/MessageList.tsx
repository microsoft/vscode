/**
 * Message List Component
 * Displays chat messages
 */

import React, { useEffect, useRef } from 'react';
import type { ChatMessage } from '../stores/chatStore';

interface MessageListProps {
    /** Messages to display */
    messages: ChatMessage[];
    /** Whether AI is loading */
    isLoading?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
    },
    message: {
        display: 'flex',
        flexDirection: 'column',
        maxWidth: '85%',
        padding: '10px 14px',
        borderRadius: '8px',
        wordBreak: 'break-word'
    },
    userMessage: {
        alignSelf: 'flex-end',
        backgroundColor: 'var(--vscode-button-background, #0e639c)',
        color: 'var(--vscode-button-foreground, #ffffff)'
    },
    assistantMessage: {
        alignSelf: 'flex-start',
        backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground, #3a3d41)',
        color: 'var(--vscode-foreground, #cccccc)'
    },
    systemMessage: {
        alignSelf: 'center',
        backgroundColor: 'var(--vscode-editorInfo-background, #2a4a6b)',
        color: 'var(--vscode-editorInfo-foreground, #9cdcfe)',
        fontSize: '0.9em',
        fontStyle: 'italic'
    },
    content: {
        whiteSpace: 'pre-wrap'
    },
    meta: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '6px',
        fontSize: '0.8em',
        opacity: 0.7
    },
    source: {
        textTransform: 'capitalize'
    },
    timestamp: {
        marginLeft: 'auto'
    },
    loadingDots: {
        alignSelf: 'flex-start',
        padding: '12px 16px',
        backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground, #3a3d41)',
        borderRadius: '8px'
    },
    dot: {
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: 'var(--vscode-foreground, #cccccc)',
        marginRight: '4px',
        animation: 'pulse 1.4s infinite ease-in-out'
    },
    emptyState: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--vscode-descriptionForeground, #8b8b8b)',
        textAlign: 'center',
        padding: '20px'
    }
};

function formatTime(timestamp: string): string {
    try {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function Message({ message }: { message: ChatMessage }) {
    const senderStyles = {
        user: styles.userMessage,
        assistant: styles.assistantMessage,
        system: styles.systemMessage
    };

    return (
        <div
            style={{ ...styles.message, ...senderStyles[message.sender] }}
            role="article"
            aria-label={`Message from ${message.sender}`}
        >
            <div style={styles.content}>{message.content}</div>
            <div style={styles.meta}>
                {message.source && (
                    <span style={styles.source}>{message.source}</span>
                )}
                <span style={styles.timestamp}>{formatTime(message.timestamp)}</span>
            </div>
        </div>
    );
}

function LoadingIndicator() {
    return (
        <div style={styles.loadingDots} aria-label="AI is thinking" role="status">
            <span style={{ ...styles.dot, animationDelay: '0s' }} />
            <span style={{ ...styles.dot, animationDelay: '0.2s' }} />
            <span style={{ ...styles.dot, animationDelay: '0.4s' }} />
        </div>
    );
}

export function MessageList({ messages, isLoading }: MessageListProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    if (messages.length === 0 && !isLoading) {
        return (
            <div style={styles.emptyState}>
                <div>
                    <div style={{ fontSize: '2em', marginBottom: '8px' }}>💬</div>
                    <div>Start a conversation with the AI assistant</div>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} style={styles.container} role="log" aria-live="polite">
            {messages.map((message) => (
                <Message key={message.id} message={message} />
            ))}
            {isLoading && <LoadingIndicator />}
        </div>
    );
}
