/**
 * VS Code API Hook
 * Provides access to VS Code Webview API
 */

import { useCallback, useEffect } from 'react';

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
    | { type: 'ready' };

/**
 * Message types from Webview to Extension
 */
export type WebviewMessage =
    | { type: 'send'; data: string }
    | { type: 'switch-phase'; data: string }
    | { type: 'cancel' }
    | { type: 'retry' }
    | { type: 'get-history' }
    | { type: 'clear-history' }
    | { type: 'ready' };

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

    return {
        postMessage,
        sendMessage,
        switchPhase,
        cancel,
        retry,
        getHistory,
        clearHistory,
        signalReady,
        isInVSCode: api !== null
    };
}

// Type declaration for VS Code API
declare function acquireVsCodeApi(): VSCodeApi;
