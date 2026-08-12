/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
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
import { IChatModel, IChatRequestModeInstructions, Response } from '../../../../common/model/chatModel.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { annotateSpecialMarkdownContent, extractCodeblockUrisFromText } from '../../../../common/widget/annotations.js';

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
	});

	suite('edit progress rendering', () => {
		const countTokens = async () => 0;
		const noProgress: ToolProgress = { report() { } };

		test('isolates interleaved edits and parent markdown into separate merge domains', async () => {
			const response = testDisposables.add(new Response([]));
			const firstEditEmitted = new DeferredPromise<void>();
			const secondAgentEmitted = new DeferredPromise<void>();
			const editUris = {
				first: URI.parse('file:///workspace/first.ts'),
				second: URI.parse('file:///workspace/second.ts'),
				third: URI.parse('file:///workspace/third.ts'),
			};
			const acceptedProgress: IChatProgress[] = [];
			const rawEditEmissions: { subAgentInvocationId: string; parts: IChatProgress[] }[] = [];
			const emitEdit = (subAgentInvocationId: string, progress: (parts: IChatProgress[]) => void, uri: URI) => {
				const start = acceptedProgress.length;
				progress([{ kind: 'codeblockUri', uri, isEdit: true }]);
				rawEditEmissions.push({ subAgentInvocationId, parts: acceptedProgress.slice(start) });
			};
			const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
			const mockChatAgentService: Pick<IChatAgentService, 'getDefaultAgent' | 'invokeAgent'> = {
				getDefaultAgent() {
					return { id: 'default-agent' } as IChatAgentService extends { getDefaultAgent(...args: infer _A): infer R } ? NonNullable<R> : never;
				},
				async invokeAgent(_id: string, request: IChatAgentRequest, progress: (parts: IChatProgress[]) => void): Promise<IChatAgentResult> {
					const subAgentInvocationId = request.subAgentInvocationId;
					if (!subAgentInvocationId) {
						throw new Error('Expected a subagent invocation ID');
					}
					if (subAgentInvocationId === 'subagent-a') {
						emitEdit(subAgentInvocationId, progress, editUris.first);
						firstEditEmitted.complete();
						await secondAgentEmitted.p;
						emitEdit(subAgentInvocationId, progress, editUris.third);
					} else {
						await firstEditEmitted.p;
						emitEdit(subAgentInvocationId, progress, editUris.second);
						secondAgentEmitted.complete();
					}
					return {};
				},
			};
			const request = { id: 'request-1' };
			let undoStopCount = 0;
			const mockChatService: Pick<IChatService, 'getSession'> = {
				getSession() {
					return {
						getRequests: () => [request],
						acceptResponseProgress: (_request: unknown, progress: IChatProgress) => {
							acceptedProgress.push(progress);
							if (progress.kind === 'codeblockUri' && progress.isEdit) {
								// ChatModel.acceptResponseProgress adds an undo stop before every edit marker.
								response.updateContent({ kind: 'undoStop', id: `undo-${++undoStopCount}` }, true);
							}
							if (progress.kind === 'markdownContent' || progress.kind === 'codeblockUri') {
								response.updateContent(progress);
							}
						},
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
				{} as ILanguageModelsService,
				new NullLogService(),
				new TestConfigurationService(),
				new MockPromptsService(),
				mockInstantiationService as IInstantiationService,
				{} as IProductService,
			));
			const sessionResource = URI.parse('test://session/edit-progress');
			const createInvocation = (callId: string): IToolInvocation => ({
				callId,
				chatStreamToolCallId: callId,
				toolId: RunSubagentTool.Id,
				parameters: { prompt: 'edit files', description: 'test edits' },
				context: { sessionResource },
				userSelectedTools: { runSubagent: true },
			} as IToolInvocation);

			await Promise.all([
				tool.invoke(createInvocation('subagent-a'), countTokens, noProgress, CancellationToken.None),
				tool.invoke(createInvocation('subagent-b'), countTokens, noProgress, CancellationToken.None),
			]);
			response.updateContent({ kind: 'markdownContent', content: new MarkdownString('```text\nparent output\n```\n') });

			const rendered = annotateSpecialMarkdownContent(response.value);
			const markdownParts = rendered.filter(part => part.kind === 'markdownContent');
			const editParts = markdownParts
				.map(part => ({ part, extracted: extractCodeblockUrisFromText(part.content.value) }))
				.filter((entry): entry is typeof entry & { extracted: NonNullable<typeof entry.extracted> } => !!entry.extracted)
				.sort((a, b) => a.extracted.uri.path.localeCompare(b.extracted.uri.path));
			const mergeKeys = editParts.map(({ part }) => part.content.baseUri?.toString());
			const normalizedRawEmissions = rawEditEmissions.map(emission => ({
				subAgentInvocationId: emission.subAgentInvocationId,
				parts: emission.parts.map(part => {
					if (part.kind === 'markdownContent') {
						const baseUri = part.content.baseUri ? URI.from(part.content.baseUri) : undefined;
						return {
							kind: part.kind,
							value: part.content.value,
							mergeKey: baseUri ? `${baseUri.scheme}:${baseUri.path.replace(/\/[0-9a-f-]{36}$/, '/<edit-uuid>')}` : undefined,
						};
					}
					return part.kind === 'codeblockUri'
						? { kind: part.kind, uri: part.uri.toString(), subAgentInvocationId: part.subAgentInvocationId }
						: { kind: part.kind };
				}),
			}));

			assert.deepStrictEqual({
				rawEditEmissions: normalizedRawEmissions,
				edits: editParts.map(({ part, extracted }) => ({
					uri: extracted.uri.toString(),
					subAgentInvocationId: extracted.subAgentInvocationId,
					textWithoutMarker: extracted.textWithoutResult,
					mergeKeyScheme: part.content.baseUri?.scheme,
					mergeKeyPath: part.content.baseUri ? URI.from(part.content.baseUri).path.replace(/\/[0-9a-f-]{36}$/, '/<edit-uuid>') : undefined,
				})),
				uniqueMergeKeys: new Set(mergeKeys).size,
				parentMarkdown: markdownParts.find(part => !extractCodeblockUrisFromText(part.content.value))?.content.value,
			}, {
				rawEditEmissions: [
					{
						subAgentInvocationId: 'subagent-a',
						parts: [
							{ kind: 'markdownContent', value: '```\n', mergeKey: 'vscode-subagent-edit:/subagent-a/<edit-uuid>' },
							{ kind: 'codeblockUri', uri: editUris.first.toString(), subAgentInvocationId: 'subagent-a' },
							{ kind: 'markdownContent', value: '\n```\n\n', mergeKey: 'vscode-subagent-edit:/subagent-a/<edit-uuid>' },
						],
					},
					{
						subAgentInvocationId: 'subagent-b',
						parts: [
							{ kind: 'markdownContent', value: '```\n', mergeKey: 'vscode-subagent-edit:/subagent-b/<edit-uuid>' },
							{ kind: 'codeblockUri', uri: editUris.second.toString(), subAgentInvocationId: 'subagent-b' },
							{ kind: 'markdownContent', value: '\n```\n\n', mergeKey: 'vscode-subagent-edit:/subagent-b/<edit-uuid>' },
						],
					},
					{
						subAgentInvocationId: 'subagent-a',
						parts: [
							{ kind: 'markdownContent', value: '```\n', mergeKey: 'vscode-subagent-edit:/subagent-a/<edit-uuid>' },
							{ kind: 'codeblockUri', uri: editUris.third.toString(), subAgentInvocationId: 'subagent-a' },
							{ kind: 'markdownContent', value: '\n```\n\n', mergeKey: 'vscode-subagent-edit:/subagent-a/<edit-uuid>' },
						],
					},
				],
				edits: [
					{ uri: editUris.first.toString(), subAgentInvocationId: 'subagent-a', textWithoutMarker: '```\n\n```\n\n', mergeKeyScheme: 'vscode-subagent-edit', mergeKeyPath: '/subagent-a/<edit-uuid>' },
					{ uri: editUris.second.toString(), subAgentInvocationId: 'subagent-b', textWithoutMarker: '```\n\n```\n\n', mergeKeyScheme: 'vscode-subagent-edit', mergeKeyPath: '/subagent-b/<edit-uuid>' },
					{ uri: editUris.third.toString(), subAgentInvocationId: 'subagent-a', textWithoutMarker: '```\n\n```\n\n', mergeKeyScheme: 'vscode-subagent-edit', mergeKeyPath: '/subagent-a/<edit-uuid>' },
				],
				uniqueMergeKeys: 3,
				parentMarkdown: '```text\nparent output\n```\n',
			});
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
		}) {
			const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
			const configService = new TestConfigurationService({
				[ChatConfiguration.SubagentsAllowInvocationsFromSubagents]: opts.allowInvocationsFromSubagents,
			});
			const promptsService = new MockPromptsService();

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
				{} as ILanguageModelsService,
				new NullLogService(),
				configService,
				promptsService,
				mockInstantiationService as IInstantiationService,
				{} as IProductService,
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
		function createCreditTool(usageParts: IChatProgress[], result: IChatAgentResult = {}) {
			const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
			const configService = new TestConfigurationService();
			const promptsService = new MockPromptsService();
			const parentCredits: { subagentCallId: string; copilotCredits: number }[] = [];

			const mockChatAgentService: Pick<IChatAgentService, 'getDefaultAgent' | 'invokeAgent'> = {
				getDefaultAgent() {
					return { id: 'default-agent' } as IChatAgentService extends { getDefaultAgent(...args: infer _A): infer R } ? NonNullable<R> : never;
				},
				async invokeAgent(_id: string, _request: IChatAgentRequest, progress: (parts: IChatProgress[]) => void): Promise<IChatAgentResult> {
					progress(usageParts);
					return result;
				},
			};

			const mockChatService: Pick<IChatService, 'getSession'> = {
				getSession() {
					return {
						getRequests: () => [{
							id: 'req-1',
							response: {
								setSubagentCopilotCredits: (subagentCallId: string, copilotCredits: number) => parentCredits.push({ subagentCallId, copilotCredits }),
							},
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
				{} as ILanguageModelsService,
				new NullLogService(),
				configService,
				promptsService,
				mockInstantiationService as IInstantiationService,
				{} as IProductService,
			));
			return { tool, parentCredits };
		}

		function createSubagentInvocation(chatStreamToolCallId?: string): IToolInvocation {
			return {
				callId: `credits-call-${++creditsCallIdCounter}`,
				chatStreamToolCallId,
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
			const { tool, parentCredits } = createCreditTool([
				{ kind: 'usage', promptTokens: 10, completionTokens: 5, copilotCredits: 2 },
				{ kind: 'usage', promptTokens: 20, completionTokens: 8, copilotCredits: 5 },
				{ kind: 'usage', promptTokens: 20, completionTokens: 8, copilotCredits: 3 },
			]);
			const invocation = createSubagentInvocation('stream-tool-call');

			await tool.invoke(invocation, countTokens, noProgress, CancellationToken.None);

			assert.deepStrictEqual({
				toolCredits: invocation.toolSpecificData?.kind === 'subagent' ? invocation.toolSpecificData.credits : undefined,
				parentCredits,
			}, {
				toolCredits: 5,
				parentCredits: [{ subagentCallId: invocation.callId, copilotCredits: 5 }],
			});
		});

		test('records credits when the subagent fails after reporting usage', async () => {
			const { tool, parentCredits } = createCreditTool(
				[{ kind: 'usage', promptTokens: 10, completionTokens: 5, copilotCredits: 3 }],
				{ errorDetails: { message: 'failed' } },
			);
			const invocation = createSubagentInvocation();

			await tool.invoke(invocation, countTokens, noProgress, CancellationToken.None);

			assert.deepStrictEqual({
				toolCredits: invocation.toolSpecificData?.kind === 'subagent' ? invocation.toolSpecificData.credits : undefined,
				parentCredits,
			}, {
				toolCredits: 3,
				parentCredits: [{ subagentCallId: invocation.callId, copilotCredits: 3 }],
			});
		});

		test('leaves credits unset when no usage is reported', async () => {
			const { tool } = createCreditTool([]);
			const invocation = createSubagentInvocation();

			await tool.invoke(invocation, countTokens, noProgress, CancellationToken.None);

			assert.strictEqual(invocation.toolSpecificData?.kind === 'subagent' ? invocation.toolSpecificData.credits : undefined, undefined);
		});
	});
});
