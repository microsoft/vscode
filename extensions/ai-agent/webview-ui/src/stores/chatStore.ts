/**
 * Chat Store
 * Zustand store for managing chat state
 */

import { create } from 'zustand';

/**
 * Chat message structure
 */
export interface ChatMessage {
    id: string;
    content: string;
    sender: 'user' | 'assistant' | 'system';
    timestamp: string;
    source?: string;
}

/**
 * Development phase
 */
export type Phase = 'design' | 'implementation' | 'review';

/**
 * Chat store state
 */
interface ChatState {
    /** Chat messages */
    messages: ChatMessage[];
    /** Current development phase */
    phase: Phase;
    /** Whether AI is processing */
    isLoading: boolean;
    /** Current input value */
    inputValue: string;
    /** Error message */
    error: string | null;
}

/**
 * Chat store actions
 */
interface ChatActions {
    /** Add a message to the chat */
    addMessage: (message: ChatMessage) => void;
    /** Set all messages (for history load) */
    setMessages: (messages: ChatMessage[]) => void;
    /** Clear all messages */
    clearMessages: () => void;
    /** Update the current phase */
    setPhase: (phase: Phase) => void;
    /** Set loading state */
    setLoading: (isLoading: boolean) => void;
    /** Set input value */
    setInputValue: (value: string) => void;
    /** Set error message */
    setError: (error: string | null) => void;
}

/**
 * Initial state
 */
const initialState: ChatState = {
    messages: [],
    phase: 'implementation',
    isLoading: false,
    inputValue: '',
    error: null
};

/**
 * Chat store
 */
export const useChatStore = create<ChatState & ChatActions>((set) => ({
    ...initialState,

    addMessage: (message) => set((state) => ({
        messages: [...state.messages, message],
        error: null
    })),

    setMessages: (messages) => set({
        messages,
        error: null
    }),

    clearMessages: () => set({
        messages: [],
        error: null
    }),

    setPhase: (phase) => set({
        phase,
        error: null
    }),

    setLoading: (isLoading) => set({
        isLoading
    }),

    setInputValue: (inputValue) => set({
        inputValue
    }),

    setError: (error) => set({
        error
    })
}));

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new chat message
 */
export function createChatMessage(
    content: string,
    sender: ChatMessage['sender'],
    source?: string
): ChatMessage {
    return {
        id: generateMessageId(),
        content,
        sender,
        timestamp: new Date().toISOString(),
        source
    };
}
