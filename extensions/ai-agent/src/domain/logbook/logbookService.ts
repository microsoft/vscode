/**
 * Logbook Service
 * Manages session state, chat history, and state persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter, Disposable } from 'vscode';
import type {
    Phase,
    ChatMessage,
    SessionState,
    StateOptions,
    AgentMemory,
    SessionMeta,
    SessionIndex
} from '../../types';
import {
    createSessionState,
    createChatMessage,
    createSessionMeta,
    createSessionIndex,
    STATE_VERSION
} from '../../types';
import * as crypto from 'crypto';

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<StateOptions> = {
    statePath: '.codeship/state.json',
    autoSaveInterval: 30000, // 30 seconds
    maxHistoryLength: 1000,
    tokenThreshold: 80000
};

/**
 * LogbookService class
 * Manages persistent session state and chat history with multi-session support
 */
export class LogbookService implements Disposable {
    private state: SessionState;
    private sessionIndex: SessionIndex | null = null;
    private readonly options: Required<StateOptions>;
    private autoSaveTimer: NodeJS.Timeout | null = null;
    private isDirty: boolean = false;

    private readonly _onStateChange = new EventEmitter<SessionState>();
    private readonly _onMessageAdded = new EventEmitter<ChatMessage>();
    private readonly _onPhaseChange = new EventEmitter<Phase>();
    private readonly _onSessionsChange = new EventEmitter<SessionMeta[]>();

    /** Event fired when state changes */
    readonly onStateChange = this._onStateChange.event;

    /** Event fired when a message is added */
    readonly onMessageAdded = this._onMessageAdded.event;

    /** Event fired when phase changes */
    readonly onPhaseChange = this._onPhaseChange.event;

    /** Event fired when sessions list changes */
    readonly onSessionsChange = this._onSessionsChange.event;

    constructor(options: Partial<StateOptions> = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.state = createSessionState();
    }

    /**
     * Get current session state
     */
    get currentState(): SessionState {
        return { ...this.state };
    }

    /**
     * Get current phase
     */
    get phase(): Phase {
        return this.state.phase;
    }

    /**
     * Get session ID
     */
    get sessionId(): string {
        return this.state.sessionId;
    }

    /**
     * Get chat history
     */
    get chatHistory(): ChatMessage[] {
        return [...this.state.chatHistory];
    }

    /**
     * Get agent memory
     */
    get agentMemory(): AgentMemory {
        return { ...this.state.agentMemory };
    }

    /**
     * Initialize the service
     * Loads existing state or creates new state
     */
    async initialize(): Promise<void> {
        // Load session index first
        await this.loadSessionIndex();
        console.log('[LogbookService] sessionIndex initialized:',
            this.sessionIndex ? `${this.sessionIndex.sessions.length} sessions` : 'null');

        // Load state (from sessions dir or legacy location)
        await this.loadState();
        console.log('[LogbookService] State loaded, sessionId:', this.state.sessionId);

        // Ensure current session is in index
        if (this.sessionIndex) {
            this.updateSessionMetaInIndex();
            await this.saveSessionIndex();
        }

        this.startAutoSave();
    }

    /**
     * Load state from file
     * Tries to load from sessions directory first, falls back to legacy state.json
     */
    async loadState(): Promise<boolean> {
        try {
            // Try loading from session index first
            if (this.sessionIndex && this.sessionIndex.currentSessionId) {
                const sessionPath = this.getSessionFilePath(this.sessionIndex.currentSessionId);
                if (sessionPath && fs.existsSync(sessionPath)) {
                    const data = fs.readFileSync(sessionPath, 'utf-8');
                    const loadedState = JSON.parse(data) as SessionState;
                    this.state = loadedState;
                    this._onStateChange.fire(this.state);
                    return true;
                }
            }

            // Fall back to legacy state.json
            const fullPath = this.getStatePath();

            // No path configured (no workspace), skip loading
            if (!fullPath) {
                return false;
            }

            if (!fs.existsSync(fullPath)) {
                // No existing state, use default
                return false;
            }

            const data = fs.readFileSync(fullPath, 'utf-8');
            const loadedState = JSON.parse(data) as SessionState;

            // Validate version
            if (loadedState.version !== STATE_VERSION) {
                console.warn('State version mismatch, migrating...');
                // Could implement migration logic here
            }

            this.state = loadedState;
            this._onStateChange.fire(this.state);

            // Migrate legacy state to new sessions format
            if (this.sessionIndex) {
                await this.migrateToSessions();
            }

            return true;
        } catch (error) {
            console.error('Failed to load state:', error);
            return false;
        }
    }

    /**
     * Migrate legacy state.json to new sessions format
     */
    private async migrateToSessions(): Promise<void> {
        const sessionsDir = this.getSessionsDir();
        if (!sessionsDir) {
            return;
        }

        // Ensure sessions directory exists
        if (!fs.existsSync(sessionsDir)) {
            fs.mkdirSync(sessionsDir, { recursive: true });
        }

        // Save current state as a session file
        const sessionPath = this.getSessionFilePath(this.state.sessionId);
        if (sessionPath && !fs.existsSync(sessionPath)) {
            fs.writeFileSync(sessionPath, JSON.stringify(this.state, null, 2), 'utf-8');
            console.log('[LogbookService] Migrated legacy state to sessions format');
        }
    }

    /**
     * Save state to file
     * Saves to sessions directory if available, otherwise legacy location
     */
    async saveState(): Promise<boolean> {
        try {
            // Update timestamp
            this.state.lastUpdated = new Date().toISOString();

            const data = JSON.stringify(this.state, null, 2);

            // Try saving to sessions directory first
            if (this.sessionIndex) {
                const sessionsDir = this.getSessionsDir();
                if (sessionsDir) {
                    // Ensure sessions directory exists
                    if (!fs.existsSync(sessionsDir)) {
                        fs.mkdirSync(sessionsDir, { recursive: true });
                    }

                    const sessionPath = this.getSessionFilePath(this.state.sessionId);
                    if (sessionPath) {
                        fs.writeFileSync(sessionPath, data, 'utf-8');

                        // Update index metadata
                        this.updateSessionMetaInIndex();
                        await this.saveSessionIndex();

                        this.isDirty = false;
                        return true;
                    }
                }
            }

            // Fallback to legacy state.json
            const fullPath = this.getStatePath();

            // No path configured (no workspace), skip saving
            if (!fullPath) {
                return false;
            }

            const dir = path.dirname(fullPath);

            // Ensure directory exists
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(fullPath, data, 'utf-8');

            this.isDirty = false;
            return true;
        } catch (error) {
            console.error('Failed to save state:', error);
            return false;
        }
    }

    /**
     * Add a message to chat history
     * @param sender Message sender
     * @param content Message content
     * @param cli Optional CLI identifier
     */
    addMessage(
        sender: 'user' | 'assistant' | 'system',
        content: string,
        cli?: string
    ): ChatMessage {
        const message = createChatMessage(sender, content, this.state.phase, cli);

        this.state.chatHistory.push(message);
        this.markDirty();

        // Check if history needs pruning
        if (this.state.chatHistory.length > this.options.maxHistoryLength) {
            this.pruneHistory();
        }

        this._onMessageAdded.fire(message);
        this._onStateChange.fire(this.state);

        return message;
    }

    /**
     * Set current phase
     * @param phase New phase
     */
    setPhase(phase: Phase): void {
        if (this.state.phase !== phase) {
            this.state.phase = phase;
            this.markDirty();

            this._onPhaseChange.fire(phase);
            this._onStateChange.fire(this.state);
        }
    }

    /**
     * Update agent memory
     * @param memory Partial memory update
     */
    updateMemory(memory: Partial<AgentMemory>): void {
        this.state.agentMemory = {
            ...this.state.agentMemory,
            ...memory
        };
        this.markDirty();
        this._onStateChange.fire(this.state);
    }

    /**
     * Add todo item to agent memory
     * @param item Todo item
     */
    addTodo(item: string): void {
        this.state.agentMemory.todo.push(item);
        this.markDirty();
        this._onStateChange.fire(this.state);
    }

    /**
     * Remove todo item from agent memory
     * @param index Todo index
     */
    removeTodo(index: number): void {
        if (index >= 0 && index < this.state.agentMemory.todo.length) {
            this.state.agentMemory.todo.splice(index, 1);
            this.markDirty();
            this._onStateChange.fire(this.state);
        }
    }

    /**
     * Prune chat history to reduce token count
     */
    pruneHistory(): number {
        const targetLength = Math.floor(this.options.maxHistoryLength * 0.5);
        const toRemove = this.state.chatHistory.length - targetLength;

        if (toRemove > 0) {
            // Keep system messages and recent messages
            const oldMessages = this.state.chatHistory.slice(0, toRemove);
            const systemMessages = oldMessages.filter(m => m.sender === 'system');

            // Remove old non-system messages
            this.state.chatHistory = [
                ...systemMessages,
                ...this.state.chatHistory.slice(toRemove)
            ];

            this.markDirty();
            this._onStateChange.fire(this.state);
        }

        return toRemove > 0 ? toRemove : 0;
    }

    /**
     * Clear chat history
     */
    clearHistory(): void {
        this.state.chatHistory = [];
        this.markDirty();
        this._onStateChange.fire(this.state);
    }

    /**
     * Reset to new session
     * @param phase Initial phase
     */
    resetSession(phase: Phase = 'implementation'): void {
        this.state = createSessionState(phase);
        this.markDirty();
        this._onStateChange.fire(this.state);
    }

    /**
     * Export state for handover
     */
    exportForHandover(): string {
        return JSON.stringify({
            phase: this.state.phase,
            memory: this.state.agentMemory,
            recentHistory: this.state.chatHistory.slice(-20),
            exportedAt: new Date().toISOString()
        }, null, 2);
    }

    // ==================== Multi-Session Methods ====================

    /**
     * List all sessions for current project
     */
    listSessions(): SessionMeta[] {
        if (!this.sessionIndex) {
            return [];
        }
        return [...this.sessionIndex.sessions];
    }

    /**
     * Get current session ID
     */
    getCurrentSessionId(): string {
        return this.sessionIndex?.currentSessionId || this.state.sessionId;
    }

    /**
     * Create a new session
     * @returns New session ID
     */
    async createNewSession(): Promise<string> {
        // 1. Save current session first
        await this.saveState();
        console.log('[LogbookService] Saved current session before creating new one');

        // 2. Create new session state
        const newState = createSessionState('design');
        this.state = newState;
        console.log('[LogbookService] Created new session:', this.state.sessionId);

        // 3. Save new session file FIRST (before updating index)
        this.markDirty();
        await this.saveState();
        console.log('[LogbookService] Saved new session file');

        // 4. Update index AFTER session file exists
        if (this.sessionIndex) {
            this.updateSessionMetaInIndex();
            await this.saveSessionIndex();
            console.log('[LogbookService] Updated session index, total sessions:', this.sessionIndex.sessions.length);

            // 5. Fire event LAST after everything is saved
            this._onSessionsChange.fire(this.sessionIndex.sessions);
        }

        this._onStateChange.fire(this.state);

        return this.state.sessionId;
    }

    /**
     * Switch to a different session
     * @param sessionId Target session ID
     */
    async switchSession(sessionId: string): Promise<void> {
        if (!this.sessionIndex) {
            throw new Error('Session index not initialized');
        }

        // Find session in index
        const sessionMeta = this.sessionIndex.sessions.find(s => s.sessionId === sessionId);
        if (!sessionMeta) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        // Save current session
        await this.saveState();

        // Load target session
        const sessionPath = this.getSessionFilePath(sessionId);
        if (!sessionPath || !fs.existsSync(sessionPath)) {
            throw new Error(`Session file not found: ${sessionId}`);
        }

        const data = fs.readFileSync(sessionPath, 'utf-8');
        this.state = JSON.parse(data) as SessionState;

        // Update current session in index
        this.sessionIndex.currentSessionId = sessionId;
        await this.saveSessionIndex();

        this._onStateChange.fire(this.state);
    }

    /**
     * Delete a session
     * @param sessionId Session ID to delete
     */
    async deleteSession(sessionId: string): Promise<void> {
        if (!this.sessionIndex) {
            throw new Error('Session index not initialized');
        }

        // Cannot delete current session
        if (sessionId === this.state.sessionId) {
            throw new Error('Cannot delete current session');
        }

        // Remove from index
        const index = this.sessionIndex.sessions.findIndex(s => s.sessionId === sessionId);
        if (index === -1) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        this.sessionIndex.sessions.splice(index, 1);

        // Delete session file
        const sessionPath = this.getSessionFilePath(sessionId);
        if (sessionPath && fs.existsSync(sessionPath)) {
            fs.unlinkSync(sessionPath);
        }

        await this.saveSessionIndex();
        this._onSessionsChange.fire(this.sessionIndex.sessions);
    }

    /**
     * Rename a session
     * @param sessionId Session ID to rename
     * @param title New title
     */
    async renameSession(sessionId: string, title: string): Promise<void> {
        if (!this.sessionIndex) {
            throw new Error('Session index not initialized');
        }

        const sessionMeta = this.sessionIndex.sessions.find(s => s.sessionId === sessionId);
        if (!sessionMeta) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        sessionMeta.title = title;
        await this.saveSessionIndex();
        this._onSessionsChange.fire(this.sessionIndex.sessions);
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.stopAutoSave();

        // Save if dirty
        if (this.isDirty) {
            this.saveState();
        }

        this._onStateChange.dispose();
        this._onMessageAdded.dispose();
        this._onPhaseChange.dispose();
        this._onSessionsChange.dispose();
    }

    /**
     * Get full state file path (legacy single-session)
     * Returns null if no valid path is configured
     */
    private getStatePath(): string | null {
        if (!this.options.statePath) {
            return null;
        }
        return path.resolve(this.options.statePath);
    }

    /**
     * Get base directory for .codeship folder
     */
    private getBaseDir(): string | null {
        const statePath = this.getStatePath();
        if (!statePath) {
            return null;
        }
        return path.dirname(statePath);
    }

    /**
     * Get sessions directory path
     */
    private getSessionsDir(): string | null {
        const baseDir = this.getBaseDir();
        if (!baseDir) {
            return null;
        }
        return path.join(baseDir, 'sessions');
    }

    /**
     * Get session file path for a specific session
     */
    private getSessionFilePath(sessionId: string): string | null {
        const sessionsDir = this.getSessionsDir();
        if (!sessionsDir) {
            return null;
        }
        return path.join(sessionsDir, `${sessionId}.json`);
    }

    /**
     * Get index file path
     */
    private getIndexPath(): string | null {
        const baseDir = this.getBaseDir();
        if (!baseDir) {
            return null;
        }
        return path.join(baseDir, 'index.json');
    }

    /**
     * Generate project ID from state path
     */
    private generateProjectId(): string {
        const statePath = this.getStatePath();
        if (!statePath) {
            return 'unknown';
        }
        return crypto.createHash('md5').update(path.dirname(statePath)).digest('hex').substring(0, 8);
    }

    /**
     * Load session index from file
     */
    private async loadSessionIndex(): Promise<void> {
        const indexPath = this.getIndexPath();
        if (!indexPath) {
            return;
        }

        if (fs.existsSync(indexPath)) {
            try {
                const data = fs.readFileSync(indexPath, 'utf-8');
                this.sessionIndex = JSON.parse(data) as SessionIndex;
            } catch (error) {
                console.error('Failed to load session index:', error);
                this.sessionIndex = createSessionIndex(this.generateProjectId());
            }
        } else {
            // Create new index
            this.sessionIndex = createSessionIndex(this.generateProjectId());
        }
    }

    /**
     * Save session index to file
     */
    private async saveSessionIndex(): Promise<boolean> {
        if (!this.sessionIndex) {
            return false;
        }

        const indexPath = this.getIndexPath();
        if (!indexPath) {
            return false;
        }

        try {
            const dir = path.dirname(indexPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(indexPath, JSON.stringify(this.sessionIndex, null, 2), 'utf-8');
            return true;
        } catch (error) {
            console.error('Failed to save session index:', error);
            return false;
        }
    }

    /**
     * Update session metadata in index
     */
    private updateSessionMetaInIndex(): void {
        if (!this.sessionIndex) {
            return;
        }

        const existingIndex = this.sessionIndex.sessions.findIndex(
            s => s.sessionId === this.state.sessionId
        );

        const meta = createSessionMeta(this.state);

        if (existingIndex >= 0) {
            // Preserve existing title if it was manually set
            const existingMeta = this.sessionIndex.sessions[existingIndex];
            if (existingMeta.title !== 'New Chat') {
                meta.title = existingMeta.title;
            }
            this.sessionIndex.sessions[existingIndex] = meta;
        } else {
            this.sessionIndex.sessions.push(meta);
        }

        this.sessionIndex.currentSessionId = this.state.sessionId;
    }

    /**
     * Mark state as dirty (needs saving)
     */
    private markDirty(): void {
        this.isDirty = true;
    }

    /**
     * Start auto-save timer
     */
    private startAutoSave(): void {
        if (this.options.autoSaveInterval > 0) {
            this.autoSaveTimer = setInterval(() => {
                if (this.isDirty) {
                    this.saveState();
                }
            }, this.options.autoSaveInterval);
        }
    }

    /**
     * Stop auto-save timer
     */
    private stopAutoSave(): void {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }
}
