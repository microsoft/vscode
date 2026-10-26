/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { InMemoryStorageService, StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { AgentHostToolSetEnablementService, AGENT_HOST_COPILOT_CLI_SESSION_TYPE, countEnabledCustomizationTools, getToolSetTriState, isCopilotCliSessionType, isToolEnabledInSet } from '../../../browser/agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { TestUserDataProfileService } from '../../../../../test/common/workbenchTestServices.js';
import { createTestProfile, createTestProfileService, SharedApplicationStorageDatabase, TestWindowStorageService } from '../../common/testSharedApplicationStorage.js';

suite('AgentHostToolSetEnablementService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const SESSION = AGENT_HOST_COPILOT_CLI_SESSION_TYPE;
	const SET = 'setA';
	const TOOLS = ['t1', 't2', 't3'];

	function createSut(storageService = store.add(new InMemoryStorageService())) {
		return { storageService, sut: store.add(new AgentHostToolSetEnablementService(storageService, new TestUserDataProfileService())) };
	}

	test('isCopilotCliSessionType matches local and remote Copilot CLI harnesses', () => {
		assert.deepStrictEqual(
			[
				AGENT_HOST_COPILOT_CLI_SESSION_TYPE,
				'remote-devbox-copilotcli',
				'remote-my-dash-box-copilotcli',
				'remote-devbox-claude',
				'agent-host-claude',
			].map(isCopilotCliSessionType),
			[true, true, true, false, false]);
	});

	test('default state: everything enabled, set tri-state on', () => {
		const { sut } = createSut();
		const state = sut.getState(SESSION);
		assert.deepStrictEqual(
			{ enabled: isToolEnabledInSet(state, SET, 't1'), tri: getToolSetTriState(state, SET, TOOLS) },
			{ enabled: true, tri: true });
	});

	test('disabling a set turns members off and clears per-tool overrides', () => {
		const { sut } = createSut();
		sut.setToolEnabled(SESSION, SET, 't1', false); // pre-existing override...
		sut.setToolSetEnabled(SESSION, SET, TOOLS, false); // ...is cleared by the set toggle.
		const state = sut.getState(SESSION);
		assert.deepStrictEqual(
			{ tri: getToolSetTriState(state, SET, TOOLS), t1: isToolEnabledInSet(state, SET, 't1'), tools: [...state.tools] },
			{ tri: false, t1: false, tools: [] });
	});

	test('toggling a single tool while the set is on yields mixed, stored sparsely', () => {
		const { sut } = createSut();
		sut.setToolEnabled(SESSION, SET, 't2', false);
		const state = sut.getState(SESSION);
		assert.deepStrictEqual(
			{ tri: getToolSetTriState(state, SET, TOOLS), t1: isToolEnabledInSet(state, SET, 't1'), t2: isToolEnabledInSet(state, SET, 't2'), tools: [...state.tools] },
			{ tri: 'mixed', t1: true, t2: false, tools: [['t2', false]] });
	});

	test('a per-tool override keeps a tool on while its set is off', () => {
		const { sut } = createSut();
		sut.setToolSetEnabled(SESSION, SET, TOOLS, false);
		sut.setToolEnabled(SESSION, SET, 't1', true);
		const state = sut.getState(SESSION);
		assert.deepStrictEqual(
			{ t1: isToolEnabledInSet(state, SET, 't1'), t2: isToolEnabledInSet(state, SET, 't2'), tri: getToolSetTriState(state, SET, TOOLS) },
			{ t1: true, t2: false, tri: 'mixed' });
	});

	test('setting a tool back to its set default removes the override', () => {
		const { sut } = createSut();
		sut.setToolEnabled(SESSION, SET, 't1', false); // set on => override false
		sut.setToolEnabled(SESSION, SET, 't1', true);  // back to default on => removed
		assert.deepStrictEqual([...sut.getState(SESSION).tools], []);
	});

	test('countEnabledCustomizationTools counts effective members and skips deprecated sets', () => {
		const { sut } = createSut();
		sut.setToolSetEnabled(SESSION, SET, TOOLS, false);
		sut.setToolEnabled(SESSION, SET, 't1', true);
		const toolSets = [
			{ id: SET, getTools: () => TOOLS.map(id => ({ id })) },
			{ id: 'dep', deprecated: true, getTools: () => [{ id: 'x' }] },
		];
		assert.strictEqual(countEnabledCustomizationTools(toolSets, sut.getState(SESSION)), 1);
	});

	test('enablement is isolated per session type', () => {
		const { sut } = createSut();
		sut.setToolSetEnabled(SESSION, SET, TOOLS, false);
		assert.strictEqual(getToolSetTriState(sut.getState('other'), SET, TOOLS), true);
	});

	test('state persists across instances backed by the same storage', () => {
		const storageService = store.add(new InMemoryStorageService());
		const { sut: first } = createSut(storageService);
		first.setToolSetEnabled(SESSION, SET, TOOLS, false);

		const { sut: second } = createSut(storageService);
		assert.deepStrictEqual({
			triState: getToolSetTriState(second.getState(SESSION), SET, TOOLS),
			profileStorage: storageService.get('chat.agentHost.toolSetEnablement', StorageScope.PROFILE),
		}, {
			triState: false,
			profileStorage: undefined,
		});
	});

	test('windows with different profiles share state through application storage', async () => {
		const shared = new SharedApplicationStorageDatabase();
		const editorStorage = await store.add(new TestWindowStorageService(shared)).init();
		const agentsStorage = await store.add(new TestWindowStorageService(shared)).init();
		const editor = store.add(new AgentHostToolSetEnablementService(editorStorage, createTestProfileService(createTestProfile('__default__profile__', { isDefault: true }))));
		const agents = store.add(new AgentHostToolSetEnablementService(agentsStorage, createTestProfileService(createTestProfile('agents'))));
		const seenInAgentsWindow: (boolean | 'mixed')[] = [];
		store.add(autorun(reader => {
			const triState = getToolSetTriState(agents.observe(SESSION).read(reader), SET, TOOLS);
			if (seenInAgentsWindow.at(-1) !== triState) {
				seenInAgentsWindow.push(triState);
			}
		}));

		editor.setToolSetEnabled(SESSION, SET, TOOLS, false);
		agents.setToolEnabled(SESSION, SET, 't1', true);

		assert.deepStrictEqual({
			seenInAgentsWindow,
			editor: TOOLS.map(tool => isToolEnabledInSet(editor.getState(SESSION), SET, tool)),
		}, {
			seenInAgentsWindow: [true, false, 'mixed'],
			editor: [true, false, false],
		});
	});
});
