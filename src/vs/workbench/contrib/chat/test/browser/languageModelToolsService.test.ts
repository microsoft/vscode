/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyEqualsExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { LanguageModelToolsService } from '../../browser/languageModelToolsService.js';
import { IChatModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { IToolData, IToolImpl, IToolInvocation, ToolDataSource } from '../../common/languageModelToolsService.js';
import { MockChatService } from '../common/mockChatService.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Barrier } from '../../../../../base/common/async.js';

suite('LanguageModelToolsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let contextKeyService: IContextKeyService;
	let service: LanguageModelToolsService;
	let chatService: MockChatService;

	setup(() => {
		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(new TestConfigurationService)),
		}, store);
		contextKeyService = instaService.get(IContextKeyService);
		chatService = new MockChatService();
		instaService.stub(IChatService, chatService);
		service = store.add(instaService.createInstance(LanguageModelToolsService));
	});

	test('registerToolData', () => {
		const toolData: IToolData = {
			id: 'testTool',
			modelDescription: 'Test Tool',
			displayName: 'Test Tool',
			source: ToolDataSource.Internal,
		};

		const disposable = service.registerToolData(toolData);
		assert.strictEqual(service.getTool('testTool')?.id, 'testTool');
		disposable.dispose();
		assert.strictEqual(service.getTool('testTool'), undefined);
	});

	test('registerToolImplementation', () => {
		const toolData: IToolData = {
			id: 'testTool',
			modelDescription: 'Test Tool',
			displayName: 'Test Tool',
			source: ToolDataSource.Internal,
		};

		store.add(service.registerToolData(toolData));

		const toolImpl: IToolImpl = {
			invoke: async () => ({ content: [{ kind: 'text', value: 'result' }] }),
		};

		store.add(service.registerToolImplementation('testTool', toolImpl));
		assert.strictEqual(service.getTool('testTool')?.id, 'testTool');
	});

	test('getTools', () => {
		contextKeyService.createKey('testKey', true);
		const toolData1: IToolData = {
			id: 'testTool1',
			modelDescription: 'Test Tool 1',
			when: ContextKeyEqualsExpr.create('testKey', false),
			displayName: 'Test Tool',
			source: ToolDataSource.Internal,
		};

		const toolData2: IToolData = {
			id: 'testTool2',
			modelDescription: 'Test Tool 2',
			when: ContextKeyEqualsExpr.create('testKey', true),
			displayName: 'Test Tool',
			source: ToolDataSource.Internal,
		};

		const toolData3: IToolData = {
			id: 'testTool3',
			modelDescription: 'Test Tool 3',
			displayName: 'Test Tool',
			source: ToolDataSource.Internal,
		};

		store.add(service.registerToolData(toolData1));
		store.add(service.registerToolData(toolData2));
		store.add(service.registerToolData(toolData3));

		const tools = Array.from(service.getTools());
		assert.strictEqual(tools.length, 2);
		assert.strictEqual(tools[0].id, 'testTool2');
		assert.strictEqual(tools[1].id, 'testTool3');
	});

	test('getToolByName', () => {
		contextKeyService.createKey('testKey', true);
		const toolData1: IToolData = {
			id: 'testTool1',
			toolReferenceName: 'testTool1',
			modelDescription: 'Test Tool 1',
			when: ContextKeyEqualsExpr.create('testKey', false),
			displayName: 'Test Tool',
			source: ToolDataSource.Internal,
		};

		const toolData2: IToolData = {
			id: 'testTool2',
			toolReferenceName: 'testTool2',
			modelDescription: 'Test Tool 2',
			when: ContextKeyEqualsExpr.create('testKey', true),
			displayName: 'Test Tool',
			source: ToolDataSource.Internal,
		};

		const toolData3: IToolData = {
			id: 'testTool3',
			toolReferenceName: 'testTool3',
			modelDescription: 'Test Tool 3',
			displayName: 'Test Tool',
			source: ToolDataSource.Internal,
		};

		store.add(service.registerToolData(toolData1));
		store.add(service.registerToolData(toolData2));
		store.add(service.registerToolData(toolData3));

		assert.strictEqual(service.getToolByName('testTool1'), undefined);
		assert.strictEqual(service.getToolByName('testTool1', true)?.id, 'testTool1');
		assert.strictEqual(service.getToolByName('testTool2')?.id, 'testTool2');
		assert.strictEqual(service.getToolByName('testTool3')?.id, 'testTool3');
	});

	test('invokeTool', async () => {
		const toolData: IToolData = {
			id: 'testTool',
			modelDescription: 'Test Tool',
			displayName: 'Test Tool',
			source: ToolDataSource.Internal,
		};

		store.add(service.registerToolData(toolData));

		const toolImpl: IToolImpl = {
			invoke: async (invocation) => {
				assert.strictEqual(invocation.callId, '1');
				assert.strictEqual(invocation.toolId, 'testTool');
				assert.deepStrictEqual(invocation.parameters, { a: 1 });
				return { content: [{ kind: 'text', value: 'result' }] };
			}
		};

		store.add(service.registerToolImplementation('testTool', toolImpl));

		const dto: IToolInvocation = {
			callId: '1',
			toolId: 'testTool',
			tokenBudget: 100,
			parameters: {
				a: 1
			},
			context: undefined,
		};

		const result = await service.invokeTool(dto, async () => 0, CancellationToken.None);
		assert.strictEqual(result.content[0].value, 'result');
	});

	test('cancel tool call', async () => {
		const toolData: IToolData = {
			id: 'testTool',
			modelDescription: 'Test Tool',
			displayName: 'Test Tool',
			source: ToolDataSource.Internal,
		};

		store.add(service.registerToolData(toolData));

		const toolBarrier = new Barrier();
		const toolImpl: IToolImpl = {
			invoke: async (invocation, countTokens, progress, cancelToken) => {
				assert.strictEqual(invocation.callId, '1');
				assert.strictEqual(invocation.toolId, 'testTool');
				assert.deepStrictEqual(invocation.parameters, { a: 1 });
				await toolBarrier.wait();
				if (cancelToken.isCancellationRequested) {
					throw new CancellationError();
				} else {
					throw new Error('Tool call should be cancelled');
				}
			}
		};

		store.add(service.registerToolImplementation('testTool', toolImpl));

		const sessionId = 'sessionId';
		const requestId = 'requestId';
		const dto: IToolInvocation = {
			callId: '1',
			toolId: 'testTool',
			tokenBudget: 100,
			parameters: {
				a: 1
			},
			context: {
				sessionId
			},
		};
		chatService.addSession({
			sessionId: sessionId,
			getRequests: () => {
				return [{
					id: requestId
				}];
			},
			acceptResponseProgress: () => { }
		} as any as IChatModel);

		const toolPromise = service.invokeTool(dto, async () => 0, CancellationToken.None);
		service.cancelToolCallsForRequest(requestId);
		toolBarrier.open();
		await assert.rejects(toolPromise, err => {
			return isCancellationError(err);
		}, 'Expected tool call to be cancelled');
	});

	test('toToolEnablementMap', () => {
		const toolData1: IToolData = {
			id: 'tool1',
			toolReferenceName: 'refTool1',
			modelDescription: 'Test Tool 1',
			displayName: 'Test Tool 1',
			source: ToolDataSource.Internal,
		};

		const toolData2: IToolData = {
			id: 'tool2',
			toolReferenceName: 'refTool2',
			modelDescription: 'Test Tool 2',
			displayName: 'Test Tool 2',
			source: ToolDataSource.Internal,
		};

		const toolData3: IToolData = {
			id: 'tool3',
			// No toolReferenceName
			modelDescription: 'Test Tool 3',
			displayName: 'Test Tool 3',
			source: ToolDataSource.Internal,
		};

		store.add(service.registerToolData(toolData1));
		store.add(service.registerToolData(toolData2));
		store.add(service.registerToolData(toolData3));

		// Test with enabled tools
		const enabledToolNames = new Set(['refTool1']);
		const result1 = service.toToolEnablementMap(enabledToolNames);

		assert.strictEqual(result1['tool1'], true, 'tool1 should be enabled');
		assert.strictEqual(result1['tool2'], false, 'tool2 should be disabled');
		assert.strictEqual(result1['tool3'], false, 'tool3 should be disabled (no reference name)');

		// Test with multiple enabled tools
		const multipleEnabledToolNames = new Set(['refTool1', 'refTool2']);
		const result2 = service.toToolEnablementMap(multipleEnabledToolNames);

		assert.strictEqual(result2['tool1'], true, 'tool1 should be enabled');
		assert.strictEqual(result2['tool2'], true, 'tool2 should be enabled');
		assert.strictEqual(result2['tool3'], false, 'tool3 should be disabled');

		// Test with no enabled tools
		const noEnabledToolNames = new Set<string>();
		const result3 = service.toToolEnablementMap(noEnabledToolNames);

		assert.strictEqual(result3['tool1'], false, 'tool1 should be disabled');
		assert.strictEqual(result3['tool2'], false, 'tool2 should be disabled');
		assert.strictEqual(result3['tool3'], false, 'tool3 should be disabled');
	});

	test('toToolEnablementMap with tool sets', () => {
		// Register individual tools
		const toolData1: IToolData = {
			id: 'tool1',
			toolReferenceName: 'refTool1',
			modelDescription: 'Test Tool 1',
			displayName: 'Test Tool 1',
			source: ToolDataSource.Internal,
		};

		const toolData2: IToolData = {
			id: 'tool2',
			modelDescription: 'Test Tool 2',
			displayName: 'Test Tool 2',
			source: ToolDataSource.Internal,
		};

		store.add(service.registerToolData(toolData1));
		store.add(service.registerToolData(toolData2));

		// Create a tool set
		const toolSet = store.add(service.createToolSet(
			ToolDataSource.Internal,
			'testToolSet',
			'refToolSet',
			{ description: 'Test Tool Set' }
		));

		// Add tools to the tool set
		const toolSetTool1: IToolData = {
			id: 'toolSetTool1',
			modelDescription: 'Tool Set Tool 1',
			displayName: 'Tool Set Tool 1',
			source: ToolDataSource.Internal,
		};

		const toolSetTool2: IToolData = {
			id: 'toolSetTool2',
			modelDescription: 'Tool Set Tool 2',
			displayName: 'Tool Set Tool 2',
			source: ToolDataSource.Internal,
		};

		store.add(service.registerToolData(toolSetTool1));
		store.add(service.registerToolData(toolSetTool2));
		store.add(toolSet.addTool(toolSetTool1));
		store.add(toolSet.addTool(toolSetTool2));

		// Test enabling the tool set
		const enabledNames = new Set(['refToolSet', 'refTool1']);
		const result = service.toToolEnablementMap(enabledNames);

		assert.strictEqual(result['tool1'], true, 'individual tool should be enabled');
		assert.strictEqual(result['tool2'], false);
		assert.strictEqual(result['toolSetTool1'], true, 'tool set tool 1 should be enabled');
		assert.strictEqual(result['toolSetTool2'], true, 'tool set tool 2 should be enabled');
	});

	test('toToolEnablementMap with non-existent tool names', () => {
		const toolData: IToolData = {
			id: 'tool1',
			toolReferenceName: 'refTool1',
			modelDescription: 'Test Tool 1',
			displayName: 'Test Tool 1',
			source: ToolDataSource.Internal,
		};

		store.add(service.registerToolData(toolData));

		// Test with non-existent tool names
		const enabledNames = new Set(['nonExistentTool', 'refTool1']);
		const result = service.toToolEnablementMap(enabledNames);

		assert.strictEqual(result['tool1'], true, 'existing tool should be enabled');
		// Non-existent tools should not appear in the result map
		assert.strictEqual(result['nonExistentTool'], undefined, 'non-existent tool should not be in result');
	});
});
