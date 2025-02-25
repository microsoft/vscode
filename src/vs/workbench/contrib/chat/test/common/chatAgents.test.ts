/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ChatAgentService, IChatAgentData, IChatAgentImplementation } from '../../common/chatAgents.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';

const testAgentId = 'testAgent';
const testAgentData: IChatAgentData = {
	id: testAgentId,
	name: 'Test Agent',
	extensionDisplayName: '',
	extensionId: new ExtensionIdentifier(''),
	extensionPublisherId: '',
	locations: [],
	metadata: {},
	slashCommands: [],
	disambiguation: [],
};

class TestingContextKeyService extends MockContextKeyService {
	private _contextMatchesRulesReturnsTrue = false;
	public contextMatchesRulesReturnsTrue() {
		this._contextMatchesRulesReturnsTrue = true;
	}

	public override contextMatchesRules(rules: ContextKeyExpression): boolean {
		return this._contextMatchesRulesReturnsTrue;
	}
}

suite('ChatAgents', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let chatAgentService: ChatAgentService;
	let contextKeyService: TestingContextKeyService;
	setup(() => {
		contextKeyService = new TestingContextKeyService();
		chatAgentService = store.add(new ChatAgentService(contextKeyService, store.add(new TestStorageService())));
	});

	test('registerAgent', async () => {
		assert.strictEqual(chatAgentService.getAgents().length, 0);


		const agentRegistration = chatAgentService.registerAgent(testAgentId, testAgentData);

		assert.strictEqual(chatAgentService.getAgents().length, 1);
		assert.strictEqual(chatAgentService.getAgents()[0].id, testAgentId);

		assert.throws(() => chatAgentService.registerAgent(testAgentId, testAgentData));

		agentRegistration.dispose();
		assert.strictEqual(chatAgentService.getAgents().length, 0);
	});

	test('agent when clause', async () => {
		assert.strictEqual(chatAgentService.getAgents().length, 0);

		store.add(chatAgentService.registerAgent(testAgentId, {
			...testAgentData,
			when: 'myKey'
		}));
		assert.strictEqual(chatAgentService.getAgents().length, 0);

		contextKeyService.contextMatchesRulesReturnsTrue();
		assert.strictEqual(chatAgentService.getAgents().length, 1);
	});

	suite('registerAgentImplementation', function () {
		const agentImpl: IChatAgentImplementation = {
			invoke: async () => { return {}; },
			provideFollowups: async () => { return []; },
		};

		test('should register an agent implementation', () => {
			store.add(chatAgentService.registerAgent(testAgentId, testAgentData));
			store.add(chatAgentService.registerAgentImplementation(testAgentId, agentImpl));

			const agents = chatAgentService.getActivatedAgents();
			assert.strictEqual(agents.length, 1);
			assert.strictEqual(agents[0].id, testAgentId);
		});

		test('can dispose an agent implementation', () => {
			store.add(chatAgentService.registerAgent(testAgentId, testAgentData));
			const implRegistration = chatAgentService.registerAgentImplementation(testAgentId, agentImpl);
			implRegistration.dispose();

			const agents = chatAgentService.getActivatedAgents();
			assert.strictEqual(agents.length, 0);
		});

		test('should throw error if agent does not exist', () => {
			assert.throws(() => chatAgentService.registerAgentImplementation('nonexistentAgent', agentImpl));
		});

		test('should throw error if agent already has an implementation', () => {
			store.add(chatAgentService.registerAgent(testAgentId, testAgentData));
			store.add(chatAgentService.registerAgentImplementation(testAgentId, agentImpl));

			assert.throws(() => chatAgentService.registerAgentImplementation(testAgentId, agentImpl));
		});
	});
});
