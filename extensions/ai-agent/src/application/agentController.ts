/**
 * Agent Controller
 * Coordinates between UI (Webview) and Domain Layer
 * Handles user requests and manages CLI orchestration
 */

import { EventEmitter, Disposable } from 'vscode';
import type {
    Phase,
    CLIOutput,
    ChatMessage,
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
    PostMessage,
    SessionMeta
} from '../types';
import { createChatMessage } from '../types';
import { ClaudeAdapter, ClaudeAdapterOptions } from '../domain/orchestrator/cliAdapters';
import { TeeCapture } from '../domain/orchestrator/teeCapture';
import { LogbookService } from '../domain/logbook/logbookService';
import { DependencyManager } from '../domain/dependency/dependencyManager';

/**
 * Agent Controller options
 */
export interface AgentControllerOptions {
    /** State file path */
    statePath?: string;
    /** Token threshold for context pruning */
    tokenThreshold?: number;
    /** Claude adapter options */
    claudeOptions?: ClaudeAdapterOptions;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: AgentControllerOptions = {
    statePath: '.codeship/state.json',
    tokenThreshold: 80000
};

/**
 * AgentController class
 * Central controller for AI agent operations
 */
export class AgentController implements Disposable {
    private readonly options: AgentControllerOptions;
    private readonly logbook: LogbookService;
    private readonly teeCapture: TeeCapture;
    private readonly dependencyManager: DependencyManager;
    private cliAdapter: ClaudeAdapter | null = null;
    private postMessage: PostMessage | null = null;
    private mockResponseTimer: NodeJS.Timeout | null = null;

    private readonly _onOutput = new EventEmitter<CLIOutput>();
    private readonly _onMessage = new EventEmitter<ChatMessage>();
    private readonly _onPhaseChange = new EventEmitter<Phase>();
    private readonly _onError = new EventEmitter<Error>();

    /** Event fired when CLI outputs data */
    readonly onOutput = this._onOutput.event;

    /** Event fired when a new message is added */
    readonly onMessage = this._onMessage.event;

    /** Event fired when phase changes */
    readonly onPhaseChange = this._onPhaseChange.event;

    /** Event fired on error */
    readonly onError = this._onError.event;

    constructor(options: AgentControllerOptions = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };

        this.logbook = new LogbookService({
            statePath: this.options.statePath,
            tokenThreshold: this.options.tokenThreshold
        });

        this.teeCapture = new TeeCapture({
            maxTokens: this.options.tokenThreshold
        });

        this.dependencyManager = new DependencyManager();

        this.setupTeeCapture();
    }

    /**
     * Get current phase
     */
    get phase(): Phase {
        return this.logbook.phase;
    }

    /**
     * Get chat history
     */
    get chatHistory(): ChatMessage[] {
        return this.logbook.chatHistory;
    }

    /**
     * Check if CLI is running
     */
    get isRunning(): boolean {
        return this.cliAdapter?.isRunning ?? false;
    }

    /**
     * Initialize the controller
     */
    async initialize(): Promise<void> {
        await this.logbook.initialize();

        // Check dependencies
        const missing = await this.dependencyManager.getMissingDependencies();
        if (missing.length > 0) {
            const message = `Missing CLI dependencies: ${missing.map(m => m.cli).join(', ')}`;
            this._onError.fire(new Error(message));
        }
    }

    /**
     * Set the postMessage function for Webview communication
     * @param postMessage Function to post messages to Webview
     */
    setPostMessage(postMessage: PostMessage): void {
        this.postMessage = postMessage;
    }

    /**
     * Handle messages from Webview
     * @param message Message from Webview
     */
    async handleWebviewMessage(message: WebviewToExtensionMessage): Promise<void> {
        switch (message.type) {
            case 'send':
                await this.sendMessage(message.data);
                break;
            case 'switch-phase':
                await this.switchPhase(message.data);
                break;
            case 'cancel':
                await this.cancel();
                break;
            case 'retry':
                await this.retry();
                break;
            case 'get-history':
                this.sendHistory();
                break;
            case 'clear-history':
                this.clearHistory();
                break;
            case 'phase-rollback':
                await this.rollbackPhase(message.data.from, message.data.to);
                break;
            case 'ready':
                this.sendReady();
                break;
            case 'get-sessions':
                this.sendSessions();
                break;
            case 'create-session':
                await this.createSession();
                break;
            case 'switch-session':
                await this.switchSession(message.data);
                break;
            case 'delete-session':
                await this.deleteSession(message.data);
                break;
            case 'rename-session':
                await this.renameSession(message.data.sessionId, message.data.title);
                break;
        }
    }

    /**
     * Send a message to the CLI
     * @param content Message content
     */
    async sendMessage(content: string): Promise<void> {
        // Add user message to history (Webview already adds it locally, so no echo back needed)
        const userMessage = this.logbook.addMessage('user', content);
        this._onMessage.fire(userMessage);
        // Note: User message echo back removed to prevent duplicate display in Webview

        // Clear any existing mock response timer
        if (this.mockResponseTimer) {
            clearTimeout(this.mockResponseTimer);
            this.mockResponseTimer = null;
        }

        // Set mock response timer (5 seconds)
        // This will be replaced with actual CLI integration in Phase 3
        this.mockResponseTimer = setTimeout(() => {
            this.generateMockResponse(content);
        }, 5000);

        try {
            // Ensure CLI is running
            if (!this.cliAdapter?.isRunning) {
                await this.startCLI();
            }

            // Send to CLI
            await this.cliAdapter?.send(content);
        } catch (error) {
            // CLI failed to start/send - mock response timer will handle the response
            console.log('[AgentController] CLI unavailable, mock response will be generated');
        }
    }

    /**
     * Switch to a different phase
     * Generates a handover artifact before transitioning (Phase 3.5)
     * @param phase Target phase
     */
    async switchPhase(phase: Phase): Promise<void> {
        if (this.phase === phase) {
            return;
        }

        const previousPhase = this.phase;
        const cliName = this.cliAdapter?.name ?? 'unknown';

        // Stop current CLI if running
        if (this.cliAdapter?.isRunning) {
            await this.cliAdapter.kill();
        }

        // Generate handover artifact before switching (Phase 3.5)
        const artifact = this.logbook.generateHandoverArtifact(
            previousPhase,
            phase,
            cliName
        );
        this.logbook.addArtifact(artifact);

        // Notify webview of artifact generation
        this.postToWebview({ type: 'artifact-generated', data: artifact });

        // Update phase
        this.logbook.setPhase(phase);
        this._onPhaseChange.fire(phase);
        this.postToWebview({ type: 'phase-changed', data: phase });
    }

    /**
     * Rollback to a previous phase
     * @param from Current phase
     * @param to Target phase to rollback to
     */
    async rollbackPhase(from: Phase, to: Phase): Promise<void> {
        if (this.phase === to) {
            return;
        }

        // Stop current CLI if running
        if (this.cliAdapter?.isRunning) {
            await this.cliAdapter.kill();
        }

        // Update phase with rollback flag
        this.logbook.setPhase(to);
        this._onPhaseChange.fire(to);
        this.postToWebview({
            type: 'phase-changed',
            data: { phase: to, isRollback: true }
        });
    }

    /**
     * Cancel current operation
     */
    async cancel(): Promise<void> {
        // Clear mock response timer
        if (this.mockResponseTimer) {
            clearTimeout(this.mockResponseTimer);
            this.mockResponseTimer = null;
        }

        if (this.cliAdapter?.isRunning) {
            await this.cliAdapter.kill();
        }

        // Reset progress indicator
        this.postToWebview({ type: 'progress', data: { type: 'idle' } });
    }

    /**
     * Retry last operation
     */
    async retry(): Promise<void> {
        const history = this.chatHistory;
        const lastUserMessage = [...history].reverse().find(m => m.sender === 'user');

        if (lastUserMessage) {
            await this.sendMessage(lastUserMessage.content);
        }
    }

    /**
     * Clear chat history
     */
    clearHistory(): void {
        this.logbook.clearHistory();
        this.teeCapture.clear();
        this.postToWebview({ type: 'clear' });
    }

    /**
     * Save current state
     */
    async saveState(): Promise<void> {
        await this.logbook.saveState();
    }

    // ==================== Session Management ====================

    /**
     * Get list of sessions
     */
    getSessions(): SessionMeta[] {
        return this.logbook.listSessions();
    }

    /**
     * Send sessions list to Webview
     */
    public sendSessions(): void {
        this.postToWebview({ type: 'sessions-list', data: this.getSessions() });
    }

    /**
     * Create a new session
     */
    async createSession(): Promise<string> {
        try {
            // Stop current CLI if running
            if (this.cliAdapter?.isRunning) {
                await this.cliAdapter.kill();
            }

            const sessionId = await this.logbook.createNewSession();
            this.teeCapture.clear();

            // Notify webview
            // Note: session-created triggers clearMessages() in ChatView, so no need to send history
            this.postToWebview({ type: 'session-created', data: { sessionId } });
            this.postToWebview({ type: 'sessions-list', data: this.getSessions() });
            this.postToWebview({ type: 'phase-changed', data: this.phase });

            return sessionId;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.postToWebview({ type: 'error', data: errorMsg });
            throw error;
        }
    }

    /**
     * Switch to a different session
     * @param sessionId Target session ID
     */
    async switchSession(sessionId: string): Promise<void> {
        try {
            // Stop current CLI if running
            if (this.cliAdapter?.isRunning) {
                await this.cliAdapter.kill();
            }

            await this.logbook.switchSession(sessionId);
            this.teeCapture.clear();

            // Notify webview
            this.postToWebview({
                type: 'session-switched',
                data: {
                    sessionId,
                    messages: this.chatHistory,
                    phase: this.phase
                }
            });
            this.postToWebview({ type: 'phase-changed', data: this.phase });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.postToWebview({ type: 'error', data: errorMsg });
            throw error;
        }
    }

    /**
     * Delete a session
     * @param sessionId Session ID to delete
     */
    async deleteSession(sessionId: string): Promise<void> {
        try {
            await this.logbook.deleteSession(sessionId);

            // Notify webview
            this.postToWebview({ type: 'session-deleted', data: { sessionId } });
            this.postToWebview({ type: 'sessions-list', data: this.getSessions() });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.postToWebview({ type: 'error', data: errorMsg });
            throw error;
        }
    }

    /**
     * Rename a session
     * @param sessionId Session ID to rename
     * @param title New title
     */
    async renameSession(sessionId: string, title: string): Promise<void> {
        try {
            await this.logbook.renameSession(sessionId, title);

            // Notify webview
            this.postToWebview({ type: 'sessions-list', data: this.getSessions() });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.postToWebview({ type: 'error', data: errorMsg });
            throw error;
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        // Clear mock response timer
        if (this.mockResponseTimer) {
            clearTimeout(this.mockResponseTimer);
            this.mockResponseTimer = null;
        }

        this.cliAdapter?.dispose();
        this.logbook.dispose();
        this.teeCapture.dispose();
        this._onOutput.dispose();
        this._onMessage.dispose();
        this._onPhaseChange.dispose();
        this._onError.dispose();
    }

    /**
     * Start the CLI adapter
     */
    private async startCLI(): Promise<void> {
        this.cliAdapter = new ClaudeAdapter(this.options.claudeOptions);

        // Setup output handling
        this.cliAdapter.onOutput((output) => {
            this.handleCLIOutput(output);
        });

        await this.cliAdapter.spawn();
    }

    /**
     * Handle CLI output
     */
    private handleCLIOutput(output: CLIOutput): void {
        // Clear mock response timer since we got real output
        if (this.mockResponseTimer) {
            clearTimeout(this.mockResponseTimer);
            this.mockResponseTimer = null;
        }

        // Capture output
        this.teeCapture.capture(output);

        // Fire event
        this._onOutput.fire(output);

        // Post to webview
        this.postToWebview({ type: 'output', data: output.data });

        // If it looks like a complete response, add to history
        if (output.type === 'stdout' && output.data.trim()) {
            const message = this.logbook.addMessage('assistant', output.data, 'claude');
            this._onMessage.fire(message);
            this.postToWebview({ type: 'message', data: message });
        }
    }

    /**
     * Generate mock response (used when CLI is unavailable)
     * This will be replaced with actual CLI integration in Phase 3
     */
    private generateMockResponse(userMessage: string): void {
        this.mockResponseTimer = null;

        const truncatedMsg = userMessage.length > 50
            ? userMessage.substring(0, 50) + '...'
            : userMessage;

        const mockContent = `[Mock Response] I received your message: "${truncatedMsg}"

This is a mock response. In Phase 3, this will be replaced with actual Claude CLI integration.

Current phase: ${this.phase}
Session ID: ${this.logbook.sessionId}`;

        const message = this.logbook.addMessage('assistant', mockContent, 'mock');
        this._onMessage.fire(message);
        this.postToWebview({ type: 'message', data: message });
        this.postToWebview({ type: 'progress', data: { type: 'idle' } });
    }

    /**
     * Setup TeeCapture event handlers
     */
    private setupTeeCapture(): void {
        this.teeCapture.onThresholdExceeded(() => {
            // Prune history when threshold exceeded
            this.logbook.pruneHistory();
            this.logbook.addMessage('system', 'Context pruned due to token limit');
        });
    }

    /**
     * Send history to Webview
     */
    private sendHistory(): void {
        this.postToWebview({ type: 'history', data: this.chatHistory });
    }

    /**
     * Send ready signal to Webview
     */
    private sendReady(): void {
        this.postToWebview({ type: 'ready' });
        this.postToWebview({ type: 'phase-changed', data: this.phase });
        this.sendHistory();
        this.sendSessions();
    }

    /**
     * Post message to Webview
     */
    private postToWebview(message: ExtensionToWebviewMessage): void {
        this.postMessage?.(message);
    }
}
