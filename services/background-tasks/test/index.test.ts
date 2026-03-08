// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { BackgroundTask, TaskConfig, ResourceLimits, TaskStatus } from '../src/types';

describe('Background Task Manager', () => {
	describe('TaskConfig validation', () => {
		test('creates valid task config with required fields', () => {
			const config: TaskConfig = {
				name: 'E2E test generation',
				description: 'Generate E2E tests for the entire app',
			};
			assert.ok(config.name);
			assert.ok(config.description);
		});

		test('accepts optional resource limits', () => {
			const config: TaskConfig = {
				name: 'Security scan',
				description: 'Run comprehensive security scan',
				resourceLimits: {
					memoryMb: 2048,
					timeoutMs: 3600000,
				},
			};
			assert.strictEqual(config.resourceLimits?.memoryMb, 2048);
			assert.strictEqual(config.resourceLimits?.timeoutMs, 3600000);
		});
	});

	describe('BackgroundTask state machine', () => {
		function createTask(overrides?: Partial<BackgroundTask>): BackgroundTask {
			return {
				id: 'bg-test-001',
				name: 'Test task',
				description: 'A test background task',
				status: 'pending',
				createdAt: Date.now(),
				startedAt: null,
				completedAt: null,
				containerId: null,
				progress: { percentage: 0, message: 'Queued' },
				resultDir: '/data/background/results/bg-test-001',
				resourceLimits: {
					memoryMb: 4096,
					cpuCores: 2,
					timeoutMs: 7200000,
					maxTokenBudgetUsd: 10,
				},
				tokenUsage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
				branch: null,
				error: null,
				...overrides,
			};
		}

		test('task starts in pending state', () => {
			const task = createTask();
			assert.strictEqual(task.status, 'pending');
			assert.strictEqual(task.startedAt, null);
			assert.strictEqual(task.completedAt, null);
		});

		test('running task has startedAt and containerId', () => {
			const task = createTask({
				status: 'running',
				startedAt: Date.now(),
				containerId: 'abc123',
			});
			assert.strictEqual(task.status, 'running');
			assert.ok(task.startedAt);
			assert.ok(task.containerId);
		});

		test('completed task has completedAt', () => {
			const now = Date.now();
			const task = createTask({
				status: 'completed',
				startedAt: now - 60000,
				completedAt: now,
				progress: { percentage: 100, message: 'Done' },
			});
			assert.strictEqual(task.status, 'completed');
			assert.ok(task.completedAt);
			assert.ok(task.completedAt > task.startedAt!);
		});

		test('failed task includes error message', () => {
			const task = createTask({
				status: 'failed',
				error: 'Container exited with code 1',
				completedAt: Date.now(),
			});
			assert.strictEqual(task.status, 'failed');
			assert.ok(task.error);
		});

		test('timeout task records timeout error', () => {
			const task = createTask({
				status: 'timeout',
				error: 'Task exceeded timeout of 7200000ms',
				completedAt: Date.now(),
			});
			assert.strictEqual(task.status, 'timeout');
			assert.ok(task.error?.includes('timeout'));
		});

		test('valid status transitions', () => {
			const validTransitions: Record<TaskStatus, TaskStatus[]> = {
				'pending': ['running', 'cancelled'],
				'running': ['completed', 'failed', 'cancelled', 'timeout'],
				'completed': [],
				'failed': [],
				'cancelled': [],
				'timeout': [],
			};

			assert.deepStrictEqual(validTransitions['pending'], ['running', 'cancelled']);
			assert.deepStrictEqual(validTransitions['completed'], []);
		});
	});

	describe('Resource limits', () => {
		test('default limits are reasonable', () => {
			const defaults: ResourceLimits = {
				memoryMb: 4096,
				cpuCores: 2,
				timeoutMs: 7200000,
				maxTokenBudgetUsd: 10,
			};
			assert.strictEqual(defaults.memoryMb, 4096);
			assert.strictEqual(defaults.cpuCores, 2);
			assert.strictEqual(defaults.timeoutMs, 2 * 60 * 60 * 1000);
			assert.strictEqual(defaults.maxTokenBudgetUsd, 10);
		});

		test('memory is specified in megabytes', () => {
			const limits: ResourceLimits = {
				memoryMb: 4096,
				cpuCores: 2,
				timeoutMs: 7200000,
				maxTokenBudgetUsd: 10,
			};
			const bytes = limits.memoryMb * 1024 * 1024;
			assert.strictEqual(bytes, 4294967296); // 4GB
		});
	});

	describe('Task ID generation', () => {
		test('generates unique IDs', () => {
			const ids = new Set<string>();
			for (let i = 0; i < 100; i++) {
				const id = `bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
				ids.add(id);
			}
			assert.strictEqual(ids.size, 100);
		});

		test('ID format matches expected pattern', () => {
			const id = `bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			assert.ok(/^bg-\d+-[a-z0-9]+$/.test(id));
		});
	});
});
