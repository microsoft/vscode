/**
 * Gemini CLI Adapter
 * Implements CLI adapter for Gemini Code Assist (gemini-cli)
 *
 * Gemini is optimized for Implementation phase with strong code generation
 * capabilities across multiple languages and frameworks.
 */

import type { CLIType } from '../../../types';
import { BaseCLIAdapter, CLIAdapterOptions } from './base';

/**
 * Gemini-specific options
 */
export interface GeminiAdapterOptions extends CLIAdapterOptions {
    /** Model to use (e.g., 'gemini-2.0-flash-exp') */
    model?: string;
    /** Maximum tokens for response */
    maxTokens?: number;
    /** Enable code-only output */
    codeOnly?: boolean;
    /** Project ID for Google Cloud */
    projectId?: string;
}

/**
 * Gemini CLI Adapter
 * Wraps the gemini CLI command for Code Ship integration
 *
 * Usage:
 * - Implementation phase: Strong code generation, refactoring
 * - Multi-language support: TypeScript, Python, Go, Rust, etc.
 * - Framework awareness: React, Vue, Next.js, FastAPI, etc.
 */
export class GeminiAdapter extends BaseCLIAdapter {
    readonly name: CLIType = 'gemini';
    protected readonly command = 'gemini';
    protected readonly defaultArgs: string[] = [];

    private readonly geminiOptions: GeminiAdapterOptions;

    constructor(options: GeminiAdapterOptions = {}) {
        super(options);
        this.geminiOptions = options;
        this.buildDefaultArgs();
    }

    /**
     * Build default arguments based on options
     */
    private buildDefaultArgs(): void {
        // Add model if specified
        if (this.geminiOptions.model) {
            this.defaultArgs.push('--model', this.geminiOptions.model);
        }

        // Add max tokens if specified
        if (this.geminiOptions.maxTokens) {
            this.defaultArgs.push('--max-tokens', this.geminiOptions.maxTokens.toString());
        }

        // Add code-only mode if specified
        if (this.geminiOptions.codeOnly) {
            this.defaultArgs.push('--code-only');
        }

        // Add project ID if specified
        if (this.geminiOptions.projectId) {
            this.defaultArgs.push('--project', this.geminiOptions.projectId);
        }
    }

    /**
     * Spawn Gemini CLI
     * @param args Additional arguments
     */
    async spawn(args: string[] = []): Promise<void> {
        // Gemini uses direct command invocation
        await super.spawn(args);
    }

    /**
     * Send a prompt to Gemini
     * @param message Message to send
     */
    async send(message: string): Promise<void> {
        // Send message with implementation-focused context
        await super.send(message);
    }

    /**
     * Send a code generation request
     * @param prompt Code generation prompt
     * @param language Target programming language
     * @param timeoutMs Timeout in milliseconds
     */
    async generateCode(prompt: string, language: string, timeoutMs: number = 120000): Promise<string> {
        return new Promise((resolve, reject) => {
            let response = '';
            let timeoutId: NodeJS.Timeout;

            const formattedPrompt = `Generate ${language} code: ${prompt}`;

            const outputHandler = this.onOutput((output) => {
                if (output.type === 'stdout') {
                    response += output.data;
                }
            });

            const stateHandler = this.onStateChange((state) => {
                if (state === 'idle' || state === 'error') {
                    clearTimeout(timeoutId);
                    outputHandler.dispose();
                    stateHandler.dispose();

                    if (state === 'error') {
                        reject(new Error('Gemini code generation failed'));
                    } else {
                        resolve(response.trim());
                    }
                }
            });

            timeoutId = setTimeout(() => {
                outputHandler.dispose();
                stateHandler.dispose();
                this.kill();
                reject(new Error('Gemini code generation timed out'));
            }, timeoutMs);

            // Send the prompt
            this.send(formattedPrompt);
        });
    }

    /**
     * Get the Gemini CLI version
     */
    static async getVersion(): Promise<string | null> {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        try {
            const { stdout } = await execAsync('gemini --version');
            return stdout.trim();
        } catch {
            return null;
        }
    }

    /**
     * Check if Gemini CLI is installed
     */
    static async isInstalled(): Promise<boolean> {
        const version = await GeminiAdapter.getVersion();
        return version !== null;
    }
}
