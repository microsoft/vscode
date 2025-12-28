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
    PostMessage
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
            case 'ready':
                this.sendReady();
                break;
        }
    }

    /**
     * Send a message to the CLI
     * @param content Message content
     */
    async sendMessage(content: string): Promise<void> {
        // Add user message to history
        const userMessage = this.logbook.addMessage('user', content);
        this._onMessage.fire(userMessage);
        this.postToWebview({ type: 'message', data: userMessage });

        try {
            // Ensure CLI is running
            if (!this.cliAdapter?.isRunning) {
                await this.startCLI();
            }

            // Send to CLI
            await this.cliAdapter?.send(content);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.postToWebview({ type: 'error', data: errorMsg });
            this._onError.fire(error instanceof Error ? error : new Error(errorMsg));
        }
    }

    /**
     * Switch to a different phase
     * @param phase Target phase
     */
    async switchPhase(phase: Phase): Promise<void> {
        if (this.phase === phase) {
            return;
        }

        // Stop current CLI if running
        if (this.cliAdapter?.isRunning) {
            await this.cliAdapter.kill();
        }

        // Update phase
        this.logbook.setPhase(phase);
        this._onPhaseChange.fire(phase);
        this.postToWebview({ type: 'phase-changed', data: phase });
    }

    /**
     * Cancel current operation
     */
    async cancel(): Promise<void> {
        if (this.cliAdapter?.isRunning) {
            await this.cliAdapter.kill();
            this.logbook.addMessage('system', 'Operation cancelled by user');
        }
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

    /**
     * Dispose of resources
     */
    dispose(): void {
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
    }

    /**
     * Post message to Webview
     */
    private postToWebview(message: ExtensionToWebviewMessage): void {
        this.postMessage?.(message);
    }
}
