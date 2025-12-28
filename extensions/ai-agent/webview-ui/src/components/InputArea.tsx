/**
 * Input Area Component
 * Text input and action buttons for chat
 */

import React, { useCallback, KeyboardEvent } from 'react';

interface InputAreaProps {
    /** Current input value */
    value: string;
    /** Callback when input changes */
    onChange: (value: string) => void;
    /** Callback when message is submitted */
    onSubmit: (message: string) => void;
    /** Callback to cancel current operation */
    onCancel?: () => void;
    /** Callback to clear history */
    onClear?: () => void;
    /** Whether input is disabled */
    disabled?: boolean;
    /** Whether AI is currently loading */
    isLoading?: boolean;
    /** Placeholder text */
    placeholder?: string;
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        borderTop: '1px solid var(--vscode-panel-border, #454545)',
        backgroundColor: 'var(--vscode-sideBar-background, #252526)'
    },
    inputRow: {
        display: 'flex',
        gap: '8px'
    },
    textarea: {
        flex: 1,
        minHeight: '60px',
        maxHeight: '200px',
        padding: '10px 12px',
        border: '1px solid var(--vscode-input-border, #3c3c3c)',
        borderRadius: '4px',
        backgroundColor: 'var(--vscode-input-background, #3c3c3c)',
        color: 'var(--vscode-input-foreground, #cccccc)',
        fontSize: 'var(--vscode-font-size, 13px)',
        fontFamily: 'var(--vscode-font-family, inherit)',
        resize: 'vertical',
        outline: 'none'
    },
    buttonColumn: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
    },
    button: {
        padding: '8px 16px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: 'var(--vscode-font-size, 13px)',
        fontFamily: 'var(--vscode-font-family, inherit)',
        transition: 'opacity 0.2s'
    },
    primaryButton: {
        backgroundColor: 'var(--vscode-button-background, #0e639c)',
        color: 'var(--vscode-button-foreground, #ffffff)'
    },
    secondaryButton: {
        backgroundColor: 'var(--vscode-button-secondaryBackground, #3a3d41)',
        color: 'var(--vscode-button-secondaryForeground, #cccccc)'
    },
    disabledButton: {
        opacity: 0.5,
        cursor: 'not-allowed'
    },
    actionRow: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px'
    },
    smallButton: {
        padding: '4px 8px',
        fontSize: '0.9em'
    }
};

export function InputArea({
    value,
    onChange,
    onSubmit,
    onCancel,
    onClear,
    disabled,
    isLoading,
    placeholder = 'Type your message...'
}: InputAreaProps) {
    const handleSubmit = useCallback(() => {
        const trimmed = value.trim();
        if (trimmed && !disabled && !isLoading) {
            onSubmit(trimmed);
            onChange('');
        }
    }, [value, disabled, isLoading, onSubmit, onChange]);

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
        // Submit on Ctrl+Enter or Cmd+Enter
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSubmit();
        }
    }, [handleSubmit]);

    const isSubmitDisabled = disabled || isLoading || !value.trim();

    return (
        <div style={styles.container}>
            <div style={styles.inputRow}>
                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    style={{
                        ...styles.textarea,
                        ...(disabled ? { opacity: 0.5 } : {})
                    }}
                    aria-label="Message input"
                />
                <div style={styles.buttonColumn}>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitDisabled}
                        style={{
                            ...styles.button,
                            ...styles.primaryButton,
                            ...(isSubmitDisabled ? styles.disabledButton : {})
                        }}
                        aria-label="Send message"
                    >
                        {isLoading ? '...' : 'Send'}
                    </button>
                    {isLoading && onCancel && (
                        <button
                            onClick={onCancel}
                            style={{
                                ...styles.button,
                                ...styles.secondaryButton
                            }}
                            aria-label="Cancel operation"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>
            <div style={styles.actionRow}>
                {onClear && (
                    <button
                        onClick={onClear}
                        disabled={disabled || isLoading}
                        style={{
                            ...styles.button,
                            ...styles.secondaryButton,
                            ...styles.smallButton,
                            ...(disabled || isLoading ? styles.disabledButton : {})
                        }}
                        aria-label="Clear chat history"
                    >
                        Clear
                    </button>
                )}
                <span style={{ fontSize: '0.8em', opacity: 0.6 }}>
                    Ctrl+Enter to send
                </span>
            </div>
        </div>
    );
}
