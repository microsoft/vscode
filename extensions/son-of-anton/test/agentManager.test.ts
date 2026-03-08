/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { AgentManager } from '../src/agents/AgentManager';
import { LlmClient } from '../src/llm/LlmClient';

// Minimal stub for tests — LlmClient requires vscode.ExtensionContext
// which is only available in the extension host. These tests validate
// the AgentManager logic independently.

suite('AgentManager', () => {
	let manager: AgentManager;

	setup(() => {
		// Create with a null context — LlmClient methods won't be called in these tests
		manager = new AgentManager(null as unknown as LlmClient);
	});

	test('createTask creates a task in pending state', () => {
		const task = manager.createTask('Orchestrator', 'plan feature');
		assert.deepStrictEqual(
			{ agentName: task.agentName, description: task.description, state: task.state },
			{ agentName: 'Orchestrator', description: 'plan feature', state: 'pending' }
		);
	});

	test('startTask transitions to running', () => {
		const task = manager.createTask('CodeGen', 'write code');
		manager.startTask(task.id);

		const active = manager.getActiveTasks();
		assert.strictEqual(active.length, 1);
		assert.strictEqual(active[0].state, 'running');
		assert.ok(active[0].startedAt);
	});

	test('completeTask transitions to completed', () => {
		const task = manager.createTask('TestWriter', 'write tests');
		manager.startTask(task.id);
		manager.completeTask(task.id);

		assert.strictEqual(manager.getActiveTasks().length, 0);
		const recent = manager.getRecentTasks();
		assert.strictEqual(recent.length, 1);
		assert.strictEqual(recent[0].state, 'completed');
	});

	test('failTask records error', () => {
		const task = manager.createTask('Scanner', 'scan code');
		manager.startTask(task.id);
		manager.failTask(task.id, 'timeout');

		const recent = manager.getRecentTasks();
		assert.strictEqual(recent.length, 1);
		assert.strictEqual(recent[0].state, 'failed');
		assert.strictEqual(recent[0].error, 'timeout');
	});

	test('getPendingTasks returns only pending tasks', () => {
		manager.createTask('A', 'task a');
		const taskB = manager.createTask('B', 'task b');
		manager.startTask(taskB.id);

		assert.strictEqual(manager.getPendingTasks().length, 1);
		assert.strictEqual(manager.getPendingTasks()[0].agentName, 'A');
	});

	test('addSpan and getSpansForTask', () => {
		const task = manager.createTask('CodeGen', 'generate code');
		manager.addSpan({
			taskId: task.id,
			name: 'llm-call',
			type: 'llm_call',
			startTime: Date.now() - 1000,
			endTime: Date.now(),
			attributes: { model: 'sonnet', inputTokens: 500 },
		});

		const spans = manager.getSpansForTask(task.id);
		assert.strictEqual(spans.length, 1);
		assert.strictEqual(spans[0].type, 'llm_call');
	});

	test('hasActiveAgents reflects running state', () => {
		assert.strictEqual(manager.hasActiveAgents(), false);

		const task = manager.createTask('Agent', 'work');
		manager.startTask(task.id);
		assert.strictEqual(manager.hasActiveAgents(), true);

		manager.completeTask(task.id);
		assert.strictEqual(manager.hasActiveAgents(), false);
	});
});
