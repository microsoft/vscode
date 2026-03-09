// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert';
import type { ModelRoutesConfig, RequestMetrics } from '../src/types.js';
import { ModelRouter } from '../src/router.js';
import { MetricsCollector, calculateCost, PRICING } from '../src/metrics.js';
import { toAnthropicFormat, toOpenAIFormat, fromAnthropicResponse, fromOpenAIResponse } from '../src/translators.js';

const testConfig: ModelRoutesConfig = {
	routes: [
		{
			name: 'orchestrator-planning',
			match: { agentRole: 'orchestrator', taskType: 'planning' },
			provider: 'anthropic',
			model: 'claude-sonnet-4-20250514',
			priority: 1,
		},
		{
			name: 'code-generation',
			match: { agentRole: 'coder', taskType: 'generation' },
			provider: 'anthropic',
			model: 'claude-sonnet-4-20250514',
			priority: 2,
		},
		{
			name: 'fast-completion',
			match: { agentRole: 'completer' },
			provider: 'ollama',
			model: 'codellama:13b',
			priority: 3,
			fallback: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
		},
		{
			name: 'exploration',
			match: { agentRole: 'explorer' },
			provider: 'anthropic',
			model: 'claude-haiku-4-5-20251001',
			priority: 4,
		},
		{
			name: 'split-route',
			match: { agentRole: 'reviewer' },
			priority: 5,
			split: [
				{ provider: 'anthropic', model: 'claude-sonnet-4-20250514', weight: 70 },
				{ provider: 'openai', model: 'gpt-4o', weight: 30 },
			],
		},
		{
			name: 'catch-all',
			match: { agentRole: '*' },
			provider: 'anthropic',
			model: 'claude-sonnet-4-20250514',
			priority: 100,
		},
	],
	providers: {
		anthropic: {
			baseUrl: 'https://api.anthropic.com',
			apiKey: '${ANTHROPIC_API_KEY}',
			format: 'anthropic',
		},
		openai: {
			baseUrl: 'https://api.openai.com',
			apiKey: '${OPENAI_API_KEY}',
			format: 'openai',
		},
		ollama: {
			baseUrl: 'http://localhost:11434',
			format: 'openai',
			local: true,
		},
	},
};

describe('ModelRouter', () => {
	let router: ModelRouter;

	beforeEach(() => {
		router = new ModelRouter(testConfig);
	});

	test('matches route by agentRole', () => {
		const result = router.resolveRoute({ agentRole: 'explorer' });
		assert.deepStrictEqual({
			provider: result.provider,
			model: result.model,
		}, {
			provider: 'anthropic',
			model: 'claude-haiku-4-5-20251001',
		});
	});

	test('matches route by agentRole and taskType', () => {
		const result = router.resolveRoute({ agentRole: 'orchestrator', taskType: 'planning' });
		assert.deepStrictEqual({
			provider: result.provider,
			model: result.model,
		}, {
			provider: 'anthropic',
			model: 'claude-sonnet-4-20250514',
		});
	});

	test('matches wildcard catch-all route', () => {
		const result = router.resolveRoute({ agentRole: 'unknown-role' });
		assert.deepStrictEqual({
			provider: result.provider,
			model: result.model,
		}, {
			provider: 'anthropic',
			model: 'claude-sonnet-4-20250514',
		});
	});

	test('respects priority ordering (lower number = higher priority)', () => {
		// orchestrator with planning should match priority 1, not catch-all at 100
		const result = router.resolveRoute({ agentRole: 'orchestrator', taskType: 'planning' });
		assert.strictEqual(result.model, 'claude-sonnet-4-20250514');
		assert.strictEqual(result.provider, 'anthropic');
	});

	test('throws when no route matches (no wildcard)', () => {
		const noWildcardConfig: ModelRoutesConfig = {
			routes: [{
				name: 'specific',
				match: { agentRole: 'coder' },
				provider: 'anthropic',
				model: 'claude-sonnet-4-20250514',
				priority: 1,
			}],
			providers: testConfig.providers,
		};
		const strictRouter = new ModelRouter(noWildcardConfig);
		assert.throws(() => {
			strictRouter.resolveRoute({ agentRole: 'explorer' });
		}, /No matching route found/);
	});

	test('resolves fallback configuration', () => {
		const route = testConfig.routes.find(r => r.name === 'fast-completion');
		assert.ok(route?.fallback);
		assert.strictEqual(route.fallback.provider, 'anthropic');
		assert.strictEqual(route.fallback.model, 'claude-haiku-4-5-20251001');
	});

	test('split/weighted routing distributes across providers', () => {
		const counts: Record<string, number> = { anthropic: 0, openai: 0 };
		const iterations = 10000;

		for (let i = 0; i < iterations; i++) {
			const result = router.resolveRoute({ agentRole: 'reviewer' });
			counts[result.provider]++;
		}

		// With 70/30 split, anthropic should get roughly 70% (+/- 5%)
		const anthropicRatio = counts.anthropic / iterations;
		assert.ok(
			anthropicRatio > 0.60 && anthropicRatio < 0.80,
			`Expected anthropic ratio ~0.70, got ${anthropicRatio}`
		);

		const openaiRatio = counts.openai / iterations;
		assert.ok(
			openaiRatio > 0.20 && openaiRatio < 0.40,
			`Expected openai ratio ~0.30, got ${openaiRatio}`
		);
	});

	test('resolves env var references in provider config', () => {
		const testKey = 'test-api-key-12345';
		process.env.ANTHROPIC_API_KEY = testKey;

		const resolved = router.resolveProvider('anthropic');
		assert.strictEqual(resolved.apiKey, testKey);

		delete process.env.ANTHROPIC_API_KEY;
	});

	test('returns empty string for unset env vars', () => {
		delete process.env.ANTHROPIC_API_KEY;

		const resolved = router.resolveProvider('anthropic');
		assert.strictEqual(resolved.apiKey, '');
	});

	test('throws for unknown provider', () => {
		assert.throws(() => {
			router.resolveProvider('nonexistent');
		}, /Unknown provider/);
	});

	test('reloads config', () => {
		const newConfig: ModelRoutesConfig = {
			routes: [{
				name: 'new-route',
				match: { agentRole: 'tester' },
				provider: 'openai',
				model: 'gpt-4o',
				priority: 1,
			}],
			providers: testConfig.providers,
		};

		router.reloadConfig(newConfig);
		const result = router.resolveRoute({ agentRole: 'tester' });
		assert.strictEqual(result.provider, 'openai');
		assert.strictEqual(result.model, 'gpt-4o');
	});
});

describe('MetricsCollector', () => {
	let collector: MetricsCollector;

	function makeMetric(overrides: Partial<RequestMetrics> = {}): RequestMetrics {
		return {
			id: 'test-id',
			timestamp: Date.now(),
			provider: 'anthropic',
			model: 'claude-sonnet-4-20250514',
			agentRole: 'coder',
			taskType: 'generation',
			taskId: 'task-1',
			inputTokens: 1000,
			outputTokens: 500,
			cachedTokens: 200,
			latencyMs: 1500,
			cost: 0.01,
			success: true,
			...overrides,
		};
	}

	beforeEach(() => {
		collector = new MetricsCollector();
	});

	test('records and aggregates metrics', () => {
		collector.record(makeMetric({ provider: 'anthropic', cost: 0.01 }));
		collector.record(makeMetric({ provider: 'openai', model: 'gpt-4o', cost: 0.02 }));
		collector.record(makeMetric({ provider: 'anthropic', cost: 0.03 }));

		const agg = collector.getAggregated();
		assert.strictEqual(agg.totalRequests, 3);
		assert.ok(Math.abs(agg.totalCost - 0.06) < 0.0001);
		assert.strictEqual(agg.byProvider['anthropic'].requests, 2);
		assert.strictEqual(agg.byProvider['openai'].requests, 1);
		assert.strictEqual(agg.byModel['claude-sonnet-4-20250514'].requests, 2);
		assert.strictEqual(agg.byModel['gpt-4o'].requests, 1);
	});

	test('returns recent metrics', () => {
		collector.record(makeMetric({ id: 'a' }));
		collector.record(makeMetric({ id: 'b' }));
		collector.record(makeMetric({ id: 'c' }));

		const recent = collector.getRecent(2);
		assert.strictEqual(recent.length, 2);
		assert.strictEqual(recent[0].id, 'b');
		assert.strictEqual(recent[1].id, 'c');
	});

	test('resets all metrics', () => {
		collector.record(makeMetric());
		collector.record(makeMetric());
		collector.reset();

		const agg = collector.getAggregated();
		assert.strictEqual(agg.totalRequests, 0);
		assert.strictEqual(agg.totalCost, 0);
	});

	test('aggregates by agent role and task type', () => {
		collector.record(makeMetric({ agentRole: 'coder', taskType: 'generation', cost: 0.01 }));
		collector.record(makeMetric({ agentRole: 'coder', taskType: 'refactor', cost: 0.02 }));
		collector.record(makeMetric({ agentRole: 'explorer', taskType: 'search', cost: 0.005 }));

		const agg = collector.getAggregated();
		assert.strictEqual(agg.byAgentRole['coder'].requests, 2);
		assert.strictEqual(agg.byAgentRole['explorer'].requests, 1);
		assert.strictEqual(agg.byTaskType['generation'].requests, 1);
		assert.strictEqual(agg.byTaskType['refactor'].requests, 1);
		assert.strictEqual(agg.byTaskType['search'].requests, 1);
	});
});

describe('calculateCost', () => {
	test('calculates cost for known model', () => {
		// claude-sonnet-4-20250514: input $3/M, output $15/M, cacheRead $0.3/M
		const cost = calculateCost('claude-sonnet-4-20250514', 1000, 500, 200);
		// nonCachedInput = 800, inputCost = 800/1M * 3 = 0.0024
		// outputCost = 500/1M * 15 = 0.0075
		// cacheCost = 200/1M * 0.3 = 0.00006
		const expected = 0.0024 + 0.0075 + 0.00006;
		assert.ok(Math.abs(cost - expected) < 0.000001, `Expected ${expected}, got ${cost}`);
	});

	test('returns 0 for unknown model', () => {
		const cost = calculateCost('unknown-model', 1000, 500, 0);
		assert.strictEqual(cost, 0);
	});

	test('handles model without cache pricing', () => {
		// gpt-4o: input $2.5/M, output $10/M, no cache pricing
		const cost = calculateCost('gpt-4o', 1000, 500, 0);
		const expected = (1000 / 1_000_000) * 2.5 + (500 / 1_000_000) * 10;
		assert.ok(Math.abs(cost - expected) < 0.000001);
	});
});

describe('Translators', () => {
	test('toAnthropicFormat extracts system messages', () => {
		const messages = [
			{ role: 'system', content: 'You are a helpful assistant.' },
			{ role: 'user', content: 'Hello' },
		];

		const result = toAnthropicFormat(messages, undefined, 4096, 'claude-sonnet-4-20250514');
		assert.deepStrictEqual(result, {
			model: 'claude-sonnet-4-20250514',
			max_tokens: 4096,
			system: 'You are a helpful assistant.',
			messages: [{ role: 'user', content: 'Hello' }],
		});
	});

	test('toAnthropicFormat merges system prompt with system messages', () => {
		const messages = [
			{ role: 'system', content: 'Additional instructions.' },
			{ role: 'user', content: 'Hello' },
		];

		const result = toAnthropicFormat(messages, 'Base system prompt', 4096, 'claude-sonnet-4-20250514');
		assert.strictEqual(result.system, 'Base system prompt\nAdditional instructions.');
	});

	test('toAnthropicFormat preserves cache_control directives', () => {
		const messages = [
			{ role: 'system', content: 'Cached system', cache_control: { type: 'ephemeral' } },
			{ role: 'user', content: 'Hello' },
		];

		const result = toAnthropicFormat(messages, undefined, 4096, 'claude-sonnet-4-20250514');
		assert.ok(Array.isArray(result.system));
		const systemBlocks = result.system as Array<{ type: string; text?: string; cache_control?: { type: string } }>;
		assert.strictEqual(systemBlocks[0].cache_control?.type, 'ephemeral');
	});

	test('toOpenAIFormat prepends system prompt', () => {
		const messages = [
			{ role: 'user', content: 'Hello' },
		];

		const result = toOpenAIFormat(messages, 'You are helpful.', 4096, 'gpt-4o');
		assert.deepStrictEqual(result, {
			model: 'gpt-4o',
			max_tokens: 4096,
			messages: [
				{ role: 'system', content: 'You are helpful.' },
				{ role: 'user', content: 'Hello' },
			],
		});
	});

	test('toOpenAIFormat without system prompt', () => {
		const messages = [
			{ role: 'user', content: 'Hello' },
		];

		const result = toOpenAIFormat(messages, undefined, 4096, 'gpt-4o');
		assert.strictEqual(result.messages.length, 1);
		assert.strictEqual(result.messages[0].role, 'user');
	});

	test('fromAnthropicResponse normalizes response', () => {
		const response = {
			content: [{ type: 'text', text: 'Hello there!' }],
			model: 'claude-sonnet-4-20250514',
			usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 20 },
			stop_reason: 'end_turn',
		};

		const unified = fromAnthropicResponse(response);
		assert.deepStrictEqual(unified, {
			content: 'Hello there!',
			model: 'claude-sonnet-4-20250514',
			inputTokens: 100,
			outputTokens: 50,
			cachedTokens: 20,
			finishReason: 'end_turn',
		});
	});

	test('fromOpenAIResponse normalizes response', () => {
		const response = {
			choices: [{
				message: { content: 'Hi!' },
				finish_reason: 'stop',
			}],
			model: 'gpt-4o',
			usage: {
				prompt_tokens: 80,
				completion_tokens: 30,
				prompt_tokens_details: { cached_tokens: 10 },
			},
		};

		const unified = fromOpenAIResponse(response);
		assert.deepStrictEqual(unified, {
			content: 'Hi!',
			model: 'gpt-4o',
			inputTokens: 80,
			outputTokens: 30,
			cachedTokens: 10,
			finishReason: 'stop',
		});
	});

	test('fromOpenAIResponse handles missing fields gracefully', () => {
		const response = {
			choices: [{ message: {}, finish_reason: undefined }],
			model: 'gpt-4o-mini',
			usage: { prompt_tokens: 50, completion_tokens: 20 },
		};

		const unified = fromOpenAIResponse(response);
		assert.strictEqual(unified.content, '');
		assert.strictEqual(unified.cachedTokens, 0);
		assert.strictEqual(unified.finishReason, 'unknown');
	});
});
