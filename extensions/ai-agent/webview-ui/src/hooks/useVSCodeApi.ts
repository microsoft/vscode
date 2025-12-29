/**
 * VS Code API Hook
 * Provides access to VS Code Webview API
 */

import { useCallback, useEffect } from 'react';
import { ProgressState, TokenUsage, SessionMeta, Phase } from '../stores/chatStore';

/**
 * VS Code API interface
 */
interface VSCodeApi {
    postMessage: (message: unknown) => void;
    getState: () => unknown;
    setState: (state: unknown) => void;
}

/**
 * Message types from Extension to Webview
 */
export type ExtensionMessage =
    | { type: 'message'; data: { id: string; content: string; sender: string; timestamp: string; source?: string } }
    | { type: 'history'; data: Array<{ id: string; content: string; sender: string; timestamp: string; source?: string }> }
    | { type: 'phase-changed'; data: string }
    | { type: 'output'; data: string }
    | { type: 'error'; data: string }
    | { type: 'clear' }
    | { type: 'ready' }
    | { type: 'locale'; data: string }
    | { type: 'progress'; data: ProgressState }
    | { type: 'token-usage'; data: TokenUsage }
    | { type: 'sessions-list'; data: SessionMeta[] }
    | { type: 'session-switched'; data: { sessionId: string; messages: Array<{ id: string; content: string; sender: string; timestamp: string; source?: string }>; phase: Phase } }
    | { type: 'session-created'; data: { sessionId: string } }
    | { type: 'session-deleted'; data: { sessionId: string } }
    | { type: 'toggle-history' };

/**
 * Message types from Webview to Extension
 */
export type WebviewMessage =
    | { type: 'send'; data: string }
    | { type: 'switch-phase'; data: string }
    | { type: 'phase-rollback'; data: { from: string; to: string } }
    | { type: 'cancel' }
    | { type: 'retry' }
    | { type: 'get-history' }
    | { type: 'clear-history' }
    | { type: 'ready' }
    | { type: 'get-sessions' }
    | { type: 'create-session' }
    | { type: 'switch-session'; data: string }
    | { type: 'delete-session'; data: string }
    | { type: 'rename-session'; data: { sessionId: string; title: string } };

// VS Code API singleton
let vsCodeApi: VSCodeApi | null = null;

/**
 * Get VS Code API instance
 */
function getVSCodeApi(): VSCodeApi | null {
    if (vsCodeApi) {
        return vsCodeApi;
    }

    // Check if running in VS Code webview
    if (typeof acquireVsCodeApi === 'function') {
        vsCodeApi = acquireVsCodeApi();
        return vsCodeApi;
    }

    // Running outside VS Code (development/testing)
    return null;
}

/**
 * Hook for VS Code API communication
 */
export function useVSCodeApi(onMessage?: (message: ExtensionMessage) => void) {
    const api = getVSCodeApi();

    // Setup message listener
    useEffect(() => {
        if (!onMessage) return;

        const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
            onMessage(event.data);
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [onMessage]);

    // Post message to extension
    const postMessage = useCallback((message: WebviewMessage) => {
        if (api) {
            api.postMessage(message);
        } else {
            // Log in development mode
            console.log('[Webview → Extension]', message);
        }
    }, [api]);

    // Send a chat message
    const sendMessage = useCallback((content: string) => {
        postMessage({ type: 'send', data: content });
    }, [postMessage]);

    // Switch development phase
    const switchPhase = useCallback((phase: string) => {
        postMessage({ type: 'switch-phase', data: phase });
    }, [postMessage]);

    // Cancel current operation
    const cancel = useCallback(() => {
        postMessage({ type: 'cancel' });
    }, [postMessage]);

    // Retry last operation
    const retry = useCallback(() => {
        postMessage({ type: 'retry' });
    }, [postMessage]);

    // Request chat history
    const getHistory = useCallback(() => {
        postMessage({ type: 'get-history' });
    }, [postMessage]);

    // Clear chat history
    const clearHistory = useCallback(() => {
        postMessage({ type: 'clear-history' });
    }, [postMessage]);

    // Signal ready
    const signalReady = useCallback(() => {
        postMessage({ type: 'ready' });
    }, [postMessage]);

    // Rollback to a previous phase
    const rollbackPhase = useCallback((from: string, to: string) => {
        postMessage({ type: 'phase-rollback', data: { from, to } });
    }, [postMessage]);

    // Get sessions list
    const getSessions = useCallback(() => {
        postMessage({ type: 'get-sessions' });
    }, [postMessage]);

    // Create a new session
    const createSession = useCallback(() => {
        postMessage({ type: 'create-session' });
    }, [postMessage]);

    // Switch to a different session
    const switchSession = useCallback((sessionId: string) => {
        postMessage({ type: 'switch-session', data: sessionId });
    }, [postMessage]);

    // Delete a session
    const deleteSession = useCallback((sessionId: string) => {
        postMessage({ type: 'delete-session', data: sessionId });
    }, [postMessage]);

    // Rename a session
    const renameSession = useCallback((sessionId: string, title: string) => {
        postMessage({ type: 'rename-session', data: { sessionId, title } });
    }, [postMessage]);

    return {
        postMessage,
        sendMessage,
        switchPhase,
        rollbackPhase,
        cancel,
        retry,
        getHistory,
        clearHistory,
        signalReady,
        getSessions,
        createSession,
        switchSession,
        deleteSession,
        renameSession,
        isInVSCode: api !== null
    };
}

// Type declaration for VS Code API
declare function acquireVsCodeApi(): VSCodeApi;
