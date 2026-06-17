/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { TestExtensionService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { getRequestIdsToRewind, getRewindConfirmationMessage } from '../../browser/actions/chatRewindActions.js';
import { ChatAgentService, IChatAgentService } from '../../common/participants/chatAgents.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatModel, ISerializableChatData3 } from '../../common/model/chatModel.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { MockChatService } from '../common/chatService/mockChatService.js';

suite('ChatRewindActions - rewind selection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('rewinds the target request and everything after it', () => {
		assert.deepStrictEqual(
			getRequestIdsToRewind(['a', 'b', 'c', 'd'], 'b'),
			['b', 'c', 'd']
		);
	});

	test('rewinding the last request removes only that request', () => {
		assert.deepStrictEqual(
			getRequestIdsToRewind(['a', 'b', 'c', 'd'], 'd'),
			['d']
		);
	});

	test('rewinding the first request removes the whole conversation', () => {
		assert.deepStrictEqual(
			getRequestIdsToRewind(['a', 'b', 'c'], 'a'),
			['a', 'b', 'c']
		);
	});

	test('returns nothing when the target is not present', () => {
		assert.deepStrictEqual(getRequestIdsToRewind(['a', 'b', 'c'], 'x'), []);
	});

	test('returns nothing for an empty conversation', () => {
		assert.deepStrictEqual(getRequestIdsToRewind([], 'a'), []);
	});

	test('confirmation message is singular for one removed turn', () => {
		assert.strictEqual(getRewindConfirmationMessage(1), 'Rewind will remove 1 message from this conversation. This cannot be undone.');
	});

	test('confirmation message is plural for multiple removed turns', () => {
		assert.strictEqual(getRewindConfirmationMessage(3), 'Rewind will remove 3 messages from this conversation. This cannot be undone.');
	});
});

suite('ChatRewindActions - model truncation (integration)', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IChatService, new MockChatService());
	});

	function createModelWithRequests(count: number): ChatModel {
		const data: ISerializableChatData3 = {
			version: 3,
			sessionId: 'rewind-integration-session',
			creationDate: Date.now(),
			customTitle: undefined,
			initialLocation: ChatAgentLocation.Chat,
			responderUsername: 'bot',
			requests: Array.from({ length: count }, (_, i) => ({
				requestId: `req-${i}`,
				message: { text: `request ${i}`, parts: [] },
				variableData: { variables: [] },
				response: [{ value: `response ${i}`, isTrusted: false }],
				modelState: { value: 1 /* ResponseModelState.Complete */, completedAt: Date.now() },
			})),
		};
		return testDisposables.add(instantiationService.createInstance(
			ChatModel,
			{ value: data, serializer: undefined! },
			{ initialLocation: ChatAgentLocation.Chat, canUseTools: true }
		));
	}

	test('removing the selected ids leaves only the turns before the rewind point', () => {
		const model = createModelWithRequests(4);
		const ids = model.getRequests().map(request => request.id);
		assert.strictEqual(ids.length, 4);

		const idsToRewind = getRequestIdsToRewind(ids, ids[1]);
		for (const id of idsToRewind) {
			model.removeRequest(id);
		}

		assert.deepStrictEqual(model.getRequests().map(request => request.id), [ids[0]]);
	});

	test('rewinding the first turn clears the whole conversation', () => {
		const model = createModelWithRequests(3);
		const ids = model.getRequests().map(request => request.id);

		for (const id of getRequestIdsToRewind(ids, ids[0])) {
			model.removeRequest(id);
		}

		assert.strictEqual(model.getRequests().length, 0);
	});
});

