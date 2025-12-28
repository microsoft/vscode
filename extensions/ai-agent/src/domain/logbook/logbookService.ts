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
    AgentMemory
} from '../../types';
import {
    createSessionState,
    createChatMessage,
    STATE_VERSION
} from '../../types';

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
 * Manages persistent session state and chat history
 */
export class LogbookService implements Disposable {
    private state: SessionState;
    private readonly options: Required<StateOptions>;
    private autoSaveTimer: NodeJS.Timeout | null = null;
    private isDirty: boolean = false;

    private readonly _onStateChange = new EventEmitter<SessionState>();
    private readonly _onMessageAdded = new EventEmitter<ChatMessage>();
    private readonly _onPhaseChange = new EventEmitter<Phase>();

    /** Event fired when state changes */
    readonly onStateChange = this._onStateChange.event;

    /** Event fired when a message is added */
    readonly onMessageAdded = this._onMessageAdded.event;

    /** Event fired when phase changes */
    readonly onPhaseChange = this._onPhaseChange.event;

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
        await this.loadState();
        this.startAutoSave();
    }

    /**
     * Load state from file
     */
    async loadState(): Promise<boolean> {
        try {
            const fullPath = this.getStatePath();

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
            return true;
        } catch (error) {
            console.error('Failed to load state:', error);
            return false;
        }
    }

    /**
     * Save state to file
     */
    async saveState(): Promise<boolean> {
        try {
            const fullPath = this.getStatePath();
            const dir = path.dirname(fullPath);

            // Ensure directory exists
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Update timestamp
            this.state.lastUpdated = new Date().toISOString();

            const data = JSON.stringify(this.state, null, 2);
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
            const oldPhase = this.state.phase;
            this.state.phase = phase;
            this.markDirty();

            // Add system message about phase change
            this.addMessage('system', `Phase changed from ${oldPhase} to ${phase}`);

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
    }

    /**
     * Get full state file path
     */
    private getStatePath(): string {
        return path.resolve(this.options.statePath);
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
