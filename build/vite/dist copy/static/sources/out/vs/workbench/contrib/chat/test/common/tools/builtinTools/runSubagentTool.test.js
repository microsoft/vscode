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
import { PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { Target } from '../../../../common/promptSyntax/promptTypes.js';
import { MockPromptsService } from '../../promptSyntax/service/mockPromptsService.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { ChatConfiguration, GeneralPurposeAgentName } from '../../../../common/constants.js';
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
            const customMode = {
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
            const tool = testDisposables.add(new RunSubagentTool({}, {}, mockToolsService, {}, new NullLogService(), new TestConfigurationService(), promptsService, {}, {}));
            const result = await tool.prepareToolInvocation({
                parameters: {
                    prompt: 'Test prompt',
                    description: 'Test task',
                    agentName: 'CustomAgent',
                },
                toolCallId: 'test-call-1',
                chatSessionResource: URI.parse('test://session'),
            }, CancellationToken.None);
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
        function createToolWithGP(opts) {
            const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
            const promptsService = new MockPromptsService();
            if (opts?.customAgents) {
                promptsService.setCustomModes(opts.customAgents);
            }
            const tool = testDisposables.add(new RunSubagentTool({}, {}, mockToolsService, {}, new NullLogService(), new TestConfigurationService({ [ChatConfiguration.GeneralPurposeAgentEnabled]: true }), promptsService, {}, {}));
            return tool;
        }
        async function createToolWithGPReady(opts) {
            return createToolWithGP(opts);
        }
        test('treats undefined agentName as General Purpose when experiment is enabled', async () => {
            const tool = await createToolWithGPReady();
            const result = await tool.prepareToolInvocation({
                parameters: { prompt: 'Test prompt', description: 'Test task', agentName: undefined },
                toolCallId: 'test-call-undef',
                chatSessionResource: URI.parse('test://session'),
            }, CancellationToken.None);
            assert.ok(result);
            assert.deepStrictEqual(result.toolSpecificData, {
                kind: 'subagent',
                description: 'Test task',
                agentName: GeneralPurposeAgentName,
                prompt: 'Test prompt',
                modelName: undefined,
            });
        });
        test('treats empty string agentName as General Purpose when experiment is enabled', async () => {
            const tool = await createToolWithGPReady();
            const result = await tool.prepareToolInvocation({
                parameters: { prompt: 'Test prompt', description: 'Test task', agentName: '' },
                toolCallId: 'test-call-empty',
                chatSessionResource: URI.parse('test://session'),
            }, CancellationToken.None);
            assert.ok(result);
            assert.deepStrictEqual(result.toolSpecificData, {
                kind: 'subagent',
                description: 'Test task',
                agentName: GeneralPurposeAgentName,
                prompt: 'Test prompt',
                modelName: undefined,
            });
        });
        test('treats explicit General Purpose agentName as GP path', async () => {
            const tool = await createToolWithGPReady();
            const result = await tool.prepareToolInvocation({
                parameters: { prompt: 'Test prompt', description: 'Test task', agentName: GeneralPurposeAgentName },
                toolCallId: 'test-call-gp',
                chatSessionResource: URI.parse('test://session'),
            }, CancellationToken.None);
            assert.ok(result);
            assert.deepStrictEqual(result.toolSpecificData, {
                kind: 'subagent',
                description: 'Test task',
                agentName: GeneralPurposeAgentName,
                prompt: 'Test prompt',
                modelName: undefined,
            });
        });
        test('passes through unknown agentName when experiment is enabled', async () => {
            const tool = await createToolWithGPReady();
            const result = await tool.prepareToolInvocation({
                parameters: { prompt: 'Test prompt', description: 'Test task', agentName: 'NonExistentAgent' },
                toolCallId: 'test-call-unknown',
                chatSessionResource: URI.parse('test://session'),
            }, CancellationToken.None);
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
            const tool = testDisposables.add(new RunSubagentTool({}, {}, mockToolsService, {}, new NullLogService(), new TestConfigurationService(), promptsService, {}, {}));
            const toolData = tool.getToolData();
            assert.strictEqual(toolData.id, 'runSubagent');
            assert.ok(toolData.inputSchema);
            assert.ok(toolData.inputSchema.properties?.prompt);
            assert.ok(toolData.inputSchema.properties?.description);
            assert.strictEqual(toolData.inputSchema.properties?.agentName, undefined, 'agentName should not be in schema when neither GP nor custom agents is enabled');
            assert.deepStrictEqual(toolData.inputSchema.required, ['prompt', 'description']);
        });
        test('marks agentName as required when GP experiment is enabled', async () => {
            const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
            const promptsService = new MockPromptsService();
            const tool = testDisposables.add(new RunSubagentTool({}, {}, mockToolsService, {}, new NullLogService(), new TestConfigurationService({ [ChatConfiguration.GeneralPurposeAgentEnabled]: true }), promptsService, {}, {}));
            const toolData = tool.getToolData();
            assert.ok(toolData.inputSchema?.properties?.agentName);
            assert.deepStrictEqual(toolData.inputSchema.required, ['prompt', 'description', 'agentName']);
        });
    });
    suite('onDidInvokeTool event', () => {
        test('mock service fires onDidInvokeTool events with correct data', () => {
            const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
            const sessionResource = URI.parse('test://session');
            const receivedEvents = [];
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
            const matchingEvents = [];
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
        function createMetadata(name, multiplierNumeric) {
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
        function createTool(opts) {
            const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
            const promptsService = new MockPromptsService();
            if (opts.customAgents) {
                promptsService.setCustomModes(opts.customAgents);
            }
            const mockLanguageModelsService = {
                lookupLanguageModel(modelId) {
                    return opts.models.get(modelId);
                },
                lookupLanguageModelByQualifiedName(qualifiedName) {
                    return opts.qualifiedNameMap?.get(qualifiedName);
                },
            };
            const tool = testDisposables.add(new RunSubagentTool({}, {}, mockToolsService, mockLanguageModelsService, new NullLogService(), new TestConfigurationService({ [ChatConfiguration.SubagentToolCustomAgents]: true }), promptsService, {}, {}));
            return tool;
        }
        function createAgent(name, modelQualifiedNames) {
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
    suite('nested subagent depth tracking', () => {
        /**
         * Creates a RunSubagentTool with mocked services suitable for invoke() testing.
         * The returned `capturedRequests` array collects every IChatAgentRequest passed to invokeAgent.
         */
        let callIdCounter = 0;
        function createInvokableTool(opts) {
            const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
            const configService = new TestConfigurationService({
                [ChatConfiguration.SubagentsAllowInvocationsFromSubagents]: opts.allowInvocationsFromSubagents,
            });
            const promptsService = new MockPromptsService();
            const mockChatAgentService = {
                getDefaultAgent() {
                    return { id: 'default-agent' };
                },
                async invokeAgent(_id, request, _progress, _history, _token) {
                    opts.capturedRequests.push(request);
                    return {};
                },
            };
            const mockChatService = {
                getSession() {
                    return {
                        getRequests: () => [{ id: 'req-1' }],
                        acceptResponseProgress: () => { },
                    };
                },
            };
            const mockInstantiationService = {
                createInstance(..._args) {
                    return { collect: async () => { } };
                },
            };
            const tool = testDisposables.add(new RunSubagentTool(mockChatAgentService, mockChatService, mockToolsService, {}, new NullLogService(), configService, promptsService, mockInstantiationService, {}));
            return { tool, mockChatAgentService };
        }
        function createInvocation(sessionUri, userSelectedTools) {
            return {
                callId: `call-${++callIdCounter}`,
                toolId: 'runSubagent',
                parameters: { prompt: 'do something', description: 'test' },
                context: { sessionResource: sessionUri },
                userSelectedTools: userSelectedTools ?? { runSubagent: true },
            };
        }
        const countTokens = async () => 0;
        const noProgress = { report() { } };
        test('disables runSubagent tool when nesting is disabled', async () => {
            const capturedRequests = [];
            const { tool } = createInvokableTool({ allowInvocationsFromSubagents: false, capturedRequests });
            const sessionUri = URI.parse('test://session/depth0');
            await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
            assert.strictEqual(capturedRequests.length, 1);
            assert.strictEqual(capturedRequests[0].userSelectedTools?.['runSubagent'], false);
        });
        test('enables runSubagent tool at depth 0 when nesting is enabled', async () => {
            const capturedRequests = [];
            const { tool } = createInvokableTool({ allowInvocationsFromSubagents: true, capturedRequests });
            const sessionUri = URI.parse('test://session/depth-enabled');
            await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
            assert.strictEqual(capturedRequests.length, 1);
            assert.strictEqual(capturedRequests[0].userSelectedTools?.['runSubagent'], true);
        });
        test('disables runSubagent tool when depth reaches hard limit', async () => {
            const capturedRequests = [];
            const sessionUri = URI.parse('test://session/depth-limit');
            // When nesting is enabled, the tool enforces a hardcoded maximum depth of 5.
            // Simulate nested invocation until we exceed the limit and ensure it disables nesting.
            const { tool, mockChatAgentService } = createInvokableTool({ allowInvocationsFromSubagents: true, capturedRequests });
            // Simulate nested invocation: the first invoke's invokeAgent callback
            // triggers a second invoke on the same tool (same session).
            capturedRequests.length = 0;
            let nestedInvocations = 0;
            mockChatAgentService.invokeAgent = async (_id, request) => {
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
            const capturedRequests = [];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuU3ViYWdlbnRUb29sLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9ydW5TdWJhZ2VudFRvb2wudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDckYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzlELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxxRkFBcUYsQ0FBQztBQUMvSCxPQUFPLEVBQUUsOEJBQThCLEVBQUUsZUFBZSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDM0gsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFNcEYsT0FBTyxFQUFnQixjQUFjLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUN6RyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDeEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDdEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFHcEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFN0YsS0FBSyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtJQUM3QixNQUFNLGVBQWUsR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRWxF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