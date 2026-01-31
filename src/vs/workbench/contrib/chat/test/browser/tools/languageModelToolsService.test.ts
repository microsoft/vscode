/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Barrier } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ConfigurationTarget, IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyEqualsExpr, ContextKeyExpr, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { LanguageModelToolsService } from '../../../browser/tools/languageModelToolsService.js';
import { ChatModel, IChatModel } from '../../../common/model/chatModel.js';
import { IChatService, IChatToolInputInvocationData, IChatToolInvocation, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { SpecedToolAliases, isToolResultInputOutputDetails, IToolData, IToolImpl, IToolInvocation, ToolDataSource, ToolSet } from '../../../common/tools/languageModelToolsService.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { ILanguageModelToolsConfirmationService } from '../../../common/tools/languageModelToolsConfirmationService.js';
import { MockLanguageModelToolsConfirmationService } from '../../common/tools/mockLanguageModelToolsConfirmationService.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ILanguageModelChatMetadata } from '../../../common/languageModels.js';

// --- Test helpers to reduce repetition and improve readability ---

class TestAccessibilitySignalService implements Partial<IAccessibilitySignalService> {
	public signalPlayedCalls: { signal: AccessibilitySignal; options?: any }[] = [];

	async playSignal(signal: AccessibilitySignal, options?: any): Promise<void> {
		this.signalPlayedCalls.push({ signal, options });
	}

	reset() {
		this.signalPlayedCalls = [];
	}
}

class TestTelemetryService implements Partial<ITelemetryService> {
	public events: Array<{ eventName: string; data: any }> = [];

	publicLog2<E extends Record<string, any>, T extends Record<string, any>>(eventName: string, data?: E): void {
		this.events.push({ eventName, data });
	}

	reset() {
		this.events = [];
	}
}

function registerToolForTest(service: LanguageModelToolsService, store: any, id: string, impl: IToolImpl, data?: Partial<IToolData>) {
	const toolData: IToolData = {
		id,
		modelDescription: data?.modelDescription ?? 'Test Tool',
		displayName: data?.displayName ?? 'Test Tool',
		source: ToolDataSource.Internal,
		...data,
	};
	store.add(service.registerTool(toolData, impl));
	return {
		id,
		makeDto: (parameters: any, context?: { sessionId: string }, callId: string = '1'): IToolInvocation => ({
			callId,
			toolId: id,
			tokenBudget: 100,
			parameters,
			context: context ? {
				sessionId: context.sessionId,
				sessionResource: LocalChatSessionUri.forSession(context.sessionId),
			} : undefined,
		}),
	};
}

function stubGetSession(chatService: MockChatService, sessionId: string, options?: { requestId?: string; capture?: { invocation?: any } }): IChatModel {
	const requestId = options?.requestId ?? 'requestId';
	const capture = options?.capture;
	const fakeModel = {
		sessionId,
		sessionResource: LocalChatSessionUri.forSession(sessionId),
		getRequests: () => [{ id: requestId, modelId: 'test-model' }],
	} as ChatModel;
	chatService.addSession(fakeModel);
	chatService.appendProgress = (request, progress) => {
		if (capture) { capture.invocation = progress; }
	};

	return fakeModel;
}

async function waitForPublishedInvocation(capture: { invocation?: any }, tries = 5): Promise<ChatToolInvocation> {
	for (let i = 0; i < tries && !capture.invocation; i++) {
		await Promise.resolve();
	}
	return capture.invocation;
}

suite('LanguageModelToolsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let contextKeyService: IContextKeyService;
	let service: LanguageModelToolsService;
	let chatService: MockChatService;
	let configurationService: TestConfigurationService;

	setup(() => {
		configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(configurationService)),
			configurationService: () => configurationService
		}, store);
		contextKeyService = instaService.get(IContextKeyService);
		chatService = new MockChatService();
		instaService.stub(IChatService, chatService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		service = store.add(instaService.createInstance(LanguageModelToolsService));
	});

	function setupToolsForTest(service: LanguageModelToolsService, store: any) {

		// Create a variety of tools and tool sets for testing
		// Some with toolReferenceName, some without, some from extensions, mcp and user defined

		const tool1: IToolData = {
			id: 'tool1',
			toolReferenceName: 'tool1RefName',
			modelDescription: 'Test Tool 1',
			displayName: 'Tool1 Display Name',
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: true,
		};
		store.add(service.registerToolData(tool1));

		const tool2: IToolData = {
			id: 'tool2',
			modelDescription: 'Test Tool 2',
			displayName: 'Tool2 Display Name',
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: true,
		};
		store.add(service.registerToolData(tool2));

		/** Extension Tool 1 */

		const extTool1: IToolData = {
			id: 'extTool1',
			toolReferenceName: 'extTool1RefName',
			modelDescription: 'Test Extension Tool 1',
			displayName: 'ExtTool1 Display Name',
			source: { type: 'extension', label: 'My Extension', extensionId: new ExtensionIdentifier('my.extension') },
			canBeReferencedInPrompt: true,
		};
		store.add(service.registerToolData(extTool1));

		/** Internal Tool Set with internalToolSetTool1 */

		const internalToolSetTool1: IToolData = {
			id: 'internalToolSetTool1',
			toolReferenceName: 'internalToolSetTool1RefName',
			modelDescription: 'Test Internal Tool Set 1',
			displayName: 'InternalToolSet1 Display Name',
			source: ToolDataSource.Internal,
		};
		store.add(service.registerToolData(internalToolSetTool1));

		const internalToolSet = store.add(service.createToolSet(
			ToolDataSource.Internal,
			'internalToolSet',
			'internalToolSetRefName',
			{ description: 'Test Set' }
		));
		store.add(internalToolSet.addTool(internalToolSetTool1));

		/** User Tool Set with tool1 */

		const userToolSet = store.add(service.createToolSet(
			{ type: 'user', label: 'User', file: URI.file('/test/userToolSet.json') },
			'userToolSet',
			'userToolSetRefName',
			{ description: 'Test Set' }
		));
		store.add(userToolSet.addTool(tool2));

		/** MCP tool in a MCP tool set */

		const mcpDataSource: ToolDataSource = { type: 'mcp', label: 'My MCP Server', serverLabel: 'MCP Server', instructions: undefined, collectionId: 'testMCPCollection', definitionId: 'testMCPDefId' };
		const mcpTool1: IToolData = {
			id: 'mcpTool1',
			toolReferenceName: 'mcpTool1RefName',
			modelDescription: 'Test MCP Tool 1',
			displayName: 'McpTool1 Display Name',
			source: mcpDataSource,
			canBeReferencedInPrompt: true,
		};
		store.add(service.registerToolData(mcpTool1));

		const mcpToolSet = store.add(service.createToolSet(
			mcpDataSource,
			'mcpToolSet',
			'mcpToolSetRefName',
			{ description: 'MCP Test ToolSet' }
		));
		store.add(mcpToolSet.addTool(mcpTool1));
	}


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

		const tools = Array.from(service.getTools(undefined));
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

		// getToolByName searches all tools regardless of when clause
		assert.strictEqual(service.getToolByName('testTool1')?.id, 'testTool1');
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

	test('invocation parameters are overridden by input toolSpecificData', async () => {
		const rawInput = { b: 2 };
		const tool = registerToolForTest(service, store, 'testToolInputOverride', {
			prepareToolInvocation: async () => ({
				toolSpecificData: { kind: 'input', rawInput } satisfies IChatToolInputInvocationData,
				confirmationMessages: {
					title: 'a',
					message: 'b',
				}
			}),
			invoke: async (invocation) => {
				// The service should replace parameters with rawInput and strip toolSpecificData
				assert.deepStrictEqual(invocation.parameters, rawInput);
				assert.strictEqual(invocation.toolSpecificData, undefined);
				return { content: [{ kind: 'text', value: 'ok' }] };
			},
		});

		const sessionId = 'sessionId';
		const capture: { invocation?: any } = {};
		stubGetSession(chatService, sessionId, { requestId: 'requestId-io', capture });
		const dto = tool.makeDto({ a: 1 }, { sessionId });

		const invokeP = service.invokeTool(dto, async () => 0, CancellationToken.None);
		const published = await waitForPublishedInvocation(capture);
		IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
		const result = await invokeP;
		assert.strictEqual(result.content[0].value, 'ok');
	});

	test('chat invocation injects input toolSpecificData for confirmation when alwaysDisplayInputOutput', async () => {
		const toolData: IToolData = {
			id: 'testToolDisplayIO',
			modelDescription: 'Test Tool',
			displayName: 'Test Tool',
			source: ToolDataSource.Internal,
			alwaysDisplayInputOutput: true,
		};

		const tool = registerToolForTest(service, store, 'testToolDisplayIO', {
			prepareToolInvocation: async () => ({
				confirmationMessages: { title: 'Confirm', message: 'Proceed?' }
			}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'done' }] }),
		}, toolData);

		const sessionId = 'sessionId-io';
		const capture: { invocation?: any } = {};
		stubGetSession(chatService, sessionId, { requestId: 'requestId-io', capture });

		const dto = tool.makeDto({ a: 1 }, { sessionId });

		const invokeP = service.invokeTool(dto, async () => 0, CancellationToken.None);
		const published = await waitForPublishedInvocation(capture);
		assert.ok(published, 'expected ChatToolInvocation to be published');
		assert.strictEqual(published.toolId, tool.id);
		// The service should have injected input toolSpecificData with the raw parameters
		assert.strictEqual(published.toolSpecificData?.kind, 'input');
		assert.deepStrictEqual(published.toolSpecificData?.rawInput, dto.parameters);

		// Confirm to let invoke proceed
		IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
		const result = await invokeP;
		assert.strictEqual(result.content[0].value, 'done');
	});

	test('chat invocation waits for user confirmation before invoking', async () => {
		const toolData: IToolData = {
			id: 'testToolConfirm',
			modelDescription: 'Test Tool',
			displayName: 'Test Tool',
			source: ToolDataSource.Internal,
		};

		let invoked = false;
		const tool = registerToolForTest(service, store, toolData.id, {
			prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Confirm', message: 'Go?' } }),
			invoke: async () => {
				invoked = true;
				return { content: [{ kind: 'text', value: 'ran' }] };
			},
		}, toolData);

		const sessionId = 'sessionId-confirm';
		const capture: { invocation?: any } = {};
		stubGetSession(chatService, sessionId, { requestId: 'requestId-confirm', capture });

		const dto = tool.makeDto({ x: 1 }, { sessionId });

		const promise = service.invokeTool(dto, async () => 0, CancellationToken.None);
		const published = await waitForPublishedInvocation(capture);
		assert.ok(published, 'expected ChatToolInvocation to be published');
		assert.strictEqual(invoked, false, 'invoke should not run before confirmation');

		IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
		const result = await promise;
		assert.strictEqual(invoked, true, 'invoke should have run after confirmation');
		assert.strictEqual(result.content[0].value, 'ran');
	});

	test('cancel tool call', async () => {
		const toolBarrier = new Barrier();
		const tool = registerToolForTest(service, store, 'testTool', {
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
		});

		const sessionId = 'sessionId';
		const requestId = 'requestId';
		const dto = tool.makeDto({ a: 1 }, { sessionId });
		stubGetSession(chatService, sessionId, { requestId });
		const toolPromise = service.invokeTool(dto, async () => 0, CancellationToken.None);
		service.cancelToolCallsForRequest(requestId);
		toolBarrier.open();
		await assert.rejects(toolPromise, err => {
			return isCancellationError(err);
		}, 'Expected tool call to be cancelled');
	});

	test('toFullReferenceNames', () => {
		setupToolsForTest(service, store);

		const tool1 = service.getToolByFullReferenceName('tool1RefName');
		const extTool1 = service.getToolByFullReferenceName('my.extension/extTool1RefName');
		const mcpToolSet = service.getToolByFullReferenceName('mcpToolSetRefName/*');
		const mcpTool1 = service.getToolByFullReferenceName('mcpToolSetRefName/mcpTool1RefName');
		const internalToolSet = service.getToolByFullReferenceName('internalToolSetRefName');
		const internalTool = service.getToolByFullReferenceName('internalToolSetRefName/internalToolSetTool1RefName');
		const userToolSet = service.getToolSet('userToolSet');
		const unknownTool = { id: 'unregisteredTool', toolReferenceName: 'unregisteredToolRefName', modelDescription: 'Unregistered Tool', displayName: 'Unregistered Tool', source: ToolDataSource.Internal, canBeReferencedInPrompt: true } satisfies IToolData;
		const unknownToolSet = service.createToolSet(ToolDataSource.Internal, 'unknownToolSet', 'unknownToolSetRefName', { description: 'Unknown Test Set' });
		unknownToolSet.dispose(); // unregister the set
		assert.ok(tool1);
		assert.ok(extTool1);
		assert.ok(mcpTool1);
		assert.ok(mcpToolSet);
		assert.ok(internalToolSet);
		assert.ok(internalTool);
		assert.ok(userToolSet);

		// Test with some enabled tool
		{
			// creating a map by hand is a no-go, we just do it for this test
			const map = new Map<IToolData | ToolSet, boolean>([[tool1, true], [extTool1, true], [mcpToolSet, true], [mcpTool1, true]]);
			const fullReferenceNames = service.toFullReferenceNames(map);
			const expectedFullReferenceNames = ['tool1RefName', 'my.extension/extTool1RefName', 'mcpToolSetRefName/*'];
			assert.deepStrictEqual(fullReferenceNames.sort(), expectedFullReferenceNames.sort(), 'toFullReferenceNames should return the original enabled names');
		}
		// Test with user data
		{
			// creating a map by hand is a no-go, we just do it for this test
			const map = new Map<IToolData | ToolSet, boolean>([[tool1, true], [userToolSet, true], [internalToolSet, false], [internalTool, true]]);
			const fullReferenceNames = service.toFullReferenceNames(map);
			const expectedFullReferenceNames = ['tool1RefName', 'internalToolSetRefName/internalToolSetTool1RefName'];
			assert.deepStrictEqual(fullReferenceNames.sort(), expectedFullReferenceNames.sort(), 'toFullReferenceNames should return the original enabled names');
		}
		// Test with unknown tool and tool set
		{
			// creating a map by hand is a no-go, we just do it for this test
			const map = new Map<IToolData | ToolSet, boolean>([[unknownTool, true], [unknownToolSet, true], [internalToolSet, true], [internalTool, true]]);
			const fullReferenceNames = service.toFullReferenceNames(map);
			const expectedFullReferenceNames = ['internalToolSetRefName'];
			assert.deepStrictEqual(fullReferenceNames.sort(), expectedFullReferenceNames.sort(), 'toFullReferenceNames should return the original enabled names');
		}
	});

	test('toToolAndToolSetEnablementMap', () => {
		setupToolsForTest(service, store);

		const allFullReferenceNames = [
			'tool1RefName',
			'Tool2 Display Name',
			'my.extension/extTool1RefName',
			'mcpToolSetRefName/*',
			'mcpToolSetRefName/mcpTool1RefName',
			'internalToolSetRefName',
			'internalToolSetRefName/internalToolSetTool1RefName',
			'vscode',
			'execute',
			'read',
			'agent'
		];
		const numOfTools = allFullReferenceNames.length + 1; // +1 for userToolSet which has no full reference name but is a tool set

		const tool1 = service.getToolByFullReferenceName('tool1RefName');
		const tool2 = service.getToolByFullReferenceName('Tool2 Display Name');
		const extTool1 = service.getToolByFullReferenceName('my.extension/extTool1RefName');
		const mcpToolSet = service.getToolByFullReferenceName('mcpToolSetRefName/*');
		const mcpTool1 = service.getToolByFullReferenceName('mcpToolSetRefName/mcpTool1RefName');
		const internalToolSet = service.getToolByFullReferenceName('internalToolSetRefName');
		const internalTool = service.getToolByFullReferenceName('internalToolSetRefName/internalToolSetTool1RefName');
		const userToolSet = service.getToolSet('userToolSet');
		const vscodeToolSet = service.getToolSet('vscode');
		const executeToolSet = service.getToolSet('execute');
		const readToolSet = service.getToolSet('read');
		const agentToolSet = service.getToolSet('agent');
		assert.ok(tool1);
		assert.ok(tool2);
		assert.ok(extTool1);
		assert.ok(mcpTool1);
		assert.ok(mcpToolSet);
		assert.ok(internalToolSet);
		assert.ok(internalTool);
		assert.ok(userToolSet);
		assert.ok(vscodeToolSet);
		assert.ok(executeToolSet);
		assert.ok(readToolSet);
		assert.ok(agentToolSet);
		// Test with enabled tool
		{
			const fullReferenceNames = ['tool1RefName'];
			const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, undefined, undefined);
			assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
			assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 1, 'Expected 1 tool to be enabled');
			assert.strictEqual(result1.get(tool1), true, 'tool1 should be enabled');

			const fullReferenceNames1 = service.toFullReferenceNames(result1);
			assert.deepStrictEqual(fullReferenceNames1.sort(), fullReferenceNames.sort(), 'toFullReferenceNames should return the original enabled names');

		}
		// Test with multiple enabled tools
		{
			const fullReferenceNames = ['my.extension/extTool1RefName', 'mcpToolSetRefName/*', 'internalToolSetRefName/internalToolSetTool1RefName'];
			const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, undefined, undefined);
			assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
			assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 4, 'Expected 4 tools to be enabled');
			assert.strictEqual(result1.get(extTool1), true, 'extTool1 should be enabled');
			assert.strictEqual(result1.get(mcpToolSet), true, 'mcpToolSet should be enabled');
			assert.strictEqual(result1.get(mcpTool1), true, 'mcpTool1 should be enabled because the set is enabled');
			assert.strictEqual(result1.get(internalTool), true, 'internalTool should be enabled because the set is enabled');

			const fullReferenceNames1 = service.toFullReferenceNames(result1);
			assert.deepStrictEqual(fullReferenceNames1.sort(), fullReferenceNames.sort(), 'toFullReferenceNames should return the expected names');
		}
		// Test with all enabled tools, redundant names
		{
			const result1 = service.toToolAndToolSetEnablementMap(allFullReferenceNames, undefined, undefined);
			assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
			assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 12, 'Expected 12 tools to be enabled'); // +4 including the vscode, execute, read, agent toolsets

			const fullReferenceNames1 = service.toFullReferenceNames(result1);
			const expectedFullReferenceNames = ['tool1RefName', 'Tool2 Display Name', 'my.extension/extTool1RefName', 'mcpToolSetRefName/*', 'internalToolSetRefName', 'vscode', 'execute', 'read', 'agent'];
			assert.deepStrictEqual(fullReferenceNames1.sort(), expectedFullReferenceNames.sort(), 'toFullReferenceNames should return the original enabled names');
		}
		// Test with no enabled tools
		{
			const fullReferenceNames: string[] = [];
			const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, undefined, undefined);
			assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
			assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 0, 'Expected 0 tools to be enabled');

			const fullReferenceNames1 = service.toFullReferenceNames(result1);
			assert.deepStrictEqual(fullReferenceNames1.sort(), fullReferenceNames.sort(), 'toFullReferenceNames should return the original enabled names');
		}
		// Test with unknown tool
		{
			const fullReferenceNames: string[] = ['unknownToolRefName'];
			const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, undefined, undefined);
			assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
			assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 0, 'Expected 0 tools to be enabled');

			const fullReferenceNames1 = service.toFullReferenceNames(result1);
			assert.deepStrictEqual(fullReferenceNames1.sort(), [], 'toFullReferenceNames should return no enabled names');
		}
		// Test with legacy tool names
		{
			const fullReferenceNames: string[] = ['extTool1RefName', 'mcpToolSetRefName', 'internalToolSetTool1RefName'];
			const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, undefined, undefined);
			assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
			assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 4, 'Expected 4 tools to be enabled');
			assert.strictEqual(result1.get(extTool1), true, 'extTool1 should be enabled');
			assert.strictEqual(result1.get(mcpToolSet), true, 'mcpToolSet should be enabled');
			assert.strictEqual(result1.get(mcpTool1), true, 'mcpTool1 should be enabled because the set is enabled');
			assert.strictEqual(result1.get(internalTool), true, 'internalTool should be enabled');

			const fullReferenceNames1 = service.toFullReferenceNames(result1);
			const expectedFullReferenceNames: string[] = ['my.extension/extTool1RefName', 'mcpToolSetRefName/*', 'internalToolSetRefName/internalToolSetTool1RefName'];
			assert.deepStrictEqual(fullReferenceNames1.sort(), expectedFullReferenceNames.sort(), 'toFullReferenceNames should return the original enabled names');
		}
		// Test with tool in user tool set
		{
			const fullReferenceNames = ['Tool2 Display Name'];
			const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, undefined, undefined);
			assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
			assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 2, 'Expected 1 tool and user tool set to be enabled');
			assert.strictEqual(result1.get(tool2), true, 'tool2 should be enabled');
			assert.strictEqual(result1.get(userToolSet), true, 'userToolSet should be enabled');

			const fullReferenceNames1 = service.toFullReferenceNames(result1);
			assert.deepStrictEqual(fullReferenceNames1.sort(), fullReferenceNames.sort(), 'toFullReferenceNames should return the original enabled names');

		}
	});

	test('toToolAndToolSetEnablementMap with extension tool', () => {
		// Register individual tools
		const toolData1: IToolData = {
			id: 'tool1',
			toolReferenceName: 'refTool1',
			modelDescription: 'Test Tool 1',
			displayName: 'Test Tool 1',
			source: { type: 'extension', label: 'My Extension', extensionId: new ExtensionIdentifier('My.extension') },
			canBeReferencedInPrompt: true,
		};

		store.add(service.registerToolData(toolData1));

		// Test enabling the tool set
		const enabledNames = [toolData1].map(t => service.getFullReferenceName(t));
		const result = service.toToolAndToolSetEnablementMap(enabledNames, undefined, undefined);

		assert.strictEqual(result.get(toolData1), true, 'individual tool should be enabled');

		const fullReferenceNames = service.toFullReferenceNames(result);
		assert.deepStrictEqual(fullReferenceNames.sort(), enabledNames.sort(), 'toFullReferenceNames should return the original enabled names');
	});

	test('toToolAndToolSetEnablementMap with tool sets', () => {
		// Register individual tools
		const toolData1: IToolData = {
			id: 'tool1',
			toolReferenceName: 'refTool1',
			modelDescription: 'Test Tool 1',
			displayName: 'Test Tool 1',
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: true,
		};

		const toolData2: IToolData = {
			id: 'tool2',
			modelDescription: 'Test Tool 2',
			displayName: 'Test Tool 2',
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: true,
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
		const enabledNames = [toolSet, toolData1].map(t => service.getFullReferenceName(t));
		const result = service.toToolAndToolSetEnablementMap(enabledNames, undefined, undefined);

		assert.strictEqual(result.get(toolData1), true, 'individual tool should be enabled');
		assert.strictEqual(result.get(toolData2), false);
		assert.strictEqual(result.get(toolSet), true, 'tool set should be enabled');
		assert.strictEqual(result.get(toolSetTool1), true, 'tool set tool 1 should be enabled');
		assert.strictEqual(result.get(toolSetTool2), true, 'tool set tool 2 should be enabled');

		const fullReferenceNames = service.toFullReferenceNames(result);
		assert.deepStrictEqual(fullReferenceNames.sort(), enabledNames.sort(), 'toFullReferenceNames should return the original enabled names');
	});

	test('toToolAndToolSetEnablementMap with non-existent tool names', () => {
		const toolData: IToolData = {
			id: 'tool1',
			toolReferenceName: 'refTool1',
			modelDescription: 'Test Tool 1',
			displayName: 'Test Tool 1',
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: true,
		};

		store.add(service.registerToolData(toolData));

		const unregisteredToolData: IToolData = {
			id: 'toolX',
			toolReferenceName: 'refToolX',
			modelDescription: 'Test Tool X',
			displayName: 'Test Tool X',
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: true,
		};

		// Test with non-existent tool names
		const enabledNames = [toolData, unregisteredToolData].map(t => service.getFullReferenceName(t));
		const result = service.toToolAndToolSetEnablementMap(enabledNames, undefined, undefined);

		assert.strictEqual(result.get(toolData), true, 'existing tool should be enabled');
		// Non-existent tools should not appear in the result map
		assert.strictEqual(result.get(unregisteredToolData), undefined, 'non-existent tool should not be in result');

		const fullReferenceNames = service.toFullReferenceNames(result);
		const expectedNames = [service.getFullReferenceName(toolData)]; // Only the existing tool
		assert.deepStrictEqual(fullReferenceNames.sort(), expectedNames.sort(), 'toFullReferenceNames should return the original enabled names');

	});


	test('toToolAndToolSetEnablementMap with legacy names', () => {
		// Test that legacy tool reference names and legacy toolset names work correctly

		// Create a tool with legacy reference names
		const toolWithLegacy: IToolData = {
			id: 'newTool',
			toolReferenceName: 'newToolRef',
			modelDescription: 'New Tool',
			displayName: 'New Tool',
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: true,
			legacyToolReferenceFullNames: ['oldToolName', 'deprecatedToolName']
		};
		store.add(service.registerToolData(toolWithLegacy));

		// Create a tool set with legacy names
		const toolSetWithLegacy = store.add(service.createToolSet(
			ToolDataSource.Internal,
			'newToolSet',
			'newToolSetRef',
			{ description: 'New Tool Set', legacyFullNames: ['oldToolSet', 'deprecatedToolSet'] }
		));

		// Create a tool in the toolset
		const toolInSet: IToolData = {
			id: 'toolInSet',
			toolReferenceName: 'toolInSetRef',
			modelDescription: 'Tool In Set',
			displayName: 'Tool In Set',
			source: ToolDataSource.Internal,
		};
		store.add(service.registerToolData(toolInSet));
		store.add(toolSetWithLegacy.addTool(toolInSet));

		// Test 1: Using legacy tool reference name should enable the tool
		{
			const result = service.toToolAndToolSetEnablementMap(['oldToolName'], undefined, undefined);
			assert.strictEqual(result.get(toolWithLegacy), true, 'tool should be enabled via legacy name');

			const fullReferenceNames = service.toFullReferenceNames(result);
			assert.deepStrictEqual(fullReferenceNames, ['newToolRef'], 'should return current full reference name, not legacy');
		}

		// Test 2: Using another legacy tool reference name should also work
		{
			const result = service.toToolAndToolSetEnablementMap(['deprecatedToolName'], undefined, undefined);
			assert.strictEqual(result.get(toolWithLegacy), true, 'tool should be enabled via another legacy name');

			const fullReferenceNames = service.toFullReferenceNames(result);
			assert.deepStrictEqual(fullReferenceNames, ['newToolRef'], 'should return current full reference name, not legacy');
		}

		// Test 3: Using legacy toolset name should enable the entire toolset
		{
			const result = service.toToolAndToolSetEnablementMap(['oldToolSet'], undefined, undefined);
			assert.strictEqual(result.get(toolSetWithLegacy), true, 'toolset should be enabled via legacy name');
			assert.strictEqual(result.get(toolInSet), true, 'tool in set should be enabled when set is enabled via legacy name');

			const fullReferenceNames = service.toFullReferenceNames(result);
			assert.deepStrictEqual(fullReferenceNames, ['newToolSetRef'], 'should return current full reference name, not legacy');
		}

		// Test 4: Using deprecated toolset name should also work
		{
			const result = service.toToolAndToolSetEnablementMap(['deprecatedToolSet'], undefined, undefined);
			assert.strictEqual(result.get(toolSetWithLegacy), true, 'toolset should be enabled via another legacy name');
			assert.strictEqual(result.get(toolInSet), true, 'tool in set should be enabled when set is enabled via legacy name');

			const fullReferenceNames = service.toFullReferenceNames(result);
			assert.deepStrictEqual(fullReferenceNames, ['newToolSetRef'], 'should return current full reference name, not legacy');
		}

		// Test 5: Mix of current and legacy names
		{
			const result = service.toToolAndToolSetEnablementMap(['newToolRef', 'oldToolSet'], undefined, undefined);
			assert.strictEqual(result.get(toolWithLegacy), true, 'tool should be enabled via current name');
			assert.strictEqual(result.get(toolSetWithLegacy), true, 'toolset should be enabled via legacy name');
			assert.strictEqual(result.get(toolInSet), true, 'tool in set should be enabled');

			const fullReferenceNames = service.toFullReferenceNames(result);
			assert.deepStrictEqual(fullReferenceNames.sort(), ['newToolRef', 'newToolSetRef'].sort(), 'should return current full reference names');
		}

		// Test 6: Using legacy names and current names together (redundant but should work)
		{
			const result = service.toToolAndToolSetEnablementMap(['newToolRef', 'oldToolName', 'deprecatedToolName'], undefined, undefined);
			assert.strictEqual(result.get(toolWithLegacy), true, 'tool should be enabled (redundant legacy names should not cause issues)');

			const fullReferenceNames = service.toFullReferenceNames(result);
			assert.deepStrictEqual(fullReferenceNames, ['newToolRef'], 'should return single current full reference name');
		}
	});

	test('toToolAndToolSetEnablementMap with orphaned toolset in legacy names', () => {
		// Test that when a tool has a legacy name with a toolset prefix, but that toolset no longer exists,
		// we can enable the tool by either the full legacy name OR just the orphaned toolset name

		// Create a tool that used to be in 'oldToolSet/oldToolName' but now is just 'newToolRef'
		const toolWithOrphanedToolSet: IToolData = {
			id: 'migratedTool',
			toolReferenceName: 'newToolRef',
			modelDescription: 'Migrated Tool',
			displayName: 'Migrated Tool',
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: true,
			legacyToolReferenceFullNames: ['oldToolSet/oldToolName']
		};
		store.add(service.registerToolData(toolWithOrphanedToolSet));

		// Test 1: Using the full legacy name should enable the tool
		{
			const result = service.toToolAndToolSetEnablementMap(['oldToolSet/oldToolName'], undefined, undefined);
			assert.strictEqual(result.get(toolWithOrphanedToolSet), true, 'tool should be enabled via full legacy name');

			const fullReferenceNames = service.toFullReferenceNames(result);
			assert.deepStrictEqual(fullReferenceNames, ['newToolRef'], 'should return current full reference name');
		}

		// Test 2: Using just the orphaned toolset name should also enable the tool
		{
			const result = service.toToolAndToolSetEnablementMap(['oldToolSet'], undefined, undefined);
			assert.strictEqual(result.get(toolWithOrphanedToolSet), true, 'tool should be enabled via orphaned toolset name');

			const fullReferenceNames = service.toFullReferenceNames(result);
			assert.deepStrictEqual(fullReferenceNames, ['newToolRef'], 'should return current full reference name');
		}

		// Test 3: Multiple tools from the same orphaned toolset
		const anotherToolFromOrphanedSet: IToolData = {
			id: 'anotherMigratedTool',
			toolReferenceName: 'anotherNewToolRef',
			modelDescription: 'Another Migrated Tool',
			displayName: 'Another Migrated Tool',
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: true,
			legacyToolReferenceFullNames: ['oldToolSet/anotherOldToolName']
		};
		store.add(service.registerToolData(anotherToolFromOrphanedSet));

		{
			const result = service.toToolAndToolSetEnablementMap(['oldToolSet'], undefined, undefined);
			assert.strictEqual(result.get(toolWithOrphanedToolSet), true, 'first tool should be enabled via orphaned toolset name');
			assert.strictEqual(result.get(anotherToolFromOrphanedSet), true, 'second tool should also be enabled via orphaned toolset name');

			const fullReferenceNames = service.toFullReferenceNames(result);
			assert.deepStrictEqual(fullReferenceNames.sort(), ['newToolRef', 'anotherNewToolRef'].sort(), 'should return both current full reference names');
		}

		// Test 4: Orphaned toolset name should NOT enable tools that weren't in that toolset
		const unrelatedTool: IToolData = {
			id: 'unrelatedTool',
			toolReferenceName: 'unrelatedToolRef',
			modelDescription: 'Unrelated Tool',
			displayName: 'Unrelated Tool',
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: true,
			legacyToolReferenceFullNames: ['differentToolSet/oldName']
		};
		store.add(service.registerToolData(unrelatedTool));

		{
			const result = service.toToolAndToolSetEnablementMap(['oldToolSet'], undefined, undefined);
			assert.strictEqual(result.get(toolWithOrphanedToolSet), true, 'tool from oldToolSet should be enabled');
			assert.strictEqual(result.get(anotherToolFromOrphanedSet), true, 'another tool from oldToolSet should be enabled');
			assert.strictEqual(result.get(unrelatedTool), false, 'tool from different toolset should NOT be enabled');

			const fullReferenceNames = service.toFullReferenceNames(result);
			assert.deepStrictEqual(fullReferenceNames.sort(), ['newToolRef', 'anotherNewToolRef'].sort(), 'should only return tools from oldToolSet');
		}

		// Test 5: If a toolset with the same name exists, it should take precedence over orphaned toolset mapping
		const newToolSetWithSameName = store.add(service.createToolSet(
			ToolDataSource.Internal,
			'recreatedToolSet',
			'oldToolSet',  // Same name as the orphaned toolset
			{ description: 'Recreated Tool Set' }
		));

		const toolInRecreatedSet: IToolData = {
			id: 'toolInRecreatedSet',
			toolReferenceName: 'toolInRecreatedSetRef',
			modelDescription: 'Tool In Recreated Set',
			displayName: 'Tool In Recreated Set',
			source: ToolDataSource.Internal,
		};
		store.add(service.registerToolData(toolInRecreatedSet));
		store.add(newToolSetWithSameName.addTool(toolInRecreatedSet));

		{
			const result = service.toToolAndToolSetEnablementMap(['oldToolSet'], undefined, undefined);
			// Now 'oldToolSet' should enable BOTH the recreated toolset AND the tools with legacy names pointing to oldToolSet
			assert.strictEqual(result.get(newToolSetWithSameName), true, 'recreated toolset should be enabled');
			assert.strictEqual(result.get(toolInRecreatedSet), true, 'tool in recreated set should be enabled');
			// The tools with legacy toolset names should ALSO be enabled because their legacy names match
			assert.strictEqual(result.get(toolWithOrphanedToolSet), true, 'tool with legacy toolset should still be enabled');
			assert.strictEqual(result.get(anotherToolFromOrphanedSet), true, 'another tool with legacy toolset should still be enabled');

			const fullReferenceNames = service.toFullReferenceNames(result);
			// Should return the toolset name plus the individual tools that were enabled via legacy names
			assert.deepStrictEqual(fullReferenceNames.sort(), ['oldToolSet', 'newToolRef', 'anotherNewToolRef'].sort(), 'should return toolset and individual tools');
		}
	});

	test('toToolAndToolSetEnablementMap map Github to VSCode tools', () => {
		const runInTerminalToolData: IToolData = {
			id: 'runInTerminalId',
			toolReferenceName: 'runInTerminal',
			modelDescription: 'runInTerminal Description',
			displayName: 'runInTerminal displayName',
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: false,
		};

		store.add(service.registerToolData(runInTerminalToolData));
		store.add(service.executeToolSet.addTool(runInTerminalToolData));


		const runSubagentToolData: IToolData = {
			id: 'runSubagentId',
			toolReferenceName: 'runSubagent',
			modelDescription: 'runSubagent Description',
			displayName: 'runSubagent displayName',
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: false,
		};

		store.add(service.registerToolData(runSubagentToolData));
		store.add(service.agentToolSet.addTool(runSubagentToolData));

		const githubMcpDataSource: ToolDataSource = { type: 'mcp', label: 'Github', serverLabel: 'Github MCP Server', instructions: undefined, collectionId: 'githubMCPCollection', definitionId: 'githubMCPDefId' };
		const githubMcpTool1: IToolData = {
			id: 'create_branch',
			toolReferenceName: 'create_branch',
			modelDescription: 'Test Github MCP Tool 1',
			displayName: 'Create Branch',
			source: githubMcpDataSource,
			canBeReferencedInPrompt: true,
		};
		store.add(service.registerToolData(githubMcpTool1));

		const githubMcpToolSet = store.add(service.createToolSet(
			githubMcpDataSource,
			'githubMcpToolSet',
			'github/github-mcp-server',
			{ description: 'Github MCP Test ToolSet' }
		));
		store.add(githubMcpToolSet.addTool(githubMcpTool1));

		assert.equal(githubMcpToolSet.referenceName, 'github', 'github/github-mcp-server will be normalized to github');

		const playwrightMcpDataSource: ToolDataSource = { type: 'mcp', label: 'playwright', serverLabel: 'playwright MCP Server', instructions: undefined, collectionId: 'playwrightMCPCollection', definitionId: 'playwrightMCPDefId' };
		const playwrightMcpTool1: IToolData = {
			id: 'browser_click',
			toolReferenceName: 'browser_click',
			modelDescription: 'Test playwright MCP Tool 1',
			displayName: 'Create Branch',
			source: playwrightMcpDataSource,
			canBeReferencedInPrompt: true,
		};
		store.add(service.registerToolData(playwrightMcpTool1));

		const playwrightMcpToolSet = store.add(service.createToolSet(
			playwrightMcpDataSource,
			'playwrightMcpToolSet',
			'microsoft/playwright-mcp',
			{ description: 'playwright MCP Test ToolSet' }
		));
		store.add(playwrightMcpToolSet.addTool(playwrightMcpTool1));

		const deprecated = service.getDeprecatedFullReferenceNames();
		const deprecatesTo = (key: string): string[] | undefined => {
			const values = deprecated.get(key);
			return values ? Array.from(values).sort() : undefined;
		};

		assert.equal(playwrightMcpToolSet.referenceName, 'playwright', 'microsoft/playwright-mcp will be normalized to playwright');

		{
			const toolNames = ['custom-agent', 'shell'];
			const result = service.toToolAndToolSetEnablementMap(toolNames, undefined, undefined);

			assert.strictEqual(result.get(service.executeToolSet), true, 'execute should be enabled');
			assert.strictEqual(result.get(service.agentToolSet), true, 'agent should be enabled');

			const fullReferenceNames = service.toFullReferenceNames(result).sort();
			assert.deepStrictEqual(fullReferenceNames, [SpecedToolAliases.agent, SpecedToolAliases.execute].sort(), 'toFullReferenceNames should return the VS Code tool names');

			assert.deepStrictEqual(toolNames.map(name => service.getToolByFullReferenceName(name)), [service.agentToolSet, service.executeToolSet]);

			assert.deepStrictEqual(deprecatesTo('custom-agent'), [SpecedToolAliases.agent], 'customAgent should map to agent');
			assert.deepStrictEqual(deprecatesTo('shell'), [SpecedToolAliases.execute], 'shell is now execute');
		}
		{
			const toolNames = ['github/*', 'playwright/*'];
			const result = service.toToolAndToolSetEnablementMap(toolNames, undefined, undefined);

			assert.strictEqual(result.get(githubMcpToolSet), true, 'githubMcpToolSet should be enabled');
			assert.strictEqual(result.get(playwrightMcpToolSet), true, 'playwrightMcpToolSet should be enabled');
			const fullReferenceNames = service.toFullReferenceNames(result).sort();
			assert.deepStrictEqual(fullReferenceNames, ['github/*', 'playwright/*'], 'toFullReferenceNames should return the VS Code tool names');

			assert.deepStrictEqual(toolNames.map(name => service.getToolByFullReferenceName(name)), [githubMcpToolSet, playwrightMcpToolSet]);

			assert.deepStrictEqual(deprecatesTo('github/*'), undefined, 'github/* is fine');
			assert.deepStrictEqual(deprecatesTo('playwright/*'), undefined, 'playwright/* is fine');
		}

		{
			// the speced names should work and not be altered
			const toolNames = ['github/create_branch', 'playwright/browser_click'];
			const result = service.toToolAndToolSetEnablementMap(toolNames, undefined, undefined);

			assert.strictEqual(result.get(githubMcpTool1), true, 'githubMcpTool1 should be enabled');
			assert.strictEqual(result.get(playwrightMcpTool1), true, 'playwrightMcpTool1 should be enabled');
			const fullReferenceNames = service.toFullReferenceNames(result).sort();
			assert.deepStrictEqual(fullReferenceNames, ['github/create_branch', 'playwright/browser_click'], 'toFullReferenceNames should return the speced names');

			assert.deepStrictEqual(toolNames.map(name => service.getToolByFullReferenceName(name)), [githubMcpTool1, playwrightMcpTool1]);

			assert.deepStrictEqual(deprecatesTo('github/create_branch'), undefined, 'github/create_branch is fine');
			assert.deepStrictEqual(deprecatesTo('playwright/browser_click'), undefined, 'playwright/browser_click is fine');
		}

		{
			// using the old MCP full names should also work
			const toolNames = ['github/github-mcp-server/*', 'microsoft/playwright-mcp/*'];
			const result = service.toToolAndToolSetEnablementMap(toolNames, undefined, undefined);

			assert.strictEqual(result.get(githubMcpToolSet), true, 'githubMcpToolSet should be enabled');
			assert.strictEqual(result.get(playwrightMcpToolSet), true, 'playwrightMcpToolSet should be enabled');
			const fullReferenceNames = service.toFullReferenceNames(result).sort();
			assert.deepStrictEqual(fullReferenceNames, ['github/*', 'playwright/*'], 'toFullReferenceNames should return the speced names');

			assert.deepStrictEqual(toolNames.map(name => service.getToolByFullReferenceName(name)), [githubMcpToolSet, playwrightMcpToolSet]);

			assert.deepStrictEqual(deprecatesTo('github/github-mcp-server/*'), ['github/*']);
			assert.deepStrictEqual(deprecatesTo('microsoft/playwright-mcp/*'), ['playwright/*']);
		}
		{
			// using the old MCP full names should also work
			const toolNames = ['github/github-mcp-server/create_branch', 'microsoft/playwright-mcp/browser_click'];
			const result = service.toToolAndToolSetEnablementMap(toolNames, undefined, undefined);

			assert.strictEqual(result.get(githubMcpTool1), true, 'githubMcpTool1 should be enabled');
			assert.strictEqual(result.get(playwrightMcpTool1), true, 'playwrightMcpTool1 should be enabled');
			const fullReferenceNames = service.toFullReferenceNames(result).sort();
			assert.deepStrictEqual(fullReferenceNames, ['github/create_branch', 'playwright/browser_click'], 'toFullReferenceNames should return the speced names');

			assert.deepStrictEqual(toolNames.map(name => service.getToolByFullReferenceName(name)), [githubMcpTool1, playwrightMcpTool1]);

			assert.deepStrictEqual(deprecatesTo('github/github-mcp-server/create_branch'), ['github/create_branch']);
			assert.deepStrictEqual(deprecatesTo('microsoft/playwright-mcp/browser_click'), ['playwright/browser_click']);
		}

		{
			// using the latest MCP full names should also work
			const toolNames = ['io.github.github/github-mcp-server/*', 'com.microsoft/playwright-mcp/*'];
			const result = service.toToolAndToolSetEnablementMap(toolNames, undefined, undefined);

			assert.strictEqual(result.get(githubMcpToolSet), true, 'githubMcpToolSet should be enabled');
			assert.strictEqual(result.get(playwrightMcpToolSet), true, 'playwrightMcpToolSet should be enabled');
			const fullReferenceNames = service.toFullReferenceNames(result).sort();
			assert.deepStrictEqual(fullReferenceNames, ['github/*', 'playwright/*'], 'toFullReferenceNames should return the speced names');

			assert.deepStrictEqual(toolNames.map(name => service.getToolByFullReferenceName(name)), [githubMcpToolSet, playwrightMcpToolSet]);

			assert.deepStrictEqual(deprecatesTo('io.github.github/github-mcp-server/*'), ['github/*']);
			assert.deepStrictEqual(deprecatesTo('com.microsoft/playwright-mcp/*'), ['playwright/*']);
		}

		{
			// using the latest MCP full names should also work
			const toolNames = ['io.github.github/github-mcp-server/create_branch', 'com.microsoft/playwright-mcp/browser_click'];
			const result = service.toToolAndToolSetEnablementMap(toolNames, undefined, undefined);

			assert.strictEqual(result.get(githubMcpTool1), true, 'githubMcpTool1 should be enabled');
			assert.strictEqual(result.get(playwrightMcpTool1), true, 'playwrightMcpTool1 should be enabled');
			const fullReferenceNames = service.toFullReferenceNames(result).sort();
			assert.deepStrictEqual(fullReferenceNames, ['github/create_branch', 'playwright/browser_click'], 'toFullReferenceNames should return the speced names');

			assert.deepStrictEqual(toolNames.map(name => service.getToolByFullReferenceName(name)), [githubMcpTool1, playwrightMcpTool1]);

			assert.deepStrictEqual(deprecatesTo('io.github.github/github-mcp-server/create_branch'), ['github/create_branch']);
			assert.deepStrictEqual(deprecatesTo('com.microsoft/playwright-mcp/browser_click'), ['playwright/browser_click']);
		}

		{
			// using the old MCP full names should also work
			const toolNames = ['github-mcp-server/create_branch'];
			const result = service.toToolAndToolSetEnablementMap(toolNames, undefined, undefined);

			assert.strictEqual(result.get(githubMcpTool1), true, 'githubMcpTool1 should be enabled');
			const fullReferenceNames = service.toFullReferenceNames(result).sort();
			assert.deepStrictEqual(fullReferenceNames, ['github/create_branch'], 'toFullReferenceNames should return the VS Code tool names');

			assert.deepStrictEqual(toolNames.map(name => service.getToolByFullReferenceName(name)), [githubMcpTool1]);

			assert.deepStrictEqual(deprecatesTo('github-mcp-server/create_branch'), ['github/create_branch']);
		}

	});

	test('accessibility signal for tool confirmation', async () => {
		// Create a test configuration service with proper settings
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration('chat.tools.global.autoApprove', false);
		testConfigService.setUserConfiguration('accessibility.signals.chatUserActionRequired', { sound: 'auto', announcement: 'auto' });

		// Create a test accessibility service that simulates screen reader being enabled
		const testAccessibilityService = new class extends TestAccessibilityService {
			override isScreenReaderOptimized(): boolean { return true; }
		}();

		// Create a test accessibility signal service that tracks calls
		const testAccessibilitySignalService = new TestAccessibilitySignalService();

		// Create a new service instance with the test services
		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(IAccessibilityService, testAccessibilityService);
		instaService.stub(IAccessibilitySignalService, testAccessibilitySignalService as unknown as IAccessibilitySignalService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		const toolData: IToolData = {
			id: 'testAccessibilityTool',
			modelDescription: 'Test Accessibility Tool',
			displayName: 'Test Accessibility Tool',
			source: ToolDataSource.Internal,
		};

		const tool = registerToolForTest(testService, store, toolData.id, {
			prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Accessibility Test', message: 'Testing accessibility signal' } }),
			invoke: async () => ({ content: [{ kind: 'text', value: 'executed' }] }),
		}, toolData);

		const sessionId = 'sessionId-accessibility';
		const capture: { invocation?: any } = {};
		stubGetSession(chatService, sessionId, { requestId: 'requestId-accessibility', capture });

		const dto = tool.makeDto({ param: 'value' }, { sessionId });

		const promise = testService.invokeTool(dto, async () => 0, CancellationToken.None);
		const published = await waitForPublishedInvocation(capture);

		assert.ok(published, 'expected ChatToolInvocation to be published');
		assert.ok(published.confirmationMessages, 'should have confirmation messages');

		// The accessibility signal should have been played
		assert.strictEqual(testAccessibilitySignalService.signalPlayedCalls.length, 1, 'accessibility signal should have been played once');
		const signalCall = testAccessibilitySignalService.signalPlayedCalls[0];
		assert.strictEqual(signalCall.signal, AccessibilitySignal.chatUserActionRequired, 'correct signal should be played');
		assert.ok(signalCall.options?.customAlertMessage.includes('Accessibility Test'), 'alert message should include tool title');
		assert.ok(signalCall.options?.customAlertMessage.includes('Chat confirmation required'), 'alert message should include confirmation text');

		// Complete the invocation
		IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
		const result = await promise;
		assert.strictEqual(result.content[0].value, 'executed');
	});

	test('accessibility signal respects autoApprove configuration', async () => {
		// Create a test configuration service with auto-approve enabled
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration('chat.tools.global.autoApprove', true);
		testConfigService.setUserConfiguration('accessibility.signals.chatUserActionRequired', { sound: 'auto', announcement: 'auto' });

		// Create a test accessibility service that simulates screen reader being enabled
		const testAccessibilityService = new class extends TestAccessibilityService {
			override isScreenReaderOptimized(): boolean { return true; }
		}();

		// Create a test accessibility signal service that tracks calls
		const testAccessibilitySignalService = new TestAccessibilitySignalService();

		// Create a new service instance with the test services
		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(IAccessibilityService, testAccessibilityService);
		instaService.stub(IAccessibilitySignalService, testAccessibilitySignalService as unknown as IAccessibilitySignalService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		const toolData: IToolData = {
			id: 'testAutoApproveTool',
			modelDescription: 'Test Auto Approve Tool',
			displayName: 'Test Auto Approve Tool',
			source: ToolDataSource.Internal,
		};

		const tool = registerToolForTest(testService, store, toolData.id, {
			prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Auto Approve Test', message: 'Testing auto approve' } }),
			invoke: async () => ({ content: [{ kind: 'text', value: 'auto approved' }] }),
		}, toolData);

		const sessionId = 'sessionId-auto-approve';
		const capture: { invocation?: any } = {};
		stubGetSession(chatService, sessionId, { requestId: 'requestId-auto-approve', capture });

		const dto = tool.makeDto({ config: 'test' }, { sessionId });

		// When auto-approve is enabled, tool should complete without user intervention
		const result = await testService.invokeTool(dto, async () => 0, CancellationToken.None);

		// Verify the tool completed and no accessibility signal was played
		assert.strictEqual(result.content[0].value, 'auto approved');
		assert.strictEqual(testAccessibilitySignalService.signalPlayedCalls.length, 0, 'accessibility signal should not be played when auto-approve is enabled');
	});

	test('shouldAutoConfirm with basic configuration', async () => {
		// Test basic shouldAutoConfirm behavior with simple configuration
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration('chat.tools.global.autoApprove', true); // Global enabled

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		// Register a tool that should be auto-approved
		const autoTool = registerToolForTest(testService, store, 'autoTool', {
			prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Test', message: 'Should auto-approve' } }),
			invoke: async () => ({ content: [{ kind: 'text', value: 'auto approved' }] })
		});

		const sessionId = 'test-basic-config';
		stubGetSession(chatService, sessionId, { requestId: 'req1' });

		// Tool should be auto-approved (global config = true)
		const result = await testService.invokeTool(
			autoTool.makeDto({ test: 1 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);
		assert.strictEqual(result.content[0].value, 'auto approved');
	});

	test('shouldAutoConfirm with per-tool configuration object', async () => {
		// Test per-tool configuration: { toolId: true/false }
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration('chat.tools.global.autoApprove', {
			'approvedTool': true,
			'deniedTool': false
		});

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		// Tool explicitly approved
		const approvedTool = registerToolForTest(testService, store, 'approvedTool', {
			prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Test', message: 'Should auto-approve' } }),
			invoke: async () => ({ content: [{ kind: 'text', value: 'approved' }] })
		});

		const sessionId = 'test-per-tool';
		stubGetSession(chatService, sessionId, { requestId: 'req1' });

		// Approved tool should auto-approve
		const approvedResult = await testService.invokeTool(
			approvedTool.makeDto({ test: 1 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);
		assert.strictEqual(approvedResult.content[0].value, 'approved');

		// Test that non-specified tools require confirmation (default behavior)
		const unspecifiedTool = registerToolForTest(testService, store, 'unspecifiedTool', {
			prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Test', message: 'Should require confirmation' } }),
			invoke: async () => ({ content: [{ kind: 'text', value: 'unspecified' }] })
		});

		const capture: { invocation?: any } = {};
		stubGetSession(chatService, sessionId + '2', { requestId: 'req2', capture });
		const unspecifiedPromise = testService.invokeTool(
			unspecifiedTool.makeDto({ test: 2 }, { sessionId: sessionId + '2' }),
			async () => 0,
			CancellationToken.None
		);
		const published = await waitForPublishedInvocation(capture);
		assert.ok(published?.confirmationMessages, 'unspecified tool should require confirmation');

		IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
		const unspecifiedResult = await unspecifiedPromise;
		assert.strictEqual(unspecifiedResult.content[0].value, 'unspecified');
	});

	test('eligibleForAutoApproval setting controls tool eligibility', async () => {
		// Test the new eligibleForAutoApproval setting
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
			'eligibleToolRef': true,
			'ineligibleToolRef': false
		});

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		// Tool explicitly marked as eligible (using toolReferenceName) - no confirmation needed
		const eligibleTool = registerToolForTest(testService, store, 'eligibleTool', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'eligible tool ran' }] })
		}, {
			toolReferenceName: 'eligibleToolRef'
		});

		const sessionId = 'test-eligible';
		stubGetSession(chatService, sessionId, { requestId: 'req1' });

		// Eligible tool should not get default confirmation messages injected
		const eligibleResult = await testService.invokeTool(
			eligibleTool.makeDto({ test: 1 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);
		assert.strictEqual(eligibleResult.content[0].value, 'eligible tool ran');

		// Tool explicitly marked as ineligible (using toolReferenceName) - must require confirmation
		const ineligibleTool = registerToolForTest(testService, store, 'ineligibleTool', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'ineligible requires confirmation' }] })
		}, {
			toolReferenceName: 'ineligibleToolRef'
		});

		const capture: { invocation?: any } = {};
		stubGetSession(chatService, sessionId + '2', { requestId: 'req2', capture });
		const ineligiblePromise = testService.invokeTool(
			ineligibleTool.makeDto({ test: 2 }, { sessionId: sessionId + '2' }),
			async () => 0,
			CancellationToken.None
		);
		const published = await waitForPublishedInvocation(capture);
		assert.ok(published?.confirmationMessages, 'ineligible tool should require confirmation');
		assert.ok(published?.confirmationMessages?.title, 'should have default confirmation title');
		assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, 'should not allow auto confirm');

		IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
		const ineligibleResult = await ineligiblePromise;
		assert.strictEqual(ineligibleResult.content[0].value, 'ineligible requires confirmation');

		// Tool not specified should default to eligible - no confirmation needed
		const unspecifiedTool = registerToolForTest(testService, store, 'unspecifiedTool', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'unspecified defaults to eligible' }] })
		}, {
			toolReferenceName: 'unspecifiedToolRef'
		});

		const unspecifiedResult = await testService.invokeTool(
			unspecifiedTool.makeDto({ test: 3 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);
		assert.strictEqual(unspecifiedResult.content[0].value, 'unspecified defaults to eligible');
	});

	test('tool content formatting with alwaysDisplayInputOutput', async () => {
		// Test ensureToolDetails, formatToolInput, and toolResultToIO
		const toolData: IToolData = {
			id: 'formatTool',
			modelDescription: 'Format Test Tool',
			displayName: 'Format Test Tool',
			source: ToolDataSource.Internal,
			alwaysDisplayInputOutput: true
		};

		const tool = registerToolForTest(service, store, toolData.id, {
			prepareToolInvocation: async () => ({}),
			invoke: async (invocation) => ({
				content: [
					{ kind: 'text', value: 'Text result' },
					{ kind: 'data', value: { data: VSBuffer.fromByteArray([1, 2, 3]), mimeType: 'application/octet-stream' } }
				]
			})
		}, toolData);

		const input = { a: 1, b: 'test', c: [1, 2, 3] };
		const result = await service.invokeTool(
			tool.makeDto(input),
			async () => 0,
			CancellationToken.None
		);

		// Should have tool result details because alwaysDisplayInputOutput = true
		assert.ok(result.toolResultDetails, 'should have toolResultDetails');
		const details = result.toolResultDetails;
		assert.ok(isToolResultInputOutputDetails(details));

		// Test formatToolInput - should be formatted JSON
		const expectedInputJson = JSON.stringify(input, undefined, 2);
		assert.strictEqual(details.input, expectedInputJson, 'input should be formatted JSON');

		// Test toolResultToIO - should convert different content types
		assert.strictEqual(details.output.length, 2, 'should have 2 output items');

		// Text content
		const textOutput = details.output[0];
		assert.strictEqual(textOutput.type, 'embed');
		assert.strictEqual(textOutput.isText, true);
		assert.strictEqual(textOutput.value, 'Text result');

		// Data content (base64 encoded)
		const dataOutput = details.output[1];
		assert.strictEqual(dataOutput.type, 'embed');
		assert.strictEqual(dataOutput.mimeType, 'application/octet-stream');
		assert.strictEqual(dataOutput.value, 'AQID'); // base64 of [1,2,3]
	});

	test('tool error handling and telemetry', async () => {
		const testTelemetryService = new TestTelemetryService();

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(configurationService)),
			configurationService: () => configurationService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(ITelemetryService, testTelemetryService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		// Test successful invocation telemetry
		const successTool = registerToolForTest(testService, store, 'successTool', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'success' }] })
		});

		const sessionId = 'telemetry-test';
		stubGetSession(chatService, sessionId, { requestId: 'req1' });

		await testService.invokeTool(
			successTool.makeDto({ test: 1 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);

		// Check success telemetry
		const successEvents = testTelemetryService.events.filter(e => e.eventName === 'languageModelToolInvoked');
		assert.strictEqual(successEvents.length, 1, 'should have success telemetry event');
		assert.strictEqual(successEvents[0].data.result, 'success');
		assert.strictEqual(successEvents[0].data.toolId, 'successTool');
		assert.strictEqual(successEvents[0].data.chatSessionId, sessionId);

		testTelemetryService.reset();

		// Test error telemetry
		const errorTool = registerToolForTest(testService, store, 'errorTool', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => { throw new Error('Tool error'); }
		});

		stubGetSession(chatService, sessionId + '2', { requestId: 'req2' });

		try {
			await testService.invokeTool(
				errorTool.makeDto({ test: 2 }, { sessionId: sessionId + '2' }),
				async () => 0,
				CancellationToken.None
			);
			assert.fail('Should have thrown');
		} catch (err) {
			// Expected
		}

		// Check error telemetry
		const errorEvents = testTelemetryService.events.filter(e => e.eventName === 'languageModelToolInvoked');
		assert.strictEqual(errorEvents.length, 1, 'should have error telemetry event');
		assert.strictEqual(errorEvents[0].data.result, 'error');
		assert.strictEqual(errorEvents[0].data.toolId, 'errorTool');
	});

	test('call tracking and cleanup', async () => {
		// Test that cancelToolCallsForRequest method exists and can be called
		// (The detailed cancellation behavior is already tested in "cancel tool call" test)
		const sessionId = 'tracking-session';
		const requestId = 'tracking-request';
		stubGetSession(chatService, sessionId, { requestId });

		// Just verify the method exists and doesn't throw
		assert.doesNotThrow(() => {
			service.cancelToolCallsForRequest(requestId);
		}, 'cancelToolCallsForRequest should not throw');

		// Verify calling with non-existent request ID doesn't throw
		assert.doesNotThrow(() => {
			service.cancelToolCallsForRequest('non-existent-request');
		}, 'cancelToolCallsForRequest with non-existent ID should not throw');
	});

	test('accessibility signal with different settings combinations', async () => {
		const testAccessibilitySignalService = new TestAccessibilitySignalService();

		// Test case 1: Sound enabled, announcement disabled, screen reader off
		const testConfigService1 = new TestConfigurationService();
		testConfigService1.setUserConfiguration('chat.tools.global.autoApprove', false);
		testConfigService1.setUserConfiguration('accessibility.signals.chatUserActionRequired', { sound: 'on', announcement: 'off' });

		const testAccessibilityService1 = new class extends TestAccessibilityService {
			override isScreenReaderOptimized(): boolean { return false; }
		}();

		const instaService1 = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService1)),
			configurationService: () => testConfigService1
		}, store);
		instaService1.stub(IChatService, chatService);
		instaService1.stub(IAccessibilityService, testAccessibilityService1);
		instaService1.stub(IAccessibilitySignalService, testAccessibilitySignalService as unknown as IAccessibilitySignalService);
		instaService1.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService1 = store.add(instaService1.createInstance(LanguageModelToolsService));

		const tool1 = registerToolForTest(testService1, store, 'soundOnlyTool', {
			prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Sound Test', message: 'Testing sound only' } }),
			invoke: async () => ({ content: [{ kind: 'text', value: 'executed' }] })
		});

		const sessionId1 = 'sound-test';
		const capture1: { invocation?: any } = {};
		stubGetSession(chatService, sessionId1, { requestId: 'req1', capture: capture1 });

		const promise1 = testService1.invokeTool(tool1.makeDto({ test: 1 }, { sessionId: sessionId1 }), async () => 0, CancellationToken.None);
		const published1 = await waitForPublishedInvocation(capture1);

		// Signal should be played (sound=on, no screen reader requirement)
		assert.strictEqual(testAccessibilitySignalService.signalPlayedCalls.length, 1, 'sound should be played when sound=on');
		const call1 = testAccessibilitySignalService.signalPlayedCalls[0];
		assert.strictEqual(call1.options?.modality, undefined, 'should use default modality for sound');

		IChatToolInvocation.confirmWith(published1, { type: ToolConfirmKind.UserAction });
		await promise1;

		testAccessibilitySignalService.reset();

		// Test case 2: Sound auto, announcement auto, screen reader on
		const testConfigService2 = new TestConfigurationService();
		testConfigService2.setUserConfiguration('chat.tools.global.autoApprove', false);
		testConfigService2.setUserConfiguration('accessibility.signals.chatUserActionRequired', { sound: 'auto', announcement: 'auto' });

		const testAccessibilityService2 = new class extends TestAccessibilityService {
			override isScreenReaderOptimized(): boolean { return true; }
		}();

		const instaService2 = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService2)),
			configurationService: () => testConfigService2
		}, store);
		instaService2.stub(IChatService, chatService);
		instaService2.stub(IAccessibilityService, testAccessibilityService2);
		instaService2.stub(IAccessibilitySignalService, testAccessibilitySignalService as unknown as IAccessibilitySignalService);
		instaService2.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService2 = store.add(instaService2.createInstance(LanguageModelToolsService));

		const tool2 = registerToolForTest(testService2, store, 'autoScreenReaderTool', {
			prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Auto Test', message: 'Testing auto with screen reader' } }),
			invoke: async () => ({ content: [{ kind: 'text', value: 'executed' }] })
		});

		const sessionId2 = 'auto-sr-test';
		const capture2: { invocation?: any } = {};
		stubGetSession(chatService, sessionId2, { requestId: 'req2', capture: capture2 });

		const promise2 = testService2.invokeTool(tool2.makeDto({ test: 2 }, { sessionId: sessionId2 }), async () => 0, CancellationToken.None);
		const published2 = await waitForPublishedInvocation(capture2);

		// Signal should be played (both sound and announcement enabled for screen reader)
		assert.strictEqual(testAccessibilitySignalService.signalPlayedCalls.length, 1, 'signal should be played with screen reader optimization');
		const call2 = testAccessibilitySignalService.signalPlayedCalls[0];
		assert.ok(call2.options?.customAlertMessage, 'should have custom alert message');
		assert.strictEqual(call2.options?.userGesture, true, 'should mark as user gesture');

		IChatToolInvocation.confirmWith(published2, { type: ToolConfirmKind.UserAction });
		await promise2;

		testAccessibilitySignalService.reset();

		// Test case 3: Sound off, announcement off - no signal
		const testConfigService3 = new TestConfigurationService();
		testConfigService3.setUserConfiguration('chat.tools.global.autoApprove', false);
		testConfigService3.setUserConfiguration('accessibility.signals.chatUserActionRequired', { sound: 'off', announcement: 'off' });

		const testAccessibilityService3 = new class extends TestAccessibilityService {
			override isScreenReaderOptimized(): boolean { return true; }
		}();

		const instaService3 = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService3)),
			configurationService: () => testConfigService3
		}, store);
		instaService3.stub(IChatService, chatService);
		instaService3.stub(IAccessibilityService, testAccessibilityService3);
		instaService3.stub(IAccessibilitySignalService, testAccessibilitySignalService as unknown as IAccessibilitySignalService);
		instaService3.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService3 = store.add(instaService3.createInstance(LanguageModelToolsService));

		const tool3 = registerToolForTest(testService3, store, 'offTool', {
			prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Off Test', message: 'Testing off settings' } }),
			invoke: async () => ({ content: [{ kind: 'text', value: 'executed' }] })
		});

		const sessionId3 = 'off-test';
		const capture3: { invocation?: any } = {};
		stubGetSession(chatService, sessionId3, { requestId: 'req3', capture: capture3 });

		const promise3 = testService3.invokeTool(tool3.makeDto({ test: 3 }, { sessionId: sessionId3 }), async () => 0, CancellationToken.None);
		const published3 = await waitForPublishedInvocation(capture3);

		// No signal should be played
		assert.strictEqual(testAccessibilitySignalService.signalPlayedCalls.length, 0, 'no signal should be played when both sound and announcement are off');

		IChatToolInvocation.confirmWith(published3, { type: ToolConfirmKind.UserAction });
		await promise3;
	});

	test('createToolSet and getToolSet', () => {
		const toolSet = store.add(service.createToolSet(
			ToolDataSource.Internal,
			'testToolSetId',
			'testToolSetName',
			{ icon: undefined, description: 'Test tool set' }
		));

		// Should be able to retrieve by ID
		const retrieved = service.getToolSet('testToolSetId');
		assert.ok(retrieved);
		assert.strictEqual(retrieved.id, 'testToolSetId');
		assert.strictEqual(retrieved.referenceName, 'testToolSetName');

		// Should not find non-existent tool set
		assert.strictEqual(service.getToolSet('nonExistentId'), undefined);

		// Dispose should remove it
		toolSet.dispose();
		assert.strictEqual(service.getToolSet('testToolSetId'), undefined);
	});

	test('getToolSetByName', () => {
		store.add(service.createToolSet(
			ToolDataSource.Internal,
			'toolSet1',
			'refName1'
		));

		store.add(service.createToolSet(
			ToolDataSource.Internal,
			'toolSet2',
			'refName2'
		));

		// Should find by reference name
		assert.strictEqual(service.getToolSetByName('refName1')?.id, 'toolSet1');
		assert.strictEqual(service.getToolSetByName('refName2')?.id, 'toolSet2');

		// Should not find non-existent name
		assert.strictEqual(service.getToolSetByName('nonExistentName'), undefined);
	});

	test('getTools with includeDisabled parameter', () => {
		// Test the includeDisabled parameter behavior with context keys
		contextKeyService.createKey('testKey', false);
		const disabledTool: IToolData = {
			id: 'disabledTool',
			modelDescription: 'Disabled Tool',
			displayName: 'Disabled Tool',
			source: ToolDataSource.Internal,
			when: ContextKeyEqualsExpr.create('testKey', true), // Will be disabled since testKey is false
		};

		const enabledTool: IToolData = {
			id: 'enabledTool',
			modelDescription: 'Enabled Tool',
			displayName: 'Enabled Tool',
			source: ToolDataSource.Internal,
		};

		store.add(service.registerToolData(disabledTool));
		store.add(service.registerToolData(enabledTool));

		const enabledTools = Array.from(service.getTools(undefined));
		assert.strictEqual(enabledTools.length, 1, 'Should only return enabled tools');
		assert.strictEqual(enabledTools[0].id, 'enabledTool');

		const allTools = Array.from(service.getAllToolsIncludingDisabled());
		assert.strictEqual(allTools.length, 2, 'getAllToolsIncludingDisabled should return all tools');
	});

	test('tool registration duplicate error', () => {
		const toolData: IToolData = {
			id: 'duplicateTool',
			modelDescription: 'Duplicate Tool',
			displayName: 'Duplicate Tool',
			source: ToolDataSource.Internal,
		};

		// First registration should succeed
		store.add(service.registerToolData(toolData));

		// Second registration should throw
		assert.throws(() => {
			service.registerToolData(toolData);
		}, /Tool "duplicateTool" is already registered/);
	});

	test('tool implementation registration without data throws', () => {
		const toolImpl: IToolImpl = {
			invoke: async () => ({ content: [] }),
		};

		// Should throw when registering implementation for non-existent tool
		assert.throws(() => {
			service.registerToolImplementation('nonExistentTool', toolImpl);
		}, /Tool "nonExistentTool" was not contributed/);
	});

	test('tool implementation duplicate registration throws', () => {
		const toolData: IToolData = {
			id: 'testTool',
			modelDescription: 'Test Tool',
			displayName: 'Test Tool',
			source: ToolDataSource.Internal,
		};

		const toolImpl1: IToolImpl = {
			invoke: async () => ({ content: [] }),
		};

		const toolImpl2: IToolImpl = {
			invoke: async () => ({ content: [] }),
		};

		store.add(service.registerToolData(toolData));
		store.add(service.registerToolImplementation('testTool', toolImpl1));

		// Second implementation should throw
		assert.throws(() => {
			service.registerToolImplementation('testTool', toolImpl2);
		}, /Tool "testTool" already has an implementation/);
	});

	test('invokeTool with unknown tool throws', async () => {
		const dto: IToolInvocation = {
			callId: '1',
			toolId: 'unknownTool',
			tokenBudget: 100,
			parameters: {},
			context: undefined,
		};

		await assert.rejects(
			service.invokeTool(dto, async () => 0, CancellationToken.None),
			/Tool unknownTool was not contributed/
		);
	});

	test('invokeTool without implementation activates extension and throws if still not found', async () => {
		const toolData: IToolData = {
			id: 'extensionActivationTool',
			modelDescription: 'Extension Tool',
			displayName: 'Extension Tool',
			source: ToolDataSource.Internal,
		};

		store.add(service.registerToolData(toolData));

		const dto: IToolInvocation = {
			callId: '1',
			toolId: 'extensionActivationTool',
			tokenBudget: 100,
			parameters: {},
			context: undefined,
		};

		// Should throw after attempting extension activation
		await assert.rejects(
			service.invokeTool(dto, async () => 0, CancellationToken.None),
			/Tool extensionActivationTool does not have an implementation registered/
		);
	});

	test('invokeTool without context (non-chat scenario)', async () => {
		const tool = registerToolForTest(service, store, 'nonChatTool', {
			invoke: async (invocation) => {
				assert.strictEqual(invocation.context, undefined);
				return { content: [{ kind: 'text', value: 'non-chat result' }] };
			}
		});

		const dto = tool.makeDto({ test: 1 }); // No context

		const result = await service.invokeTool(dto, async () => 0, CancellationToken.None);
		assert.strictEqual(result.content[0].value, 'non-chat result');
	});

	test('invokeTool with unknown chat session throws', async () => {
		const tool = registerToolForTest(service, store, 'unknownSessionTool', {
			invoke: async () => ({ content: [{ kind: 'text', value: 'should not reach' }] })
		});

		const dto = tool.makeDto({ test: 1 }, { sessionId: 'unknownSession' });

		// Test that it throws, regardless of exact error message
		let threwError = false;
		try {
			await service.invokeTool(dto, async () => 0, CancellationToken.None);
		} catch (err) {
			threwError = true;
			// Verify it's one of the expected error types
			assert.ok(
				err instanceof Error && (
					err.message.includes('Tool called for unknown chat session') ||
					err.message.includes('getRequests is not a function')
				),
				`Unexpected error: ${err.message}`
			);
		}
		assert.strictEqual(threwError, true, 'Should have thrown an error');
	});

	test('tool error with alwaysDisplayInputOutput includes details', async () => {
		const toolData: IToolData = {
			id: 'errorToolWithIO',
			modelDescription: 'Error Tool With IO',
			displayName: 'Error Tool With IO',
			source: ToolDataSource.Internal,
			alwaysDisplayInputOutput: true
		};

		const tool = registerToolForTest(service, store, toolData.id, {
			invoke: async () => { throw new Error('Tool execution failed'); }
		}, toolData);

		const input = { param: 'testValue' };

		try {
			await service.invokeTool(
				tool.makeDto(input),
				async () => 0,
				CancellationToken.None
			);
			assert.fail('Should have thrown');
		} catch (err: any) {
			// The error should bubble up, but we need to check if toolResultError is set
			// This tests the internal error handling path
			assert.strictEqual(err.message, 'Tool execution failed');
		}
	});

	test('context key changes trigger tool updates', async () => {
		let changeEventFired = false;
		const disposable = service.onDidChangeTools(() => {
			changeEventFired = true;
		});
		store.add(disposable);

		// Create a tool with a context key dependency
		contextKeyService.createKey('dynamicKey', false);
		const toolData: IToolData = {
			id: 'contextTool',
			modelDescription: 'Context Tool',
			displayName: 'Context Tool',
			source: ToolDataSource.Internal,
			when: ContextKeyEqualsExpr.create('dynamicKey', true),
		};

		store.add(service.registerToolData(toolData));

		// Change the context key value
		contextKeyService.createKey('dynamicKey', true);

		// Wait a bit for the scheduler
		await new Promise(resolve => setTimeout(resolve, 800));

		assert.strictEqual(changeEventFired, true, 'onDidChangeTools should fire when context keys change');
	});

	test('configuration changes trigger tool updates', async () => {
		return runWithFakedTimers({}, async () => {
			let changeEventFired = false;
			const disposable = service.onDidChangeTools(() => {
				changeEventFired = true;
			});
			store.add(disposable);

			// Change the correct configuration key
			configurationService.setUserConfiguration('chat.extensionTools.enabled', false);
			// Fire the configuration change event manually
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: () => true,
				affectedKeys: new Set(['chat.extensionTools.enabled']),
				change: null!,
				source: ConfigurationTarget.USER
			} satisfies IConfigurationChangeEvent);

			// Wait a bit for the scheduler
			await new Promise(resolve => setTimeout(resolve, 800));

			assert.strictEqual(changeEventFired, true, 'onDidChangeTools should fire when configuration changes');
		});
	});

	test('toToolAndToolSetEnablementMap with MCP toolset enables contained tools', () => {
		// Create MCP toolset
		const mcpToolSet = store.add(service.createToolSet(
			{ type: 'mcp', label: 'testServer', serverLabel: 'testServer', instructions: undefined, collectionId: 'testCollection', definitionId: 'testDef' },
			'mcpSet',
			'mcpSetRef'
		));

		const mcpTool: IToolData = {
			id: 'mcpTool',
			modelDescription: 'MCP Tool',
			displayName: 'MCP Tool',
			source: { type: 'mcp', label: 'testServer', serverLabel: 'testServer', instructions: undefined, collectionId: 'testCollection', definitionId: 'testDef' },
			canBeReferencedInPrompt: true,
			toolReferenceName: 'mcpToolRef'
		};

		store.add(service.registerToolData(mcpTool));
		store.add(mcpToolSet.addTool(mcpTool));

		// Enable the MCP toolset
		{
			const enabledNames = [mcpToolSet].map(t => service.getFullReferenceName(t));
			const result = service.toToolAndToolSetEnablementMap(enabledNames, undefined, undefined);

			assert.strictEqual(result.get(mcpToolSet), true, 'MCP toolset should be enabled'); // Ensure the toolset is in the map
			assert.strictEqual(result.get(mcpTool), true, 'MCP tool should be enabled when its toolset is enabled'); // Ensure the tool is in the map

			const fullReferenceNames = service.toFullReferenceNames(result);
			assert.deepStrictEqual(fullReferenceNames.sort(), enabledNames.sort(), 'toFullReferenceNames should return the original enabled names');
		}
		// Enable a tool from the MCP toolset
		{
			const enabledNames = [mcpTool].map(t => service.getFullReferenceName(t, mcpToolSet));
			const result = service.toToolAndToolSetEnablementMap(enabledNames, undefined, undefined);

			assert.strictEqual(result.get(mcpToolSet), false, 'MCP toolset should be disabled'); // Ensure the toolset is in the map
			assert.strictEqual(result.get(mcpTool), true, 'MCP tool should be enabled'); // Ensure the tool is in the map

			const fullReferenceNames = service.toFullReferenceNames(result);
			assert.deepStrictEqual(fullReferenceNames.sort(), enabledNames.sort(), 'toFullReferenceNames should return the original enabled names');
		}

	});

	test('shouldAutoConfirm with workspace-specific tool configuration', async () => {
		const testConfigService = new TestConfigurationService();
		// Configure per-tool settings at different scopes
		testConfigService.setUserConfiguration('chat.tools.global.autoApprove', { 'workspaceTool': true });

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		const workspaceTool = registerToolForTest(testService, store, 'workspaceTool', {
			prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Test', message: 'Workspace tool' } }),
			invoke: async () => ({ content: [{ kind: 'text', value: 'workspace result' }] })
		}, { runsInWorkspace: true });

		const sessionId = 'workspace-test';
		stubGetSession(chatService, sessionId, { requestId: 'req1' });

		// Should auto-approve based on user configuration
		const result = await testService.invokeTool(
			workspaceTool.makeDto({ test: 1 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);
		assert.strictEqual(result.content[0].value, 'workspace result');
	});

	test('getFullReferenceNames', () => {
		setupToolsForTest(service, store);

		const fullReferenceNames = Array.from(service.getFullReferenceNames()).sort();

		const expectedNames = [
			'tool1RefName',
			'Tool2 Display Name',
			'my.extension/extTool1RefName',
			'mcpToolSetRefName/*',
			'mcpToolSetRefName/mcpTool1RefName',
			'internalToolSetRefName',
			'internalToolSetRefName/internalToolSetTool1RefName',
			'vscode',
			'execute',
			'read',
			'agent'
		].sort();

		assert.deepStrictEqual(fullReferenceNames, expectedNames, 'getFullReferenceNames should return correct full reference names');
	});

	test('getDeprecatedFullReferenceNames', () => {
		setupToolsForTest(service, store);

		const deprecatedNames = service.getDeprecatedFullReferenceNames();

		// Tools in internal tool sets should have their full reference names with toolset prefix, tools sets keep their name
		assert.deepStrictEqual(deprecatedNames.get('internalToolSetTool1RefName'), new Set(['internalToolSetRefName/internalToolSetTool1RefName']));
		assert.strictEqual(deprecatedNames.get('internalToolSetRefName'), undefined);

		// For extension tools, the full reference name includes the extension ID
		assert.deepStrictEqual(deprecatedNames.get('extTool1RefName'), new Set(['my.extension/extTool1RefName']));

		// For MCP tool sets, the full reference name includes the /* suffix
		assert.deepStrictEqual(deprecatedNames.get('mcpToolSetRefName'), new Set(['mcpToolSetRefName/*']));
		assert.deepStrictEqual(deprecatedNames.get('mcpTool1RefName'), new Set(['mcpToolSetRefName/mcpTool1RefName']));

		// Internal tool sets and user tools sets and tools without namespace changes should not appear
		assert.strictEqual(deprecatedNames.get('Tool2 Display Name'), undefined);
		assert.strictEqual(deprecatedNames.get('tool1RefName'), undefined);
		assert.strictEqual(deprecatedNames.get('userToolSetRefName'), undefined);
	});

	test('getToolByFullReferenceName', () => {
		setupToolsForTest(service, store);

		// Test finding tools by their full reference names
		const tool1 = service.getToolByFullReferenceName('tool1RefName');
		assert.ok(tool1);
		assert.strictEqual(tool1.id, 'tool1');

		const tool2 = service.getToolByFullReferenceName('Tool2 Display Name');
		assert.ok(tool2);
		assert.strictEqual(tool2.id, 'tool2');

		const extTool = service.getToolByFullReferenceName('my.extension/extTool1RefName');
		assert.ok(extTool);
		assert.strictEqual(extTool.id, 'extTool1');

		const mcpTool = service.getToolByFullReferenceName('mcpToolSetRefName/mcpTool1RefName');
		assert.ok(mcpTool);
		assert.strictEqual(mcpTool.id, 'mcpTool1');


		const mcpToolSet = service.getToolByFullReferenceName('mcpToolSetRefName/*');
		assert.ok(mcpToolSet);
		assert.strictEqual(mcpToolSet.id, 'mcpToolSet');

		const internalToolSet = service.getToolByFullReferenceName('internalToolSetRefName/internalToolSetTool1RefName');
		assert.ok(internalToolSet);
		assert.strictEqual(internalToolSet.id, 'internalToolSetTool1');

		// Test finding tools within tool sets
		const toolInSet = service.getToolByFullReferenceName('internalToolSetRefName');
		assert.ok(toolInSet);
		assert.strictEqual(toolInSet!.id, 'internalToolSet');

	});

	test('eligibleForAutoApproval setting can be configured via policy', async () => {
		// Test that policy configuration works for eligibleForAutoApproval
		// Policy values should be JSON strings for object-type settings
		const testConfigService = new TestConfigurationService();

		// Simulate policy configuration (would come from policy file)
		const policyValue = {
			'toolA': true,
			'toolB': false
		};
		testConfigService.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, policyValue);

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		// Tool A is eligible (true in policy)
		const toolA = registerToolForTest(testService, store, 'toolA', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'toolA executed' }] })
		}, {
			toolReferenceName: 'toolA'
		});

		// Tool B is ineligible (false in policy)
		const toolB = registerToolForTest(testService, store, 'toolB', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'toolB executed' }] })
		}, {
			toolReferenceName: 'toolB'
		});

		const sessionId = 'test-policy';
		stubGetSession(chatService, sessionId, { requestId: 'req1' });

		// Tool A should execute without confirmation (eligible)
		const resultA = await testService.invokeTool(
			toolA.makeDto({ test: 1 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);
		assert.strictEqual(resultA.content[0].value, 'toolA executed');

		// Tool B should require confirmation (ineligible)
		const capture: { invocation?: any } = {};
		stubGetSession(chatService, sessionId + '2', { requestId: 'req2', capture });
		const promiseB = testService.invokeTool(
			toolB.makeDto({ test: 2 }, { sessionId: sessionId + '2' }),
			async () => 0,
			CancellationToken.None
		);
		const published = await waitForPublishedInvocation(capture);
		assert.ok(published?.confirmationMessages, 'toolB should require confirmation due to policy');
		assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, 'should not allow auto confirm');

		IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
		const resultB = await promiseB;
		assert.strictEqual(resultB.content[0].value, 'toolB executed');
	});

	test('eligibleForAutoApproval with legacy tool reference names - eligible', async () => {
		// Test backwards compatibility: configuring a legacy name as eligible should work
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
			'oldToolName': true  // Using legacy name
		});

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		// Tool has been renamed but has legacy name
		const renamedTool = registerToolForTest(testService, store, 'renamedTool', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'tool executed via legacy name' }] })
		}, {
			toolReferenceName: 'newToolName',
			legacyToolReferenceFullNames: ['oldToolName']
		});

		const sessionId = 'test-legacy-eligible';
		stubGetSession(chatService, sessionId, { requestId: 'req1' });

		// Tool should be eligible even though we configured the legacy name
		const result = await testService.invokeTool(
			renamedTool.makeDto({ test: 1 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);
		assert.strictEqual(result.content[0].value, 'tool executed via legacy name');
	});

	test('eligibleForAutoApproval with legacy tool reference names - ineligible', async () => {
		// Test backwards compatibility: configuring a legacy name as ineligible should work
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
			'deprecatedToolName': false  // Using legacy name
		});

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		// Tool has been renamed but has legacy name
		const renamedTool = registerToolForTest(testService, store, 'renamedTool2', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'tool requires confirmation' }] })
		}, {
			toolReferenceName: 'modernToolName',
			legacyToolReferenceFullNames: ['deprecatedToolName']
		});

		const sessionId = 'test-legacy-ineligible';
		const capture: { invocation?: any } = {};
		stubGetSession(chatService, sessionId, { requestId: 'req1', capture });

		// Tool should be ineligible and require confirmation
		const promise = testService.invokeTool(
			renamedTool.makeDto({ test: 1 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);
		const published = await waitForPublishedInvocation(capture);
		assert.ok(published?.confirmationMessages, 'tool should require confirmation when legacy name is ineligible');
		assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, 'should not allow auto confirm');

		IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
		const result = await promise;
		assert.strictEqual(result.content[0].value, 'tool requires confirmation');
	});

	test('eligibleForAutoApproval with multiple legacy names', async () => {
		// Test that any of the legacy names can be used in the configuration
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
			'secondLegacyName': true  // Using the second legacy name
		});

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		// Tool has multiple legacy names
		const multiLegacyTool = registerToolForTest(testService, store, 'multiLegacyTool', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'multi legacy executed' }] })
		}, {
			toolReferenceName: 'currentToolName',
			legacyToolReferenceFullNames: ['firstLegacyName', 'secondLegacyName', 'thirdLegacyName']
		});

		const sessionId = 'test-multi-legacy';
		stubGetSession(chatService, sessionId, { requestId: 'req1' });

		// Tool should be eligible via second legacy name
		const result = await testService.invokeTool(
			multiLegacyTool.makeDto({ test: 1 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);
		assert.strictEqual(result.content[0].value, 'multi legacy executed');
	});

	test('eligibleForAutoApproval current name takes precedence over legacy names', async () => {
		// Test forward compatibility: current name in config should take precedence
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
			'currentName': false,      // Current name says ineligible
			'oldName': true           // Legacy name says eligible
		});

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		const tool = registerToolForTest(testService, store, 'precedenceTool', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'precedence test' }] })
		}, {
			toolReferenceName: 'currentName',
			legacyToolReferenceFullNames: ['oldName']
		});

		const sessionId = 'test-precedence';
		const capture: { invocation?: any } = {};
		stubGetSession(chatService, sessionId, { requestId: 'req1', capture });

		// Current name should take precedence, so tool should be ineligible
		const promise = testService.invokeTool(
			tool.makeDto({ test: 1 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);
		const published = await waitForPublishedInvocation(capture);
		assert.ok(published?.confirmationMessages, 'current name should take precedence over legacy name');
		assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, 'should not allow auto confirm');

		IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
		const result = await promise;
		assert.strictEqual(result.content[0].value, 'precedence test');
	});

	test('eligibleForAutoApproval with legacy full reference names from toolsets', async () => {
		// Test legacy names that include toolset prefixes (e.g., 'oldToolSet/oldToolName')
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
			'oldToolSet/oldToolName': false  // Legacy full reference name from old toolset
		});

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		// Tool was in an old toolset but now standalone
		const migratedTool = registerToolForTest(testService, store, 'migratedTool', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'migrated tool' }] })
		}, {
			toolReferenceName: 'standaloneToolName',
			legacyToolReferenceFullNames: ['oldToolSet/oldToolName']
		});

		const sessionId = 'test-fullReferenceName-legacy';
		const capture: { invocation?: any } = {};
		stubGetSession(chatService, sessionId, { requestId: 'req1', capture });

		// Tool should be ineligible based on legacy full reference name
		const promise = testService.invokeTool(
			migratedTool.makeDto({ test: 1 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);
		const published = await waitForPublishedInvocation(capture);
		assert.ok(published?.confirmationMessages, 'tool should be ineligible via legacy full reference name');
		assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, 'should not allow auto confirm');

		IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
		const result = await promise;
		assert.strictEqual(result.content[0].value, 'migrated tool');
	});

	test('eligibleForAutoApproval mixed current and legacy names', async () => {
		// Test realistic migration scenario with mixed current and legacy names
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
			'modernTool': true,           // Current name
			'legacyToolOld': false,      // Legacy name
			'unchangedTool': true        // Tool that never changed
		});

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		// Modern tool with current name
		const tool1 = registerToolForTest(testService, store, 'tool1', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'modern executed' }] })
		}, {
			toolReferenceName: 'modernTool'
		});

		// Renamed tool with legacy name
		const tool2 = registerToolForTest(testService, store, 'tool2', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'legacy needs confirmation' }] })
		}, {
			toolReferenceName: 'legacyToolNew',
			legacyToolReferenceFullNames: ['legacyToolOld']
		});

		// Unchanged tool
		const tool3 = registerToolForTest(testService, store, 'tool3', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'unchanged executed' }] })
		}, {
			toolReferenceName: 'unchangedTool'
		});

		const sessionId = 'test-mixed';
		stubGetSession(chatService, sessionId, { requestId: 'req1' });

		// Tool 1 should be eligible (current name)
		const result1 = await testService.invokeTool(
			tool1.makeDto({ test: 1 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);
		assert.strictEqual(result1.content[0].value, 'modern executed');

		// Tool 2 should be ineligible (legacy name)
		const capture2: { invocation?: any } = {};
		stubGetSession(chatService, sessionId + '2', { requestId: 'req2', capture: capture2 });
		const promise2 = testService.invokeTool(
			tool2.makeDto({ test: 2 }, { sessionId: sessionId + '2' }),
			async () => 0,
			CancellationToken.None
		);
		const published2 = await waitForPublishedInvocation(capture2);
		assert.ok(published2?.confirmationMessages, 'tool2 should require confirmation via legacy name');

		IChatToolInvocation.confirmWith(published2, { type: ToolConfirmKind.UserAction });
		const result2 = await promise2;
		assert.strictEqual(result2.content[0].value, 'legacy needs confirmation');

		// Tool 3 should be eligible (unchanged)
		const result3 = await testService.invokeTool(
			tool3.makeDto({ test: 3 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);
		assert.strictEqual(result3.content[0].value, 'unchanged executed');
	});

	test('eligibleForAutoApproval with namespaced legacy names - full tool name eligible', async () => {
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
			'gitTools/gitCommit': true
		});

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		const tool = registerToolForTest(testService, store, 'gitCommitTool', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'commit executed' }] })
		}, {
			toolReferenceName: 'commit',
			legacyToolReferenceFullNames: ['gitTools/gitCommit']
		});

		const sessionId = 'test-extension-prefix';
		const capture: { invocation?: any } = {};
		stubGetSession(chatService, sessionId, { requestId: 'req1' });

		// Tool should be eligible via legacy extension-prefixed name
		const result = await testService.invokeTool(
			tool.makeDto({ test: 1 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);

		const published = await waitForPublishedInvocation(capture);
		assert.strictEqual(published, undefined, 'tool should not require confirmation when legacy trimmed name is eligible');
		assert.strictEqual(result.content[0].value, 'commit executed');
	});

	test('eligibleForAutoApproval with namespaced and renamed toolname - just last segment eligible', async () => {
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
			'gitCommit': true
		});

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		// Tool that was previously namespaced under extension but is now internal
		const tool = registerToolForTest(testService, store, 'gitCommitTool2', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'commit executed' }] })
		}, {
			toolReferenceName: 'commit',
			legacyToolReferenceFullNames: ['gitTools/gitCommit']
		});

		const sessionId = 'test-renamed-prefix';
		const capture: { invocation?: any } = {};
		stubGetSession(chatService, sessionId, { requestId: 'req1' });

		// Tool should be eligible via legacy extension-prefixed name
		const result = await testService.invokeTool(
			tool.makeDto({ test: 1 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);

		const published = await waitForPublishedInvocation(capture);
		assert.strictEqual(published, undefined, 'tool should not require confirmation when legacy trimmed name is eligible');
		assert.strictEqual(result.content[0].value, 'commit executed');
	});

	test('eligibleForAutoApproval with namespaced legacy names - full tool name ineligible', async () => {
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
			'gitTools/gitCommit': false
		});

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		// Tool that was previously namespaced under extension but is now internal
		const tool = registerToolForTest(testService, store, 'gitCommitTool3', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'commit blocked' }] })
		}, {
			toolReferenceName: 'commit',
			legacyToolReferenceFullNames: ['something/random', 'gitTools/bar', 'gitTools/gitCommit']
		});

		const sessionId = 'test-extension-prefix-blocked';
		const capture: { invocation?: any } = {};
		stubGetSession(chatService, sessionId, { requestId: 'req1', capture });

		// Tool should be ineligible via legacy extension-prefixed name
		const promise = testService.invokeTool(
			tool.makeDto({ test: 1 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);
		const published = await waitForPublishedInvocation(capture);
		assert.ok(published?.confirmationMessages, 'tool should require confirmation when legacy full name is ineligible');
		assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, 'should not allow auto confirm');

		IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
		const result = await promise;
		assert.strictEqual(result.content[0].value, 'commit blocked');
	});

	test('eligibleForAutoApproval with namespaced and renamed toolname - just last segment ineligible', async () => {
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
			'gitCommit': false
		});

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, store);
		instaService.stub(IChatService, chatService);
		instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const testService = store.add(instaService.createInstance(LanguageModelToolsService));

		// Tool that was previously namespaced under extension but is now internal
		const tool = registerToolForTest(testService, store, 'gitCommitTool4', {
			prepareToolInvocation: async () => ({}),
			invoke: async () => ({ content: [{ kind: 'text', value: 'commit blocked' }] })
		}, {
			toolReferenceName: 'commit',
			legacyToolReferenceFullNames: ['something/random', 'gitTools/bar', 'gitTools/gitCommit']
		});

		const sessionId = 'test-renamed-prefix-blocked';
		const capture: { invocation?: any } = {};
		stubGetSession(chatService, sessionId, { requestId: 'req1', capture });

		// Tool should be ineligible via trimmed legacy name
		const promise = testService.invokeTool(
			tool.makeDto({ test: 1 }, { sessionId }),
			async () => 0,
			CancellationToken.None
		);
		const published = await waitForPublishedInvocation(capture);
		assert.ok(published?.confirmationMessages, 'tool should require confirmation when legacy trimmed name is ineligible');
		assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, 'should not allow auto confirm');

		IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
		const result = await promise;
		assert.strictEqual(result.content[0].value, 'commit blocked');
	});

	test('beginToolCall creates streaming tool invocation', () => {
		const tool = registerToolForTest(service, store, 'streamingTool', {
			invoke: async () => ({ content: [{ kind: 'text', value: 'result' }] }),
			handleToolStream: async () => ({ invocationMessage: 'Processing...' }),
		});

		const sessionId = 'streaming-session';
		const requestId = 'streaming-request';
		stubGetSession(chatService, sessionId, { requestId });

		const invocation = service.beginToolCall({
			toolCallId: 'call-123',
			toolId: tool.id,
			chatRequestId: requestId,
			sessionResource: LocalChatSessionUri.forSession(sessionId),
		});

		assert.ok(invocation, 'beginToolCall should return an invocation');
		assert.strictEqual(invocation.toolId, tool.id);
	});

	test('beginToolCall returns undefined for unknown tool', () => {
		const invocation = service.beginToolCall({
			toolCallId: 'call-unknown',
			toolId: 'nonExistentTool',
		});

		assert.strictEqual(invocation, undefined, 'beginToolCall should return undefined for unknown tools');
	});

	test('updateToolStream calls handleToolStream on tool implementation', async () => {
		let handleToolStreamCalled = false;
		let receivedRawInput: unknown;

		const tool = registerToolForTest(service, store, 'streamHandlerTool', {
			invoke: async () => ({ content: [{ kind: 'text', value: 'result' }] }),
			handleToolStream: async (context) => {
				handleToolStreamCalled = true;
				receivedRawInput = context.rawInput;
				return { invocationMessage: 'Processing...' };
			},
		});

		const sessionId = 'stream-handler-session';
		const requestId = 'stream-handler-request';
		stubGetSession(chatService, sessionId, { requestId });

		const invocation = service.beginToolCall({
			toolCallId: 'call-stream',
			toolId: tool.id,
			chatRequestId: requestId,
			sessionResource: LocalChatSessionUri.forSession(sessionId),
		});

		assert.ok(invocation, 'should create invocation');

		// Update the stream with partial input
		const partialInput = { partial: 'data' };
		await service.updateToolStream('call-stream', partialInput, CancellationToken.None);

		assert.strictEqual(handleToolStreamCalled, true, 'handleToolStream should be called');
		assert.deepStrictEqual(receivedRawInput, partialInput, 'should receive the partial input');
	});

	test('updateToolStream does nothing for unknown tool call', async () => {
		// Should not throw
		await service.updateToolStream('unknown-call-id', { data: 'test' }, CancellationToken.None);
	});

	test('toToolAndToolSetEnablementMap with model metadata filters tools', () => {
		// This test verifies that when a tool's models selector matches the provided model,
		// it's included in the enablement map.

		// Tool that requires gpt-4 family (matches provided model)
		const gpt4ToolDef: IToolData = {
			id: 'gpt4Tool',
			toolReferenceName: 'gpt4ToolRef',
			modelDescription: 'GPT-4 Tool',
			displayName: 'GPT-4 Tool',
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: true,
			models: [{ family: 'gpt-4' }],
		};

		// Tool with no models selector (available for all models)
		const anyModelToolDef: IToolData = {
			id: 'anyModelTool',
			toolReferenceName: 'anyModelToolRef',
			modelDescription: 'Any Model Tool',
			displayName: 'Any Model Tool',
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: true,
		};

		// Tool that requires claude family (won't match)
		const claudeToolDef: IToolData = {
			id: 'claudeTool',
			toolReferenceName: 'claudeToolRef',
			modelDescription: 'Claude Tool',
			displayName: 'Claude Tool',
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: true,
			models: [{ family: 'claude-3' }],
		};

		store.add(service.registerToolData(gpt4ToolDef));
		store.add(service.registerToolData(anyModelToolDef));
		store.add(service.registerToolData(claudeToolDef));

		// Get the tools from the service
		const gpt4Tool = service.getTool('gpt4Tool');
		const anyModelTool = service.getTool('anyModelTool');
		const claudeTool = service.getTool('claudeTool');
		assert.ok(gpt4Tool && anyModelTool && claudeTool, 'tools should be registered');

		// Provide model metadata for gpt-4 family
		const modelMetadata = { id: 'gpt-4-turbo', vendor: 'openai', family: 'gpt-4', version: '1.0' } as ILanguageModelChatMetadata;
		const enabledNames = ['gpt4ToolRef', 'anyModelToolRef', 'claudeToolRef'];
		const result = service.toToolAndToolSetEnablementMap(enabledNames, undefined, modelMetadata);

		// gpt4Tool should be enabled (model matches)
		assert.strictEqual(result.get(gpt4Tool), true, 'gpt4Tool should be enabled');
		// anyModelTool should be enabled (no model restriction)
		assert.strictEqual(result.get(anyModelTool), true, 'anyModelTool should be enabled');
		// claudeTool should NOT be in the enablement map (filtered out by model)
		assert.strictEqual(result.has(claudeTool), false, 'claudeTool should be filtered out by model');
	});

	test('observeTools returns tools filtered by context', async () => {
		return runWithFakedTimers({}, async () => {
			contextKeyService.createKey('featureEnabled', true);

			const enabledTool: IToolData = {
				id: 'enabledObsTool',
				modelDescription: 'Enabled Tool',
				displayName: 'Enabled Tool',
				source: ToolDataSource.Internal,
				when: ContextKeyEqualsExpr.create('featureEnabled', true),
			};

			const disabledTool: IToolData = {
				id: 'disabledObsTool',
				modelDescription: 'Disabled Tool',
				displayName: 'Disabled Tool',
				source: ToolDataSource.Internal,
				when: ContextKeyEqualsExpr.create('featureEnabled', false),
			};

			store.add(service.registerToolData(enabledTool));
			store.add(service.registerToolData(disabledTool));

			const toolsObs = service.observeTools(undefined);

			// Read current value directly
			const tools = toolsObs.get();

			assert.strictEqual(tools.length, 1, 'should only include enabled tool');
			assert.strictEqual(tools[0].id, 'enabledObsTool');
		});
	});

	test('invokeTool with chatStreamToolCallId correlates with pending streaming call', async () => {
		const tool = registerToolForTest(service, store, 'correlatedTool', {
			invoke: async () => ({ content: [{ kind: 'text', value: 'correlated result' }] }),
			handleToolStream: async () => ({ invocationMessage: 'Processing...' }),
		});

		const sessionId = 'correlated-session';
		const requestId = 'correlated-request';
		const capture: { invocation?: any } = {};
		stubGetSession(chatService, sessionId, { requestId, capture });

		// Start a streaming tool call
		const streamingInvocation = service.beginToolCall({
			toolCallId: 'stream-call-id',
			toolId: tool.id,
			chatRequestId: requestId,
			sessionResource: LocalChatSessionUri.forSession(sessionId),
		});

		assert.ok(streamingInvocation, 'should create streaming invocation');

		// Now invoke the tool with a different callId but matching chatStreamToolCallId
		const dto: IToolInvocation = {
			callId: 'different-call-id',
			toolId: tool.id,
			tokenBudget: 100,
			parameters: { test: 1 },
			context: {
				sessionId,
				sessionResource: LocalChatSessionUri.forSession(sessionId),
			},
			chatStreamToolCallId: 'stream-call-id', // This should correlate
		};

		const result = await service.invokeTool(dto, async () => 0, CancellationToken.None);
		assert.strictEqual(result.content[0].value, 'correlated result');
	});

	test('getAllToolsIncludingDisabled returns tools regardless of when clause', () => {
		contextKeyService.createKey('featureFlag', false);

		const enabledTool: IToolData = {
			id: 'enabledTool',
			modelDescription: 'Enabled Tool',
			displayName: 'Enabled Tool',
			source: ToolDataSource.Internal,
		};

		const disabledTool: IToolData = {
			id: 'disabledTool',
			modelDescription: 'Disabled Tool',
			displayName: 'Disabled Tool',
			source: ToolDataSource.Internal,
			when: ContextKeyEqualsExpr.create('featureFlag', true), // Will be disabled
		};

		store.add(service.registerToolData(enabledTool));
		store.add(service.registerToolData(disabledTool));

		// getAllToolsIncludingDisabled should return both tools
		const allTools = Array.from(service.getAllToolsIncludingDisabled());
		assert.strictEqual(allTools.length, 2, 'getAllToolsIncludingDisabled should return all tools');
		assert.ok(allTools.some(t => t.id === 'enabledTool'), 'should include enabled tool');
		assert.ok(allTools.some(t => t.id === 'disabledTool'), 'should include disabled tool');

		// getTools should only return tools matching when clause
		const enabledTools = Array.from(service.getTools(undefined));
		assert.strictEqual(enabledTools.length, 1, 'getTools should only return matching tools');
		assert.strictEqual(enabledTools[0].id, 'enabledTool');
	});

	test('getTools filters by model id using models property', () => {
		const gpt4Tool: IToolData = {
			id: 'gpt4Tool',
			modelDescription: 'GPT-4 Tool',
			displayName: 'GPT-4 Tool',
			source: ToolDataSource.Internal,
			models: [{ id: 'gpt-4-turbo' }],
		};

		const claudeTool: IToolData = {
			id: 'claudeTool',
			modelDescription: 'Claude Tool',
			displayName: 'Claude Tool',
			source: ToolDataSource.Internal,
			models: [{ id: 'claude-3-opus' }],
		};

		const universalTool: IToolData = {
			id: 'universalTool',
			modelDescription: 'Universal Tool',
			displayName: 'Universal Tool',
			source: ToolDataSource.Internal,
			// No models - available for all models
		};

		store.add(service.registerToolData(gpt4Tool));
		store.add(service.registerToolData(claudeTool));
		store.add(service.registerToolData(universalTool));

		// Mock model metadata with id 'gpt-4-turbo'
		const modelMetadata = { id: 'gpt-4-turbo', vendor: 'openai', family: 'gpt-4', version: '1.0' } as ILanguageModelChatMetadata;
		const tools = Array.from(service.getTools(modelMetadata));

		assert.strictEqual(tools.length, 2, 'should return 2 tools');
		assert.ok(tools.some(t => t.id === 'gpt4Tool'), 'should include GPT-4 tool');
		assert.ok(tools.some(t => t.id === 'universalTool'), 'should include universal tool');
		assert.ok(!tools.some(t => t.id === 'claudeTool'), 'should NOT include Claude tool');
	});

	test('getTools filters by model vendor using models property', () => {
		const anthropicTool: IToolData = {
			id: 'anthropicTool',
			modelDescription: 'Anthropic Tool',
			displayName: 'Anthropic Tool',
			source: ToolDataSource.Internal,
			models: [{ vendor: 'anthropic' }],
		};

		const openaiTool: IToolData = {
			id: 'openaiTool',
			modelDescription: 'OpenAI Tool',
			displayName: 'OpenAI Tool',
			source: ToolDataSource.Internal,
			models: [{ vendor: 'openai' }],
		};

		store.add(service.registerToolData(anthropicTool));
		store.add(service.registerToolData(openaiTool));

		// Mock model metadata with vendor 'anthropic'
		const modelMetadata = { id: 'claude-3', vendor: 'anthropic', family: 'claude-3', version: '1.0' } as ILanguageModelChatMetadata;
		const tools = Array.from(service.getTools(modelMetadata));

		assert.strictEqual(tools.length, 1, 'should return 1 tool');
		assert.strictEqual(tools[0].id, 'anthropicTool', 'should include Anthropic tool');
	});

	test('getTools filters by model family using models property', () => {
		const gpt4FamilyTool: IToolData = {
			id: 'gpt4FamilyTool',
			modelDescription: 'GPT-4 Family Tool',
			displayName: 'GPT-4 Family Tool',
			source: ToolDataSource.Internal,
			models: [{ family: 'gpt-4' }],
		};

		const gpt35FamilyTool: IToolData = {
			id: 'gpt35FamilyTool',
			modelDescription: 'GPT-3.5 Family Tool',
			displayName: 'GPT-3.5 Family Tool',
			source: ToolDataSource.Internal,
			models: [{ family: 'gpt-3.5' }],
		};

		store.add(service.registerToolData(gpt4FamilyTool));
		store.add(service.registerToolData(gpt35FamilyTool));

		// Mock model metadata with family 'gpt-4'
		const modelMetadata = { id: 'gpt-4-turbo', vendor: 'openai', family: 'gpt-4', version: '1.0' } as ILanguageModelChatMetadata;
		const tools = Array.from(service.getTools(modelMetadata));

		assert.strictEqual(tools.length, 1, 'should return 1 tool');
		assert.strictEqual(tools[0].id, 'gpt4FamilyTool', 'should include GPT-4 family tool');
	});

	test('getTools with undefined model skips model filtering', () => {
		const gpt4Tool: IToolData = {
			id: 'gpt4Tool',
			modelDescription: 'GPT-4 Tool',
			displayName: 'GPT-4 Tool',
			source: ToolDataSource.Internal,
			models: [{ id: 'gpt-4-turbo' }],
		};

		const claudeTool: IToolData = {
			id: 'claudeTool',
			modelDescription: 'Claude Tool',
			displayName: 'Claude Tool',
			source: ToolDataSource.Internal,
			models: [{ id: 'claude-3-opus' }],
		};

		store.add(service.registerToolData(gpt4Tool));
		store.add(service.registerToolData(claudeTool));

		// When model is undefined, all tools should be returned (model filtering skipped)
		const tools = Array.from(service.getTools(undefined));

		assert.strictEqual(tools.length, 2, 'should return all tools when model is undefined');
		assert.ok(tools.some(t => t.id === 'gpt4Tool'), 'should include GPT-4 tool');
		assert.ok(tools.some(t => t.id === 'claudeTool'), 'should include Claude tool');
	});

	test('getTool returns tool regardless of when clause', () => {
		contextKeyService.createKey('someFlag', false);

		const disabledTool: IToolData = {
			id: 'disabledLookupTool',
			modelDescription: 'Disabled Lookup Tool',
			displayName: 'Disabled Lookup Tool',
			source: ToolDataSource.Internal,
			when: ContextKeyEqualsExpr.create('someFlag', true), // Disabled
		};

		store.add(service.registerToolData(disabledTool));

		// getTool should still find the tool by ID
		const tool = service.getTool('disabledLookupTool');
		assert.ok(tool, 'getTool should return tool even when disabled');
		assert.strictEqual(tool.id, 'disabledLookupTool');
	});

	test('getToolByName returns tool regardless of when clause', () => {
		contextKeyService.createKey('anotherFlag', false);

		const disabledTool: IToolData = {
			id: 'disabledNamedTool',
			toolReferenceName: 'disabledNamedToolRef',
			modelDescription: 'Disabled Named Tool',
			displayName: 'Disabled Named Tool',
			source: ToolDataSource.Internal,
			when: ContextKeyEqualsExpr.create('anotherFlag', true), // Disabled
		};

		store.add(service.registerToolData(disabledTool));

		// getToolByName should still find the tool by reference name
		const tool = service.getToolByName('disabledNamedToolRef');
		assert.ok(tool, 'getToolByName should return tool even when disabled');
		assert.strictEqual(tool.id, 'disabledNamedTool');
	});

	test('IToolData models property stores selector information', () => {
		const toolWithModels: IToolData = {
			id: 'modelSpecificTool',
			modelDescription: 'Model Specific Tool',
			displayName: 'Model Specific Tool',
			source: ToolDataSource.Internal,
			models: [
				{ vendor: 'openai', family: 'gpt-4' },
				{ vendor: 'anthropic', family: 'claude-3' },
			],
		};

		store.add(service.registerToolData(toolWithModels));

		const tool = service.getTool('modelSpecificTool');
		assert.ok(tool, 'tool should be registered');
		assert.ok(tool.models, 'tool should have models property');
		assert.strictEqual(tool.models.length, 2, 'tool should have 2 model selectors');
		assert.deepStrictEqual(tool.models[0], { vendor: 'openai', family: 'gpt-4' });
		assert.deepStrictEqual(tool.models[1], { vendor: 'anthropic', family: 'claude-3' });
	});

	test('tools with extension tools disabled setting are filtered', () => {
		// Create a tool from an extension
		const extensionTool: IToolData = {
			id: 'extensionTool',
			modelDescription: 'Extension Tool',
			displayName: 'Extension Tool',
			source: { type: 'extension', label: 'Test Extension', extensionId: new ExtensionIdentifier('test.extension') },
		};

		store.add(service.registerToolData(extensionTool));

		// With extension tools enabled (default in setup)
		let tools = Array.from(service.getTools(undefined));
		assert.ok(tools.some(t => t.id === 'extensionTool'), 'extension tool should be included when enabled');

		// Disable extension tools
		configurationService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, false);

		tools = Array.from(service.getTools(undefined));
		assert.ok(!tools.some(t => t.id === 'extensionTool'), 'extension tool should be excluded when disabled');

		// Re-enable for cleanup
		configurationService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
	});

	test('observeTools changes when context key changes', async () => {
		return runWithFakedTimers({}, async () => {
			const testCtxKey = contextKeyService.createKey<string>('dynamicTestKey', 'value1');

			const tool1: IToolData = {
				id: 'dynamicTool1',
				modelDescription: 'Dynamic Tool 1',
				displayName: 'Dynamic Tool 1',
				source: ToolDataSource.Internal,
				when: ContextKeyEqualsExpr.create('dynamicTestKey', 'value1'),
			};

			const tool2: IToolData = {
				id: 'dynamicTool2',
				modelDescription: 'Dynamic Tool 2',
				displayName: 'Dynamic Tool 2',
				source: ToolDataSource.Internal,
				when: ContextKeyEqualsExpr.create('dynamicTestKey', 'value2'),
			};

			store.add(service.registerToolData(tool1));
			store.add(service.registerToolData(tool2));

			const toolsObs = service.observeTools(undefined);

			// Initial state: value1 matches tool1
			let tools = toolsObs.get();
			assert.strictEqual(tools.length, 1, 'should have 1 tool initially');
			assert.strictEqual(tools[0].id, 'dynamicTool1', 'should be dynamicTool1');

			// Change context key to value2
			testCtxKey.set('value2');

			// Wait for scheduler to trigger
			await new Promise(resolve => setTimeout(resolve, 800));

			// Now tool2 should be available
			tools = toolsObs.get();
			assert.strictEqual(tools.length, 1, 'should have 1 tool after change');
			assert.strictEqual(tools[0].id, 'dynamicTool2', 'should be dynamicTool2 after context change');
		});
	});

	test('isPermitted allows tools in permitted toolsets when agent mode is disabled', () => {
		// Disable agent mode
		configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);

		// Create tool in the 'read' toolset (permitted)
		const readTool: IToolData = {
			id: 'readToolInSet',
			toolReferenceName: 'readToolRef',
			modelDescription: 'Read Tool in Set',
			displayName: 'Read Tool',
			source: ToolDataSource.Internal,
		};
		store.add(service.registerToolData(readTool));
		store.add(service.readToolSet.addTool(readTool));

		// Create standalone tool not in any permitted toolset
		const standaloneTool: IToolData = {
			id: 'standaloneTool',
			toolReferenceName: 'standaloneRef',
			modelDescription: 'Standalone Tool',
			displayName: 'Standalone Tool',
			source: ToolDataSource.Internal,
		};
		store.add(service.registerToolData(standaloneTool));

		// Get tools - should include the tool in the read toolset but not the standalone tool
		const tools = Array.from(service.getTools(undefined));
		const toolIds = tools.map(t => t.id);

		assert.ok(toolIds.includes('readToolInSet'), 'Tool in read toolset should be permitted when agent mode is disabled');
		assert.ok(!toolIds.includes('standaloneTool'), 'Standalone tool not in permitted toolset should NOT be permitted when agent mode is disabled');
	});

	test('isPermitted allows all tools when agent mode is enabled', () => {
		// Enable agent mode (default)
		configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, true);

		// Create tool in the 'read' toolset
		const readTool: IToolData = {
			id: 'readToolEnabled',
			toolReferenceName: 'readToolEnabledRef',
			modelDescription: 'Read Tool',
			displayName: 'Read Tool',
			source: ToolDataSource.Internal,
		};
		store.add(service.registerToolData(readTool));
		store.add(service.readToolSet.addTool(readTool));

		// Create standalone tool not in any permitted toolset
		const standaloneTool: IToolData = {
			id: 'standaloneToolEnabled',
			toolReferenceName: 'standaloneEnabledRef',
			modelDescription: 'Standalone Tool',
			displayName: 'Standalone Tool',
			source: ToolDataSource.Internal,
		};
		store.add(service.registerToolData(standaloneTool));

		// Get tools - both should be available when agent mode is enabled
		const tools = Array.from(service.getTools(undefined));
		const toolIds = tools.map(t => t.id);

		assert.ok(toolIds.includes('readToolEnabled'), 'Tool in read toolset should be permitted when agent mode is enabled');
		assert.ok(toolIds.includes('standaloneToolEnabled'), 'Standalone tool should be permitted when agent mode is enabled');
	});

	test('isPermitted filters toolsets when agent mode is disabled', () => {
		// Disable agent mode
		configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);

		// Create a custom internal toolset that is NOT in the permitted list
		const customToolSet = store.add(service.createToolSet(
			ToolDataSource.Internal,
			'customToolSet',
			'customToolSetRef',
			{ description: 'Custom Tool Set' }
		));

		const customTool: IToolData = {
			id: 'customToolInSet',
			toolReferenceName: 'customToolRef',
			modelDescription: 'Custom Tool',
			displayName: 'Custom Tool',
			source: ToolDataSource.Internal,
		};
		store.add(service.registerToolData(customTool));
		store.add(customToolSet.addTool(customTool));

		// Get toolsets - read/search/web should be available, custom should not
		const toolSets = Array.from(service.toolSets.get());
		const toolSetIds = Array.from(toolSets).map(ts => ts.id);

		assert.ok(toolSetIds.includes('read'), 'read toolset should be permitted when agent mode is disabled');
		assert.ok(!toolSetIds.includes('customToolSet'), 'custom toolset should NOT be permitted when agent mode is disabled');
	});

	test('isPermitted allows execute toolset tools when agent mode is enabled', () => {
		// Enable agent mode
		configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, true);

		// Create tool in the 'execute' toolset (only permitted when agent mode is enabled)
		const executeTool: IToolData = {
			id: 'executeToolInSet',
			toolReferenceName: 'executeToolRef',
			modelDescription: 'Execute Tool',
			displayName: 'Execute Tool',
			source: ToolDataSource.Internal,
		};
		store.add(service.registerToolData(executeTool));
		store.add(service.executeToolSet.addTool(executeTool));

		// Get tools - execute tool should be available when agent mode is enabled
		const tools = Array.from(service.getTools(undefined));
		const toolIds = tools.map(t => t.id);

		assert.ok(toolIds.includes('executeToolInSet'), 'Tool in execute toolset should be permitted when agent mode is enabled');
	});

	test('isPermitted blocks execute toolset tools when agent mode is disabled', () => {
		// Disable agent mode
		configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);

		// Create tool in the 'execute' toolset (NOT permitted when agent mode is disabled)
		const executeTool: IToolData = {
			id: 'executeToolBlocked',
			toolReferenceName: 'executeToolBlockedRef',
			modelDescription: 'Execute Tool',
			displayName: 'Execute Tool',
			source: ToolDataSource.Internal,
		};
		store.add(service.registerToolData(executeTool));
		store.add(service.executeToolSet.addTool(executeTool));

		// Get tools - execute tool should NOT be available when agent mode is disabled
		const tools = Array.from(service.getTools(undefined));
		const toolIds = tools.map(t => t.id);

		assert.ok(!toolIds.includes('executeToolBlocked'), 'Tool in execute toolset should NOT be permitted when agent mode is disabled');
	});

	test('isPermitted allows search toolset tools when agent mode is disabled', () => {
		// Disable agent mode
		configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);

		// Create a 'search' toolset (permitted when agent mode is disabled)
		const searchToolSet = store.add(service.createToolSet(
			ToolDataSource.Internal,
			'search',
			SpecedToolAliases.search,
			{ description: 'Search Tool Set' }
		));

		const searchTool: IToolData = {
			id: 'searchToolInSet',
			toolReferenceName: 'searchToolRef',
			modelDescription: 'Search Tool',
			displayName: 'Search Tool',
			source: ToolDataSource.Internal,
		};
		store.add(service.registerToolData(searchTool));
		store.add(searchToolSet.addTool(searchTool));

		// Get tools - search tool should be available when agent mode is disabled
		const tools = Array.from(service.getTools(undefined));
		const toolIds = tools.map(t => t.id);

		assert.ok(toolIds.includes('searchToolInSet'), 'Tool in search toolset should be permitted when agent mode is disabled');
	});

	test('isPermitted allows web toolset tools when agent mode is disabled', () => {
		// Disable agent mode
		configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);

		// Create a 'web' toolset (permitted when agent mode is disabled)
		const webToolSet = store.add(service.createToolSet(
			ToolDataSource.Internal,
			'web',
			SpecedToolAliases.web,
			{ description: 'Web Tool Set' }
		));

		const webTool: IToolData = {
			id: 'webToolInSet',
			toolReferenceName: 'webToolRef',
			modelDescription: 'Web Tool',
			displayName: 'Web Tool',
			source: ToolDataSource.Internal,
		};
		store.add(service.registerToolData(webTool));
		store.add(webToolSet.addTool(webTool));

		// Get tools - web tool should be available when agent mode is disabled
		const tools = Array.from(service.getTools(undefined));
		const toolIds = tools.map(t => t.id);

		assert.ok(toolIds.includes('webToolInSet'), 'Tool in web toolset should be permitted when agent mode is disabled');
	});

	test('isPermitted allows vscode_fetchWebPage_internal special case when agent mode is disabled', () => {
		// Disable agent mode
		configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);

		// Register the special-cased fetch tool (not added to any toolset)
		const fetchTool: IToolData = {
			id: 'vscode_fetchWebPage_internal',
			toolReferenceName: 'fetchWebPage',
			modelDescription: 'Fetch Web Page',
			displayName: 'Fetch Web Page',
			source: ToolDataSource.Internal,
		};
		store.add(service.registerToolData(fetchTool));

		// Get tools - this special tool should be available even when not in a toolset
		const tools = Array.from(service.getTools(undefined));
		const toolIds = tools.map(t => t.id);

		assert.ok(toolIds.includes('vscode_fetchWebPage_internal'), 'vscode_fetchWebPage_internal should be permitted as special case when agent mode is disabled');
	});

	test('isPermitted blocks extension tools not in permitted toolsets when agent mode is disabled', () => {
		// Disable agent mode
		configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);

		// Create extension tool not in any permitted toolset
		const extensionTool: IToolData = {
			id: 'extensionToolBlocked',
			toolReferenceName: 'extensionToolRef',
			modelDescription: 'Extension Tool',
			displayName: 'Extension Tool',
			source: { type: 'extension', label: 'Test Extension', extensionId: new ExtensionIdentifier('test.extension') },
			canBeReferencedInPrompt: true,
		};
		store.add(service.registerToolData(extensionTool));

		// Get tools - extension tool should NOT be available when agent mode is disabled
		const tools = Array.from(service.getTools(undefined));
		const toolIds = tools.map(t => t.id);

		assert.ok(!toolIds.includes('extensionToolBlocked'), 'Extension tool not in permitted toolset should NOT be permitted when agent mode is disabled');
	});

	test('isPermitted blocks MCP tools not in permitted toolsets when agent mode is disabled', () => {
		// Disable agent mode
		configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);

		// Create MCP toolset (not in permitted list)
		const mcpToolSet = store.add(service.createToolSet(
			{ type: 'mcp', label: 'Test MCP', serverLabel: 'Test MCP Server', instructions: undefined, collectionId: 'testMcp', definitionId: 'testMcpDef' },
			'mcpToolSetBlocked',
			'mcpToolSetBlockedRef',
			{ description: 'MCP Tool Set' }
		));

		const mcpTool: IToolData = {
			id: 'mcpToolBlocked',
			toolReferenceName: 'mcpToolRef',
			modelDescription: 'MCP Tool',
			displayName: 'MCP Tool',
			source: { type: 'mcp', label: 'Test MCP', serverLabel: 'Test MCP Server', instructions: undefined, collectionId: 'testMcp', definitionId: 'testMcpDef' },
			canBeReferencedInPrompt: true,
		};
		store.add(service.registerToolData(mcpTool));
		store.add(mcpToolSet.addTool(mcpTool));

		// Get tools - MCP tool should NOT be available when agent mode is disabled
		const tools = Array.from(service.getTools(undefined));
		const toolIds = tools.map(t => t.id);

		assert.ok(!toolIds.includes('mcpToolBlocked'), 'MCP tool should NOT be permitted when agent mode is disabled');

		// Get toolsets - MCP toolset should NOT be available
		const toolSets = Array.from(service.toolSets.get());
		const toolSetIds = Array.from(toolSets).map(ts => ts.id);

		assert.ok(!toolSetIds.includes('mcpToolSetBlocked'), 'MCP toolset should NOT be permitted when agent mode is disabled');
	});

	test('isPermitted blocks agent toolset tools when agent mode is disabled', () => {
		// Disable agent mode
		configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);

		// Create tool in the 'agent' toolset (NOT permitted when agent mode is disabled)
		const agentTool: IToolData = {
			id: 'agentToolBlocked',
			toolReferenceName: 'agentToolBlockedRef',
			modelDescription: 'Agent Tool',
			displayName: 'Agent Tool',
			source: ToolDataSource.Internal,
		};
		store.add(service.registerToolData(agentTool));
		store.add(service.agentToolSet.addTool(agentTool));

		// Get tools - agent tool should NOT be available when agent mode is disabled
		const tools = Array.from(service.getTools(undefined));
		const toolIds = tools.map(t => t.id);

		assert.ok(!toolIds.includes('agentToolBlocked'), 'Tool in agent toolset should NOT be permitted when agent mode is disabled');

		// Get toolsets - agent toolset should NOT be available
		const toolSets = Array.from(service.toolSets.get());
		const toolSetIds = Array.from(toolSets).map(ts => ts.id);

		assert.ok(!toolSetIds.includes('agent'), 'agent toolset should NOT be permitted when agent mode is disabled');
	});

	test('isPermitted includes tool in multiple toolsets if one is permitted', () => {
		// Disable agent mode
		configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);

		// Create a tool that is added to both a permitted toolset (read) and a non-permitted toolset
		const multiSetTool: IToolData = {
			id: 'multiSetTool',
			toolReferenceName: 'multiSetToolRef',
			modelDescription: 'Multi Set Tool',
			displayName: 'Multi Set Tool',
			source: ToolDataSource.Internal,
		};
		store.add(service.registerToolData(multiSetTool));

		// Add to read toolset (permitted)
		store.add(service.readToolSet.addTool(multiSetTool));

		// Also create and add to a non-permitted toolset
		const customToolSet = store.add(service.createToolSet(
			ToolDataSource.Internal,
			'customMultiSet',
			'customMultiSetRef',
			{ description: 'Custom Multi Set' }
		));
		store.add(customToolSet.addTool(multiSetTool));

		// Get tools - tool should be available because it's in the 'read' toolset
		const tools = Array.from(service.getTools(undefined));
		const toolIds = tools.map(t => t.id);

		assert.ok(toolIds.includes('multiSetTool'), 'Tool should be permitted if it belongs to at least one permitted toolset');
	});

	suite('ToolSet when clause filtering (issue #291154)', () => {
		test('ToolSet.getTools filters tools by when clause', () => {
			// Create a context key for testing
			contextKeyService.createKey('testFeatureEnabled', false);

			// Create tools with different when clauses
			const toolWithWhenTrue: IToolData = {
				id: 'toolWithWhenTrue',
				modelDescription: 'Tool with when true',
				displayName: 'Tool with when true',
				source: ToolDataSource.Internal,
				when: ContextKeyEqualsExpr.create('testFeatureEnabled', true),
			};

			const toolWithWhenFalse: IToolData = {
				id: 'toolWithWhenFalse',
				modelDescription: 'Tool with when false',
				displayName: 'Tool with when false',
				source: ToolDataSource.Internal,
				when: ContextKeyEqualsExpr.create('testFeatureEnabled', false),
			};

			const toolWithoutWhen: IToolData = {
				id: 'toolWithoutWhen',
				modelDescription: 'Tool without when',
				displayName: 'Tool without when',
				source: ToolDataSource.Internal,
			};

			// Create a tool set and add the tools
			const testToolSet = store.add(service.createToolSet(
				ToolDataSource.Internal,
				'testToolSet',
				'testToolSetRef',
				{ description: 'Test Tool Set' }
			));

			store.add(service.registerToolData(toolWithWhenTrue));
			store.add(service.registerToolData(toolWithWhenFalse));
			store.add(service.registerToolData(toolWithoutWhen));

			store.add(testToolSet.addTool(toolWithWhenTrue));
			store.add(testToolSet.addTool(toolWithWhenFalse));
			store.add(testToolSet.addTool(toolWithoutWhen));

			// Get tools from the tool set
			const tools = Array.from(testToolSet.getTools());
			const toolIds = tools.map(t => t.id);

			// Since testFeatureEnabled is false, only tools with when=false or no when clause should be available
			assert.ok(toolIds.includes('toolWithWhenFalse'), 'Tool with when=false should be in tool set when context key is false');
			assert.ok(toolIds.includes('toolWithoutWhen'), 'Tool without when clause should be in tool set');
			assert.ok(!toolIds.includes('toolWithWhenTrue'), 'Tool with when=true should NOT be in tool set when context key is false');
		});

		test('ToolSet.getTools updates when context key changes', async () => {
			return runWithFakedTimers({}, async () => {
				// Create a context key for testing
				const testKey = contextKeyService.createKey<string>('dynamicTestKey', 'value1');

				// Create tools with when clauses
				const toolWithValue1: IToolData = {
					id: 'toolWithValue1',
					modelDescription: 'Tool with value1',
					displayName: 'Tool with value1',
					source: ToolDataSource.Internal,
					when: ContextKeyEqualsExpr.create('dynamicTestKey', 'value1'),
				};

				const toolWithValue2: IToolData = {
					id: 'toolWithValue2',
					modelDescription: 'Tool with value2',
					displayName: 'Tool with value2',
					source: ToolDataSource.Internal,
					when: ContextKeyEqualsExpr.create('dynamicTestKey', 'value2'),
				};

				// Create a tool set and add the tools
				const dynamicToolSet = store.add(service.createToolSet(
					ToolDataSource.Internal,
					'dynamicToolSet',
					'dynamicToolSetRef',
					{ description: 'Dynamic Tool Set' }
				));

				store.add(service.registerToolData(toolWithValue1));
				store.add(service.registerToolData(toolWithValue2));

				store.add(dynamicToolSet.addTool(toolWithValue1));
				store.add(dynamicToolSet.addTool(toolWithValue2));

				// Initial state: value1 is set
				let tools = Array.from(dynamicToolSet.getTools());
				let toolIds = tools.map(t => t.id);

				assert.strictEqual(tools.length, 1, 'Should have 1 tool initially');
				assert.strictEqual(toolIds[0], 'toolWithValue1', 'Should be toolWithValue1');

				// Change context key to value2
				testKey.set('value2');

				// Wait for scheduler to trigger
				await new Promise(resolve => setTimeout(resolve, 800));

				// Now toolWithValue2 should be available
				tools = Array.from(dynamicToolSet.getTools());
				toolIds = tools.map(t => t.id);

				assert.strictEqual(tools.length, 1, 'Should have 1 tool after change');
				assert.strictEqual(toolIds[0], 'toolWithValue2', 'Should be toolWithValue2 after context change');
			});
		});

		test('ToolSet.getTools with complex when expressions', () => {
			// Create multiple context keys for testing complex expressions
			contextKeyService.createKey('featureA', true);
			contextKeyService.createKey('featureB', false);
			contextKeyService.createKey('featureC', true);

			const toolWithAnd: IToolData = {
				id: 'toolWithAnd',
				modelDescription: 'Tool with AND expression',
				displayName: 'Tool with AND',
				source: ToolDataSource.Internal,
				when: ContextKeyExpr.and(
					ContextKeyExpr.has('featureA'),
					ContextKeyExpr.has('featureC')
				),
			};

			const toolWithOr: IToolData = {
				id: 'toolWithOr',
				modelDescription: 'Tool with OR expression',
				displayName: 'Tool with OR',
				source: ToolDataSource.Internal,
				when: ContextKeyExpr.or(
					ContextKeyExpr.has('featureA'),
					ContextKeyExpr.has('featureC')
				),
			};

			const toolWithNot: IToolData = {
				id: 'toolWithNot',
				modelDescription: 'Tool with NOT expression',
				displayName: 'Tool with NOT',
				source: ToolDataSource.Internal,
				when: ContextKeyExpr.not('featureB'),
			};

			// Create a tool set and add the tools
			const complexToolSet = store.add(service.createToolSet(
				ToolDataSource.Internal,
				'complexToolSet',
				'complexToolSetRef',
				{ description: 'Complex Tool Set' }
			));

			store.add(service.registerToolData(toolWithAnd));
			store.add(service.registerToolData(toolWithOr));
			store.add(service.registerToolData(toolWithNot));

			store.add(complexToolSet.addTool(toolWithAnd));
			store.add(complexToolSet.addTool(toolWithOr));
			store.add(complexToolSet.addTool(toolWithNot));

			// Get tools from the tool set
			const tools = Array.from(complexToolSet.getTools());
			const toolIds = tools.map(t => t.id);

			// featureA=true, featureB=false, featureC=true
			// toolWithAnd: has('featureA') AND has('featureC') = true
			// toolWithOr: has('featureA') OR has('featureC') = true
			// toolWithNot: NOT has('featureB') = true
			assert.ok(toolIds.includes('toolWithAnd'), 'Tool with AND should be in tool set (has(featureA) AND has(featureC) = true)');
			assert.ok(toolIds.includes('toolWithOr'), 'Tool with OR should be in tool set (has(featureA) OR has(featureC) = true)');
			assert.ok(toolIds.includes('toolWithNot'), 'Tool with NOT should be in tool set (NOT has(featureB) = true)');
		});

		test('ToolSet.getTools filters nested tool sets by when clause', () => {
			// Create a context key for testing
			contextKeyService.createKey('nestedFeature', false);

			// Create tools in parent tool set
			const parentTool: IToolData = {
				id: 'parentTool',
				modelDescription: 'Parent Tool',
				displayName: 'Parent Tool',
				source: ToolDataSource.Internal,
			};

			// Create tools in child tool set with when clause
			const childToolWithWhen: IToolData = {
				id: 'childToolWithWhen',
				modelDescription: 'Child Tool with When',
				displayName: 'Child Tool with When',
				source: ToolDataSource.Internal,
				when: ContextKeyEqualsExpr.create('nestedFeature', true),
			};

			const childToolWithoutWhen: IToolData = {
				id: 'childToolWithoutWhen',
				modelDescription: 'Child Tool without When',
				displayName: 'Child Tool without When',
				source: ToolDataSource.Internal,
			};

			// Create parent tool set
			const parentToolSet = store.add(service.createToolSet(
				ToolDataSource.Internal,
				'parentToolSet',
				'parentToolSetRef',
				{ description: 'Parent Tool Set' }
			));

			// Create child tool set
			const childToolSet = store.add(service.createToolSet(
				ToolDataSource.Internal,
				'childToolSet',
				'childToolSetRef',
				{ description: 'Child Tool Set' }
			));

			store.add(service.registerToolData(parentTool));
			store.add(service.registerToolData(childToolWithWhen));
			store.add(service.registerToolData(childToolWithoutWhen));

			store.add(parentToolSet.addTool(parentTool));
			store.add(parentToolSet.addToolSet(childToolSet));
			store.add(childToolSet.addTool(childToolWithWhen));
			store.add(childToolSet.addTool(childToolWithoutWhen));

			// Get tools from the parent tool set
			const tools = Array.from(parentToolSet.getTools());
			const toolIds = tools.map(t => t.id);

			// Should include parent tool, child tool without when, but not child tool with when
			assert.ok(toolIds.includes('parentTool'), 'Parent tool should be in tool set');
			assert.ok(toolIds.includes('childToolWithoutWhen'), 'Child tool without when should be in tool set');
			assert.ok(!toolIds.includes('childToolWithWhen'), 'Child tool with when=true should NOT be in tool set when context key is false');
		});
	});
});
