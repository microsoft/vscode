/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { MetricsTracker } from '../src/agents/MetricsTracker';
import { TokenUsage } from '../src/agents/types';

suite('MetricsTracker', () => {
	let tracker: MetricsTracker;

	const tokenUsage: TokenUsage = {
		inputTokens: 100,
		outputTokens: 50,
		cachedTokens: 20,
		naiveInputTokens: 400,
	};

	setup(() => {
		tracker = new MetricsTracker();
	});

	test('recordInvocation tracks token usage and latency', () => {
		tracker.recordInvocation('anton-code', 500, tokenUsage);

		const metrics = tracker.getMetrics('anton-code');
		assert.deepStrictEqual(
			{
				totalInvocations: metrics?.totalInvocations,
				totalInputTokens: metrics?.totalInputTokens,
				totalOutputTokens: metrics?.totalOutputTokens,
				averageLatencyMs: metrics?.averageLatencyMs,
			},
			{
				totalInvocations: 1,
				totalInputTokens: 100,
				totalOutputTokens: 50,
				averageLatencyMs: 500,
			}
		);
	});

	test('recordFirstPassSuccess increments counter', () => {
		tracker.recordInvocation('anton-code', 500, tokenUsage);
		tracker.recordFirstPassSuccess('anton-code');

		assert.strictEqual(tracker.getMetrics('anton-code')?.firstPassSuccessCount, 1);
	});

	test('recordRetry and recordEscalation', () => {
		tracker.recordInvocation('anton-test', 300, tokenUsage);
		tracker.recordRetry('anton-test');
		tracker.recordRetry('anton-test');
		tracker.recordEscalation('anton-test');

		const metrics = tracker.getMetrics('anton-test');
		assert.deepStrictEqual(
			{
				totalRetries: metrics?.totalRetries,
				escalationCount: metrics?.escalationCount,
			},
			{
				totalRetries: 2,
				escalationCount: 1,
			}
		);
	});

	test('recordFailureMode tracks counts per mode', () => {
		tracker.recordInvocation('anton-security', 200, tokenUsage);
		tracker.recordFailureMode('anton-security', 'timeout');
		tracker.recordFailureMode('anton-security', 'timeout');
		tracker.recordFailureMode('anton-security', 'parse_error');

		const metrics = tracker.getMetrics('anton-security');
		assert.strictEqual(metrics?.failureModes.get('timeout'), 2);
		assert.strictEqual(metrics?.failureModes.get('parse_error'), 1);
	});

	test('getTokenSavings calculates percentage', () => {
		tracker.recordInvocation('anton-code', 500, tokenUsage);

		// naiveInputTokens = 400, inputTokens = 100 → savings = (400-100)/400 * 100 = 75%
		assert.strictEqual(tracker.getTokenSavings('anton-code'), 75);
	});

	test('getTokenSavings returns 0 for unknown agent', () => {
		assert.strictEqual(tracker.getTokenSavings('anton-docs'), 0);
	});

	test('getAllMetrics returns all tracked agents', () => {
		tracker.recordInvocation('anton-code', 500, tokenUsage);
		tracker.recordInvocation('anton-test', 300, tokenUsage);

		const all = tracker.getAllMetrics();
		assert.strictEqual(all.length, 2);
	});

	test('averageLatencyMs computes correctly across invocations', () => {
		tracker.recordInvocation('anton-code', 200, tokenUsage);
		tracker.recordInvocation('anton-code', 400, tokenUsage);

		assert.strictEqual(tracker.getMetrics('anton-code')?.averageLatencyMs, 300);
	});

	test('formatSummary produces markdown output', () => {
		tracker.recordInvocation('anton-code', 500, tokenUsage);
		tracker.recordFirstPassSuccess('anton-code');

		const summary = tracker.formatSummary();
		assert.ok(summary.includes('## Agent Metrics Summary'));
		assert.ok(summary.includes('anton-code'));
		assert.ok(summary.includes('Invocations: 1'));
	});
});
