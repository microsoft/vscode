/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { RUN_SUBAGENT_MAX_NESTING_DEPTH, RunSubagentTool } from '../../../../common/tools/builtinTools/runSubagentTool.js';
import { MockLanguageModelToolsService } from '../mockLanguageModelToolsService.js';
import { IChatAgentHistoryEntry, IChatAgentRequest, IChatAgentResult, IChatAgentService, UserSelectedTools } from '../../../../common/participants/chatAgents.js';
import { IChatProgress, IChatService } from '../../../../common/chatService/chatService.js';
import { COPILOT_VENDOR_ID, ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../common/languageModels.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../../../../platform/product/common/productService.js';
import { ICustomAgent, PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { Target } from '../../../../common/promptSyntax/promptTypes.js';
import { MockPromptsService } from '../../promptSyntax/service/mockPromptsService.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { IToolInvocation, ToolProgress } from '../../../../common/tools/languageModelToolsService.js';
import { IChatModel, IChatRequestModeInstructions } from '../../../../common/model/chatModel.js';
import { ChatConfiguration } from '../../../../common/constants.js';

suite('RunSubagentTool', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('resultText trimming', () => {
		test('trims leading empty codeblocks (```\\n```) from result', () => {
			// This tests the regex: /^\n*```\n+```\n*/g
			const testCases = [
				{ input: '```\n```\nActual content', expected: 'Actual content' },
				{ input: '\n```\n```\nActual content', expected: 'Actual content' },
				{ input: '\n\n```\n\n```\n\nActual content', expected: 'Actual content' },
				{ input: '```\n```\n```\n```\nActual content', expected: '```\n```\nActual content' }, // Only trims leading
				{ input: 'No codeblock here', expected: 'No codeblock here' },
				{ input: '```\n```\n', expected: '' },
				{ input: '', expected: '' },
			];

			for (const { input, expected } of testCases) {
				const result = input.replace(/^\n*```\n+```\n*/g, '').trim();
				assert.strictEqual(result, expected, `Failed for input: ${JSON.stringify(input)}`);
			}
		});
	});

	suite('prepareToolInvocation', () => {
		test('returns correct toolSpecificData', async () => {
			const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());

			const promptsService = new MockPromptsService();
			const customMode: ICustomAgent = {
				id: 'file:///test/custom-agent.md',
				uri: URI.parse('file:///test/custom-agent.md'),
				name: 'CustomAgent',
				description: 'A test custom agent',
				tools: ['tool1', 'tool2'],
				agentInstructions: { content: 'Custom agent body', toolReferences: [] },
				source: { storage: PromptsStorage.local },
				target: Target.Undefined,
				visibility: { userInvocable: true, agentInvocable: true },
				enabled: true
			};
			promptsService.setCustomModes([customMode]);

			const tool = testDisposables.add(new RunSubagentTool(
				{} as IChatAgentService,
				{} as IChatService,
				mockToolsService,
				{} as ILanguageModelsService,
				new NullLogService(),
				new TestConfigurationService(),
				promptsService,
				{} as IInstantiationService,
				{} as IProductService,
			));

			const result = await tool.prepareToolInvocation(
				{
					parameters: {
						prompt: 'Test prompt',
						description: 'Test task',
						agentName: 'CustomAgent',
					},
					toolCallId: 'test-call-1',
					chatSessionResource: URI.parse('test://session'),
				},
				CancellationToken.None
			);

			assert.ok(result);
			assert.strictEqual(result.invocationMessage, 'Test task');
			assert.deepStrictEqual(result.toolSpecificData, {
				kind: 'subagent',
				description: 'Test task',
				agentName: 'CustomAgent',
				prompt: 'Test prompt',
				modelName: undefined,
			});
		});

		function createTool(opts?: { customAgents?: ICustomAgent[] }) {
			const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
			const promptsService = new MockPromptsService();
			if (opts?.customAgents) {
				promptsService.setCustomModes(opts.customAgents);
			}

			const tool = testDisposables.add(new RunSubagentTool(
				{} as IChatAgentService,
				{} as IChatService,
				mockToolsService,
				{} as ILanguageModelsService,
				new NullLogService(),
				new TestConfigurationService(),
				promptsService,
				{} as IInstantiationService,
				{} as IProductService,
			));
			return tool;
		}

		test('passes through unknown agentName', async () => {
			const tool = createTool();

			const result = await tool.prepareToolInvocation(
				{
					parameters: { prompt: 'Test prompt', description: 'Test task', agentName: 'NonExistentAgent' },
					toolCallId: 'test-call-unknown',
					chatSessionResource: URI.parse('test://session'),
				},
				CancellationToken.None
			);

			assert.ok(result);
			assert.deepStrictEqual(result.toolSpecificData, {
				kind: 'subagent',
				description: 'Test task',
				agentName: 'NonExistentAgent',
				prompt: 'Test prompt',
				modelName: undefined,
			});
		});
	});

	suite('getToolData', () => {
		test('returns basic tool data', () => {
			const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
			const promptsService = new MockPromptsService();

			const tool = testDisposables.add(new RunSubagentTool(
				{} as IChatAgentService,
				{} as IChatService,
				mockToolsService,
				{} as ILanguageModelsService,
				new NullLogService(),
				new TestConfigurationService(),
				promptsService,
				{} as IInstantiationService,
				{} as IProductService,
			));

			const toolData = tool.getToolData();

			assert.strictEqual(toolData.id, 'runSubagent');
			assert.ok(toolData.inputSchema);
			assert.ok(toolData.inputSchema.properties?.prompt);
			assert.ok(toolData.inputSchema.properties?.description);
			assert.ok(toolData.inputSchema.properties?.agentName, 'agentName should be in schema properties');
			assert.deepStrictEqual(toolData.inputSchema.required, ['prompt', 'description']);
		});
	});

	suite('onDidInvokeTool event', () => {
		test('mock service fires onDidInvokeTool events with correct data', () => {
			const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
			const sessionResource = URI.parse('test://session');
			const receivedEvents: { toolId: string; sessionResource: URI | undefined; requestId: string | undefined; subagentInvocationId: string | undefined }[] = [];

			testDisposables.add(mockToolsService.onDidInvokeTool(e => {
				receivedEvents.push(e);
			}));

			mockToolsService.fireOnDidInvokeTool({
				toolId: 'test-tool',
				sessionResource,
				requestId: 'request-123',
				subagentInvocationId: 'subagent-456',
			});

			assert.strictEqual(receivedEvents.length, 1);
			assert.deepStrictEqual(receivedEvents[0], {
				toolId: 'test-tool',
				sessionResource,
				requestId: 'request-123',
				subagentInvocationId: 'subagent-456',
			});
		});

		test('events with different subagentInvocationId are distinguishable', () => {
			// This tests the filtering logic used in RunSubagentTool.invoke()
			// The tool subscribes to onDidInvokeTool and checks if e.subagentInvocationId matches its own callId
			const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
			const targetSubagentId = 'target-subagent';

			const matchingEvents: string[] = [];
			testDisposables.add(mockToolsService.onDidInvokeTool(e => {
				if (e.subagentInvocationId === targetSubagentId) {
					matchingEvents.push(e.toolId);
				}
			}));

			// Fire events with different subagentInvocationIds
			mockToolsService.fireOnDidInvokeTool({
				toolId: 'unrelated-tool',
				sessionResource: undefined,
				requestId: undefined,
				subagentInvocationId: 'different-subagent',
			});
			mockToolsService.fireOnDidInvokeTool({
				toolId: 'matching-tool',
				sessionResource: undefined,
				requestId: undefined,
				subagentInvocationId: targetSubagentId,
			});
			mockToolsService.fireOnDidInvokeTool({
				toolId: 'another-unrelated-tool',
				sessionResource: undefined,
				requestId: undefined,
				subagentInvocationId: undefined,
			});

			// Only the matching event should be captured
			assert.deepStrictEqual(matchingEvents, ['matching-tool']);
		});
	});

	suite('model fallback behavior', () => {
		const BUILTIN_CHAT_EXTENSION_ID = 'github.copilot-chat';
		const builtinProductService = { defaultChatAgent: { chatExtensionId: BUILTIN_CHAT_EXTENSION_ID } } as IProductService;

		function createMetadata(name: string, multiplierNumeric?: number, vendor: string = 'TestVendor'): ILanguageModelChatMetadata {
			return {
				extension: new ExtensionIdentifier('test.extension'),
				name,
				id: name.toLowerCase().replace(/\s+/g, '-'),
				vendor,
				version: '1.0',
				family: 'test',
				maxInputTokens: 128000,
				maxOutputTokens: 8192,
				isDefaultForLocation: {},
				multiplierNumeric,
				capabilities: { toolCalling: true },
				isBYOK: vendor !== COPILOT_VENDOR_ID,
			};
		}

		function createTool(opts: {
			models: Map<string, ILanguageModelChatMetadata>;
			qualifiedNameMap?: Map<string, ILanguageModelChatMetadataAndIdentifier>;
			customAgents?: ICustomAgent[];
		}) {
			const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
			const promptsService = new MockPromptsService();
			if (opts.customAgents) {
				promptsService.setCustomModes(opts.customAgents);
			}

			const mockLanguageModelsService: Partial<ILanguageModelsService> = {
				getLanguageModelIds() {
					return Array.from(opts.models.keys());
				},
				lookupLanguageModel(modelId: string) {
					return opts.models.get(modelId);
				},
				lookupLanguageModelByQualifiedName(qualifiedName: string) {
					return opts.qualifiedNameMap?.get(qualifiedName);
				},
			};

			const tool = testDisposables.add(new RunSubagentTool(
				{} as IChatAgentService,
				{} as IChatService,
				mockToolsService,
				mockLanguageModelsService as ILanguageModelsService,
				new NullLogService(),
				new TestConfigurationService(),
				promptsService,
				{} as IInstantiationService,
				builtinProductService,
			));

			return tool;
		}

		function createAgent(name: string, modelQualifiedNames?: string[]): ICustomAgent {
			const id = `file:///test/${name}.md`;
			return {
				uri: URI.parse(id),
				id,
				name,
				description: `Agent ${name}`,
				tools: ['tool1'],
				model: modelQualifiedNames,
				agentInstructions: { content: 'test', toolReferences: [] },
				source: { storage: PromptsStorage.local },
				target: Target.Undefined,
				visibility: { userInvocable: true, agentInvocable: true },
				enabled: true
			};
		}

		// A built-in (extension-shipped) agent such as Explore, whose model list is a curated fallback list.
		function createBuiltinAgent(name: string, modelQualifiedNames?: string[]): ICustomAgent {
			return {
				...createAgent(name, modelQualifiedNames),
				source: { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier(BUILTIN_CHAT_EXTENSION_ID) },
			};
		}

		test('throws error when subagent model has higher multiplier', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const expensiveMeta = createMetadata('O3 Pro', 50);
			const models = new Map([
				['main-model-id', mainMeta],
				['expensive-model-id', expensiveMeta],
			]);
			const qualifiedNameMap = new Map([
				['O3 Pro (TestVendor)', { metadata: expensiveMeta, identifier: 'expensive-model-id' }],
			]);

			const agent = createAgent('ExpensiveAgent', ['O3 Pro (TestVendor)']);
			const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });

			await assert.rejects(
				() => tool.prepareToolInvocation({
					parameters: { prompt: 'test', description: 'test task', agentName: 'ExpensiveAgent' },
					toolCallId: 'call-1',
					modelId: 'main-model-id',
					chatSessionResource: URI.parse('test://session'),
				}, CancellationToken.None),
				(err: Error) => {
					assert.ok(err.message.includes('O3 Pro'));
					assert.ok(err.message.includes('exceeds'));
					assert.ok(err.message.includes('cost tier'));
					assert.ok(err.message.includes('Unavailable'));
					return true;
				}
			);
		});

		test('uses subagent model when it has equal multiplier', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const sameCostMeta = createMetadata('Claude Sonnet', 1);
			const models = new Map([
				['main-model-id', mainMeta],
				['same-cost-model-id', sameCostMeta],
			]);
			const qualifiedNameMap = new Map([
				['Claude Sonnet (TestVendor)', { metadata: sameCostMeta, identifier: 'same-cost-model-id' }],
			]);

			const agent = createAgent('SameCostAgent', ['Claude Sonnet (TestVendor)']);
			const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test task', agentName: 'SameCostAgent' },
				toolCallId: 'call-2',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			assert.deepStrictEqual(result.toolSpecificData, {
				kind: 'subagent',
				description: 'test task',
				agentName: 'SameCostAgent',
				prompt: 'test',
				modelName: 'Claude Sonnet',
			});
		});

		test('uses subagent model when it has lower multiplier', async () => {
			const mainMeta = createMetadata('O3 Pro', 50);
			const cheapMeta = createMetadata('GPT-4o Mini', 0.25);
			const models = new Map([
				['main-model-id', mainMeta],
				['cheap-model-id', cheapMeta],
			]);
			const qualifiedNameMap = new Map([
				['GPT-4o Mini (TestVendor)', { metadata: cheapMeta, identifier: 'cheap-model-id' }],
			]);

			const agent = createAgent('CheapAgent', ['GPT-4o Mini (TestVendor)']);
			const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test task', agentName: 'CheapAgent' },
				toolCallId: 'call-3',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			assert.deepStrictEqual(result.toolSpecificData, {
				kind: 'subagent',
				description: 'test task',
				agentName: 'CheapAgent',
				prompt: 'test',
				modelName: 'GPT-4o Mini',
			});
		});

		test('uses subagent model when main model has no multiplier', async () => {
			const mainMeta = createMetadata('Unknown Model', undefined);
			const subMeta = createMetadata('O3 Pro', 50);
			const models = new Map([
				['main-model-id', mainMeta],
				['sub-model-id', subMeta],
			]);
			const qualifiedNameMap = new Map([
				['O3 Pro (TestVendor)', { metadata: subMeta, identifier: 'sub-model-id' }],
			]);

			const agent = createAgent('SubAgent', ['O3 Pro (TestVendor)']);
			const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test task', agentName: 'SubAgent' },
				toolCallId: 'call-4',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			// No fallback when main model's multiplier is unknown
			assert.deepStrictEqual(result.toolSpecificData, {
				kind: 'subagent',
				description: 'test task',
				agentName: 'SubAgent',
				prompt: 'test',
				modelName: 'O3 Pro',
			});
		});

		test('uses subagent model when subagent model has no multiplier', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const subMeta = createMetadata('Custom Model', undefined);
			const models = new Map([
				['main-model-id', mainMeta],
				['sub-model-id', subMeta],
			]);
			const qualifiedNameMap = new Map([
				['Custom Model (TestVendor)', { metadata: subMeta, identifier: 'sub-model-id' }],
			]);

			const agent = createAgent('CustomAgent', ['Custom Model (TestVendor)']);
			const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test task', agentName: 'CustomAgent' },
				toolCallId: 'call-5',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			// No fallback when subagent model's multiplier is unknown
			assert.deepStrictEqual(result.toolSpecificData, {
				kind: 'subagent',
				description: 'test task',
				agentName: 'CustomAgent',
				prompt: 'test',
				modelName: 'Custom Model',
			});
		});

		test('uses main model when no subagent is specified', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const models = new Map([['main-model-id', mainMeta]]);

			const tool = createTool({ models });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test task' },
				toolCallId: 'call-6',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			assert.deepStrictEqual(result.toolSpecificData, {
				kind: 'subagent',
				description: 'test task',
				agentName: undefined,
				prompt: 'test',
				modelName: 'GPT-4o',
			});
		});

		test('uses main model when subagent has no model configured', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const models = new Map([['main-model-id', mainMeta]]);

			const agent = createAgent('NoModelAgent', undefined);
			const tool = createTool({ models, customAgents: [agent] });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test task', agentName: 'NoModelAgent' },
				toolCallId: 'call-7',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			assert.deepStrictEqual(result.toolSpecificData, {
				kind: 'subagent',
				description: 'test task',
				agentName: 'NoModelAgent',
				prompt: 'test',
				modelName: 'GPT-4o',
			});
		});

		test('skips Copilot fallback models when main model is BYOK and inherits the main model', async () => {
			const mainMeta = createMetadata('Claude Sonnet BYOK', undefined, 'anthropic');
			const copilotFallback = createMetadata('Copilot Haiku', undefined, COPILOT_VENDOR_ID);
			const models = new Map([
				['main-byok-id', mainMeta],
				['copilot-fallback-id', copilotFallback],
			]);
			const qualifiedNameMap = new Map([
				['Copilot Haiku (copilot)', { metadata: copilotFallback, identifier: 'copilot-fallback-id' }],
			]);

			const agent = createBuiltinAgent('ExploreAgent', ['Copilot Haiku (copilot)']);
			const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test task', agentName: 'ExploreAgent' },
				toolCallId: 'byok-call-1',
				modelId: 'main-byok-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			// The Copilot fallback is skipped, so the subagent inherits the BYOK main model.
			assert.deepStrictEqual(result.toolSpecificData, {
				kind: 'subagent',
				description: 'test task',
				agentName: 'ExploreAgent',
				prompt: 'test',
				modelName: 'Claude Sonnet BYOK',
			});
		});

		test('skips Copilot fallback but uses a non-Copilot fallback when main model is BYOK', async () => {
			const mainMeta = createMetadata('Claude Sonnet BYOK', undefined, 'anthropic');
			const copilotFallback = createMetadata('Copilot Haiku', undefined, COPILOT_VENDOR_ID);
			const byokFallback = createMetadata('Ollama Llama', undefined, 'ollama');
			const models = new Map([
				['main-byok-id', mainMeta],
				['copilot-fallback-id', copilotFallback],
				['byok-fallback-id', byokFallback],
			]);
			const qualifiedNameMap = new Map([
				['Copilot Haiku (copilot)', { metadata: copilotFallback, identifier: 'copilot-fallback-id' }],
				['Ollama Llama (ollama)', { metadata: byokFallback, identifier: 'byok-fallback-id' }],
			]);

			// Copilot fallback is listed first, the BYOK fallback second.
			const agent = createBuiltinAgent('ExploreAgent', ['Copilot Haiku (copilot)', 'Ollama Llama (ollama)']);
			const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test task', agentName: 'ExploreAgent' },
				toolCallId: 'byok-call-2',
				modelId: 'main-byok-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			assert.deepStrictEqual(result.toolSpecificData, {
				kind: 'subagent',
				description: 'test task',
				agentName: 'ExploreAgent',
				prompt: 'test',
				modelName: 'Ollama Llama',
			});
		});

		test('uses the Copilot fallback model when the main model is also Copilot', async () => {
			const mainMeta = createMetadata('Copilot GPT-4o', undefined, COPILOT_VENDOR_ID);
			const copilotFallback = createMetadata('Copilot Haiku', undefined, COPILOT_VENDOR_ID);
			const models = new Map([
				['main-copilot-id', mainMeta],
				['copilot-fallback-id', copilotFallback],
			]);
			const qualifiedNameMap = new Map([
				['Copilot Haiku (copilot)', { metadata: copilotFallback, identifier: 'copilot-fallback-id' }],
			]);

			const agent = createBuiltinAgent('ExploreAgent', ['Copilot Haiku (copilot)']);
			const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test task', agentName: 'ExploreAgent' },
				toolCallId: 'byok-call-3',
				modelId: 'main-copilot-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			assert.deepStrictEqual(result.toolSpecificData, {
				kind: 'subagent',
				description: 'test task',
				agentName: 'ExploreAgent',
				prompt: 'test',
				modelName: 'Copilot Haiku',
			});
		});

		test('uses the Copilot fallback model when no main model is set', async () => {
			const copilotFallback = createMetadata('Copilot Haiku', undefined, COPILOT_VENDOR_ID);
			const models = new Map([
				['copilot-fallback-id', copilotFallback],
			]);
			const qualifiedNameMap = new Map([
				['Copilot Haiku (copilot)', { metadata: copilotFallback, identifier: 'copilot-fallback-id' }],
			]);

			const agent = createBuiltinAgent('ExploreAgent', ['Copilot Haiku (copilot)']);
			const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test task', agentName: 'ExploreAgent' },
				toolCallId: 'byok-call-4',
				modelId: undefined,
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			assert.deepStrictEqual(result.toolSpecificData, {
				kind: 'subagent',
				description: 'test task',
				agentName: 'ExploreAgent',
				prompt: 'test',
				modelName: 'Copilot Haiku',
			});
		});

		test('honors a user-authored agent\'s explicit Copilot model even when main model is BYOK', async () => {
			const mainMeta = createMetadata('Claude Sonnet BYOK', undefined, 'anthropic');
			const copilotPinned = createMetadata('Copilot Sonnet', undefined, COPILOT_VENDOR_ID);
			const models = new Map([
				['main-byok-id', mainMeta],
				['copilot-pinned-id', copilotPinned],
			]);
			const qualifiedNameMap = new Map([
				['Copilot Sonnet (copilot)', { metadata: copilotPinned, identifier: 'copilot-pinned-id' }],
			]);

			// A user-authored (local) agent that deliberately pins a Copilot model — must not be skipped.
			const agent = createAgent('MyAgent', ['Copilot Sonnet (copilot)']);
			const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test task', agentName: 'MyAgent' },
				toolCallId: 'byok-call-5',
				modelId: 'main-byok-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			assert.deepStrictEqual(result.toolSpecificData, {
				kind: 'subagent',
				description: 'test task',
				agentName: 'MyAgent',
				prompt: 'test',
				modelName: 'Copilot Sonnet',
			});
		});

		test('does not select another fallback when an invocation override is incompatible', async () => {
			const mainMeta = createMetadata('Main', 1);
			const incompatibleMeta = createMetadata('Incompatible', 1);
			const compatibleMeta: ILanguageModelChatMetadata = {
				...createMetadata('Compatible', 1),
				configurationSchema: {
					properties: {
						thinkingLevel: { type: 'string', enum: ['low', 'high'], group: 'navigation' },
					}
				},
			};
			const models = new Map([
				['main-model-id', mainMeta],
				['incompatible-model-id', incompatibleMeta],
				['compatible-model-id', compatibleMeta],
			]);
			const qualifiedNameMap = new Map([
				['Incompatible (TestVendor)', { metadata: incompatibleMeta, identifier: 'incompatible-model-id' }],
				['Compatible (TestVendor)', { metadata: compatibleMeta, identifier: 'compatible-model-id' }],
			]);
			const agent = createAgent('ConfiguredAgent', ['Incompatible (TestVendor)', 'Compatible (TestVendor)']);
			const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });

			await assert.rejects(
				() => tool.prepareToolInvocation({
					parameters: { prompt: 'test', description: 'test task', agentName: agent.name, reasoningEffort: 'high' },
					toolCallId: 'incompatible-override',
					modelId: 'main-model-id',
					chatSessionResource: URI.parse('test://session'),
				}, CancellationToken.None),
				/Resolved model 'Incompatible \(TestVendor\)' does not support reasoningEffort overrides/
			);
		});
	});

	suite('explicit model parameter', () => {
		function createMetadata(name: string, multiplierNumeric?: number): ILanguageModelChatMetadata {
			return {
				extension: new ExtensionIdentifier('test.extension'),
				name,
				id: name.toLowerCase().replace(/\s+/g, '-'),
				vendor: 'TestVendor',
				version: '1.0',
				family: 'test',
				maxInputTokens: 128000,
				maxOutputTokens: 8192,
				isDefaultForLocation: {},
				multiplierNumeric,
				capabilities: { toolCalling: true },
			};
		}

		function createTool(opts: {
			models: Map<string, ILanguageModelChatMetadata>;
			qualifiedNameMap?: Map<string, ILanguageModelChatMetadataAndIdentifier>;
			customAgents?: ICustomAgent[];
		}) {
			const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
			const promptsService = new MockPromptsService();
			if (opts.customAgents) {
				promptsService.setCustomModes(opts.customAgents);
			}

			const mockLanguageModelsService: Partial<ILanguageModelsService> = {
				getLanguageModelIds() {
					return Array.from(opts.models.keys());
				},
				lookupLanguageModel(modelId: string) {
					return opts.models.get(modelId);
				},
				lookupLanguageModelByQualifiedName(qualifiedName: string) {
					return opts.qualifiedNameMap?.get(qualifiedName);
				},
			};

			const tool = testDisposables.add(new RunSubagentTool(
				{} as IChatAgentService,
				{} as IChatService,
				mockToolsService,
				mockLanguageModelsService as ILanguageModelsService,
				new NullLogService(),
				new TestConfigurationService(),
				promptsService,
				{} as IInstantiationService,
				{} as IProductService,
			));

			return tool;
		}

		function createAgent(name: string, modelQualifiedNames?: string[]): ICustomAgent {
			const id = `file:///test/${name}.md`;
			return {
				id,
				uri: URI.parse(id),
				name,
				description: `Agent ${name}`,
				tools: ['tool1'],
				model: modelQualifiedNames,
				agentInstructions: { content: 'test', toolReferences: [] },
				source: { storage: PromptsStorage.local },
				target: Target.Undefined,
				visibility: { userInvocable: true, agentInvocable: true },
				enabled: true
			};
		}

		test('model property is included in tool schema without enum', () => {
			const models = new Map([
				['model-1', createMetadata('GPT-4o')],
				['model-2', createMetadata('Claude Sonnet')],
			]);

			const tool = createTool({ models });
			const toolData = tool.getToolData();

			assert.ok(toolData.inputSchema?.properties?.model, 'model should be in schema');
			assert.strictEqual(toolData.inputSchema?.properties?.model?.type, 'string');
			// No enum should be present - validation happens at runtime
			assert.strictEqual(toolData.inputSchema?.properties?.model?.enum, undefined, 'model should not have an enum');
			assert.deepStrictEqual(toolData.inputSchema?.properties?.reasoningEffort, {
				type: 'string',
				minLength: 1,
				pattern: '\\S',
				description: 'Optional reasoning effort to apply to the model resolved for this subagent invocation.',
			});
			assert.deepStrictEqual(toolData.inputSchema?.properties?.contextSize, {
				type: 'integer',
				minimum: 1,
				description: 'Optional context size to apply to the model resolved for this subagent invocation.',
			});
		});

		test('resolves explicit model parameter without agentName', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const explicitMeta = createMetadata('Claude Sonnet', 1);
			const models = new Map([
				['main-model-id', mainMeta],
				['explicit-model-id', explicitMeta],
			]);
			const qualifiedNameMap = new Map([
				['Claude Sonnet (TestVendor)', { metadata: explicitMeta, identifier: 'explicit-model-id' }],
			]);

			const tool = createTool({ models, qualifiedNameMap });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test task', model: 'Claude Sonnet (TestVendor)' },
				toolCallId: 'model-call-1',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			assert.deepStrictEqual(result.toolSpecificData, {
				kind: 'subagent',
				description: 'test task',
				agentName: undefined,
				prompt: 'test',
				modelName: 'Claude Sonnet',
			});
		});

		test('explicit model overrides agent configured model', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const agentMeta = createMetadata('Agent Model', 1);
			const explicitMeta = createMetadata('Claude Sonnet', 1);
			const models = new Map([
				['main-model-id', mainMeta],
				['agent-model-id', agentMeta],
				['explicit-model-id', explicitMeta],
			]);
			const qualifiedNameMap = new Map([
				['Agent Model (TestVendor)', { metadata: agentMeta, identifier: 'agent-model-id' }],
				['Claude Sonnet (TestVendor)', { metadata: explicitMeta, identifier: 'explicit-model-id' }],
			]);

			const agent = createAgent('MyAgent', ['Agent Model (TestVendor)']);
			const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test task', agentName: 'MyAgent', model: 'Claude Sonnet (TestVendor)' },
				toolCallId: 'model-call-2',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			assert.deepStrictEqual(result.toolSpecificData, {
				kind: 'subagent',
				description: 'test task',
				agentName: 'MyAgent',
				prompt: 'test',
				modelName: 'Claude Sonnet',
			});
		});

		test('throws error when explicit model has higher multiplier', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const expensiveMeta = createMetadata('O3 Pro', 50);
			const models = new Map([
				['main-model-id', mainMeta],
				['expensive-model-id', expensiveMeta],
			]);
			const qualifiedNameMap = new Map([
				['O3 Pro (TestVendor)', { metadata: expensiveMeta, identifier: 'expensive-model-id' }],
			]);

			const tool = createTool({ models, qualifiedNameMap });

			await assert.rejects(
				() => tool.prepareToolInvocation({
					parameters: { prompt: 'test', description: 'test task', model: 'O3 Pro (TestVendor)' },
					toolCallId: 'model-call-3',
					modelId: 'main-model-id',
					chatSessionResource: URI.parse('test://session'),
				}, CancellationToken.None),
				(err: Error) => {
					assert.ok(err.message.includes('O3 Pro'));
					assert.ok(err.message.includes('exceeds'));
					assert.ok(err.message.includes('cost tier'));
					assert.ok(err.message.includes('Unavailable'));
					return true;
				}
			);
		});

		test('throws error with available models when explicit model is not found', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const otherMeta = createMetadata('Claude Sonnet', 1);
			const models = new Map([
				['main-model-id', mainMeta],
				['other-model-id', otherMeta],
			]);

			const tool = createTool({ models, qualifiedNameMap: new Map() });

			await assert.rejects(
				() => tool.prepareToolInvocation({
					parameters: { prompt: 'test', description: 'test task', model: 'Nonexistent Model (Vendor)' },
					toolCallId: 'model-call-4',
					modelId: 'main-model-id',
					chatSessionResource: URI.parse('test://session'),
				}, CancellationToken.None),
				(err: Error) => {
					assert.ok(err.message.includes('Nonexistent Model (Vendor)'));
					assert.ok(err.message.includes('not found'));
					assert.ok(err.message.includes('Available models:'));
					assert.ok(err.message.includes('GPT-4o (TestVendor)'));
					assert.ok(err.message.includes('Claude Sonnet (TestVendor)'));
					return true;
				}
			);
		});

		test('throws error with no models message when no models are available', async () => {
			const tool = createTool({ models: new Map(), qualifiedNameMap: new Map() });

			await assert.rejects(
				() => tool.prepareToolInvocation({
					parameters: { prompt: 'test', description: 'test task', model: 'Nonexistent Model (Vendor)' },
					toolCallId: 'model-call-5',
					modelId: undefined,
					chatSessionResource: URI.parse('test://session'),
				}, CancellationToken.None),
				(err: Error) => {
					assert.ok(err.message.includes('Nonexistent Model (Vendor)'));
					assert.ok(err.message.includes('not found'));
					assert.ok(err.message.includes('No models available'));
					return true;
				}
			);
		});

		test('throws a clear error when configuration overrides have no resolved model', async () => {
			const tool = createTool({ models: new Map(), qualifiedNameMap: new Map() });

			await assert.rejects(
				() => tool.prepareToolInvocation({
					parameters: { prompt: 'test', description: 'test task', reasoningEffort: 'high' },
					toolCallId: 'model-call-no-resolved-model',
					modelId: undefined,
					chatSessionResource: URI.parse('test://session'),
				}, CancellationToken.None),
				/Cannot apply reasoningEffort or contextSize overrides because no model could be resolved/
			);
		});
	});

	suite('nested subagent depth tracking', () => {
		/**
		 * Creates a RunSubagentTool with mocked services suitable for invoke() testing.
		 * The returned `capturedRequests` array collects every IChatAgentRequest passed to invokeAgent.
		 */
		let callIdCounter = 0;
		function createInvokableTool(opts: {
			allowInvocationsFromSubagents: boolean;
			capturedRequests: IChatAgentRequest[];
			currentModeInstructions?: IChatRequestModeInstructions;
			customAgents?: ICustomAgent[];
			languageModelsService?: ILanguageModelsService;
			productService?: IProductService;
		}) {
			const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
			mockToolsService.toToolReferences = () => [];
			const configService = new TestConfigurationService({
				[ChatConfiguration.SubagentsAllowInvocationsFromSubagents]: opts.allowInvocationsFromSubagents,
			});
			const promptsService = new MockPromptsService();
			if (opts.customAgents) {
				promptsService.setCustomModes(opts.customAgents);
			}

			const mockChatAgentService: Pick<IChatAgentService, 'getDefaultAgent' | 'invokeAgent'> = {
				getDefaultAgent() {
					return { id: 'default-agent' } as IChatAgentService extends { getDefaultAgent(...args: infer _A): infer R } ? NonNullable<R> : never;
				},
				async invokeAgent(_id: string, request: IChatAgentRequest, _progress: (parts: IChatProgress[]) => void, _history: IChatAgentHistoryEntry[], _token: CancellationToken): Promise<IChatAgentResult> {
					opts.capturedRequests.push(request);
					return {};
				},
			};

			const mockChatService: Pick<IChatService, 'getSession'> = {
				getSession() {
					return {
						getRequests: () => [{
							id: 'req-1',
							modeInfo: opts.currentModeInstructions ? {
								kind: undefined,
								isBuiltin: false,
								modeInstructions: opts.currentModeInstructions,
								telemetryModeId: 'custom',
								applyCodeBlockSuggestionId: undefined,
							} : undefined
						}],
						acceptResponseProgress: () => { },
					} as unknown as IChatModel;
				},
			};

			const mockInstantiationService: Pick<IInstantiationService, 'createInstance'> = {
				createInstance(..._args: never[]): { collect: () => Promise<void> } {
					return { collect: async () => { } };
				},
			};

			const tool = testDisposables.add(new RunSubagentTool(
				mockChatAgentService as IChatAgentService,
				mockChatService as IChatService,
				mockToolsService,
				opts.languageModelsService ?? {} as ILanguageModelsService,
				new NullLogService(),
				configService,
				promptsService,
				mockInstantiationService as IInstantiationService,
				opts.productService ?? {} as IProductService,
			));

			return { tool, mockChatAgentService };
		}

		function createInvocation(sessionUri: URI, userSelectedTools?: UserSelectedTools): IToolInvocation {
			return {
				callId: `call-${++callIdCounter}`,
				toolId: 'runSubagent',
				parameters: { prompt: 'do something', description: 'test' },
				context: { sessionResource: sessionUri },
				userSelectedTools: userSelectedTools ?? { runSubagent: true },
			} as IToolInvocation;
		}

		test('named and current agents merge invocation overrides individually over paired fallback defaults', async () => {
			const capturedRequests: IChatAgentRequest[] = [];
			const availableMetadata: ILanguageModelChatMetadata = {
				extension: new ExtensionIdentifier('test.extension'),
				name: 'Available',
				id: 'available',
				vendor: 'test',
				version: '1',
				family: 'available',
				maxInputTokens: 300_000,
				maxOutputTokens: 10_000,
				isDefaultForLocation: {},
				capabilities: { toolCalling: true },
				configurationSchema: {
					properties: {
						thinkingLevel: { type: 'string', enum: ['low', 'high'], group: 'navigation' },
						maxPromptTokens: { type: 'number', enum: [100_000, 300_000], group: 'tokens' },
					}
				}
			};
			const languageModelsService = {
				getLanguageModelIds: () => ['available-id'],
				lookupLanguageModel: (id: string) => id === 'available-id' ? availableMetadata : undefined,
				lookupLanguageModelByQualifiedName: (name: string) => name === 'Available (test)' ? { identifier: 'available-id', metadata: availableMetadata } : undefined,
				getModelConfiguration: (id: string) => id === 'available-id' ? { temperature: 0.5, thinkingLevel: 'low' } : undefined,
			} as ILanguageModelsService;
			const customAgent: ICustomAgent = {
				id: 'file:///test/structured.agent.md',
				uri: URI.parse('file:///test/structured.agent.md'),
				name: 'Structured',
				model: [
					{ name: 'Missing (test)', reasoningEffort: 'low', contextSize: 50_000 },
					{ name: 'Available (test)', reasoningEffort: 'high', contextSize: 222_222 },
				],
				agentInstructions: { content: 'test', toolReferences: [] },
				source: { storage: PromptsStorage.local },
				target: Target.Undefined,
				visibility: { userInvocable: true, agentInvocable: true },
				enabled: true,
			};
			const currentModeInstructions: IChatRequestModeInstructions = {
				uri: customAgent.uri,
				name: customAgent.name,
				content: customAgent.agentInstructions.content,
				toolReferences: [],
			};
			const { tool } = createInvokableTool({ allowInvocationsFromSubagents: false, capturedRequests, currentModeInstructions, customAgents: [customAgent], languageModelsService });
			const sessionUri = URI.parse('test://session/structured');
			const parameters = [
				{ agentName: 'Structured', reasoningEffort: 'low', contextSize: 150_000 },
				{ reasoningEffort: 'low' },
				{ agentName: 'Structured' },
			];
			for (const overrides of parameters) {
				const invocation = createInvocation(sessionUri);
				invocation.parameters = {
					prompt: 'do something',
					description: 'test',
					...overrides,
				};
				invocation.modelId = 'main-id';

				await tool.prepareToolInvocation({
					parameters: invocation.parameters,
					toolCallId: invocation.callId,
					modelId: invocation.modelId,
					chatSessionResource: sessionUri,
				}, CancellationToken.None);
				await tool.invoke(invocation, countTokens, noProgress, CancellationToken.None);
			}

			assert.deepStrictEqual(capturedRequests.map(request => ({
				modelId: request.userSelectedModelId,
				configuration: request.modelConfiguration,
			})), [
				{
					modelId: 'available-id',
					configuration: { temperature: 0.5, thinkingLevel: 'low', maxPromptTokens: 150_000 },
				},
				{
					modelId: 'available-id',
					configuration: { temperature: 0.5, thinkingLevel: 'low', maxPromptTokens: 222_222 },
				},
				{
					modelId: 'available-id',
					configuration: { temperature: 0.5, thinkingLevel: 'high', maxPromptTokens: 222_222 },
				},
			]);
		});

		test('explicit models receive defaults only from their matching custom-agent entry', async () => {
			const capturedRequests: IChatAgentRequest[] = [];
			const createMetadata = (name: string): ILanguageModelChatMetadata => ({
				extension: new ExtensionIdentifier('test.extension'),
				name,
				id: name.toLowerCase(),
				vendor: 'test',
				version: '1',
				family: name,
				maxInputTokens: 300_000,
				maxOutputTokens: 10_000,
				isDefaultForLocation: {},
				capabilities: { toolCalling: true },
				configurationSchema: {
					properties: {
						thinkingLevel: { type: 'string', enum: ['low', 'medium', 'high'], group: 'navigation' },
						maxPromptTokens: { type: 'number', enum: [100_000, 300_000], group: 'tokens' },
					}
				}
			});
			const firstMetadata = createMetadata('First');
			const laterMetadata = createMetadata('Later');
			const outsideMetadata = createMetadata('Outside');
			const metadataById = new Map([
				['first-id', firstMetadata],
				['later-id', laterMetadata],
				['outside-id', outsideMetadata],
			]);
			const metadataByName = new Map<string, ILanguageModelChatMetadataAndIdentifier>([
				['First (test)', { identifier: 'first-id', metadata: firstMetadata }],
				['Later (test)', { identifier: 'later-id', metadata: laterMetadata }],
				['Outside (test)', { identifier: 'outside-id', metadata: outsideMetadata }],
			]);
			const languageModelsService: Partial<ILanguageModelsService> = {
				getLanguageModelIds: () => Array.from(metadataById.keys()),
				lookupLanguageModel: (id: string) => metadataById.get(id),
				lookupLanguageModelByQualifiedName: (name: string) => metadataByName.get(name),
				getModelConfiguration: () => ({ temperature: 0.5, thinkingLevel: 'medium', maxPromptTokens: 100_000 }),
			};
			const customAgent: ICustomAgent = {
				id: 'file:///test/explicit.agent.md',
				uri: URI.parse('file:///test/explicit.agent.md'),
				name: 'Explicit',
				model: [
					{ name: 'First (test)', reasoningEffort: 'low', contextSize: 120_000 },
					{ name: 'Later (test)', reasoningEffort: 'high', contextSize: 220_000 },
				],
				agentInstructions: { content: 'test', toolReferences: [] },
				source: { storage: PromptsStorage.local },
				target: Target.Undefined,
				visibility: { userInvocable: true, agentInvocable: true },
				enabled: true,
			};
			const { tool } = createInvokableTool({ allowInvocationsFromSubagents: false, capturedRequests, customAgents: [customAgent], languageModelsService: languageModelsService as ILanguageModelsService });
			const sessionUri = URI.parse('test://session/explicit-config');
			for (const { model, reasoningEffort } of [
				{ model: 'Later (test)', reasoningEffort: 'medium' },
				{ model: 'Outside (test)', reasoningEffort: 'high' },
			]) {
				const invocation = createInvocation(sessionUri);
				invocation.parameters = {
					prompt: 'do something',
					description: 'test',
					agentName: customAgent.name,
					model,
					reasoningEffort,
				};
				invocation.modelId = 'first-id';

				await tool.prepareToolInvocation({
					parameters: invocation.parameters,
					toolCallId: invocation.callId,
					modelId: invocation.modelId,
					chatSessionResource: sessionUri,
				}, CancellationToken.None);
				await tool.invoke(invocation, countTokens, noProgress, CancellationToken.None);
			}

			assert.deepStrictEqual(capturedRequests.map(request => ({
				modelId: request.userSelectedModelId,
				configuration: request.modelConfiguration,
			})), [
				{
					modelId: 'later-id',
					configuration: { temperature: 0.5, thinkingLevel: 'medium', maxPromptTokens: 220_000 },
				},
				{
					modelId: 'outside-id',
					configuration: { temperature: 0.5, thinkingLevel: 'high', maxPromptTokens: 100_000 },
				},
			]);
		});

		test('built-in BYOK fallback skips Copilot defaults and applies invocation overrides to the inherited model', async () => {
			const capturedRequests: IChatAgentRequest[] = [];
			const byokMetadata: ILanguageModelChatMetadata = {
				extension: new ExtensionIdentifier('test.extension'),
				name: 'BYOK',
				id: 'byok',
				vendor: 'anthropic',
				version: '1',
				family: 'byok',
				maxInputTokens: 300_000,
				maxOutputTokens: 10_000,
				isDefaultForLocation: {},
				isBYOK: true,
				capabilities: { toolCalling: true },
				configurationSchema: {
					properties: {
						thinkingLevel: { type: 'string', enum: ['low', 'high'], group: 'navigation' },
						maxPromptTokens: { type: 'number', enum: [100_000, 300_000], group: 'tokens' },
					}
				}
			};
			const copilotMetadata: ILanguageModelChatMetadata = {
				...byokMetadata,
				name: 'Copilot',
				id: 'copilot',
				vendor: COPILOT_VENDOR_ID,
				isBYOK: false,
			};
			const languageModelsService = {
				getLanguageModelIds: () => ['byok-id', 'copilot-id'],
				lookupLanguageModel: (id: string) => id === 'byok-id' ? byokMetadata : id === 'copilot-id' ? copilotMetadata : undefined,
				lookupLanguageModelByQualifiedName: (name: string) => name === 'Copilot (copilot)' ? { identifier: 'copilot-id', metadata: copilotMetadata } : undefined,
				getModelConfiguration: (id: string) => id === 'byok-id' ? { temperature: 0.5, thinkingLevel: 'low', maxPromptTokens: 100_000 } : undefined,
			} as ILanguageModelsService;
			const builtinProductService = { defaultChatAgent: { chatExtensionId: 'github.copilot-chat' } } as IProductService;
			const customAgent: ICustomAgent = {
				id: 'file:///test/byok.agent.md',
				uri: URI.parse('file:///test/byok.agent.md'),
				name: 'Explore',
				model: [{ name: 'Copilot (copilot)', reasoningEffort: 'low', contextSize: 120_000 }],
				agentInstructions: { content: 'test', toolReferences: [] },
				source: { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier('github.copilot-chat') },
				target: Target.Undefined,
				visibility: { userInvocable: true, agentInvocable: true },
				enabled: true,
			};
			const { tool } = createInvokableTool({
				allowInvocationsFromSubagents: false,
				capturedRequests,
				customAgents: [customAgent],
				languageModelsService,
				productService: builtinProductService,
			});
			const sessionUri = URI.parse('test://session/byok-config');
			const invocation = createInvocation(sessionUri);
			invocation.parameters = {
				prompt: 'do something',
				description: 'test',
				agentName: customAgent.name,
				reasoningEffort: 'high',
			};
			invocation.modelId = 'byok-id';

			await tool.prepareToolInvocation({
				parameters: invocation.parameters,
				toolCallId: invocation.callId,
				modelId: invocation.modelId,
				chatSessionResource: sessionUri,
			}, CancellationToken.None);
			await tool.invoke(invocation, countTokens, noProgress, CancellationToken.None);

			assert.deepStrictEqual(capturedRequests.map(request => ({
				modelId: request.userSelectedModelId,
				configuration: request.modelConfiguration,
			})), [{
				modelId: 'byok-id',
				configuration: { temperature: 0.5, thinkingLevel: 'high', maxPromptTokens: 100_000 },
			}]);
		});

		test('prepared structured fallback merges defaults over the configuration at invocation time', async () => {
			const capturedRequests: IChatAgentRequest[] = [];
			const availableMetadata: ILanguageModelChatMetadata = {
				extension: new ExtensionIdentifier('test.extension'),
				name: 'Available',
				id: 'available',
				vendor: 'test',
				version: '1',
				family: 'available',
				maxInputTokens: 300_000,
				maxOutputTokens: 10_000,
				isDefaultForLocation: {},
				capabilities: { toolCalling: true },
				configurationSchema: {
					properties: {
						thinkingLevel: { type: 'string', enum: ['low', 'high'], group: 'navigation' },
					}
				}
			};
			let baseConfiguration: IStringDictionary<unknown> = { temperature: 0.5, thinkingLevel: 'low' };
			const languageModelsService = {
				getLanguageModelIds: () => ['available-id'],
				lookupLanguageModel: (id: string) => id === 'available-id' ? availableMetadata : undefined,
				lookupLanguageModelByQualifiedName: (name: string) => name === 'Available (test)' ? { identifier: 'available-id', metadata: availableMetadata } : undefined,
				getModelConfiguration: (id: string) => id === 'available-id' ? baseConfiguration : undefined,
			} as ILanguageModelsService;
			const customAgent: ICustomAgent = {
				id: 'file:///test/structured.agent.md',
				uri: URI.parse('file:///test/structured.agent.md'),
				name: 'Structured',
				model: [{ name: 'Available (test)', reasoningEffort: 'high' }],
				agentInstructions: { content: 'test', toolReferences: [] },
				source: { storage: PromptsStorage.local },
				target: Target.Undefined,
				visibility: { userInvocable: true, agentInvocable: true },
				enabled: true,
			};
			const { tool } = createInvokableTool({ allowInvocationsFromSubagents: false, capturedRequests, customAgents: [customAgent], languageModelsService });
			const sessionUri = URI.parse('test://session/structured-live-config');
			const invocation = createInvocation(sessionUri);
			invocation.parameters = { prompt: 'do something', description: 'test', agentName: 'Structured' };
			invocation.modelId = 'main-id';

			await tool.prepareToolInvocation({
				parameters: invocation.parameters,
				toolCallId: invocation.callId,
				modelId: invocation.modelId,
				chatSessionResource: sessionUri,
			}, CancellationToken.None);
			baseConfiguration = { temperature: 0.7, thinkingLevel: 'low' };
			const result = await tool.invoke(invocation, countTokens, noProgress, CancellationToken.None);

			assert.strictEqual(capturedRequests.length, 1, JSON.stringify(result.content));
			assert.deepStrictEqual(capturedRequests[0].modelConfiguration, { temperature: 0.7, thinkingLevel: 'high' });
		});

		const countTokens = async () => 0;
		const noProgress: ToolProgress = { report() { } };

		test('disables runSubagent tool when nesting is disabled', async () => {
			const capturedRequests: IChatAgentRequest[] = [];
			const { tool } = createInvokableTool({ allowInvocationsFromSubagents: false, capturedRequests });
			const sessionUri = URI.parse('test://session/depth0');

			await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);

			assert.strictEqual(capturedRequests.length, 1);
			assert.strictEqual(capturedRequests[0].userSelectedTools?.['runSubagent'], false);
		});

		test('enables runSubagent tool at depth 0 when nesting is enabled', async () => {
			const capturedRequests: IChatAgentRequest[] = [];
			const { tool } = createInvokableTool({ allowInvocationsFromSubagents: true, capturedRequests });
			const sessionUri = URI.parse('test://session/depth-enabled');

			await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);

			assert.strictEqual(capturedRequests.length, 1);
			assert.strictEqual(capturedRequests[0].userSelectedTools?.['runSubagent'], true);
		});

		test('disables runSubagent tool when depth reaches hard limit', async () => {
			const capturedRequests: IChatAgentRequest[] = [];
			const sessionUri = URI.parse('test://session/depth-limit');

			// When nesting is enabled, the tool enforces a hardcoded maximum depth of 5.
			// Simulate nested invocation until we exceed the limit and ensure it disables nesting.
			const { tool, mockChatAgentService } = createInvokableTool({ allowInvocationsFromSubagents: true, capturedRequests });

			// Simulate nested invocation: the first invoke's invokeAgent callback
			// triggers a second invoke on the same tool (same session).
			capturedRequests.length = 0;
			let nestedInvocations = 0;
			mockChatAgentService.invokeAgent = async (_id: string, request: IChatAgentRequest) => {
				capturedRequests.push(request);
				// Keep nesting until we go beyond the hardcoded maxDepth
				if (nestedInvocations++ < RUN_SUBAGENT_MAX_NESTING_DEPTH + 1) {
					await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
				}
				return {};
			};

			await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);

			assert.ok(capturedRequests.length >= 2);
			// At depth 0..(maxDepth-1), nesting is allowed. Once depth reaches maxDepth, the next call should disable nesting.
			const enabledFlags = capturedRequests.map(r => r.userSelectedTools?.['runSubagent']);
			assert.strictEqual(enabledFlags[0], true);
			assert.strictEqual(enabledFlags[1], true);
			assert.strictEqual(enabledFlags[RUN_SUBAGENT_MAX_NESTING_DEPTH], false);
		});

		test('depth is decremented after invoke completes', async () => {
			const capturedRequests: IChatAgentRequest[] = [];
			const { tool } = createInvokableTool({ allowInvocationsFromSubagents: true, capturedRequests });
			const sessionUri = URI.parse('test://session/depth-decrement');

			// First invoke
			await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
			// Second invoke on same session should start at depth 0 again
			await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);

			assert.strictEqual(capturedRequests.length, 2);
			// Both should have runSubagent enabled since depth resets after each invoke
			assert.strictEqual(capturedRequests[0].userSelectedTools?.['runSubagent'], true);
			assert.strictEqual(capturedRequests[1].userSelectedTools?.['runSubagent'], true);
		});

		test('inherits the current agent instructions when agentName is omitted', async () => {
			const capturedRequests: IChatAgentRequest[] = [];
			const currentModeInstructions = { name: 'CurrentAgent', content: 'Current agent instructions', toolReferences: [] };
			const { tool } = createInvokableTool({ allowInvocationsFromSubagents: false, capturedRequests, currentModeInstructions });
			const sessionUri = URI.parse('test://session/current-agent');

			await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);

			assert.strictEqual(capturedRequests.length, 1);
			assert.strictEqual(capturedRequests[0].subAgentName, 'CurrentAgent');
			assert.deepStrictEqual(capturedRequests[0].modeInstructions, currentModeInstructions);
		});
	});

	suite('subagent credits', () => {
		let creditsCallIdCounter = 0;

		/**
		 * Creates a RunSubagentTool whose subagent invocation emits the supplied
		 * usage progress parts, so tests can assert how the subagent's credit
		 * (AIC) cost is surfaced on its tool's `toolSpecificData`.
		 */
		function createCreditTool(usageParts: IChatProgress[]) {
			const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
			const configService = new TestConfigurationService();
			const promptsService = new MockPromptsService();

			const mockChatAgentService: Pick<IChatAgentService, 'getDefaultAgent' | 'invokeAgent'> = {
				getDefaultAgent() {
					return { id: 'default-agent' } as IChatAgentService extends { getDefaultAgent(...args: infer _A): infer R } ? NonNullable<R> : never;
				},
				async invokeAgent(_id: string, _request: IChatAgentRequest, progress: (parts: IChatProgress[]) => void): Promise<IChatAgentResult> {
					progress(usageParts);
					return {};
				},
			};

			const mockChatService: Pick<IChatService, 'getSession'> = {
				getSession() {
					return {
						getRequests: () => [{ id: 'req-1' }],
						acceptResponseProgress: () => { },
					} as unknown as IChatModel;
				},
			};

			const mockInstantiationService: Pick<IInstantiationService, 'createInstance'> = {
				createInstance(..._args: never[]): { collect: () => Promise<void> } {
					return { collect: async () => { } };
				},
			};

			return testDisposables.add(new RunSubagentTool(
				mockChatAgentService as IChatAgentService,
				mockChatService as IChatService,
				mockToolsService,
				{} as ILanguageModelsService,
				new NullLogService(),
				configService,
				promptsService,
				mockInstantiationService as IInstantiationService,
				{} as IProductService,
			));
		}

		function createSubagentInvocation(): IToolInvocation {
			return {
				callId: `credits-call-${++creditsCallIdCounter}`,
				toolId: 'runSubagent',
				parameters: { prompt: 'do something', description: 'test' },
				context: { sessionResource: URI.parse('test://session/credits') },
				userSelectedTools: { runSubagent: true },
				toolSpecificData: { kind: 'subagent', description: 'test' },
			} as IToolInvocation;
		}

		const countTokens = async () => 0;
		const noProgress: ToolProgress = { report() { } };

		test('writes the running credit total onto the subagent toolSpecificData', async () => {
			// Credits are cumulative per usage event; the latest value is the total.
			const tool = createCreditTool([
				{ kind: 'usage', promptTokens: 10, completionTokens: 5, copilotCredits: 2 },
				{ kind: 'usage', promptTokens: 20, completionTokens: 8, copilotCredits: 5 },
			]);
			const invocation = createSubagentInvocation();

			await tool.invoke(invocation, countTokens, noProgress, CancellationToken.None);

			assert.strictEqual(invocation.toolSpecificData?.kind === 'subagent' ? invocation.toolSpecificData.credits : undefined, 5);
		});

		test('leaves credits unset when no usage is reported', async () => {
			const tool = createCreditTool([]);
			const invocation = createSubagentInvocation();

			await tool.invoke(invocation, countTokens, noProgress, CancellationToken.None);

			assert.strictEqual(invocation.toolSpecificData?.kind === 'subagent' ? invocation.toolSpecificData.credits : undefined, undefined);
		});
	});
});
