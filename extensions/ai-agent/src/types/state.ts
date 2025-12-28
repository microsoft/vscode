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
    phase: 'implementation',
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
export function createSessionState(phase: Phase = 'implementation'): SessionState {
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
