/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { TestExtensionService, TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { ChatAgentService, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatModel } from '../../../common/model/chatModel.js';
import { ChatRequestTextPart } from '../../../common/requestParser/chatParserTypes.js';
import { IChatService, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

/**
 * Helper function to extract and normalize accessible content from a response.
 * This mirrors the logic in ChatResponseAccessibleProvider._getContent()
 */
function getAccessibleContent(model: ChatModel): string {
	const request = model.getRequests().at(-1);
	if (!request?.response) {
		return '';
	}

	let responseContent = request.response.response.toString();
	const responseValue = request.response.response.value;

	// Process tool invocations
	const toolInvocations = responseValue.filter(item => item.kind === 'toolInvocation') as IChatToolInvocation[];
	for (const toolInvocation of toolInvocations) {
		const state = toolInvocation.state.get();
		if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
			// Confirmation waiting state
			if (toolInvocation.confirmationMessages?.title) {
				const title = typeof toolInvocation.confirmationMessages.title === 'string'
					? toolInvocation.confirmationMessages.title
					: toolInvocation.confirmationMessages.title.value;
				responseContent += `\n${title}`;
			}
		} else if (state.type === IChatToolInvocation.StateKind.Completed) {
			const invocationMessage = typeof toolInvocation.invocationMessage === 'string'
				? toolInvocation.invocationMessage
				: toolInvocation.invocationMessage.value;
			if (invocationMessage) {
				responseContent += `\nCompleted ${invocationMessage}`;
			}
		} else if (state.type === IChatToolInvocation.StateKind.Executing) {
			const invocationMessage = typeof toolInvocation.invocationMessage === 'string'
				? toolInvocation.invocationMessage
				: toolInvocation.invocationMessage.value;
			if (invocationMessage) {
				responseContent += `\nExecuting ${invocationMessage}`;
			}
		}
	}

	// Process serialized tool invocations
	const pastConfirmations = responseValue.filter(item => item.kind === 'toolInvocationSerialized') as IChatToolInvocationSerialized[];
	for (const pastConfirmation of pastConfirmations) {
		if (pastConfirmation.isComplete) {
			const message = pastConfirmation.pastTenseMessage
				? (typeof pastConfirmation.pastTenseMessage === 'string'
					? pastConfirmation.pastTenseMessage
					: pastConfirmation.pastTenseMessage.value)
				: (typeof pastConfirmation.invocationMessage === 'string'
					? pastConfirmation.invocationMessage
					: pastConfirmation.invocationMessage.value);
			if (message) {
				responseContent += `\n${message}`;
			}
		}
	}

	return responseContent;
}

suite('ChatResponseAccessibleView', () => {
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
		instantiationService.stub(IChatService, new MockChatService());
	});

	function createModel(): ChatModel {
		return testDisposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
	}

	function addRequestWithResponse(model: ChatModel, responseText?: string): void {
		const text = 'hello';
		const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
		if (responseText) {
			model.acceptResponseProgress(request, { content: new MarkdownString(responseText), kind: 'markdownContent' });
		}
	}

	test('completed tool invocation with invocationMessage is included', () => {
		const model = createModel();
		addRequestWithResponse(model, '');

		const request = model.getRequests()[0];

		// Create a completed tool invocation
		const toolState = observableValue<IChatToolInvocation.State>('state', {
			type: IChatToolInvocation.StateKind.Completed,
			confirmed: { type: ToolConfirmKind.UserAction },
			resultDetails: undefined,
			contentForModel: [],
			postConfirmed: undefined,
		});

		const toolInvocation: IChatToolInvocation = {
			kind: 'toolInvocation',
			invocationMessage: new MarkdownString('Created `newFile.ts`'),
			pastTenseMessage: new MarkdownString('Created `newFile.ts`'),
			confirmationMessages: undefined,
			originMessage: undefined,
			source: ToolDataSource.Internal,
			toolId: 'vscode_createFile',
			toolCallId: 'test-call-1',
			parameters: {},
			state: toolState,
			presentation: undefined,
			toolSpecificData: undefined,
			toJSON: () => ({} as IChatToolInvocationSerialized),
		};

		model.acceptResponseProgress(request, toolInvocation);

		const content = getAccessibleContent(model);
		assert.ok(content.includes('Created `newFile.ts`'), `Expected "Created \`newFile.ts\`" to be in content: "${content}"`);
	});

	test('completed tool invocation without input details shows just message', () => {
		const model = createModel();
		addRequestWithResponse(model, '');

		const request = model.getRequests()[0];

		// Create a completed tool invocation with no resultDetails.input
		const toolState = observableValue<IChatToolInvocation.State>('state', {
			type: IChatToolInvocation.StateKind.Completed,
			confirmed: { type: ToolConfirmKind.UserAction },
			resultDetails: [URI.parse('file:///test/newFile.ts')], // Array of URIs, not IToolResultInputOutputDetails
			contentForModel: [],
			postConfirmed: undefined,
		});

		const toolInvocation: IChatToolInvocation = {
			kind: 'toolInvocation',
			invocationMessage: 'Apply patch to `config.json`',
			pastTenseMessage: 'Applied patch to `config.json`',
			confirmationMessages: undefined,
			originMessage: undefined,
			source: ToolDataSource.Internal,
			toolId: 'vscode_applyPatch',
			toolCallId: 'test-call-2',
			parameters: {},
			state: toolState,
			presentation: undefined,
			toolSpecificData: undefined,
			toJSON: () => ({} as IChatToolInvocationSerialized),
		};

		model.acceptResponseProgress(request, toolInvocation);

		const content = getAccessibleContent(model);
		// Should include the invocation message even without input details
		assert.ok(content.includes('Apply patch to `config.json`'), `Expected "Apply patch to \`config.json\`" to be in content: "${content}"`);
	});

	test('executing tool invocation shows status', () => {
		const model = createModel();
		addRequestWithResponse(model, '');

		const request = model.getRequests()[0];

		const progressObservable = observableValue('progress', { message: undefined, progress: undefined });
		const toolState = observableValue<IChatToolInvocation.State>('state', {
			type: IChatToolInvocation.StateKind.Executing,
			confirmed: { type: ToolConfirmKind.UserAction },
			progress: progressObservable,
		});

		const toolInvocation: IChatToolInvocation = {
			kind: 'toolInvocation',
			invocationMessage: 'Reading `README.md`',
			pastTenseMessage: 'Read `README.md`',
			confirmationMessages: undefined,
			originMessage: undefined,
			source: ToolDataSource.Internal,
			toolId: 'vscode_readFile',
			toolCallId: 'test-call-3',
			parameters: {},
			state: toolState,
			presentation: undefined,
			toolSpecificData: undefined,
			toJSON: () => ({} as IChatToolInvocationSerialized),
		};

		model.acceptResponseProgress(request, toolInvocation);

		const content = getAccessibleContent(model);
		assert.ok(content.includes('Reading `README.md`'), `Expected "Reading \`README.md\`" to be in content: "${content}"`);

		// Complete the tool to clean up disposables
		toolState.set({
			type: IChatToolInvocation.StateKind.Completed,
			confirmed: { type: ToolConfirmKind.UserAction },
			resultDetails: undefined,
			contentForModel: [],
			postConfirmed: undefined,
		}, undefined);
	});

	test('serialized tool invocation with pastTenseMessage is included', () => {
		const model = createModel();
		addRequestWithResponse(model, '');

		const request = model.getRequests()[0];

		const serializedInvocation: IChatToolInvocationSerialized = {
			kind: 'toolInvocationSerialized',
			invocationMessage: 'Creating file',
			pastTenseMessage: 'Created `myComponent.tsx`',
			originMessage: undefined,
			source: ToolDataSource.Internal,
			toolId: 'vscode_createFile',
			toolCallId: 'test-call-4',
			isConfirmed: { type: ToolConfirmKind.UserAction },
			isComplete: true,
			resultDetails: undefined,
			presentation: undefined,
			toolSpecificData: undefined,
		};

		model.acceptResponseProgress(request, serializedInvocation);

		const content = getAccessibleContent(model);
		// Should prefer pastTenseMessage over invocationMessage
		assert.ok(content.includes('Created `myComponent.tsx`'), `Expected "Created \`myComponent.tsx\`" to be in content: "${content}"`);
	});

	test('serialized tool invocation falls back to invocationMessage if no pastTenseMessage', () => {
		const model = createModel();
		addRequestWithResponse(model, '');

		const request = model.getRequests()[0];

		const serializedInvocation: IChatToolInvocationSerialized = {
			kind: 'toolInvocationSerialized',
			invocationMessage: 'Ran terminal command `npm install`',
			pastTenseMessage: undefined,
			originMessage: undefined,
			source: ToolDataSource.Internal,
			toolId: 'vscode_runTerminal',
			toolCallId: 'test-call-5',
			isConfirmed: { type: ToolConfirmKind.UserAction },
			isComplete: true,
			resultDetails: undefined,
			presentation: undefined,
			toolSpecificData: undefined,
		};

		model.acceptResponseProgress(request, serializedInvocation);

		const content = getAccessibleContent(model);
		assert.ok(content.includes('Ran terminal command `npm install`'), `Expected "Ran terminal command \`npm install\`" to be in content: "${content}"`);
	});

	test('serialized tool invocation with input details includes input', () => {
		const model = createModel();
		addRequestWithResponse(model, '');

		const request = model.getRequests()[0];

		const serializedInvocation: IChatToolInvocationSerialized = {
			kind: 'toolInvocationSerialized',
			invocationMessage: 'Running command',
			pastTenseMessage: 'Ran terminal command',
			originMessage: undefined,
			source: ToolDataSource.Internal,
			toolId: 'vscode_runTerminal',
			toolCallId: 'test-call-6',
			isConfirmed: { type: ToolConfirmKind.UserAction },
			isComplete: true,
			resultDetails: {
				input: 'npm run build',
				output: [],
			},
			presentation: undefined,
			toolSpecificData: undefined,
		};

		model.acceptResponseProgress(request, serializedInvocation);

		// The toString() of the Response should include the tool invocation info
		const response = request.response?.response;
		assert.ok(response, 'Response should exist');
		const responseString = response.toString();
		assert.ok(responseString.includes('npm run build'), `Response string should include the input "npm run build": "${responseString}"`);
	});

	test('multiple tool invocations are all included', () => {
		const model = createModel();
		addRequestWithResponse(model, 'Starting response\n');

		const request = model.getRequests()[0];

		// Add first serialized tool invocation
		const invocation1: IChatToolInvocationSerialized = {
			kind: 'toolInvocationSerialized',
			invocationMessage: 'Reading file',
			pastTenseMessage: 'Read `package.json`',
			originMessage: undefined,
			source: ToolDataSource.Internal,
			toolId: 'vscode_readFile',
			toolCallId: 'test-call-7',
			isConfirmed: { type: ToolConfirmKind.UserAction },
			isComplete: true,
			resultDetails: undefined,
			presentation: undefined,
			toolSpecificData: undefined,
		};

		// Add second serialized tool invocation
		const invocation2: IChatToolInvocationSerialized = {
			kind: 'toolInvocationSerialized',
			invocationMessage: 'Editing file',
			pastTenseMessage: 'Edited `src/index.ts`',
			originMessage: undefined,
			source: ToolDataSource.Internal,
			toolId: 'vscode_editFile',
			toolCallId: 'test-call-8',
			isConfirmed: { type: ToolConfirmKind.UserAction },
			isComplete: true,
			resultDetails: undefined,
			presentation: undefined,
			toolSpecificData: undefined,
		};

		model.acceptResponseProgress(request, invocation1);
		model.acceptResponseProgress(request, invocation2);

		const content = getAccessibleContent(model);
		assert.ok(content.includes('Read `package.json`'), `Expected "Read \`package.json\`" to be in content: "${content}"`);
		assert.ok(content.includes('Edited `src/index.ts`'), `Expected "Edited \`src/index.ts\`" to be in content: "${content}"`);
	});

	test('tool invocation with empty message is ignored', () => {
		const model = createModel();
		addRequestWithResponse(model, 'Base response');

		const request = model.getRequests()[0];

		const serializedInvocation: IChatToolInvocationSerialized = {
			kind: 'toolInvocationSerialized',
			invocationMessage: '',
			pastTenseMessage: '',
			originMessage: undefined,
			source: ToolDataSource.Internal,
			toolId: 'vscode_hidden',
			toolCallId: 'test-call-9',
			isConfirmed: { type: ToolConfirmKind.UserAction },
			isComplete: true,
			resultDetails: undefined,
			presentation: undefined,
			toolSpecificData: undefined,
		};

		model.acceptResponseProgress(request, serializedInvocation);

		const content = getAccessibleContent(model);
		// Content should only include the base response
		assert.strictEqual(content.trim(), 'Base response');
	});

	test('incomplete serialized tool invocation prefers pastTenseMessage', () => {
		const model = createModel();
		addRequestWithResponse(model, 'Base response');

		const request = model.getRequests()[0];

		const serializedInvocation: IChatToolInvocationSerialized = {
			kind: 'toolInvocationSerialized',
			invocationMessage: 'Working on task',
			pastTenseMessage: 'Task in progress',
			originMessage: undefined,
			source: ToolDataSource.Internal,
			toolId: 'vscode_test',
			toolCallId: 'test-call-10',
			isConfirmed: { type: ToolConfirmKind.UserAction },
			isComplete: false, // Not complete
			resultDetails: undefined,
			presentation: undefined,
			toolSpecificData: undefined,
		};

		model.acceptResponseProgress(request, serializedInvocation);

		const content = getAccessibleContent(model);
		// Model prefers pastTenseMessage over invocationMessage when rendering
		assert.ok(content.includes('Task in progress'), `Tool invocation should be included with pastTenseMessage: "${content}"`);
	});
});
