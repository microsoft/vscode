/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { TestExtensionService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ChatAgentService, IChatAgentService } from '../../common/chatAgents.js';
import { IChatEditingService } from '../../common/chatEditingService.js';
import { ChatModel, getResponseThinkingTokens, getThinkingTokens } from '../../common/chatModel.js';
import { ChatRequestTextPart } from '../../common/chatParserTypes.js';
import { IChatThinkingPart } from '../../common/chatService.js';
import { ChatAgentLocation } from '../../common/constants.js';

class MockChatEditingService {
	// Empty mock for testing
}

suite('ChatModel Thinking Tokens', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;

	setup(async () => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IChatEditingService, new MockChatEditingService());
	});

	test('thinking tokens are stored and retrieved correctly', async () => {
		const model = testDisposables.add(instantiationService.createInstance(ChatModel, undefined, ChatAgentLocation.Panel));

		// Create a request
		const text = 'Tell me about TypeScript';
		const request = model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [] }, 0);

		// Add thinking tokens to the response
		const thinkingToken1: IChatThinkingPart = {
			kind: 'thinking',
			value: 'Let me think about TypeScript...',
			id: 'thinking-1',
			metadata: 'initial-thought'
		};

		const thinkingToken2: IChatThinkingPart = {
			kind: 'thinking',
			value: 'TypeScript is a superset of JavaScript that adds static typing.',
			id: 'thinking-2'
		};

		model.acceptResponseProgress(request, thinkingToken1);
		model.acceptResponseProgress(request, thinkingToken2);

		// Add some regular markdown content
		model.acceptResponseProgress(request, {
			kind: 'markdownContent',
			content: new MarkdownString('TypeScript is a programming language.')
		});

		// Verify thinking tokens are stored
		const storedThinkingTokens = getResponseThinkingTokens(request.response!);
		assert.strictEqual(storedThinkingTokens.length, 2);
		assert.strictEqual(storedThinkingTokens[0].value, 'Let me think about TypeScript...');
		assert.strictEqual(storedThinkingTokens[0].id, 'thinking-1');
		assert.strictEqual(storedThinkingTokens[0].metadata, 'initial-thought');
		assert.strictEqual(storedThinkingTokens[1].value, 'TypeScript is a superset of JavaScript that adds static typing.');
		assert.strictEqual(storedThinkingTokens[1].id, 'thinking-2');
		assert.strictEqual(storedThinkingTokens[1].metadata, undefined);

		// Verify thinking tokens are included in response content
		const allContent = request.response!.entireResponse.value;
		const thinkingParts = getThinkingTokens(allContent);
		assert.strictEqual(thinkingParts.length, 2);
		assert.strictEqual(thinkingParts[0].kind, 'thinking');
		assert.strictEqual(thinkingParts[1].kind, 'thinking');
	});

	test('thinking tokens are serialized and deserialized correctly', async () => {
		const model = testDisposables.add(instantiationService.createInstance(ChatModel, undefined, ChatAgentLocation.Panel));

		// Create a request with thinking tokens
		const text = 'Explain async/await';
		const request = model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [] }, 0);

		const thinkingToken: IChatThinkingPart = {
			kind: 'thinking',
			value: 'Async/await is syntactic sugar for promises...',
			id: 'thinking-async',
			metadata: 'async-explanation'
		};

		model.acceptResponseProgress(request, thinkingToken);
		model.acceptResponseProgress(request, {
			kind: 'markdownContent',
			content: new MarkdownString('Async/await makes asynchronous code look synchronous.')
		});

		model.completeResponse(request);

		// Serialize the model
		const serialized = model.toExport();

		// Create a new model from serialized data
		const model2 = testDisposables.add(instantiationService.createInstance(ChatModel, serialized, ChatAgentLocation.Panel));

		// Verify thinking tokens are preserved
		const restoredRequests = model2.getRequests();
		assert.strictEqual(restoredRequests.length, 1);

		const restoredResponse = restoredRequests[0].response!;
		const restoredThinkingTokens = getResponseThinkingTokens(restoredResponse);

		assert.strictEqual(restoredThinkingTokens.length, 1);
		assert.strictEqual(restoredThinkingTokens[0].value, 'Async/await is syntactic sugar for promises...');
		assert.strictEqual(restoredThinkingTokens[0].id, 'thinking-async');
		assert.strictEqual(restoredThinkingTokens[0].metadata, 'async-explanation');
		assert.strictEqual(restoredThinkingTokens[0].kind, 'thinking');
	});

	test('thinking tokens are excluded from text representation', async () => {
		const model = testDisposables.add(instantiationService.createInstance(ChatModel, undefined, ChatAgentLocation.Panel));

		const text = 'What is JavaScript?';
		const request = model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [] }, 0);

		// Add thinking token (should be ignored in text representation)
		model.acceptResponseProgress(request, {
			kind: 'thinking',
			value: 'This is internal reasoning that should not appear in the text representation.',
			id: 'internal-thinking'
		});

		// Add visible content
		model.acceptResponseProgress(request, {
			kind: 'markdownContent',
			content: new MarkdownString('JavaScript is a programming language.')
		});

		// Verify thinking tokens are stored but not in text representation
		const response = request.response!;
		const thinkingTokens = getResponseThinkingTokens(response);
		assert.strictEqual(thinkingTokens.length, 1);

		// Verify text representation doesn't include thinking content
		const textRepresentation = response.response.toString();
		assert.strictEqual(textRepresentation, 'JavaScript is a programming language.');

		// Verify markdown content doesn't include thinking content
		const markdownContent = response.response.getMarkdown();
		assert.strictEqual(markdownContent, 'JavaScript is a programming language.');

		// But thinking tokens should still be accessible
		assert.strictEqual(thinkingTokens[0].value, 'This is internal reasoning that should not appear in the text representation.');
	});

	test('getThinkingTokens utility function works correctly', () => {
		const mixedContent = [
			{ kind: 'markdownContent', content: new MarkdownString('Hello') } as const,
			{ kind: 'thinking', value: 'First thought', id: 'thought-1' } as IChatThinkingPart,
			{ kind: 'progressMessage', content: new MarkdownString('Working...') } as const,
			{ kind: 'thinking', value: 'Second thought' } as IChatThinkingPart,
			{ kind: 'markdownContent', content: new MarkdownString('World') } as const,
		];

		const thinkingTokens = getThinkingTokens(mixedContent);

		assert.strictEqual(thinkingTokens.length, 2);
		assert.strictEqual(thinkingTokens[0].value, 'First thought');
		assert.strictEqual(thinkingTokens[0].id, 'thought-1');
		assert.strictEqual(thinkingTokens[1].value, 'Second thought');
		assert.strictEqual(thinkingTokens[1].id, undefined);
	});
});
