/**
 * Tee Capture
 * Captures CLI output while passing it through for display
 * Manages buffer and token thresholds for context safety
 */

import { EventEmitter, Disposable } from 'vscode';
import type { CLIOutput } from '../../types';

/**
 * Token estimation method
 */
export type TokenEstimationMethod = 'chars_divided_4' | 'words_times_1.3' | 'accurate';

/**
 * Tee Capture options
 */
export interface TeeCaptureOptions {
    /** Maximum tokens before triggering prune */
    maxTokens?: number;
    /** Token estimation method */
    estimationMethod?: TokenEstimationMethod;
    /** Maximum buffer entries */
    maxEntries?: number;
}

/**
 * Captured entry structure
 */
export interface CapturedEntry {
    /** Output data */
    output: CLIOutput;
    /** Estimated token count for this entry */
    tokens: number;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<TeeCaptureOptions> = {
    maxTokens: 80000,
    estimationMethod: 'chars_divided_4',
    maxEntries: 10000
};

/**
 * TeeCapture class
 * Implements Tee & Capture Strategy for CLI output
 */
export class TeeCapture implements Disposable {
    private buffer: CapturedEntry[] = [];
    private totalTokens: number = 0;
    private readonly options: Required<TeeCaptureOptions>;

    private readonly _onThresholdExceeded = new EventEmitter<number>();
    private readonly _onCapture = new EventEmitter<CLIOutput>();

    /** Event fired when token threshold is exceeded */
    readonly onThresholdExceeded = this._onThresholdExceeded.event;

    /** Event fired when output is captured */
    readonly onCapture = this._onCapture.event;

    constructor(options: TeeCaptureOptions = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    /**
     * Get current token count
     */
    get tokenCount(): number {
        return this.totalTokens;
    }

    /**
     * Get buffer size
     */
    get bufferSize(): number {
        return this.buffer.length;
    }

    /**
     * Check if threshold is exceeded
     */
    get isThresholdExceeded(): boolean {
        return this.totalTokens >= this.options.maxTokens;
    }

    /**
     * Get threshold utilization percentage
     */
    get thresholdUtilization(): number {
        return (this.totalTokens / this.options.maxTokens) * 100;
    }

    /**
     * Capture output
     * @param output CLI output to capture
     * @returns The captured entry
     */
    capture(output: CLIOutput): CapturedEntry {
        const tokens = this.estimateTokens(output.data);
        const entry: CapturedEntry = { output, tokens };

        this.buffer.push(entry);
        this.totalTokens += tokens;

        // Fire capture event
        this._onCapture.fire(output);

        // Check thresholds
        this.checkThreshold();
        this.checkMaxEntries();

        return entry;
    }

    /**
     * Estimate tokens in text
     * @param text Text to estimate
     */
    estimateTokens(text: string): number {
        switch (this.options.estimationMethod) {
            case 'chars_divided_4':
                // Rough estimate: 1 token ≈ 4 characters
                return Math.ceil(text.length / 4);

            case 'words_times_1.3':
                // Word-based estimate: avg 1.3 tokens per word
                const words = text.split(/\s+/).filter(w => w.length > 0);
                return Math.ceil(words.length * 1.3);

            case 'accurate':
                // More accurate estimation considering punctuation
                const chars = text.length;
                const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
                const punctuation = (text.match(/[.,!?;:'"()\[\]{}]/g) || []).length;
                return Math.ceil((chars / 4) * 0.8 + wordCount * 0.5 + punctuation * 0.5);

            default:
                return Math.ceil(text.length / 4);
        }
    }

    /**
     * Get captured history
     * @param limit Maximum entries to return
     */
    getHistory(limit?: number): CLIOutput[] {
        const outputs = this.buffer.map(e => e.output);
        if (limit && limit > 0) {
            return outputs.slice(-limit);
        }
        return outputs;
    }

    /**
     * Get raw history as string
     * @param limit Maximum entries to include
     */
    getHistoryText(limit?: number): string {
        return this.getHistory(limit)
            .map(o => o.data)
            .join('');
    }

    /**
     * Prune old entries to reduce token count
     * @param targetTokens Target token count after pruning
     * @returns Number of entries removed
     */
    prune(targetTokens?: number): number {
        const target = targetTokens ?? Math.floor(this.options.maxTokens * 0.5);
        let removed = 0;

        while (this.totalTokens > target && this.buffer.length > 0) {
            const entry = this.buffer.shift();
            if (entry) {
                this.totalTokens -= entry.tokens;
                removed++;
            }
        }

        // Ensure totalTokens doesn't go negative
        if (this.totalTokens < 0) {
            this.totalTokens = 0;
        }

        return removed;
    }

    /**
     * Clear all captured output
     */
    clear(): void {
        this.buffer = [];
        this.totalTokens = 0;
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.clear();
        this._onThresholdExceeded.dispose();
        this._onCapture.dispose();
    }

    /**
     * Check if token threshold is exceeded
     */
    private checkThreshold(): void {
        if (this.totalTokens >= this.options.maxTokens) {
            this._onThresholdExceeded.fire(this.totalTokens);
        }
    }

    /**
     * Check if max entries is exceeded
     */
    private checkMaxEntries(): void {
        while (this.buffer.length > this.options.maxEntries) {
            const entry = this.buffer.shift();
            if (entry) {
                this.totalTokens -= entry.tokens;
            }
        }
    }

    /**
     * Get buffer statistics
     */
    getStats(): {
        entries: number;
        tokens: number;
        maxTokens: number;
        utilization: number;
    } {
        return {
            entries: this.buffer.length,
            tokens: this.totalTokens,
            maxTokens: this.options.maxTokens,
            utilization: this.thresholdUtilization
        };
    }
}
