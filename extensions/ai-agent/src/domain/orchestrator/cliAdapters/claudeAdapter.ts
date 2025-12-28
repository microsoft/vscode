/**
 * Claude CLI Adapter
 * Implements CLI adapter for Claude Code (claude-code)
 */

import type { CLIType } from '../../../types';
import { BaseCLIAdapter, CLIAdapterOptions } from './base';

/**
 * Claude-specific options
 */
export interface ClaudeAdapterOptions extends CLIAdapterOptions {
    /** Model to use (e.g., 'claude-opus-4-5-20251101') */
    model?: string;
    /** Temperature setting */
    temperature?: number;
    /** Enable print mode (non-interactive) */
    printMode?: boolean;
    /** Disable permission prompts */
    dangerouslySkipPermissions?: boolean;
}

/**
 * Claude CLI Adapter
 * Wraps the claude CLI command for Code Ship integration
 */
export class ClaudeAdapter extends BaseCLIAdapter {
    readonly name: CLIType = 'claude';
    protected readonly command = 'claude';
    protected readonly defaultArgs: string[] = [];

    private readonly claudeOptions: ClaudeAdapterOptions;

    constructor(options: ClaudeAdapterOptions = {}) {
        super(options);
        this.claudeOptions = options;
        this.buildDefaultArgs();
    }

    /**
     * Build default arguments based on options
     */
    private buildDefaultArgs(): void {
        // Add model if specified
        if (this.claudeOptions.model) {
            this.defaultArgs.push('--model', this.claudeOptions.model);
        }

        // Add print mode if specified
        if (this.claudeOptions.printMode) {
            this.defaultArgs.push('--print');
        }

        // Add dangerous skip permissions if specified (for automated workflows)
        if (this.claudeOptions.dangerouslySkipPermissions) {
            this.defaultArgs.push('--dangerously-skip-permissions');
        }
    }

    /**
     * Spawn Claude CLI in chat mode
     * @param args Additional arguments
     */
    async spawn(args: string[] = []): Promise<void> {
        // Claude uses 'chat' subcommand for interactive mode
        // For non-interactive (print mode), no subcommand needed
        const chatArgs = this.claudeOptions.printMode ? args : ['chat', ...args];

        await super.spawn(chatArgs);
    }

    /**
     * Send a prompt to Claude
     * For print mode, this sends the entire prompt
     * For chat mode, this sends a message in the conversation
     * @param message Message to send
     */
    async send(message: string): Promise<void> {
        if (this.claudeOptions.printMode) {
            // In print mode, send the full prompt
            this.processManager.writeLine(message);
        } else {
            // In chat mode, send as conversation message
            await super.send(message);
        }
    }

    /**
     * Send a prompt and wait for response (print mode only)
     * @param prompt Prompt to send
     * @param timeoutMs Timeout in milliseconds
     */
    async prompt(prompt: string, timeoutMs: number = 120000): Promise<string> {
        if (!this.claudeOptions.printMode) {
            throw new Error('prompt() is only available in print mode');
        }

        return new Promise((resolve, reject) => {
            let response = '';
            let timeoutId: NodeJS.Timeout;

            const outputHandler = this.onOutput((output) => {
                if (output.type === 'stdout') {
                    response += output.data;
                }
            });

            const exitHandler = this.processManager.onExit((code) => {
                clearTimeout(timeoutId);
                outputHandler.dispose();
                exitHandler.dispose();

                if (code === 0) {
                    resolve(response.trim());
                } else {
                    reject(new Error(`Claude exited with code ${code}`));
                }
            });

            timeoutId = setTimeout(() => {
                outputHandler.dispose();
                exitHandler.dispose();
                this.kill();
                reject(new Error('Claude prompt timed out'));
            }, timeoutMs);

            // Send the prompt
            this.send(prompt);
        });
    }

    /**
     * Get the Claude CLI version
     */
    static async getVersion(): Promise<string | null> {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        try {
            const { stdout } = await execAsync('claude --version');
            return stdout.trim();
        } catch {
            return null;
        }
    }

    /**
     * Check if Claude CLI is installed
     */
    static async isInstalled(): Promise<boolean> {
        const version = await ClaudeAdapter.getVersion();
        return version !== null;
    }
}
