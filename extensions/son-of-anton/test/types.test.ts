/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import {
	AgentConfig,
	ExecutionPlan,
	FileChange,
	MemoryEntry,
	ReviewCheck,
	ReviewFeedback,
	SecurityFinding,
	Subtask,
	SubtaskResult,
	TokenUsage,
} from '../src/agents/types';

suite('Agent Types', () => {
	test('Subtask structure is valid', () => {
		const subtask: Subtask = {
			id: 'plan-1-subtask-0',
			instruction: 'Add rate limiting middleware',
			assignee: 'anton-code',
			scopeFiles: ['src/middleware/rateLimit.ts'],
			dependencies: [],
			status: 'pending',
			retryCount: 0,
		};

		assert.deepStrictEqual(
			{ id: subtask.id, assignee: subtask.assignee, status: subtask.status },
			{ id: 'plan-1-subtask-0', assignee: 'anton-code', status: 'pending' },
		);
	});

	test('FileChange supports create, modify, and delete', () => {
		const changes: FileChange[] = [
			{ filePath: 'src/new.ts', changeType: 'create', content: 'export {}' },
			{ filePath: 'src/existing.ts', changeType: 'modify', diff: '+line' },
			{ filePath: 'src/old.ts', changeType: 'delete' },
		];

		assert.strictEqual(changes.length, 3);
		assert.strictEqual(changes[0].changeType, 'create');
		assert.strictEqual(changes[1].changeType, 'modify');
		assert.strictEqual(changes[2].changeType, 'delete');
	});

	test('SecurityFinding blocking logic', () => {
		const critical: SecurityFinding = {
			ruleId: 'sql-injection',
			severity: 'critical',
			message: 'SQL injection detected',
			filePath: 'src/db.ts',
			blocking: true,
		};
		const low: SecurityFinding = {
			ruleId: 'no-console',
			severity: 'low',
			message: 'Console log in production',
			filePath: 'src/app.ts',
			blocking: false,
		};

		assert.strictEqual(critical.blocking, true);
		assert.strictEqual(low.blocking, false);
	});

	test('ExecutionPlan starts unapproved', () => {
		const plan: ExecutionPlan = {
			id: 'plan-1',
			originalRequest: 'Add feature X',
			subtasks: [],
			scopeDeclaration: { entries: [] },
			approved: false,
		};

		assert.strictEqual(plan.approved, false);
	});

	test('ReviewFeedback captures check results', () => {
		const checks: ReviewCheck[] = [
			{ name: 'syntax', passed: true, message: 'OK', severity: 'info' },
			{ name: 'security', passed: false, message: 'XSS found', severity: 'error' },
		];

		const feedback: ReviewFeedback = {
			passed: false,
			checks,
			suggestions: ['Sanitize user input'],
			confidence: 'high',
		};

		assert.strictEqual(feedback.passed, false);
		assert.strictEqual(feedback.checks.filter(c => !c.passed).length, 1);
	});

	test('TokenUsage supports naive estimation', () => {
		const usage: TokenUsage = {
			inputTokens: 100,
			outputTokens: 50,
			cachedTokens: 30,
			naiveInputTokens: 400,
		};

		const savings = (usage.naiveInputTokens - usage.inputTokens) / usage.naiveInputTokens;
		assert.strictEqual(savings, 0.75);
	});

	test('MemoryEntry has correct structure', () => {
		const entry: MemoryEntry = {
			timestamp: Date.now(),
			category: 'decision',
			content: 'Use Redis for rate limiting',
			source: 'orchestrator',
		};

		assert.strictEqual(entry.category, 'decision');
		assert.ok(entry.timestamp > 0);
	});

	test('AgentConfig includes slash commands', () => {
		const config: AgentConfig = {
			handle: 'anton',
			displayName: 'Anton',
			description: 'Orchestrator',
			defaultModel: 'opus',
			maxRetries: 3,
			slashCommands: [
				{ name: 'plan', description: 'Create a plan' },
			],
		};

		assert.strictEqual(config.slashCommands.length, 1);
		assert.strictEqual(config.slashCommands[0].name, 'plan');
	});
});
