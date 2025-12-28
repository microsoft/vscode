/**
 * Webview Message Type Definitions
 * Defines the communication protocol between Extension and Webview
 */

import type { Phase, CLIStatus } from './cli';

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
    | { type: 'ready' };

/**
 * Messages from Webview to Extension
 */
export type WebviewToExtensionMessage =
    | { type: 'send'; data: string }
    | { type: 'switch-phase'; data: Phase }
    | { type: 'cancel' }
    | { type: 'retry' }
    | { type: 'get-history' }
    | { type: 'clear-history' }
    | { type: 'ready' };

/**
 * Union type for all messages
 */
export type WebviewMessage = ExtensionToWebviewMessage | WebviewToExtensionMessage;

/**
 * Type guard for Extension messages
 */
export function isExtensionMessage(msg: WebviewMessage): msg is ExtensionToWebviewMessage {
    return ['output', 'message', 'status', 'phase-changed', 'history', 'error', 'clear', 'ready'].includes(msg.type);
}

/**
 * Type guard for Webview messages
 */
export function isWebviewMessage(msg: WebviewMessage): msg is WebviewToExtensionMessage {
    return ['send', 'switch-phase', 'cancel', 'retry', 'get-history', 'clear-history', 'ready'].includes(msg.type);
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
