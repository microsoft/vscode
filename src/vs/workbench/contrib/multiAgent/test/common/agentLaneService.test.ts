/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { TestSecretStorageService } from '../../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { AgentState } from '../../common/agentLaneService.js';
import { AgentLaneServiceImpl } from '../../common/agentLaneServiceImpl.js';
import { MultiAgentProviderServiceImpl } from '../../common/multiAgentProviderServiceImpl.js';

suite('AgentLaneService', () => {

	const store = new DisposableStore();
	let service: AgentLaneServiceImpl;

	setup(() => {
		const providerService = store.add(new MultiAgentProviderServiceImpl(
			new TestStorageService(),
			new TestSecretStorageService(),
			new NullLogService(),
		));

		const configService = new class extends mock<IConfigurationService>() {
			override getValue(key: string) {
				if (key === 'multiAgent.maxConcurrentAgents') { return 5; }
				return undefined;
			}
		};

		service = store.add(new AgentLaneServiceImpl(
			providerService,
			configService,
			new TestStorageService(),
			new NullLogService(),
		));
	});

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// --- Definitions ---

	test('loads built-in agents', () => {
		const builtIn = service.getBuiltInAgents();
		assert.ok(builtIn.length >= 6, 'Should have at least 6 built-in agents');
	});

	test('adds custom agent definition', () => {
		const def = service.addAgentDefinition({
			name: 'Custom Agent',
			role: 'custom',
			description: 'Test agent',
			systemInstructions: 'You are a test agent',
			modelId: 'claude-sonnet-4',
			providerIds: ['anthropic'],
			icon: 'robot',
			capabilities: ['file-read'],
			maxConcurrentTasks: 1,
		});
		assert.ok(def.id.startsWith('custom-'));
		assert.strictEqual(def.isBuiltIn, false);
	});

	test('cannot remove built-in agent', () => {
		const builtIn = service.getBuiltInAgents()[0];
		assert.throws(() => service.removeAgentDefinition(builtIn.id));
	});

	test('removes custom agent', () => {
		const def = service.addAgentDefinition({
			name: 'Removable',
			role: 'temp',
			description: 'Will be removed',
			systemInstructions: 'temp',
			modelId: 'claude-sonnet-4',
			providerIds: ['anthropic'],
			icon: 'robot',
			capabilities: [],
			maxConcurrentTasks: 1,
		});
		service.removeAgentDefinition(def.id);
		assert.strictEqual(service.getAgentDefinition(def.id), undefined);
	});

	// --- Instances ---

	test('spawns agent instance', () => {
		const builtIn = service.getBuiltInAgents()[0];
		const instance = service.spawnAgent(builtIn.id);
		assert.ok(instance.id);
		assert.strictEqual(instance.state, AgentState.Idle);
		assert.strictEqual(instance.definitionId, builtIn.id);
	});

	test('enforces max concurrent agents', () => {
		const builtIn = service.getBuiltInAgents()[0];
		// Spawn up to limit (configured as 5 in mock)
		for (let i = 0; i < 5; i++) {
			service.spawnAgent(builtIn.id);
		}
		assert.throws(() => service.spawnAgent(builtIn.id));
	});

	test('terminates agent instance', () => {
		const builtIn = service.getBuiltInAgents()[0];
		const instance = service.spawnAgent(builtIn.id);
		service.terminateAgent(instance.id);
		assert.strictEqual(service.getAgentInstance(instance.id), undefined);
	});

	// --- State transitions ---

	test('valid transition: Idle → Queued → Running → Done → Idle', () => {
		const builtIn = service.getBuiltInAgents()[0];
		const instance = service.spawnAgent(builtIn.id);

		service.transitionState(instance.id, AgentState.Queued);
		assert.strictEqual(service.getAgentInstance(instance.id)?.state, AgentState.Queued);

		service.transitionState(instance.id, AgentState.Running);
		assert.strictEqual(service.getAgentInstance(instance.id)?.state, AgentState.Running);

		service.transitionState(instance.id, AgentState.Done);
		assert.strictEqual(service.getAgentInstance(instance.id)?.state, AgentState.Done);

		service.transitionState(instance.id, AgentState.Idle);
		assert.strictEqual(service.getAgentInstance(instance.id)?.state, AgentState.Idle);
	});

	test('rejects invalid state transition', () => {
		const builtIn = service.getBuiltInAgents()[0];
		const instance = service.spawnAgent(builtIn.id);
		// Idle → Running is invalid (must go through Queued)
		assert.throws(() => service.transitionState(instance.id, AgentState.Running));
	});

	test('assignTask requires Idle or Queued state', () => {
		const builtIn = service.getBuiltInAgents()[0];
		const instance = service.spawnAgent(builtIn.id);
		// Assign in Idle — should work
		service.assignTask(instance.id, 'task-1', 'Test task');

		// Transition to Running and try assign — should fail
		service.transitionState(instance.id, AgentState.Queued);
		service.transitionState(instance.id, AgentState.Running);
		assert.throws(() => service.assignTask(instance.id, 'task-2', 'Another task'));
	});

	// --- Validation ---

	test('validates compatible model-provider assignment', () => {
		const result = service.validateModelProviderAssignment('claude-sonnet-4', ['anthropic']);
		assert.ok(result.valid);
		assert.strictEqual(result.errors.length, 0);
	});

	test('rejects incompatible model-provider assignment', () => {
		const result = service.validateModelProviderAssignment('claude-sonnet-4', ['openai']);
		assert.ok(!result.valid);
		assert.ok(result.errors.length > 0);
	});

	test('rejects empty provider list', () => {
		const result = service.validateModelProviderAssignment('claude-sonnet-4', []);
		assert.ok(!result.valid);
	});
});
