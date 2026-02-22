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
import { RunSubagentTool } from '../../../../common/tools/builtinTools/runSubagentTool.js';
import { MockLanguageModelToolsService } from '../mockLanguageModelToolsService.js';
import { IChatAgentService } from '../../../../common/participants/chatAgents.js';
import { IChatService } from '../../../../common/chatService/chatService.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../common/languageModels.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ICustomAgent, PromptsStorage, Target } from '../../../../common/promptSyntax/service/promptsService.js';
import { MockPromptsService } from '../../promptSyntax/service/mockPromptsService.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';

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

	suite('model fallback behavior', () => {
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

		function createTool(opts: {
			models: Map<string, ILanguageModelChatMetadata>;
			qualifiedNameMap?: Map<string, ILanguageModelChatMetadataAndIdentifier>;
			customAgents?: ICustomAgent[];
		}) {
			const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
			const configService = new TestConfigurationService();
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
			));

			return tool;
		}

		function createAgent(name: string, modelQualifiedNames?: string[]): ICustomAgent {
			return {
				uri: URI.parse(`file:///test/${name}.md`),
				name,
				description: `Agent ${name}`,
				tools: ['tool1'],
				model: modelQualifiedNames,
				agentInstructions: { content: 'test', toolReferences: [] },
				source: { storage: PromptsStorage.local },
				target: Target.Undefined,
				visibility: { userInvocable: true, agentInvocable: true }
			};
		}

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
			const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });

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
	});
});
