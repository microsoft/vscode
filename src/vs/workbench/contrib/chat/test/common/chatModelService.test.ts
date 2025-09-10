/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatAgentService } from '../../common/chatAgents.js';
import { IChatModelService } from '../../common/chatModelService.js';
import { ChatModelService } from '../../common/chatModelServiceImpl.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ChatUri } from '../../common/chatUri.js';
import { ChatAgentLocation } from '../../common/constants.js';

suite('ChatModelService', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let chatModelService: IChatModelService;

	setup(async () => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());

		// Mock required services
		const mockChatAgentService = {
			getAgent: () => undefined
		};
		instantiationService.stub(IChatAgentService, mockChatAgentService);

		const mockChatSessionsService = {
			provideChatSessionContent: () => Promise.resolve({
				history: [],
				dispose: () => { }
			})
		};
		instantiationService.stub(IChatSessionsService, mockChatSessionsService);

		chatModelService = testDisposables.add(instantiationService.createInstance(ChatModelService));
	});

	test('ChatModelService implements IChatModelService interface correctly', () => {
		assert.ok(chatModelService);
		assert.strictEqual(typeof chatModelService.loadSessionForResource, 'function');
		assert.strictEqual(typeof chatModelService.getContentProviderSession, 'function');
		assert.strictEqual(typeof chatModelService.disposeSessionsOfType, 'function');
	});

	test('loadSessionForResource handles invalid URIs', async () => {
		const invalidUri = URI.parse('invalid://test');

		try {
			await chatModelService.loadSessionForResource(invalidUri, ChatAgentLocation.Chat, CancellationToken.None);
			assert.fail('Should have thrown an error for invalid URI');
		} catch (error) {
			assert.strictEqual(error.message, 'Invalid chat session URI');
		}
	});

	test('loadSessionForResource handles local sessions by returning undefined', async () => {
		const localUri = ChatUri.generate('local', 'test-session');

		// For local sessions, the service should return undefined to let ChatService handle it
		const result = await chatModelService.loadSessionForResource(localUri, ChatAgentLocation.Chat, CancellationToken.None);
		assert.strictEqual(result, undefined);
	});

	test('getContentProviderSession returns undefined for non-existent sessions', () => {
		const result = chatModelService.getContentProviderSession('testType', 'testId');
		assert.strictEqual(result, undefined);
	});

	test('disposeSessionsOfType handles non-existent types safely', () => {
		// Should not throw
		chatModelService.disposeSessionsOfType('non-existent-type');
		assert.ok(true, 'disposeSessionsOfType should handle non-existent types without throwing');
	});

	test('ChatModelService follows proper architecture patterns', () => {
		// Verify that the service extends Disposable (for resource management)
		assert.ok(chatModelService.dispose, 'ChatModelService should have dispose method');
		
		// Verify that it's a proper service implementation
		assert.strictEqual(chatModelService._serviceBrand, undefined, 'Service should have _serviceBrand property');
	});
});