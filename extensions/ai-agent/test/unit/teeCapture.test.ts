/**
 * TeeCapture Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TeeCapture, TeeCaptureOptions } from '../../src/domain/orchestrator/teeCapture';
import type { CLIOutput } from '../../src/types';

describe('TeeCapture', () => {
    let teeCapture: TeeCapture;

    const createOutput = (data: string, type: 'stdout' | 'stderr' = 'stdout'): CLIOutput => ({
        type,
        data,
        timestamp: Date.now()
    });

    beforeEach(() => {
        teeCapture = new TeeCapture();
    });

    afterEach(() => {
        teeCapture.dispose();
    });

    describe('capture', () => {
        it('should capture and store output', () => {
            const output = createOutput('Hello World');

            const entry = teeCapture.capture(output);

            expect(entry.output).toBe(output);
            expect(entry.tokens).toBeGreaterThan(0);
            expect(teeCapture.bufferSize).toBe(1);
        });

        it('should capture multiple outputs', () => {
            teeCapture.capture(createOutput('First'));
            teeCapture.capture(createOutput('Second'));
            teeCapture.capture(createOutput('Third'));

            expect(teeCapture.bufferSize).toBe(3);
        });

        it('should emit capture event', () => {
            const outputs: CLIOutput[] = [];
            teeCapture.onCapture((output) => outputs.push(output));

            const output = createOutput('Test');
            teeCapture.capture(output);

            expect(outputs).toHaveLength(1);
            expect(outputs[0]).toBe(output);
        });

        it('should accumulate token count', () => {
            teeCapture.capture(createOutput('Hello'));
            const firstCount = teeCapture.tokenCount;

            teeCapture.capture(createOutput('World'));
            const secondCount = teeCapture.tokenCount;

            expect(secondCount).toBeGreaterThan(firstCount);
        });
    });

    describe('estimateTokens', () => {
        it('should estimate tokens using chars_divided_4 method', () => {
            const tee = new TeeCapture({ estimationMethod: 'chars_divided_4' });

            // 12 characters / 4 = 3 tokens
            const tokens = tee.estimateTokens('Hello World!');

            expect(tokens).toBe(3);
            tee.dispose();
        });

        it('should estimate tokens using words_times_1.3 method', () => {
            const tee = new TeeCapture({ estimationMethod: 'words_times_1.3' });

            // 2 words * 1.3 = 2.6 → 3 tokens
            const tokens = tee.estimateTokens('Hello World');

            expect(tokens).toBe(3);
            tee.dispose();
        });

        it('should handle empty string', () => {
            const tokens = teeCapture.estimateTokens('');

            expect(tokens).toBe(0);
        });

        it('should handle whitespace-only string', () => {
            const tee = new TeeCapture({ estimationMethod: 'words_times_1.3' });

            const tokens = tee.estimateTokens('   ');

            expect(tokens).toBe(0);
            tee.dispose();
        });
    });

    describe('threshold', () => {
        it('should trigger prune at 80k threshold', () => {
            const tee = new TeeCapture({ maxTokens: 100 });
            const thresholdCalls: number[] = [];
            tee.onThresholdExceeded((tokens) => thresholdCalls.push(tokens));

            // Add enough data to exceed 100 tokens (400+ characters)
            tee.capture(createOutput('x'.repeat(500)));

            expect(thresholdCalls).toHaveLength(1);
            expect(thresholdCalls[0]).toBeGreaterThanOrEqual(100);
            tee.dispose();
        });

        it('should calculate threshold utilization correctly', () => {
            const tee = new TeeCapture({ maxTokens: 100 });

            // Add 200 characters = ~50 tokens = 50% utilization
            tee.capture(createOutput('x'.repeat(200)));

            expect(tee.thresholdUtilization).toBe(50);
            tee.dispose();
        });

        it('should report when threshold is exceeded', () => {
            const tee = new TeeCapture({ maxTokens: 10 });

            tee.capture(createOutput('x'.repeat(100)));

            expect(tee.isThresholdExceeded).toBe(true);
            tee.dispose();
        });
    });

    describe('getHistory', () => {
        it('should return all history', () => {
            teeCapture.capture(createOutput('First'));
            teeCapture.capture(createOutput('Second'));
            teeCapture.capture(createOutput('Third'));

            const history = teeCapture.getHistory();

            expect(history).toHaveLength(3);
            expect(history[0].data).toBe('First');
            expect(history[2].data).toBe('Third');
        });

        it('should return limited history', () => {
            teeCapture.capture(createOutput('First'));
            teeCapture.capture(createOutput('Second'));
            teeCapture.capture(createOutput('Third'));

            const history = teeCapture.getHistory(2);

            expect(history).toHaveLength(2);
            expect(history[0].data).toBe('Second');
            expect(history[1].data).toBe('Third');
        });

        it('should return history as text', () => {
            teeCapture.capture(createOutput('Hello '));
            teeCapture.capture(createOutput('World'));

            const text = teeCapture.getHistoryText();

            expect(text).toBe('Hello World');
        });
    });

    describe('prune', () => {
        it('should remove old entries when pruning', () => {
            const tee = new TeeCapture({ maxTokens: 1000 });

            // Add multiple entries
            for (let i = 0; i < 10; i++) {
                tee.capture(createOutput(`Entry ${i}: ${'x'.repeat(100)}`));
            }

            const beforeSize = tee.bufferSize;
            const beforeTokens = tee.tokenCount;

            // Prune to 50 tokens
            const removed = tee.prune(50);

            expect(removed).toBeGreaterThan(0);
            expect(tee.bufferSize).toBeLessThan(beforeSize);
            expect(tee.tokenCount).toBeLessThan(beforeTokens);
            tee.dispose();
        });

        it('should prune to 50% by default', () => {
            const tee = new TeeCapture({ maxTokens: 100 });

            // Fill buffer
            tee.capture(createOutput('x'.repeat(500)));

            // Prune without target
            tee.prune();

            expect(tee.tokenCount).toBeLessThanOrEqual(50);
            tee.dispose();
        });
    });

    describe('clear', () => {
        it('should clear all data', () => {
            teeCapture.capture(createOutput('First'));
            teeCapture.capture(createOutput('Second'));

            teeCapture.clear();

            expect(teeCapture.bufferSize).toBe(0);
            expect(teeCapture.tokenCount).toBe(0);
        });
    });

    describe('maxEntries', () => {
        it('should enforce max entries limit', () => {
            const tee = new TeeCapture({ maxEntries: 5 });

            for (let i = 0; i < 10; i++) {
                tee.capture(createOutput(`Entry ${i}`));
            }

            expect(tee.bufferSize).toBe(5);
            tee.dispose();
        });

        it('should remove oldest entries when limit exceeded', () => {
            const tee = new TeeCapture({ maxEntries: 3 });

            tee.capture(createOutput('First'));
            tee.capture(createOutput('Second'));
            tee.capture(createOutput('Third'));
            tee.capture(createOutput('Fourth'));

            const history = tee.getHistory();

            expect(history[0].data).toBe('Second');
            expect(history[2].data).toBe('Fourth');
            tee.dispose();
        });
    });

    describe('getStats', () => {
        it('should return buffer statistics', () => {
            const tee = new TeeCapture({ maxTokens: 100 });
            tee.capture(createOutput('x'.repeat(40))); // 10 tokens

            const stats = tee.getStats();

            expect(stats.entries).toBe(1);
            expect(stats.tokens).toBe(10);
            expect(stats.maxTokens).toBe(100);
            expect(stats.utilization).toBe(10);
            tee.dispose();
        });
    });

    describe('dispose', () => {
        it('should clear buffer on dispose', () => {
            teeCapture.capture(createOutput('Test'));

            teeCapture.dispose();

            expect(teeCapture.bufferSize).toBe(0);
        });
    });
});
