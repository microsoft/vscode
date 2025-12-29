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
 * Progress state - represents current agent activity
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
 * Milestone status
 */
export type MilestoneStatus = 'complete' | 'active' | 'pending';

/**
 * Milestone - represents a task step within a phase
 */
export interface Milestone {
    id: string;
    label: string;
    description?: string;
    status: MilestoneStatus;
    duration?: number;
}

/**
 * Phase history entry - tracks milestones for each phase
 */
export interface PhaseHistoryEntry {
    phase: Phase;
    milestones: Milestone[];
    startedAt: string;
    completedAt?: string;
}

/**
 * Session metadata for history list
 */
export interface SessionMeta {
    sessionId: string;
    title: string;
    createdAt: string;
    lastUpdated: string;
    messageCount: number;
    phase: Phase;
}

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
    /** Current progress state */
    progress: ProgressState;
    /** Token usage information */
    tokenUsage: TokenUsage | null;
    /** Phase history with milestones */
    phaseHistory: PhaseHistoryEntry[];
    /** Currently expanded phases in milestone view */
    expandedPhases: Phase[];
    /** Available sessions for current project */
    sessions: SessionMeta[];
    /** Current session ID */
    currentSessionId: string | null;
    /** Whether history panel is open */
    isHistoryOpen: boolean;
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
    /** Set progress state */
    setProgress: (progress: ProgressState) => void;
    /** Set token usage */
    setTokenUsage: (usage: TokenUsage | null) => void;
    /** Add or update phase history entry */
    updatePhaseHistory: (entry: PhaseHistoryEntry) => void;
    /** Add milestone to current phase */
    addMilestone: (milestone: Milestone) => void;
    /** Update milestone status */
    updateMilestoneStatus: (milestoneId: string, status: MilestoneStatus) => void;
    /** Toggle phase expansion in milestone view */
    togglePhaseExpanded: (phase: Phase) => void;
    /** Set expanded phases */
    setExpandedPhases: (phases: Phase[]) => void;
    /** Set sessions list */
    setSessions: (sessions: SessionMeta[]) => void;
    /** Set current session ID */
    setCurrentSessionId: (sessionId: string | null) => void;
    /** Toggle history panel */
    toggleHistoryPanel: () => void;
    /** Set history panel open state */
    setHistoryOpen: (isOpen: boolean) => void;
}

/**
 * Initial state
 */
const initialState: ChatState = {
    messages: [],
    phase: 'design',
    isLoading: false,
    inputValue: '',
    error: null,
    progress: { type: 'idle' },
    tokenUsage: null,
    phaseHistory: [],
    expandedPhases: [],
    sessions: [],
    currentSessionId: null,
    isHistoryOpen: false
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
    }),

    setProgress: (progress) => set({
        progress
    }),

    setTokenUsage: (tokenUsage) => set({
        tokenUsage
    }),

    updatePhaseHistory: (entry) => set((state) => {
        const existingIndex = state.phaseHistory.findIndex(
            (h) => h.phase === entry.phase
        );
        if (existingIndex >= 0) {
            const updated = [...state.phaseHistory];
            updated[existingIndex] = entry;
            return { phaseHistory: updated };
        }
        return { phaseHistory: [...state.phaseHistory, entry] };
    }),

    addMilestone: (milestone) => set((state) => {
        const currentPhase = state.phase;
        const existingIndex = state.phaseHistory.findIndex(
            (h) => h.phase === currentPhase
        );

        if (existingIndex >= 0) {
            const updated = [...state.phaseHistory];
            updated[existingIndex] = {
                ...updated[existingIndex],
                milestones: [...updated[existingIndex].milestones, milestone]
            };
            return { phaseHistory: updated };
        }

        // Create new phase history entry if none exists
        return {
            phaseHistory: [
                ...state.phaseHistory,
                {
                    phase: currentPhase,
                    milestones: [milestone],
                    startedAt: new Date().toISOString()
                }
            ]
        };
    }),

    updateMilestoneStatus: (milestoneId, status) => set((state) => {
        const updated = state.phaseHistory.map((entry) => ({
            ...entry,
            milestones: entry.milestones.map((m) =>
                m.id === milestoneId ? { ...m, status } : m
            )
        }));
        return { phaseHistory: updated };
    }),

    togglePhaseExpanded: (phase) => set((state) => {
        const isExpanded = state.expandedPhases.includes(phase);
        return {
            expandedPhases: isExpanded
                ? state.expandedPhases.filter((p) => p !== phase)
                : [...state.expandedPhases, phase]
        };
    }),

    setExpandedPhases: (expandedPhases) => set({
        expandedPhases
    }),

    setSessions: (sessions) => set({
        sessions
    }),

    setCurrentSessionId: (currentSessionId) => set({
        currentSessionId
    }),

    toggleHistoryPanel: () => set((state) => ({
        isHistoryOpen: !state.isHistoryOpen
    })),

    setHistoryOpen: (isHistoryOpen) => set({
        isHistoryOpen
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
