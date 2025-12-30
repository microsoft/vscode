/**
 * Codex CLI Adapter
 * Implements CLI adapter for OpenAI Codex CLI
 *
 * Codex (GPT-based) is optimized for Review phase with strong analytical
 * and code review capabilities.
 */

import type { CLIType } from '../../../types';
import { BaseCLIAdapter, CLIAdapterOptions } from './base';

/**
 * Codex-specific options
 */
export interface CodexAdapterOptions extends CLIAdapterOptions {
    /** Model to use (e.g., 'gpt-4', 'gpt-4-turbo') */
    model?: string;
    /** Temperature setting for creativity control */
    temperature?: number;
    /** Maximum tokens for response */
    maxTokens?: number;
    /** OpenAI API key (optional, can use env var) */
    apiKey?: string;
    /** Enable review mode */
    reviewMode?: boolean;
}

/**
 * Codex CLI Adapter
 * Wraps the codex/openai CLI command for Code Ship integration
 *
 * Usage:
 * - Review phase: Code review, bug detection, security analysis
 * - Quality assessment: Best practices, style compliance
 * - Risk analysis: Breaking changes, performance implications
 */
export class CodexAdapter extends BaseCLIAdapter {
    readonly name: CLIType = 'codex';
    protected readonly command = 'codex';
    protected readonly defaultArgs: string[] = [];

    private readonly codexOptions: CodexAdapterOptions;

    constructor(options: CodexAdapterOptions = {}) {
        super(options);
        this.codexOptions = options;
        this.buildDefaultArgs();
    }

    /**
     * Build default arguments based on options
     */
    private buildDefaultArgs(): void {
        // Add model if specified
        if (this.codexOptions.model) {
            this.defaultArgs.push('--model', this.codexOptions.model);
        }

        // Add temperature if specified
        if (this.codexOptions.temperature !== undefined) {
            this.defaultArgs.push('--temperature', this.codexOptions.temperature.toString());
        }

        // Add max tokens if specified
        if (this.codexOptions.maxTokens) {
            this.defaultArgs.push('--max-tokens', this.codexOptions.maxTokens.toString());
        }

        // Add review mode if specified
        if (this.codexOptions.reviewMode) {
            this.defaultArgs.push('--review');
        }
    }

    /**
     * Spawn Codex CLI
     * @param args Additional arguments
     */
    async spawn(args: string[] = []): Promise<void> {
        // Set API key in environment if provided
        if (this.codexOptions.apiKey) {
            this.options.env = {
                ...this.options.env,
                OPENAI_API_KEY: this.codexOptions.apiKey
            };
        }

        await super.spawn(args);
    }

    /**
     * Send a prompt to Codex
     * @param message Message to send
     */
    async send(message: string): Promise<void> {
        // Send message with review-focused context
        await super.send(message);
    }

    /**
     * Request a code review
     * @param code Code to review
     * @param context Additional context about the code
     * @param timeoutMs Timeout in milliseconds
     */
    async reviewCode(code: string, context: string = '', timeoutMs: number = 120000): Promise<CodeReviewResult> {
        return new Promise((resolve, reject) => {
            let response = '';
            let timeoutId: NodeJS.Timeout;

            const reviewPrompt = context
                ? `Review the following code. Context: ${context}\n\nCode:\n${code}`
                : `Review the following code:\n\n${code}`;

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
                        reject(new Error('Codex review failed'));
                    } else {
                        resolve(this.parseReviewResponse(response.trim()));
                    }
                }
            });

            timeoutId = setTimeout(() => {
                outputHandler.dispose();
                stateHandler.dispose();
                this.kill();
                reject(new Error('Codex review timed out'));
            }, timeoutMs);

            // Send the review prompt
            this.send(reviewPrompt);
        });
    }

    /**
     * Parse the review response into structured format
     * @param response Raw response from Codex
     */
    private parseReviewResponse(response: string): CodeReviewResult {
        // Basic parsing - in production, use more sophisticated parsing
        const issues: CodeReviewIssue[] = [];
        const lines = response.split('\n');

        let severity: 'error' | 'warning' | 'info' = 'info';
        let currentIssue = '';

        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            if (lowerLine.includes('error') || lowerLine.includes('critical')) {
                severity = 'error';
            } else if (lowerLine.includes('warning') || lowerLine.includes('concern')) {
                severity = 'warning';
            }

            if (line.startsWith('-') || line.startsWith('*')) {
                if (currentIssue) {
                    issues.push({ message: currentIssue.trim(), severity });
                }
                currentIssue = line.slice(1).trim();
            } else if (currentIssue) {
                currentIssue += ' ' + line.trim();
            }
        }

        if (currentIssue) {
            issues.push({ message: currentIssue.trim(), severity });
        }

        return {
            summary: response,
            issues,
            passed: issues.filter(i => i.severity === 'error').length === 0
        };
    }

    /**
     * Get the Codex CLI version
     */
    static async getVersion(): Promise<string | null> {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        try {
            const { stdout } = await execAsync('codex --version');
            return stdout.trim();
        } catch {
            return null;
        }
    }

    /**
     * Check if Codex CLI is installed
     */
    static async isInstalled(): Promise<boolean> {
        const version = await CodexAdapter.getVersion();
        return version !== null;
    }
}

/**
 * Code review issue
 */
export interface CodeReviewIssue {
    /** Issue message */
    message: string;
    /** Issue severity */
    severity: 'error' | 'warning' | 'info';
    /** Line number (if available) */
    line?: number;
    /** Column number (if available) */
    column?: number;
}

/**
 * Code review result
 */
export interface CodeReviewResult {
    /** Summary of the review */
    summary: string;
    /** List of issues found */
    issues: CodeReviewIssue[];
    /** Whether the code passed review */
    passed: boolean;
}
