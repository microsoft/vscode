/**
 * State Schema Type Definitions
 * Defines the structure for state.json and session management
 */

import type { Phase } from './cli';
import type { ChatMessage } from './messages';

/**
 * State schema version
 */
export const STATE_VERSION = '1.0';

/**
 * Agent memory structure
 * Stores short-term context and pending tasks
 */
export interface AgentMemory {
    /** Short-term memory/context */
    shortTerm: string;
    /** Pending todo items */
    todo: string[];
    /** Key decisions made in this session */
    decisions?: string[];
    /** Active blockers or issues */
    blockers?: string[];
}

/**
 * Session state schema (state.json)
 */
export interface SessionState {
    /** Schema version */
    version: string;
    /** Unique session identifier */
    sessionId: string;
    /** Last update timestamp (ISO 8601) */
    lastUpdated: string;
    /** Current development phase */
    phase: Phase;
    /** Agent memory */
    agentMemory: AgentMemory;
    /** Chat history */
    chatHistory: ChatMessage[];
}

/**
 * Handover artifact for phase transitions
 */
export interface HandoverArtifact {
    /** Source phase */
    fromPhase: Phase;
    /** Target phase */
    toPhase: Phase;
    /** Summary of work done */
    summary: string;
    /** Key files modified */
    modifiedFiles: string[];
    /** Outstanding issues */
    issues?: string[];
    /** Creation timestamp */
    createdAt: string;
    /** Creating CLI/model */
    createdBy: string;
}

/**
 * Timeline entry for logbook
 */
export interface TimelineEntry {
    /** Entry timestamp */
    timestamp: string;
    /** Entry type */
    type: 'phase_change' | 'message' | 'file_edit' | 'command' | 'error';
    /** Brief description */
    description: string;
    /** Related phase */
    phase: Phase;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Logbook structure for session persistence
 */
export interface Logbook {
    /** Session identifier */
    sessionId: string;
    /** Session start time */
    startedAt: string;
    /** Timeline of events */
    timeline: TimelineEntry[];
    /** Handover artifacts */
    artifacts: HandoverArtifact[];
}

/**
 * Session metadata for index file
 * Lightweight info for listing sessions without loading full state
 */
export interface SessionMeta {
    /** Unique session identifier */
    sessionId: string;
    /** Session title (auto-generated from first message or user-defined) */
    title: string;
    /** Creation timestamp (ISO 8601) */
    createdAt: string;
    /** Last update timestamp (ISO 8601) */
    lastUpdated: string;
    /** Number of messages in session */
    messageCount: number;
    /** Current phase of the session */
    phase: Phase;
}

/**
 * Session index file schema
 * Stored at .codeship/index.json
 */
export interface SessionIndex {
    /** Index schema version */
    version: string;
    /** Hash of workspace path for project identification */
    projectId: string;
    /** Currently active session ID */
    currentSessionId: string;
    /** List of all sessions */
    sessions: SessionMeta[];
}

/**
 * Creates a new SessionMeta from SessionState
 */
export function createSessionMeta(state: SessionState, title?: string): SessionMeta {
    const autoTitle = state.chatHistory.length > 0
        ? state.chatHistory[0].content.substring(0, 50) + (state.chatHistory[0].content.length > 50 ? '...' : '')
        : 'New Chat';

    return {
        sessionId: state.sessionId,
        title: title || autoTitle,
        createdAt: state.lastUpdated,
        lastUpdated: state.lastUpdated,
        messageCount: state.chatHistory.length,
        phase: state.phase
    };
}

/**
 * Creates a new SessionIndex
 */
export function createSessionIndex(projectId: string): SessionIndex {
    return {
        version: STATE_VERSION,
        projectId,
        currentSessionId: '',
        sessions: []
    };
}

/**
 * State manager options
 */
export interface StateOptions {
    /** Path to state.json file */
    statePath: string;
    /** Auto-save interval in milliseconds */
    autoSaveInterval?: number;
    /** Maximum chat history length */
    maxHistoryLength?: number;
    /** Token threshold for pruning */
    tokenThreshold?: number;
}

/**
 * Default state values
 */
export const DEFAULT_STATE: Omit<SessionState, 'sessionId' | 'lastUpdated'> = {
    version: STATE_VERSION,
    phase: 'design',
    agentMemory: {
        shortTerm: '',
        todo: []
    },
    chatHistory: []
};

/**
 * Creates a new session ID
 */
export function createSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Creates a new session state
 * Note: Creates deep copies of mutable objects to ensure isolation
 */
export function createSessionState(phase: Phase = 'design'): SessionState {
    return {
        version: STATE_VERSION,
        sessionId: createSessionId(),
        lastUpdated: new Date().toISOString(),
        phase,
        agentMemory: {
            shortTerm: '',
            todo: []
        },
        chatHistory: []
    };
}

/**
 * Creates a timeline entry
 */
export function createTimelineEntry(
    type: TimelineEntry['type'],
    description: string,
    phase: Phase,
    metadata?: Record<string, unknown>
): TimelineEntry {
    return {
        timestamp: new Date().toISOString(),
        type,
        description,
        phase,
        metadata
    };
}
