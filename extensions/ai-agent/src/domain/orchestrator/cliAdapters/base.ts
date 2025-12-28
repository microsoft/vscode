/**
 * Base CLI Adapter Interface
 * Defines the contract for all CLI implementations
 */

import { EventEmitter, Disposable } from 'vscode';
import type { CLIType, ProcessState, CLIOutput, ICLIAdapter } from '../../../types';
import { ProcessManager } from '../processManager';

/**
 * Base CLI Adapter options
 */
export interface CLIAdapterOptions {
    /** Working directory */
    cwd?: string;
    /** Environment variables */
    env?: NodeJS.ProcessEnv;
    /** Additional CLI arguments */
    args?: string[];
}

/**
 * Abstract base class for CLI adapters
 * Provides common functionality for all CLI implementations
 */
export abstract class BaseCLIAdapter implements ICLIAdapter {
    protected readonly processManager: ProcessManager;
    protected readonly options: CLIAdapterOptions;

    protected readonly _onOutput = new EventEmitter<CLIOutput>();
    protected readonly _onStateChange = new EventEmitter<ProcessState>();

    /** Event fired when CLI outputs data */
    readonly onOutput = this._onOutput.event;

    /** Event fired when CLI state changes */
    readonly onStateChange = this._onStateChange.event;

    /** CLI type identifier - must be implemented by subclass */
    abstract readonly name: CLIType;

    /** Command to execute - must be implemented by subclass */
    protected abstract readonly command: string;

    /** Default arguments - can be overridden by subclass */
    protected readonly defaultArgs: string[] = [];

    constructor(options: CLIAdapterOptions = {}) {
        this.options = options;
        this.processManager = new ProcessManager();
        this.setupEventForwarding();
    }

    /** Current process state */
    get state(): ProcessState {
        return this.processManager.state;
    }

    /** Whether the CLI is currently running */
    get isRunning(): boolean {
        return this.processManager.isRunning;
    }

    /**
     * Spawn the CLI process
     * @param args Additional command line arguments
     */
    async spawn(args: string[] = []): Promise<void> {
        const allArgs = [
            ...this.defaultArgs,
            ...(this.options.args || []),
            ...args
        ];

        await this.processManager.spawn(this.command, allArgs, {
            cwd: this.options.cwd,
            env: this.options.env
        });
    }

    /**
     * Send a message to the CLI
     * @param message Message to send
     */
    async send(message: string): Promise<void> {
        if (!this.isRunning) {
            throw new Error(`${this.name} CLI is not running`);
        }

        // Format message for CLI (add newline if not present)
        const formattedMessage = message.endsWith('\n') ? message : message + '\n';
        this.processManager.write(formattedMessage);
    }

    /**
     * Terminate the CLI process
     */
    async kill(): Promise<void> {
        await this.processManager.kill();
    }

    /**
     * Dispose of the adapter
     */
    dispose(): void {
        this.processManager.dispose();
        this._onOutput.dispose();
        this._onStateChange.dispose();
    }

    /**
     * Setup event forwarding from ProcessManager
     */
    private setupEventForwarding(): void {
        // Forward output events
        this.processManager.onOutput((output) => {
            this._onOutput.fire(output);
        });

        // Forward state change events
        this.processManager.onStateChange((state) => {
            this._onStateChange.fire(state);
        });
    }
}
