/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { RUN_SUBAGENT_MAX_NESTING_DEPTH, RunSubagentTool } from '../../../../common/tools/builtinTools/runSubagentTool.js';
import { MockLanguageModelToolsService } from '../mockLanguageModelToolsService.js';
import { IChatAgentHistoryEntry, IChatAgentRequest, IChatAgentResult, IChatAgentService, UserSelectedTools } from '../../../../common/participants/chatAgents.js';
import { IChatProgress, IChatService } from '../../../../common/chatService/chatService.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../common/languageModels.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../../../../platform/product/common/productService.js';
import { ICustomAgent, PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { Target } from '../../../../common/promptSyntax/promptTypes.js';
import { MockPromptsService } from '../../promptSyntax/service/mockPromptsService.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { IToolInvocation, ToolProgress } from '../../../../common/tools/languageModelToolsService.js';
import { IChatModel } from '../../../../common/model/chatModel.js';
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
			const configService = new TestConfigurationService();

			const promptsService = new MockPromptsService();
			const customMode: ICustomAgent = {
				uri: URI.parse('file:///test/custom-agent.md'),
				name: 'CustomAgent',
				description: 'A test custom agent',
				tools: ['tool1', 'tool2'],
				agentInstructions: { content: 'Custom agent body', toolReferences: [] },
				source: { storage: PromptsStorage.local },
				target: Target.Undefined,
				visibility: { userInvocable: true, agentInvocable: true }
			};
			promptsService.setCustomModes([customMode]);

			const tool = testDisposables.add(new RunSubagentTool(
				{} as IChatAgentService,
				{} as IChatService,
				mockToolsService,
				{} as ILanguageModelsService,
				new NullLogService(),
				mockToolsService,
				configService,
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
	});

	suite('getToolData', () => {
		test('returns basic tool data', () => {
			const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
			const configService = new TestConfigurationService();
			const promptsService = new MockPromptsService();

			const tool = testDisposables.add(new RunSubagentTool(
				{} as IChatAgentService,
				{} as IChatService,
				mockToolsService,
				{} as ILanguageModelsService,
				new NullLogService(),
				mockToolsService,
				configService,
				promptsService,
				{} as IInstantiationService,
				{} as IProductService,
			));

			const toolData = tool.getToolData();

			assert.strictEqual(toolData.id, 'runSubagent');
			assert.ok(toolData.inputSchema);
			assert.ok(toolData.inputSchema.properties?.prompt);
			assert.ok(toolData.inputSchema.properties?.description);
			assert.deepStrictEqual(toolData.inputSchema.required, ['prompt', 'description']);
		});

		test('includes agentName property when SubagentToolCustomAgents is enabled', () => {
			const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
			const configService = new TestConfigurationService({
				'chat.customAgentInSubagent.enabled': true,
			});
			const promptsService = new MockPromptsService();

			const tool = testDisposables.add(new RunSubagentTool(
				{} as IChatAgentService,
				{} as IChatService,
				mockToolsService,
				{} as ILanguageModelsService,
				new NullLogService(),
				mockToolsService,
				configService,
				promptsService,
				{} as IInstantiationService,
				{} as IProductService,
			));

			const toolData = tool.getToolData();

			assert.ok(toolData.inputSchema?.properties?.agentName, 'agentName should be in schema when custom agents enabled');
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

	// Shared helpers for model resolution test suites
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
			modelPickerCategory: undefined,
			multiplierNumeric,
		};
	}

	function createModelTool(opts: {
		models: Map<string, ILanguageModelChatMetadata>;
		qualifiedNameMap?: Map<string, ILanguageModelChatMetadataAndIdentifier>;
		customAgents?: ICustomAgent[];
		enableCustomAgents?: boolean;
	}) {
		const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
		const configService = opts.enableCustomAgents
			? new TestConfigurationService({ 'chat.customAgentInSubagent.enabled': true })
			: new TestConfigurationService();
		const promptsService = new MockPromptsService();
		if (opts.customAgents) {
			promptsService.setCustomModes(opts.customAgents);
		}

		const mockLanguageModelsService: Partial<ILanguageModelsService> = {
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
			mockToolsService,
			configService,
			promptsService,
			{} as IInstantiationService,
			{} as IProductService,
		));

		return tool;
	}

	function createAgent(name: string, modelQualifiedNames?: string[], tiers?: Record<string, { model: string }>): ICustomAgent {
		return {
			uri: URI.parse(`file:///test/${name}.md`),
			name,
			description: `Agent ${name}`,
			tools: ['tool1'],
			model: modelQualifiedNames,
			tiers,
			agentInstructions: { content: 'test', toolReferences: [] },
			source: { storage: PromptsStorage.local },
			target: Target.Undefined,
			visibility: { userInvocable: true, agentInvocable: true }
		};
	}

	suite('model fallback behavior', () => {
		test('falls back to main model when subagent model has higher multiplier', async () => {
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
			const tool = createModelTool({ models, qualifiedNameMap, customAgents: [agent] });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test task', agentName: 'ExpensiveAgent' },
				toolCallId: 'call-1',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			// Should fall back to the main model's name, not the expensive model
			assert.deepStrictEqual(result.toolSpecificData, {
				kind: 'subagent',
				description: 'test task',
				agentName: 'ExpensiveAgent',
				prompt: 'test',
				modelName: 'GPT-4o',
			});
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
			const tool = createModelTool({ models, qualifiedNameMap, customAgents: [agent] });

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
			const tool = createModelTool({ models, qualifiedNameMap, customAgents: [agent] });

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
			const tool = createModelTool({ models, qualifiedNameMap, customAgents: [agent] });

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
			const tool = createModelTool({ models, qualifiedNameMap, customAgents: [agent] });

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

			const tool = createModelTool({ models });

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
			const tool = createModelTool({ models, customAgents: [agent] });

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
	});

	suite('call-time model parameter', () => {
		test('includes model and tier properties in schema when custom agents enabled', () => {
			const models = new Map<string, ILanguageModelChatMetadata>();
			const tool = createModelTool({ models, enableCustomAgents: true });
			const toolData = tool.getToolData();

			assert.ok(toolData.inputSchema?.properties?.model, 'model should be in schema when custom agents enabled');
			assert.ok(toolData.inputSchema?.properties?.tier, 'tier should be in schema when custom agents enabled');
		});

		test('model parameter overrides agent frontmatter model via qualified name', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const agentMeta = createMetadata('Claude Haiku', 0.5);
			const overrideMeta = createMetadata('Claude Sonnet', 1);
			const models = new Map([
				['main-model-id', mainMeta],
				['agent-model-id', agentMeta],
				['override-model-id', overrideMeta],
			]);
			const qualifiedNameMap = new Map([
				['Claude Haiku (TestVendor)', { metadata: agentMeta, identifier: 'agent-model-id' }],
				['Claude Sonnet (TestVendor)', { metadata: overrideMeta, identifier: 'override-model-id' }],
			]);

			const agent = createAgent('TestAgent', ['Claude Haiku (TestVendor)']);
			const tool = createModelTool({ models, qualifiedNameMap, customAgents: [agent], enableCustomAgents: true });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test', agentName: 'TestAgent', model: 'Claude Sonnet (TestVendor)' },
				toolCallId: 'model-override-1',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			assert.strictEqual(result.toolSpecificData?.modelName, 'Claude Sonnet');
		});

		test('model parameter overrides via direct model ID', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const overrideMeta = createMetadata('Claude Sonnet', 1);
			const models = new Map([
				['main-model-id', mainMeta],
				['claude-sonnet', overrideMeta],
			]);

			const tool = createModelTool({ models, enableCustomAgents: true });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test', model: 'claude-sonnet' },
				toolCallId: 'model-direct-1',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			assert.strictEqual(result.toolSpecificData?.modelName, 'Claude Sonnet');
		});

		test('model parameter is subject to multiplier cap', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const expensiveMeta = createMetadata('O3 Pro', 50);
			const models = new Map([
				['main-model-id', mainMeta],
				['o3-pro', expensiveMeta],
			]);

			const tool = createModelTool({ models, enableCustomAgents: true });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test', model: 'o3-pro' },
				toolCallId: 'model-cap-1',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			// Should fall back to main model due to multiplier cap
			assert.strictEqual(result.toolSpecificData?.modelName, 'GPT-4o');
		});

		test('unknown model hint is ignored gracefully', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const models = new Map([
				['main-model-id', mainMeta],
			]);

			const tool = createModelTool({ models, enableCustomAgents: true });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test', model: 'nonexistent-model' },
				toolCallId: 'model-unknown-1',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			// Should fall back to main model since override was not found
			assert.strictEqual(result.toolSpecificData?.modelName, 'GPT-4o');
		});

		test('model param takes precedence over tier param', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const tierMeta = createMetadata('Claude Haiku', 0.25);
			const modelMeta = createMetadata('Claude Sonnet', 1);
			const models = new Map([
				['main-model-id', mainMeta],
				['haiku-id', tierMeta],
				['sonnet-id', modelMeta],
			]);
			const qualifiedNameMap = new Map([
				['Claude Haiku (TestVendor)', { metadata: tierMeta, identifier: 'haiku-id' }],
				['Claude Sonnet (TestVendor)', { metadata: modelMeta, identifier: 'sonnet-id' }],
			]);

			const agent = createAgent('TieredAgent', undefined, {
				fast: { model: 'Claude Haiku (TestVendor)' },
			});
			const tool = createModelTool({ models, qualifiedNameMap, customAgents: [agent], enableCustomAgents: true });

			const result = await tool.prepareToolInvocation({
				parameters: {
					prompt: 'test', description: 'test',
					agentName: 'TieredAgent',
					tier: 'fast',
					model: 'Claude Sonnet (TestVendor)',
				},
				toolCallId: 'precedence-1',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			// model takes precedence over tier
			assert.strictEqual(result.toolSpecificData?.modelName, 'Claude Sonnet');
		});
	});

	suite('tier resolution', () => {
		test('tier resolves to correct model from agent tiers frontmatter', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const fastMeta = createMetadata('Claude Haiku', 0.25);
			const deepMeta = createMetadata('Claude Sonnet', 1);
			const models = new Map([
				['main-model-id', mainMeta],
				['haiku-id', fastMeta],
				['sonnet-id', deepMeta],
			]);
			const qualifiedNameMap = new Map([
				['Claude Haiku (TestVendor)', { metadata: fastMeta, identifier: 'haiku-id' }],
				['Claude Sonnet (TestVendor)', { metadata: deepMeta, identifier: 'sonnet-id' }],
			]);

			const agent = createAgent('TieredAgent', undefined, {
				fast: { model: 'Claude Haiku (TestVendor)' },
				deep: { model: 'Claude Sonnet (TestVendor)' },
			});
			const tool = createModelTool({ models, qualifiedNameMap, customAgents: [agent], enableCustomAgents: true });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test', agentName: 'TieredAgent', tier: 'fast' },
				toolCallId: 'tier-fast-1',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			assert.strictEqual(result.toolSpecificData?.modelName, 'Claude Haiku');
		});

		test('tier overrides agent frontmatter model', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const agentDefaultMeta = createMetadata('Claude Sonnet', 1);
			const tierMeta = createMetadata('Claude Haiku', 0.25);
			const models = new Map([
				['main-model-id', mainMeta],
				['sonnet-id', agentDefaultMeta],
				['haiku-id', tierMeta],
			]);
			const qualifiedNameMap = new Map([
				['Claude Sonnet (TestVendor)', { metadata: agentDefaultMeta, identifier: 'sonnet-id' }],
				['Claude Haiku (TestVendor)', { metadata: tierMeta, identifier: 'haiku-id' }],
			]);

			// Agent has both a default model and tiers
			const agent = createAgent('TieredAgent', ['Claude Sonnet (TestVendor)'], {
				fast: { model: 'Claude Haiku (TestVendor)' },
			});
			const tool = createModelTool({ models, qualifiedNameMap, customAgents: [agent], enableCustomAgents: true });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test', agentName: 'TieredAgent', tier: 'fast' },
				toolCallId: 'tier-override-1',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			// Tier takes precedence over agent's default model
			assert.strictEqual(result.toolSpecificData?.modelName, 'Claude Haiku');
		});

		test('tier resolution respects multiplier cap', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const expensiveMeta = createMetadata('O3 Pro', 50);
			const models = new Map([
				['main-model-id', mainMeta],
				['o3-pro-id', expensiveMeta],
			]);
			const qualifiedNameMap = new Map([
				['O3 Pro (TestVendor)', { metadata: expensiveMeta, identifier: 'o3-pro-id' }],
			]);

			const agent = createAgent('TieredAgent', undefined, {
				deep: { model: 'O3 Pro (TestVendor)' },
			});
			const tool = createModelTool({ models, qualifiedNameMap, customAgents: [agent], enableCustomAgents: true });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test', agentName: 'TieredAgent', tier: 'deep' },
				toolCallId: 'tier-cap-1',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			// Should fall back to main model due to multiplier cap
			assert.strictEqual(result.toolSpecificData?.modelName, 'GPT-4o');
		});

		test('unknown tier name falls back to agent default model', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const agentMeta = createMetadata('Claude Sonnet', 1);
			const models = new Map([
				['main-model-id', mainMeta],
				['sonnet-id', agentMeta],
			]);
			const qualifiedNameMap = new Map([
				['Claude Sonnet (TestVendor)', { metadata: agentMeta, identifier: 'sonnet-id' }],
			]);

			const agent = createAgent('TieredAgent', ['Claude Sonnet (TestVendor)'], {
				fast: { model: 'Claude Sonnet (TestVendor)' },
			});
			const tool = createModelTool({ models, qualifiedNameMap, customAgents: [agent], enableCustomAgents: true });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test', agentName: 'TieredAgent', tier: 'nonexistent' },
				toolCallId: 'tier-unknown-1',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			// Falls back to agent's default model (not main model) since tier was not found
			assert.strictEqual(result.toolSpecificData?.modelName, 'Claude Sonnet');
		});

		test('tier without a named subagent is ignored', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const models = new Map([
				['main-model-id', mainMeta],
			]);

			const tool = createModelTool({ models, enableCustomAgents: true });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test', tier: 'fast' },
				toolCallId: 'tier-no-agent-1',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			// tier is ignored when no agent is specified (agent.tiers would be undefined)
			assert.strictEqual(result.toolSpecificData?.modelName, 'GPT-4o');
		});

		test('tier with agent that has no tiers defined falls back gracefully', async () => {
			const mainMeta = createMetadata('GPT-4o', 1);
			const agentMeta = createMetadata('Claude Sonnet', 1);
			const models = new Map([
				['main-model-id', mainMeta],
				['sonnet-id', agentMeta],
			]);
			const qualifiedNameMap = new Map([
				['Claude Sonnet (TestVendor)', { metadata: agentMeta, identifier: 'sonnet-id' }],
			]);

			// Agent has a model but no tiers
			const agent = createAgent('NoTiersAgent', ['Claude Sonnet (TestVendor)']);
			const tool = createModelTool({ models, qualifiedNameMap, customAgents: [agent], enableCustomAgents: true });

			const result = await tool.prepareToolInvocation({
				parameters: { prompt: 'test', description: 'test', agentName: 'NoTiersAgent', tier: 'fast' },
				toolCallId: 'tier-no-tiers-1',
				modelId: 'main-model-id',
				chatSessionResource: URI.parse('test://session'),
			}, CancellationToken.None);

			assert.ok(result);
			// Falls back to agent's frontmatter model since tiers is undefined
			assert.strictEqual(result.toolSpecificData?.modelName, 'Claude Sonnet');
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

			const tool = testDisposables.add(new RunSubagentTool(
				mockChatAgentService as IChatAgentService,
				mockChatService as IChatService,
				mockToolsService,
				{} as ILanguageModelsService,
				new NullLogService(),
				mockToolsService,
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
	});
});
