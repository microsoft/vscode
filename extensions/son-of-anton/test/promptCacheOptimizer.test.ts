/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { PromptCacheOptimizer } from '../src/llm/PromptCacheOptimizer';

suite('PromptCacheOptimizer', () => {
	let optimizer: PromptCacheOptimizer;

	setup(() => {
		optimizer = new PromptCacheOptimizer();
	});

	test('recordCacheMetrics calculates hit rate correctly', () => {
		const metrics = optimizer.recordCacheMetrics(
			'sonnet', 'anton-code', 100, 900, 1000, 200
		);

		assert.deepStrictEqual(
			{
				cacheHitRate: metrics.cacheHitRate,
				model: metrics.model,
				agentHandle: metrics.agentHandle,
			},
			{
				cacheHitRate: 0.9,
				model: 'sonnet',
				agentHandle: 'anton-code',
			}
		);
	});

	test('recordCacheMetrics handles zero tokens', () => {
		const metrics = optimizer.recordCacheMetrics(
			'haiku', 'anton-docs', 0, 0, 500, 100
		);

		assert.strictEqual(metrics.cacheHitRate, 0);
	});

	test('getOverallCacheHitRate aggregates across agents', () => {
		optimizer.recordCacheMetrics('sonnet', 'anton-code', 200, 800, 1000, 200);
		optimizer.recordCacheMetrics('haiku', 'anton-docs', 100, 900, 1000, 100);

		const rate = optimizer.getOverallCacheHitRate();
		// Total read: 800+900=1700, Total creation: 200+100=300
		// Rate = 1700 / (1700+300) = 0.85
		assert.strictEqual(rate, 0.85);
	});

	test('getAgentCacheStats returns per-agent stats', () => {
		optimizer.recordCacheMetrics('sonnet', 'anton-code', 100, 900, 1000, 200);
		optimizer.recordCacheMetrics('sonnet', 'anton-code', 50, 950, 1000, 150);

		const stats = optimizer.getAgentCacheStats('anton-code');
		assert.strictEqual(stats?.totalRequests, 2);
		assert.strictEqual(stats?.totalCacheReadTokens, 1850);
		assert.strictEqual(stats?.totalCacheCreationTokens, 150);
	});

	test('auditPromptStructure detects timestamps in system prompt', () => {
		const result = optimizer.auditPromptStructure(
			'anton-code',
			'You are an agent. Current time: 2024-03-15T10:30:00',
			'# Project',
			'context',
			'user message',
		);

		const hasTimestampIssue = result.issues.some(i =>
			i.message.includes('timestamp')
		);
		assert.strictEqual(hasTimestampIssue, true);
	});

	test('auditPromptStructure detects system prompt hash changes', () => {
		optimizer.auditPromptStructure('anton-code', 'Prompt v1', '', '', '');
		const result = optimizer.auditPromptStructure('anton-code', 'Prompt v2', '', '', '');

		const hasHashIssue = result.issues.some(i =>
			i.message.includes('hash changed')
		);
		assert.strictEqual(hasHashIssue, true);
	});

	test('formatSummary produces markdown output', () => {
		optimizer.recordCacheMetrics('sonnet', 'anton-code', 100, 900, 1000, 200);

		const summary = optimizer.formatSummary();
		assert.ok(summary.includes('Prompt Cache Performance'));
		assert.ok(summary.includes('anton-code'));
		assert.ok(summary.includes('Overall Cache Hit Rate'));
	});

	test('getRecentMetrics returns limited entries', () => {
		for (let i = 0; i < 100; i++) {
			optimizer.recordCacheMetrics('sonnet', 'anton-code', 10, 90, 100, 20);
		}

		const recent = optimizer.getRecentMetrics(10);
		assert.strictEqual(recent.length, 10);
	});
});
