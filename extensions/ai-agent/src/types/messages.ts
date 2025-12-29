/**
 * Webview Message Type Definitions
 * Defines the communication protocol between Extension and Webview
 */

import type { Phase, CLIStatus } from './cli';
import type { SessionMeta } from './state';

/**
 * Message sender identifier
 */
export type MessageSender = 'user' | 'assistant' | 'system';

/**
 * Chat message structure
 */
export interface ChatMessage {
    /** Unique message ID */
    id: string;
    /** Message sender */
    sender: MessageSender;
    /** Message content */
    content: string;
    /** Timestamp (ISO 8601) */
    timestamp: string;
    /** Current phase when message was sent */
    phase: Phase;
    /** CLI that generated/received the message */
    cli?: string;
}

/**
 * Progress state for webview
 */
export type ProgressState =
    | { type: 'idle' }
    | { type: 'thinking'; message?: string }
    | { type: 'searching'; target: string }
    | { type: 'reading'; files: string[] }
    | { type: 'writing'; files: string[] }
    | { type: 'executing'; command: string }
    | { type: 'error'; message: string };

/**
 * Token usage information
 */
export interface TokenUsage {
    used: number;
    limit: number;
}

/**
 * Messages from Extension to Webview
 */
export type ExtensionToWebviewMessage =
    | { type: 'output'; data: string }
    | { type: 'message'; data: ChatMessage }
    | { type: 'status'; data: CLIStatus }
    | { type: 'phase-changed'; data: Phase }
    | { type: 'history'; data: ChatMessage[] }
    | { type: 'error'; data: string }
    | { type: 'clear' }
    | { type: 'ready' }
    | { type: 'locale'; data: string }
    | { type: 'progress'; data: ProgressState }
    | { type: 'token-usage'; data: TokenUsage }
    | { type: 'sessions-list'; data: SessionMeta[] }
    | { type: 'session-switched'; data: { sessionId: string; messages: ChatMessage[]; phase: Phase } }
    | { type: 'session-created'; data: { sessionId: string } }
    | { type: 'session-deleted'; data: { sessionId: string } }
    | { type: 'toggle-history' };

/**
 * Messages from Webview to Extension
 */
export type WebviewToExtensionMessage =
    | { type: 'send'; data: string }
    | { type: 'switch-phase'; data: Phase }
    | { type: 'phase-rollback'; data: { from: Phase; to: Phase } }
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

/**
 * Union type for all messages
 */
export type WebviewMessage = ExtensionToWebviewMessage | WebviewToExtensionMessage;

/**
 * Type guard for Extension messages
 */
export function isExtensionMessage(msg: WebviewMessage): msg is ExtensionToWebviewMessage {
    return ['output', 'message', 'status', 'phase-changed', 'history', 'error', 'clear', 'ready', 'locale', 'progress', 'token-usage', 'sessions-list', 'session-switched', 'session-created', 'session-deleted', 'toggle-history'].includes(msg.type);
}

/**
 * Type guard for Webview messages
 */
export function isWebviewMessage(msg: WebviewMessage): msg is WebviewToExtensionMessage {
    return ['send', 'switch-phase', 'phase-rollback', 'cancel', 'retry', 'get-history', 'clear-history', 'ready', 'get-sessions', 'create-session', 'switch-session', 'delete-session', 'rename-session'].includes(msg.type);
}

/**
 * Message handler type
 */
export type MessageHandler<T extends WebviewMessage> = (message: T) => void | Promise<void>;

/**
 * Webview post message function type
 */
export type PostMessage = (message: ExtensionToWebviewMessage) => void;

/**
 * Creates a unique message ID
 */
export function createMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates a chat message object
 */
export function createChatMessage(
    sender: MessageSender,
    content: string,
    phase: Phase,
    cli?: string
): ChatMessage {
    return {
        id: createMessageId(),
        sender,
        content,
        timestamp: new Date().toISOString(),
        phase,
        cli
    };
}
