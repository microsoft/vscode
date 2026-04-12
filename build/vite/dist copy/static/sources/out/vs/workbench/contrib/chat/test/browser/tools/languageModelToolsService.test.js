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
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyEqualsExpr, ContextKeyExpr, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { LanguageModelToolsService } from '../../../browser/tools/languageModelToolsService.js';
import { IChatService, IChatToolInvocation } from '../../../common/chatService/chatService.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../common/constants.js';
import { SpecedToolAliases, isToolResultInputOutputDetails, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { ILanguageModelToolsConfirmationService } from '../../../common/tools/languageModelToolsConfirmationService.js';
import { MockLanguageModelToolsConfirmationService } from '../../common/tools/mockLanguageModelToolsConfirmationService.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
// --- Test helpers to reduce repetition and improve readability ---
class TestAccessibilitySignalService {
    constructor() {
        this.signalPlayedCalls = [];
    }
    async playSignal(signal, options) {
        this.signalPlayedCalls.push({ signal, options });
    }
    reset() {
        this.signalPlayedCalls = [];
    }
}
class TestTelemetryService {
    constructor() {
        this.events = [];
    }
    publicLog2(eventName, data) {
        this.events.push({ eventName, data });
    }
    reset() {
        this.events = [];
    }
}
function registerToolForTest(service, store, id, impl, data) {
    const toolData = {
        id,
        modelDescription: data?.modelDescription ?? 'Test Tool',
        displayName: data?.displayName ?? 'Test Tool',
        source: ToolDataSource.Internal,
        ...data,
    };
    store.add(service.registerTool(toolData, impl));
    return {
        id,
        makeDto: (parameters, context, callId = '1') => ({
            callId,
            toolId: id,
            tokenBudget: 100,
            parameters,
            context: context ? {
                sessionResource: LocalChatSessionUri.forSession(context.sessionId),
            } : undefined,
        }),
    };
}
function stubGetSession(chatService, sessionId, options) {
    const requestId = options?.requestId ?? 'requestId';
    const capture = options?.capture;
    const fakeModel = {
        sessionId,
        sessionResource: LocalChatSessionUri.forSession(sessionId),
        getRequests: () => [{ id: requestId, modelId: 'test-model', modeInfo: options?.modeInfo }],
    };
    chatService.addSession(fakeModel);
    chatService.appendProgress = (request, progress) => {
        if (capture) {
            capture.invocation = progress;
        }
    };
    return fakeModel;
}
async function waitForPublishedInvocation(capture, tries = 10) {
    for (let i = 0; i < tries && !capture.invocation; i++) {
        await Promise.resolve();
    }
    return capture.invocation;
}
/**
 * Helper to create a LanguageModelToolsService with all common test stubs.
 * Reduces boilerplate when tests need custom service configurations.
 */
function createTestToolsService(store, options) {
    const configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
    // Allow tests to configure before service creation
    options?.configureServices?.(configurationService);
    const instaService = workbenchInstantiationService({
        contextKeyService: () => store.add(new ContextKeyService(configurationService)),
        configurationService: () => configurationService
    }, store);
    const contextKeyService = instaService.get(IContextKeyService);
    const chatService = new MockChatService();
    instaService.stub(IChatService, chatService);
    instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
    if (options?.accessibilityService) {
        instaService.stub(IAccessibilityService, options.accessibilityService);
    }
    if (options?.accessibilitySignalService) {
        instaService.stub(IAccessibilitySignalService, options.accessibilitySignalService);
    }
    if (options?.telemetryService) {
        instaService.stub(ITelemetryService, options.telemetryService);
    }
    if (options?.commandService) {
        instaService.stub(ICommandService, options.commandService);
    }
    const service = store.add(instaService.createInstance(LanguageModelToolsService));
    return { configurationService, chatService, service, contextKeyService };
}
suite('LanguageModelToolsService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let contextKeyService;
    let service;
    let chatService;
    let configurationService;
    setup(() => {
        const setup = createTestToolsService(store);
        configurationService = setup.configurationService;
        chatService = setup.chatService;
        service = setup.service;
        contextKeyService = setup.contextKeyService;
    });
    function setupToolsForTest(service, store) {
        // Create a variety of tools and tool sets for testing
        // Some with toolReferenceName, some without, some from extensions, mcp and user defined
        const tool1 = {
            id: 'tool1',
            toolReferenceName: 'tool1RefName',
            modelDescription: 'Test Tool 1',
            displayName: 'Tool1 Display Name',
            source: ToolDataSource.Internal,
            canBeReferencedInPrompt: true,
        };
        store.add(service.registerToolData(tool1));
        const tool2 = {
            id: 'tool2',
            modelDescription: 'Test Tool 2',
            displayName: 'Tool2 Display Name',
            source: ToolDataSource.Internal,
            canBeReferencedInPrompt: true,
        };
        store.add(service.registerToolData(tool2));
        /** Extension Tool 1 */
        const extTool1 = {
            id: 'extTool1',
            toolReferenceName: 'extTool1RefName',
            modelDescription: 'Test Extension Tool 1',
            displayName: 'ExtTool1 Display Name',
            source: { type: 'extension', label: 'My Extension', extensionId: new ExtensionIdentifier('my.extension') },
            canBeReferencedInPrompt: true,
        };
        store.add(service.registerToolData(extTool1));
        /** Internal Tool Set with internalToolSetTool1 */
        const internalToolSetTool1 = {
            id: 'internalToolSetTool1',
            toolReferenceName: 'internalToolSetTool1RefName',
            modelDescription: 'Test Internal Tool Set 1',
            displayName: 'InternalToolSet1 Display Name',
            source: ToolDataSource.Internal,
        };
        store.add(service.registerToolData(internalToolSetTool1));
        const internalToolSet = store.add(service.createToolSet(ToolDataSource.Internal, 'internalToolSet', 'internalToolSetRefName', { description: 'Test Set' }));
        store.add(internalToolSet.addTool(internalToolSetTool1));
        /** User Tool Set with tool1 */
        const userToolSet = store.add(service.createToolSet({ type: 'user', label: 'User', file: URI.file('/test/userToolSet.json') }, 'userToolSet', 'userToolSetRefName', { description: 'Test Set' }));
        store.add(userToolSet.addTool(tool2));
        /** MCP tool in a MCP tool set */
        const mcpDataSource = { type: 'mcp', label: 'My MCP Server', serverLabel: 'MCP Server', instructions: undefined, collectionId: 'testMCPCollection', definitionId: 'testMCPDefId' };
        const mcpTool1 = {
            id: 'mcpTool1',
            toolReferenceName: 'mcpTool1RefName',
            modelDescription: 'Test MCP Tool 1',
            displayName: 'McpTool1 Display Name',
            source: mcpDataSource,
            canBeReferencedInPrompt: true,
        };
        store.add(service.registerToolData(mcpTool1));
        const mcpToolSet = store.add(service.createToolSet(mcpDataSource, 'mcpToolSet', 'mcpToolSetRefName', { description: 'MCP Test ToolSet' }));
        store.add(mcpToolSet.addTool(mcpTool1));
    }
    test('registerToolData', () => {
        const toolData = {
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
        const toolData = {
            id: 'testTool',
            modelDescription: 'Test Tool',
            displayName: 'Test Tool',
            source: ToolDataSource.Internal,
        };
        store.add(service.registerToolData(toolData));
        const toolImpl = {
            invoke: async () => ({ content: [{ kind: 'text', value: 'result' }] }),
        };
        store.add(service.registerToolImplementation('testTool', toolImpl));
        assert.strictEqual(service.getTool('testTool')?.id, 'testTool');
    });
    test('getTools', () => {
        contextKeyService.createKey('testKey', true);
        const toolData1 = {
            id: 'testTool1',
            modelDescription: 'Test Tool 1',
            when: ContextKeyEqualsExpr.create('testKey', false),
            displayName: 'Test Tool',
            source: ToolDataSource.Internal,
        };
        const toolData2 = {
            id: 'testTool2',
            modelDescription: 'Test Tool 2',
            when: ContextKeyEqualsExpr.create('testKey', true),
            displayName: 'Test Tool',
            source: ToolDataSource.Internal,
        };
        const toolData3 = {
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
        const toolData1 = {
            id: 'testTool1',
            toolReferenceName: 'testTool1',
            modelDescription: 'Test Tool 1',
            when: ContextKeyEqualsExpr.create('testKey', false),
            displayName: 'Test Tool',
            source: ToolDataSource.Internal,
        };
        const toolData2 = {
            id: 'testTool2',
            toolReferenceName: 'testTool2',
            modelDescription: 'Test Tool 2',
            when: ContextKeyEqualsExpr.create('testKey', true),
            displayName: 'Test Tool',
            source: ToolDataSource.Internal,
        };
        const toolData3 = {
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
        const toolData = {
            id: 'testTool',
            modelDescription: 'Test Tool',
            displayName: 'Test Tool',
            source: ToolDataSource.Internal,
        };
        store.add(service.registerToolData(toolData));
        const toolImpl = {
            invoke: async (invocation) => {
                assert.strictEqual(invocation.callId, '1');
                assert.strictEqual(invocation.toolId, 'testTool');
                assert.deepStrictEqual(invocation.parameters, { a: 1 });
                return { content: [{ kind: 'text', value: 'result' }] };
            }
        };
        store.add(service.registerToolImplementation('testTool', toolImpl));
        const dto = {
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
                toolSpecificData: { kind: 'input', rawInput },
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
        const capture = {};
        stubGetSession(chatService, sessionId, { requestId: 'requestId-io', capture });
        const dto = tool.makeDto({ a: 1 }, { sessionId });
        const invokeP = service.invokeTool(dto, async () => 0, CancellationToken.None);
        const published = await waitForPublishedInvocation(capture);
        IChatToolInvocation.confirmWith(published, { type: 4 /* ToolConfirmKind.UserAction */ });
        const result = await invokeP;
        assert.strictEqual(result.content[0].value, 'ok');
    });
    test('chat invocation injects input toolSpecificData for confirmation when alwaysDisplayInputOutput', async () => {
        const toolData = {
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
        const capture = {};
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
        IChatToolInvocation.confirmWith(published, { type: 4 /* ToolConfirmKind.UserAction */ });
        const result = await invokeP;
        assert.strictEqual(result.content[0].value, 'done');
    });
    test('chat invocation waits for user confirmation before invoking', async () => {
        const toolData = {
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
        const capture = {};
        stubGetSession(chatService, sessionId, { requestId: 'requestId-confirm', capture });
        const dto = tool.makeDto({ x: 1 }, { sessionId });
        const promise = service.invokeTool(dto, async () => 0, CancellationToken.None);
        const published = await waitForPublishedInvocation(capture);
        assert.ok(published, 'expected ChatToolInvocation to be published');
        assert.strictEqual(invoked, false, 'invoke should not run before confirmation');
        IChatToolInvocation.confirmWith(published, { type: 4 /* ToolConfirmKind.UserAction */ });
        const result = await promise;
        assert.strictEqual(invoked, true, 'invoke should have run after confirmation');
        assert.strictEqual(result.content[0].value, 'ran');
    });
    test('selectedCustomButton is passed to tool invoke when user selects a custom button', async () => {
        let receivedInvocation;
        const tool = registerToolForTest(service, store, 'testToolCustomButton', {
            prepareToolInvocation: async () => ({
                confirmationMessages: {
                    title: 'Confirm',
                    message: 'Pick an option',
                    customButtons: ['Option A', 'Option B'],
                    allowAutoConfirm: false,
                }
            }),
            invoke: async (invocation) => {
                receivedInvocation = invocation;
                return { content: [{ kind: 'text', value: invocation.selectedCustomButton ?? 'none' }] };
            },
        });
        const sessionId = 'sessionId-custom-btn';
        const capture = {};
        stubGetSession(chatService, sessionId, { requestId: 'requestId-custom-btn', capture });
        const dto = tool.makeDto({ x: 1 }, { sessionId });
        const promise = service.invokeTool(dto, async () => 0, CancellationToken.None);
        const published = await waitForPublishedInvocation(capture);
        assert.ok(published, 'expected ChatToolInvocation to be published');
        IChatToolInvocation.confirmWith(published, { type: 4 /* ToolConfirmKind.UserAction */, selectedButton: 'Option A' });
        const result = await promise;
        assert.strictEqual(receivedInvocation?.selectedCustomButton, 'Option A');
        assert.strictEqual(result.content[0].value, 'Option A');
    });
    test('selectedCustomButton is not set when user confirms without custom button', async () => {
        let receivedInvocation;
        const tool = registerToolForTest(service, store, 'testToolNoCustomBtn', {
            prepareToolInvocation: async () => ({
                confirmationMessages: { title: 'Confirm', message: 'Go?' }
            }),
            invoke: async (invocation) => {
                receivedInvocation = invocation;
                return { content: [{ kind: 'text', value: 'ok' }] };
            },
        });
        const sessionId = 'sessionId-no-custom-btn';
        const capture = {};
        stubGetSession(chatService, sessionId, { requestId: 'requestId-no-custom-btn', capture });
        const dto = tool.makeDto({ x: 1 }, { sessionId });
        const promise = service.invokeTool(dto, async () => 0, CancellationToken.None);
        const published = await waitForPublishedInvocation(capture);
        assert.ok(published);
        IChatToolInvocation.confirmWith(published, { type: 4 /* ToolConfirmKind.UserAction */ });
        const result = await promise;
        assert.strictEqual(receivedInvocation?.selectedCustomButton, undefined);
        assert.strictEqual(result.content[0].value, 'ok');
    });
    test('confirmationMessages with customButtons disables allowAutoConfirm', async () => {
        const tool = registerToolForTest(service, store, 'testToolCustomBtnNoAuto', {
            prepareToolInvocation: async () => ({
                confirmationMessages: {
                    title: 'Confirm',
                    message: 'Choose',
                    customButtons: ['Yes', 'No'],
                    allowAutoConfirm: false,
                }
            }),
            invoke: async () => ({ content: [{ kind: 'text', value: 'done' }] }),
        });
        const sessionId = 'sessionId-custom-noauto';
        const capture = {};
        stubGetSession(chatService, sessionId, { requestId: 'requestId-custom-noauto', capture });
        const dto = tool.makeDto({ x: 1 }, { sessionId });
        const promise = service.invokeTool(dto, async () => 0, CancellationToken.None);
        const published = await waitForPublishedInvocation(capture);
        assert.ok(published, 'expected ChatToolInvocation to be published');
        assert.deepStrictEqual(published.confirmationMessages?.customButtons, ['Yes', 'No']);
        IChatToolInvocation.confirmWith(published, { type: 4 /* ToolConfirmKind.UserAction */, selectedButton: 'Yes' });
        await promise;
    });
    test('skipping modified-files confirmation returns the shared skip message and does not invoke the tool', async () => {
        let invoked = false;
        const tool = registerToolForTest(service, store, 'testModifiedFilesConfirmationSkip', {
            prepareToolInvocation: async () => ({
                confirmationMessages: {
                    title: 'Confirm',
                    message: 'Choose',
                    allowAutoConfirm: false,
                },
                toolSpecificData: {
                    kind: 'modifiedFilesConfirmation',
                    options: ['Copy Changes', 'Move Changes'],
                    modifiedFiles: [{
                            uri: URI.parse('file:///workspace/file1.ts')
                        }]
                }
            }),
            invoke: async () => {
                invoked = true;
                return { content: [{ kind: 'text', value: 'should not run' }] };
            },
        });
        const sessionId = 'sessionId-modified-files-skip';
        const capture = {};
        stubGetSession(chatService, sessionId, { requestId: 'requestId-modified-files-skip', capture });
        const dto = tool.makeDto({ x: 1 }, { sessionId });
        const promise = service.invokeTool(dto, async () => 0, CancellationToken.None);
        const published = await waitForPublishedInvocation(capture);
        assert.ok(published, 'expected ChatToolInvocation to be published');
        IChatToolInvocation.confirmWith(published, { type: 5 /* ToolConfirmKind.Skipped */ });
        const result = await promise;
        assert.strictEqual(invoked, false);
        assert.deepStrictEqual(result.content, [{
                kind: 'text',
                value: 'The user chose to skip the tool call, they want to proceed without running it'
            }]);
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
                }
                else {
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
    test('rejects tool invocation for cancelled request id', async () => {
        let invoked = false;
        const tool = registerToolForTest(service, store, 'testTool', {
            invoke: async () => {
                invoked = true;
                return { content: [{ kind: 'text', value: 'done' }] };
            }
        });
        const sessionId = 'sessionId-cancelled-request';
        const requestId = 'requestId-cancelled-request';
        const fakeModel = {
            sessionId,
            sessionResource: LocalChatSessionUri.forSession(sessionId),
            getRequests: () => [{
                    id: requestId,
                    modelId: 'test-model',
                    response: { isCanceled: true },
                }],
        };
        chatService.addSession(fakeModel);
        const dto = {
            ...tool.makeDto({ a: 1 }, { sessionId }),
            chatRequestId: requestId,
        };
        await assert.rejects(service.invokeTool(dto, async () => 0, CancellationToken.None), err => {
            return isCancellationError(err);
        }, 'Expected tool invocation to be rejected for cancelled request id');
        assert.strictEqual(invoked, false, 'Tool implementation should not run after request cancellation');
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
        const unknownTool = { id: 'unregisteredTool', toolReferenceName: 'unregisteredToolRefName', modelDescription: 'Unregistered Tool', displayName: 'Unregistered Tool', source: ToolDataSource.Internal, canBeReferencedInPrompt: true };
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
            const map = new Map([[tool1, true], [extTool1, true], [mcpToolSet, true], [mcpTool1, true]]);
            const fullReferenceNames = service.toFullReferenceNames(map);
            const expectedFullReferenceNames = ['tool1RefName', 'my.extension/extTool1RefName', 'mcpToolSetRefName/*'];
            assert.deepStrictEqual(fullReferenceNames.sort(), expectedFullReferenceNames.sort(), 'toFullReferenceNames should return the original enabled names');
        }
        // Test with user data
        {
            // creating a map by hand is a no-go, we just do it for this test
            const map = new Map([[tool1, true], [userToolSet, true], [internalToolSet, false], [internalTool, true]]);
            const fullReferenceNames = service.toFullReferenceNames(map);
            const expectedFullReferenceNames = ['tool1RefName', 'internalToolSetRefName/internalToolSetTool1RefName'];
            assert.deepStrictEqual(fullReferenceNames.sort(), expectedFullReferenceNames.sort(), 'toFullReferenceNames should return the original enabled names');
        }
        // Test with unknown tool and tool set
        {
            // creating a map by hand is a no-go, we just do it for this test
            const map = new Map([[unknownTool, true], [unknownToolSet, true], [internalToolSet, true], [internalTool, true]]);
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
            const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, undefined);
            assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
            assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 1, 'Expected 1 tool to be enabled');
            assert.strictEqual(result1.get(tool1), true, 'tool1 should be enabled');
            const fullReferenceNames1 = service.toFullReferenceNames(result1);
            assert.deepStrictEqual(fullReferenceNames1.sort(), fullReferenceNames.sort(), 'toFullReferenceNames should return the original enabled names');
        }
        // Test with multiple enabled tools
        {
            const fullReferenceNames = ['my.extension/extTool1RefName', 'mcpToolSetRefName/*', 'internalToolSetRefName/internalToolSetTool1RefName'];
            const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, undefined);
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
            const result1 = service.toToolAndToolSetEnablementMap(allFullReferenceNames, undefined);
            assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
            assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 12, 'Expected 12 tools to be enabled'); // +4 including the vscode, execute, read, agent toolsets
            const fullReferenceNames1 = service.toFullReferenceNames(result1);
            const expectedFullReferenceNames = ['tool1RefName', 'Tool2 Display Name', 'my.extension/extTool1RefName', 'mcpToolSetRefName/*', 'internalToolSetRefName', 'vscode', 'execute', 'read', 'agent'];
            assert.deepStrictEqual(fullReferenceNames1.sort(), expectedFullReferenceNames.sort(), 'toFullReferenceNames should return the original enabled names');
        }
        // Test with no enabled tools
        {
            const fullReferenceNames = [];
            const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, undefined);
            assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
            assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 0, 'Expected 0 tools to be enabled');
            const fullReferenceNames1 = service.toFullReferenceNames(result1);
            assert.deepStrictEqual(fullReferenceNames1.sort(), fullReferenceNames.sort(), 'toFullReferenceNames should return the original enabled names');
        }
        // Test with unknown tool
        {
            const fullReferenceNames = ['unknownToolRefName'];
            const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, undefined);
            assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
            assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 0, 'Expected 0 tools to be enabled');
            const fullReferenceNames1 = service.toFullReferenceNames(result1);
            assert.deepStrictEqual(fullReferenceNames1.sort(), [], 'toFullReferenceNames should return no enabled names');
        }
        // Test with legacy tool names
        {
            const fullReferenceNames = ['extTool1RefName', 'mcpToolSetRefName', 'internalToolSetTool1RefName'];
            const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, undefined);
            assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
            assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 4, 'Expected 4 tools to be enabled');
            assert.strictEqual(result1.get(extTool1), true, 'extTool1 should be enabled');
            assert.strictEqual(result1.get(mcpToolSet), true, 'mcpToolSet should be enabled');
            assert.strictEqual(result1.get(mcpTool1), true, 'mcpTool1 should be enabled because the set is enabled');
            assert.strictEqual(result1.get(internalTool), true, 'internalTool should be enabled');
            const fullReferenceNames1 = service.toFullReferenceNames(result1);
            const expectedFullReferenceNames = ['my.extension/extTool1RefName', 'mcpToolSetRefName/*', 'internalToolSetRefName/internalToolSetTool1RefName'];
            assert.deepStrictEqual(fullReferenceNames1.sort(), expectedFullReferenceNames.sort(), 'toFullReferenceNames should return the original enabled names');
        }
        // Test with tool in user tool set
        {
            const fullReferenceNames = ['Tool2 Display Name'];
            const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, undefined);
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
        const toolData1 = {
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
        const result = service.toToolAndToolSetEnablementMap(enabledNames, undefined);
        assert.strictEqual(result.get(toolData1), true, 'individual tool should be enabled');
        const fullReferenceNames = service.toFullReferenceNames(result);
        assert.deepStrictEqual(fullReferenceNames.sort(), enabledNames.sort(), 'toFullReferenceNames should return the original enabled names');
    });
    test('toToolAndToolSetEnablementMap with tool sets', () => {
        // Register individual tools
        const toolData1 = {
            id: 'tool1',
            toolReferenceName: 'refTool1',
            modelDescription: 'Test Tool 1',
            displayName: 'Test Tool 1',
            source: ToolDataSource.Internal,
            canBeReferencedInPrompt: true,
        };
        const toolData2 = {
            id: 'tool2',
            modelDescription: 'Test Tool 2',
            displayName: 'Test Tool 2',
            source: ToolDataSource.Internal,
            canBeReferencedInPrompt: true,
        };
        store.add(service.registerToolData(toolData1));
        store.add(service.registerToolData(toolData2));
        // Create a tool set
        const toolSet = store.add(service.createToolSet(ToolDataSource.Internal, 'testToolSet', 'refToolSet', { description: 'Test Tool Set' }));
        // Add tools to the tool set
        const toolSetTool1 = {
            id: 'toolSetTool1',
            modelDescription: 'Tool Set Tool 1',
            displayName: 'Tool Set Tool 1',
            source: ToolDataSource.Internal,
        };
        const toolSetTool2 = {
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
        const result = service.toToolAndToolSetEnablementMap(enabledNames, undefined);
        assert.strictEqual(result.get(toolData1), true, 'individual tool should be enabled');
        assert.strictEqual(result.get(toolData2), false);
        assert.strictEqual(result.get(toolSet), true, 'tool set should be enabled');
        assert.strictEqual(result.get(toolSetTool1), true, 'tool set tool 1 should be enabled');
        assert.strictEqual(result.get(toolSetTool2), true, 'tool set tool 2 should be enabled');
        const fullReferenceNames = service.toFullReferenceNames(result);
        assert.deepStrictEqual(fullReferenceNames.sort(), enabledNames.sort(), 'toFullReferenceNames should return the original enabled names');
    });
    test('toToolAndToolSetEnablementMap with non-existent tool names', () => {
        const toolData = {
            id: 'tool1',
            toolReferenceName: 'refTool1',
            modelDescription: 'Test Tool 1',
            displayName: 'Test Tool 1',
            source: ToolDataSource.Internal,
            canBeReferencedInPrompt: true,
        };
        store.add(service.registerToolData(toolData));
        const unregisteredToolData = {
            id: 'toolX',
            toolReferenceName: 'refToolX',
            modelDescription: 'Test Tool X',
            displayName: 'Test Tool X',
            source: ToolDataSource.Internal,
            canBeReferencedInPrompt: true,
        };
        // Test with non-existent tool names
        const enabledNames = [toolData, unregisteredToolData].map(t => service.getFullReferenceName(t));
        const result = service.toToolAndToolSetEnablementMap(enabledNames, undefined);
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
        const toolWithLegacy = {
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
        const toolSetWithLegacy = store.add(service.createToolSet(ToolDataSource.Internal, 'newToolSet', 'newToolSetRef', { description: 'New Tool Set', legacyFullNames: ['oldToolSet', 'deprecatedToolSet'] }));
        // Create a tool in the toolset
        const toolInSet = {
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
            const result = service.toToolAndToolSetEnablementMap(['oldToolName'], undefined);
            assert.strictEqual(result.get(toolWithLegacy), true, 'tool should be enabled via legacy name');
            const fullReferenceNames = service.toFullReferenceNames(result);
            assert.deepStrictEqual(fullReferenceNames, ['newToolRef'], 'should return current full reference name, not legacy');
        }
        // Test 2: Using another legacy tool reference name should also work
        {
            const result = service.toToolAndToolSetEnablementMap(['deprecatedToolName'], undefined);
            assert.strictEqual(result.get(toolWithLegacy), true, 'tool should be enabled via another legacy name');
            const fullReferenceNames = service.toFullReferenceNames(result);
            assert.deepStrictEqual(fullReferenceNames, ['newToolRef'], 'should return current full reference name, not legacy');
        }
        // Test 3: Using legacy toolset name should enable the entire toolset
        {
            const result = service.toToolAndToolSetEnablementMap(['oldToolSet'], undefined);
            assert.strictEqual(result.get(toolSetWithLegacy), true, 'toolset should be enabled via legacy name');
            assert.strictEqual(result.get(toolInSet), true, 'tool in set should be enabled when set is enabled via legacy name');
            const fullReferenceNames = service.toFullReferenceNames(result);
            assert.deepStrictEqual(fullReferenceNames, ['newToolSetRef'], 'should return current full reference name, not legacy');
        }
        // Test 4: Using deprecated toolset name should also work
        {
            const result = service.toToolAndToolSetEnablementMap(['deprecatedToolSet'], undefined);
            assert.strictEqual(result.get(toolSetWithLegacy), true, 'toolset should be enabled via another legacy name');
            assert.strictEqual(result.get(toolInSet), true, 'tool in set should be enabled when set is enabled via legacy name');
            const fullReferenceNames = service.toFullReferenceNames(result);
            assert.deepStrictEqual(fullReferenceNames, ['newToolSetRef'], 'should return current full reference name, not legacy');
        }
        // Test 5: Mix of current and legacy names
        {
            const result = service.toToolAndToolSetEnablementMap(['newToolRef', 'oldToolSet'], undefined);
            assert.strictEqual(result.get(toolWithLegacy), true, 'tool should be enabled via current name');
            assert.strictEqual(result.get(toolSetWithLegacy), true, 'toolset should be enabled via legacy name');
            assert.strictEqual(result.get(toolInSet), true, 'tool in set should be enabled');
            const fullReferenceNames = service.toFullReferenceNames(result);
            assert.deepStrictEqual(fullReferenceNames.sort(), ['newToolRef', 'newToolSetRef'].sort(), 'should return current full reference names');
        }
        // Test 6: Using legacy names and current names together (redundant but should work)
        {
            const result = service.toToolAndToolSetEnablementMap(['newToolRef', 'oldToolName', 'deprecatedToolName'], undefined);
            assert.strictEqual(result.get(toolWithLegacy), true, 'tool should be enabled (redundant legacy names should not cause issues)');
            const fullReferenceNames = service.toFullReferenceNames(result);
            assert.deepStrictEqual(fullReferenceNames, ['newToolRef'], 'should return single current full reference name');
        }
    });
    test('toToolAndToolSetEnablementMap with orphaned toolset in legacy names', () => {
        // Test that when a tool has a legacy name with a toolset prefix, but that toolset no longer exists,
        // we can enable the tool by either the full legacy name OR just the orphaned toolset name
        // Create a tool that used to be in 'oldToolSet/oldToolName' but now is just 'newToolRef'
        const toolWithOrphanedToolSet = {
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
            const result = service.toToolAndToolSetEnablementMap(['oldToolSet/oldToolName'], undefined);
            assert.strictEqual(result.get(toolWithOrphanedToolSet), true, 'tool should be enabled via full legacy name');
            const fullReferenceNames = service.toFullReferenceNames(result);
            assert.deepStrictEqual(fullReferenceNames, ['newToolRef'], 'should return current full reference name');
        }
        // Test 2: Using just the orphaned toolset name should also enable the tool
        {
            const result = service.toToolAndToolSetEnablementMap(['oldToolSet'], undefined);
            assert.strictEqual(result.get(toolWithOrphanedToolSet), true, 'tool should be enabled via orphaned toolset name');
            const fullReferenceNames = service.toFullReferenceNames(result);
            assert.deepStrictEqual(fullReferenceNames, ['newToolRef'], 'should return current full reference name');
        }
        // Test 3: Multiple tools from the same orphaned toolset
        const anotherToolFromOrphanedSet = {
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
            const result = service.toToolAndToolSetEnablementMap(['oldToolSet'], undefined);
            assert.strictEqual(result.get(toolWithOrphanedToolSet), true, 'first tool should be enabled via orphaned toolset name');
            assert.strictEqual(result.get(anotherToolFromOrphanedSet), true, 'second tool should also be enabled via orphaned toolset name');
            const fullReferenceNames = service.toFullReferenceNames(result);
            assert.deepStrictEqual(fullReferenceNames.sort(), ['newToolRef', 'anotherNewToolRef'].sort(), 'should return both current full reference names');
        }
        // Test 4: Orphaned toolset name should NOT enable tools that weren't in that toolset
        const unrelatedTool = {
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
            const result = service.toToolAndToolSetEnablementMap(['oldToolSet'], undefined);
            assert.strictEqual(result.get(toolWithOrphanedToolSet), true, 'tool from oldToolSet should be enabled');
            assert.strictEqual(result.get(anotherToolFromOrphanedSet), true, 'another tool from oldToolSet should be enabled');
            assert.strictEqual(result.get(unrelatedTool), false, 'tool from different toolset should NOT be enabled');
            const fullReferenceNames = service.toFullReferenceNames(result);
            assert.deepStrictEqual(fullReferenceNames.sort(), ['newToolRef', 'anotherNewToolRef'].sort(), 'should only return tools from oldToolSet');
        }
        // Test 5: If a toolset with the same name exists, it should take precedence over orphaned toolset mapping
        const newToolSetWithSameName = store.add(service.createToolSet(ToolDataSource.Internal, 'recreatedToolSet', 'oldToolSet', // Same name as the orphaned toolset
        { description: 'Recreated Tool Set' }));
        const toolInRecreatedSet = {
            id: 'toolInRecreatedSet',
            toolReferenceName: 'toolInRecreatedSetRef',
            modelDescription: 'Tool In Recreated Set',
            displayName: 'Tool In Recreated Set',
            source: ToolDataSource.Internal,
        };
        store.add(service.registerToolData(toolInRecreatedSet));
        store.add(newToolSetWithSameName.addTool(toolInRecreatedSet));
        {
            const result = service.toToolAndToolSetEnablementMap(['oldToolSet'], undefined);
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
        const runInTerminalToolData = {
            id: 'runInTerminalId',
            toolReferenceName: 'runInTerminal',
            modelDescription: 'runInTerminal Description',
            displayName: 'runInTerminal displayName',
            source: ToolDataSource.Internal,
            canBeReferencedInPrompt: false,
        };
        store.add(service.registerToolData(runInTerminalToolData));
        store.add(service.executeToolSet.addTool(runInTerminalToolData));
        const runSubagentToolData = {
            id: 'runSubagentId',
            toolReferenceName: 'runSubagent',
            modelDescription: 'runSubagent Description',
            displayName: 'runSubagent displayName',
            source: ToolDataSource.Internal,
            canBeReferencedInPrompt: false,
        };
        store.add(service.registerToolData(runSubagentToolData));
        store.add(service.agentToolSet.addTool(runSubagentToolData));
        const githubMcpDataSource = { type: 'mcp', label: 'Github', serverLabel: 'Github MCP Server', instructions: undefined, collectionId: 'githubMCPCollection', definitionId: 'githubMCPDefId' };
        const githubMcpTool1 = {
            id: 'create_branch',
            toolReferenceName: 'create_branch',
            modelDescription: 'Test Github MCP Tool 1',
            displayName: 'Create Branch',
            source: githubMcpDataSource,
            canBeReferencedInPrompt: true,
        };
        store.add(service.registerToolData(githubMcpTool1));
        const githubMcpToolSet = store.add(service.createToolSet(githubMcpDataSource, 'githubMcpToolSet', 'github/github-mcp-server', { description: 'Github MCP Test ToolSet' }));
        store.add(githubMcpToolSet.addTool(githubMcpTool1));
        assert.equal(githubMcpToolSet.referenceName, 'github', 'github/github-mcp-server will be normalized to github');
        const playwrightMcpDataSource = { type: 'mcp', label: 'playwright', serverLabel: 'playwright MCP Server', instructions: undefined, collectionId: 'playwrightMCPCollection', definitionId: 'playwrightMCPDefId' };
        const playwrightMcpTool1 = {
            id: 'browser_click',
            toolReferenceName: 'browser_click',
            modelDescription: 'Test playwright MCP Tool 1',
            displayName: 'Create Branch',
            source: playwrightMcpDataSource,
            canBeReferencedInPrompt: true,
        };
        store.add(service.registerToolData(playwrightMcpTool1));
        const playwrightMcpToolSet = store.add(service.createToolSet(playwrightMcpDataSource, 'playwrightMcpToolSet', 'microsoft/playwright-mcp', { description: 'playwright MCP Test ToolSet' }));
        store.add(playwrightMcpToolSet.addTool(playwrightMcpTool1));
        const deprecated = service.getDeprecatedFullReferenceNames();
        const deprecatesTo = (key) => {
            const values = deprecated.get(key);
            return values ? Array.from(values).sort() : undefined;
        };
        assert.equal(playwrightMcpToolSet.referenceName, 'playwright', 'microsoft/playwright-mcp will be normalized to playwright');
        {
            const toolNames = ['custom-agent', 'shell'];
            const result = service.toToolAndToolSetEnablementMap(toolNames, undefined);
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
            const result = service.toToolAndToolSetEnablementMap(toolNames, undefined);
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
            const result = service.toToolAndToolSetEnablementMap(toolNames, undefined);
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
            const result = service.toToolAndToolSetEnablementMap(toolNames, undefined);
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
            const result = service.toToolAndToolSetEnablementMap(toolNames, undefined);
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
            const result = service.toToolAndToolSetEnablementMap(toolNames, undefined);
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
            const result = service.toToolAndToolSetEnablementMap(toolNames, undefined);
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
            const result = service.toToolAndToolSetEnablementMap(toolNames, undefined);
            assert.strictEqual(result.get(githubMcpTool1), true, 'githubMcpTool1 should be enabled');
            const fullReferenceNames = service.toFullReferenceNames(result).sort();
            assert.deepStrictEqual(fullReferenceNames, ['github/create_branch'], 'toFullReferenceNames should return the VS Code tool names');
            assert.deepStrictEqual(toolNames.map(name => service.getToolByFullReferenceName(name)), [githubMcpTool1]);
            assert.deepStrictEqual(deprecatesTo('github-mcp-server/create_branch'), ['github/create_branch']);
        }
    });
    test('accessibility signal for tool confirmation', async () => {
        // Create a test accessibility service that simulates screen reader being enabled
        const testAccessibilityService = new class extends TestAccessibilityService {
            isScreenReaderOptimized() { return true; }
        }();
        // Create a test accessibility signal service that tracks calls
        const testAccessibilitySignalService = new TestAccessibilitySignalService();
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            accessibilityService: testAccessibilityService,
            accessibilitySignalService: testAccessibilitySignalService,
            configureServices: config => {
                config.setUserConfiguration('chat.tools.global.autoApprove', false);
                config.setUserConfiguration('accessibility.signals.chatUserActionRequired', { sound: 'auto', announcement: 'auto' });
            }
        });
        const toolData = {
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
        const capture = {};
        stubGetSession(testChatService, sessionId, { requestId: 'requestId-accessibility', capture });
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
        IChatToolInvocation.confirmWith(published, { type: 4 /* ToolConfirmKind.UserAction */ });
        const result = await promise;
        assert.strictEqual(result.content[0].value, 'executed');
    });
    test('accessibility signal respects autoApprove configuration', async () => {
        // Create a test accessibility service that simulates screen reader being enabled
        const testAccessibilityService = new class extends TestAccessibilityService {
            isScreenReaderOptimized() { return true; }
        }();
        // Create a test accessibility signal service that tracks calls
        const testAccessibilitySignalService = new TestAccessibilitySignalService();
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            accessibilityService: testAccessibilityService,
            accessibilitySignalService: testAccessibilitySignalService,
            configureServices: config => {
                config.setUserConfiguration('chat.tools.global.autoApprove', true);
                config.setUserConfiguration('accessibility.signals.chatUserActionRequired', { sound: 'auto', announcement: 'auto' });
            }
        });
        const toolData = {
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
        const capture = {};
        stubGetSession(testChatService, sessionId, { requestId: 'requestId-auto-approve', capture });
        const dto = tool.makeDto({ config: 'test' }, { sessionId });
        // When auto-approve is enabled, tool should complete without user intervention
        const result = await testService.invokeTool(dto, async () => 0, CancellationToken.None);
        // Verify the tool completed and no accessibility signal was played
        assert.strictEqual(result.content[0].value, 'auto approved');
        assert.strictEqual(testAccessibilitySignalService.signalPlayedCalls.length, 0, 'accessibility signal should not be played when auto-approve is enabled');
    });
    test('autopilot permission level bypasses global auto-approve check', async () => {
        // When autopilot is on, tools should auto-approve without needing global auto-approve enabled
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                config.setUserConfiguration('chat.tools.global.autoApprove', false); // Global OFF
            }
        });
        const tool = registerToolForTest(testService, store, 'autopilotTool', {
            prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Confirm?', message: 'Should be auto-approved by autopilot' } }),
            invoke: async () => ({ content: [{ kind: 'text', value: 'autopilot approved' }] })
        });
        const sessionId = 'test-autopilot';
        stubGetSession(testChatService, sessionId, {
            requestId: 'req1',
            modeInfo: { permissionLevel: ChatPermissionLevel.Autopilot },
        });
        // Tool should be auto-approved even though global auto-approve is off
        const result = await testService.invokeTool(tool.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
        assert.strictEqual(result.content[0].value, 'autopilot approved');
    });
    test('autopilot finds correct request by chatRequestId', async () => {
        // When chatRequestId is provided, the exact request should be matched
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                config.setUserConfiguration('chat.tools.global.autoApprove', false);
            }
        });
        const tool = registerToolForTest(testService, store, 'autopilotIdTool', {
            prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Confirm?', message: 'Test' } }),
            invoke: async () => ({ content: [{ kind: 'text', value: 'found by id' }] })
        });
        const sessionId = 'test-autopilot-id';
        const fakeModel = {
            sessionId,
            sessionResource: LocalChatSessionUri.forSession(sessionId),
            getRequests: () => [
                { id: 'req-old', modelId: 'test-model', modeInfo: undefined },
                { id: 'req-autopilot', modelId: 'test-model', modeInfo: { permissionLevel: ChatPermissionLevel.Autopilot } },
            ],
        };
        testChatService.addSession(fakeModel);
        const dto = tool.makeDto({ test: 1 }, { sessionId });
        dto.chatRequestId = 'req-autopilot';
        const result = await testService.invokeTool(dto, async () => 0, CancellationToken.None);
        assert.strictEqual(result.content[0].value, 'found by id');
    });
    test('autopilot auto-approves terminal tool with confirmation messages', async () => {
        // Terminal tools always return confirmationMessages when their own auto-approve is off.
        // In autopilot mode, shouldAutoConfirm should still auto-approve the tool.
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                config.setUserConfiguration('chat.tools.global.autoApprove', false);
            }
        });
        const tool = registerToolForTest(testService, store, 'terminalTool', {
            prepareToolInvocation: async () => ({
                confirmationMessages: {
                    title: 'Run shell command?',
                    message: 'echo hello',
                },
                toolSpecificData: {
                    kind: 'terminal',
                    terminalToolSessionId: 'test',
                    terminalCommandId: 'cmd-1',
                    commandLine: { original: 'echo hello' },
                    language: 'sh',
                },
            }),
            invoke: async () => ({ content: [{ kind: 'text', value: 'terminal executed' }] })
        });
        const sessionId = 'test-autopilot-terminal';
        stubGetSession(testChatService, sessionId, {
            requestId: 'req1',
            modeInfo: { permissionLevel: ChatPermissionLevel.Autopilot },
        });
        // Terminal tool should be auto-approved by autopilot even without terminal auto-approve enabled
        const result = await testService.invokeTool(tool.makeDto({ command: 'echo hello', explanation: 'test', goal: 'test', isBackground: false }, { sessionId }), async () => 0, CancellationToken.None);
        assert.strictEqual(result.content[0].value, 'terminal executed');
    });
    test('bypass approvals auto-approves terminal tool with confirmation messages', async () => {
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                config.setUserConfiguration('chat.tools.global.autoApprove', false);
            }
        });
        const tool = registerToolForTest(testService, store, 'terminalToolBypass', {
            prepareToolInvocation: async () => ({
                confirmationMessages: {
                    title: 'Run shell command?',
                    message: 'ls -la',
                },
                toolSpecificData: {
                    kind: 'terminal',
                    terminalToolSessionId: 'test',
                    terminalCommandId: 'cmd-2',
                    commandLine: { original: 'ls -la' },
                    language: 'sh',
                },
            }),
            invoke: async () => ({ content: [{ kind: 'text', value: 'bypass executed' }] })
        });
        const sessionId = 'test-bypass-terminal';
        stubGetSession(testChatService, sessionId, {
            requestId: 'req1',
            modeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove },
        });
        const result = await testService.invokeTool(tool.makeDto({ command: 'ls -la', explanation: 'test', goal: 'test', isBackground: false }, { sessionId }), async () => 0, CancellationToken.None);
        assert.strictEqual(result.content[0].value, 'bypass executed');
    });
    test('bypass approvals does not auto-approve tools in toolIdsThatCannotBeAutoApproved for CLI sessions', async () => {
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                config.setUserConfiguration('chat.tools.global.autoApprove', false);
            }
        });
        // Register a tool with the ID that should never be auto-approved
        registerToolForTest(testService, store, 'vscode_get_modified_files_confirmation', {
            prepareToolInvocation: async () => ({
                confirmationMessages: {
                    title: 'Uncommitted Changes',
                    message: 'Should these changes be included?',
                },
            }),
            invoke: async () => ({ content: [{ kind: 'text', value: 'confirmed' }] })
        });
        // Create a CLI session URI (authority = 'copilotcli' instead of 'local')
        const sessionId = 'test-bypass-no-auto-confirm';
        const cliSessionResource = URI.from({
            scheme: LocalChatSessionUri.scheme,
            authority: 'copilotcli',
            path: '/' + sessionId
        });
        const capture = {};
        const fakeModel = {
            sessionId,
            sessionResource: cliSessionResource,
            getRequests: () => [{ id: 'req1', modelId: 'test-model', modeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove } }],
        };
        testChatService.addSession(fakeModel);
        testChatService.appendProgress = (_request, progress) => {
            capture.invocation = progress;
        };
        const resultPromise = testService.invokeTool({
            callId: '1',
            toolId: 'vscode_get_modified_files_confirmation',
            tokenBudget: 100,
            parameters: { test: true },
            context: { sessionResource: cliSessionResource },
        }, async () => 0, CancellationToken.None);
        // The tool should NOT be auto-approved for CLI sessions — it must show confirmation UI
        const published = await waitForPublishedInvocation(capture);
        assert.ok(published?.confirmationMessages, 'tool in toolIdsThatCannotBeAutoApproved should require confirmation for CLI sessions even with Bypass Approvals');
        IChatToolInvocation.confirmWith(published, { type: 4 /* ToolConfirmKind.UserAction */ });
        const result = await resultPromise;
        assert.strictEqual(result.content[0].value, 'confirmed');
    });
    test('bypass approvals auto-approves tools in toolIdsThatCannotBeAutoApproved for local sessions', async () => {
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                config.setUserConfiguration('chat.tools.global.autoApprove', false);
            }
        });
        // Register a tool with the ID that cannot be auto-approved for CLI
        const tool = registerToolForTest(testService, store, 'vscode_get_modified_files_confirmation', {
            prepareToolInvocation: async () => ({
                confirmationMessages: {
                    title: 'Uncommitted Changes',
                    message: 'Should these changes be included?',
                },
            }),
            invoke: async () => ({ content: [{ kind: 'text', value: 'auto approved for local' }] })
        });
        const sessionId = 'test-bypass-local-auto-confirm';
        stubGetSession(testChatService, sessionId, {
            requestId: 'req1',
            modeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove },
        });
        // For local sessions, Bypass Approvals should auto-approve even these tools
        const result = await testService.invokeTool(tool.makeDto({ test: true }, { sessionId }), async () => 0, CancellationToken.None);
        assert.strictEqual(result.content[0].value, 'auto approved for local');
    });
    test('shouldAutoConfirm with basic configuration', async () => {
        // Test basic shouldAutoConfirm behavior with simple configuration
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                config.setUserConfiguration('chat.tools.global.autoApprove', true); // Global enabled
            }
        });
        // Register a tool that should be auto-approved
        const autoTool = registerToolForTest(testService, store, 'autoTool', {
            prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Test', message: 'Should auto-approve' } }),
            invoke: async () => ({ content: [{ kind: 'text', value: 'auto approved' }] })
        });
        const sessionId = 'test-basic-config';
        stubGetSession(testChatService, sessionId, { requestId: 'req1' });
        // Tool should be auto-approved (global config = true)
        const result = await testService.invokeTool(autoTool.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
        assert.strictEqual(result.content[0].value, 'auto approved');
    });
    test('shouldAutoConfirm with per-tool configuration object', async () => {
        // Test per-tool configuration: { toolId: true/false }
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                config.setUserConfiguration('chat.tools.global.autoApprove', {
                    'approvedTool': true,
                    'deniedTool': false
                });
            }
        });
        // Tool explicitly approved
        const approvedTool = registerToolForTest(testService, store, 'approvedTool', {
            prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Test', message: 'Should auto-approve' } }),
            invoke: async () => ({ content: [{ kind: 'text', value: 'approved' }] })
        });
        const sessionId = 'test-per-tool';
        stubGetSession(testChatService, sessionId, { requestId: 'req1' });
        // Approved tool should auto-approve
        const approvedResult = await testService.invokeTool(approvedTool.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
        assert.strictEqual(approvedResult.content[0].value, 'approved');
        // Test that non-specified tools require confirmation (default behavior)
        const unspecifiedTool = registerToolForTest(testService, store, 'unspecifiedTool', {
            prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Test', message: 'Should require confirmation' } }),
            invoke: async () => ({ content: [{ kind: 'text', value: 'unspecified' }] })
        });
        const capture = {};
        stubGetSession(testChatService, sessionId + '2', { requestId: 'req2', capture });
        const unspecifiedPromise = testService.invokeTool(unspecifiedTool.makeDto({ test: 2 }, { sessionId: sessionId + '2' }), async () => 0, CancellationToken.None);
        const published = await waitForPublishedInvocation(capture);
        assert.ok(published?.confirmationMessages, 'unspecified tool should require confirmation');
        IChatToolInvocation.confirmWith(published, { type: 4 /* ToolConfirmKind.UserAction */ });
        const unspecifiedResult = await unspecifiedPromise;
        assert.strictEqual(unspecifiedResult.content[0].value, 'unspecified');
    });
    test('eligibleForAutoApproval setting controls tool eligibility', async () => {
        // Test the new eligibleForAutoApproval setting
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                config.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
                    'eligibleToolRef': true,
                    'ineligibleToolRef': false
                });
            }
        });
        // Tool explicitly marked as eligible (using toolReferenceName) - no confirmation needed
        const eligibleTool = registerToolForTest(testService, store, 'eligibleTool', {
            prepareToolInvocation: async () => ({}),
            invoke: async () => ({ content: [{ kind: 'text', value: 'eligible tool ran' }] })
        }, {
            toolReferenceName: 'eligibleToolRef'
        });
        const sessionId = 'test-eligible';
        stubGetSession(testChatService, sessionId, { requestId: 'req1' });
        // Eligible tool should not get default confirmation messages injected
        const eligibleResult = await testService.invokeTool(eligibleTool.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
        assert.strictEqual(eligibleResult.content[0].value, 'eligible tool ran');
        // Tool explicitly marked as ineligible (using toolReferenceName) - must require confirmation
        const ineligibleTool = registerToolForTest(testService, store, 'ineligibleTool', {
            prepareToolInvocation: async () => ({}),
            invoke: async () => ({ content: [{ kind: 'text', value: 'ineligible requires confirmation' }] })
        }, {
            toolReferenceName: 'ineligibleToolRef'
        });
        const capture = {};
        stubGetSession(testChatService, sessionId + '2', { requestId: 'req2', capture });
        const ineligiblePromise = testService.invokeTool(ineligibleTool.makeDto({ test: 2 }, { sessionId: sessionId + '2' }), async () => 0, CancellationToken.None);
        const published = await waitForPublishedInvocation(capture);
        assert.ok(published?.confirmationMessages, 'ineligible tool should require confirmation');
        assert.ok(published?.confirmationMessages?.title, 'should have default confirmation title');
        assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, 'should not allow auto confirm');
        IChatToolInvocation.confirmWith(published, { type: 4 /* ToolConfirmKind.UserAction */ });
        const ineligibleResult = await ineligiblePromise;
        assert.strictEqual(ineligibleResult.content[0].value, 'ineligible requires confirmation');
        // Tool not specified should default to eligible - no confirmation needed
        const unspecifiedTool = registerToolForTest(testService, store, 'unspecifiedTool', {
            prepareToolInvocation: async () => ({}),
            invoke: async () => ({ content: [{ kind: 'text', value: 'unspecified defaults to eligible' }] })
        }, {
            toolReferenceName: 'unspecifiedToolRef'
        });
        const unspecifiedResult = await testService.invokeTool(unspecifiedTool.makeDto({ test: 3 }, { sessionId }), async () => 0, CancellationToken.None);
        assert.strictEqual(unspecifiedResult.content[0].value, 'unspecified defaults to eligible');
    });
    test('tool content formatting with alwaysDisplayInputOutput', async () => {
        // Test ensureToolDetails, formatToolInput, and toolResultToIO
        const toolData = {
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
        const result = await service.invokeTool(tool.makeDto(input), async () => 0, CancellationToken.None);
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
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            telemetryService: testTelemetryService
        });
        // Test successful invocation telemetry
        const successTool = registerToolForTest(testService, store, 'successTool', {
            prepareToolInvocation: async () => ({}),
            invoke: async () => ({ content: [{ kind: 'text', value: 'success' }] })
        });
        const sessionId = 'telemetry-test';
        stubGetSession(testChatService, sessionId, { requestId: 'req1' });
        await testService.invokeTool(successTool.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
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
        stubGetSession(testChatService, sessionId + '2', { requestId: 'req2' });
        try {
            await testService.invokeTool(errorTool.makeDto({ test: 2 }, { sessionId: sessionId + '2' }), async () => 0, CancellationToken.None);
            assert.fail('Should have thrown');
        }
        catch (err) {
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
            isScreenReaderOptimized() { return false; }
        }();
        const instaService1 = workbenchInstantiationService({
            contextKeyService: () => store.add(new ContextKeyService(testConfigService1)),
            configurationService: () => testConfigService1
        }, store);
        instaService1.stub(IChatService, chatService);
        instaService1.stub(IAccessibilityService, testAccessibilityService1);
        instaService1.stub(IAccessibilitySignalService, testAccessibilitySignalService);
        instaService1.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
        const testService1 = store.add(instaService1.createInstance(LanguageModelToolsService));
        const tool1 = registerToolForTest(testService1, store, 'soundOnlyTool', {
            prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Sound Test', message: 'Testing sound only' } }),
            invoke: async () => ({ content: [{ kind: 'text', value: 'executed' }] })
        });
        const sessionId1 = 'sound-test';
        const capture1 = {};
        stubGetSession(chatService, sessionId1, { requestId: 'req1', capture: capture1 });
        const promise1 = testService1.invokeTool(tool1.makeDto({ test: 1 }, { sessionId: sessionId1 }), async () => 0, CancellationToken.None);
        const published1 = await waitForPublishedInvocation(capture1);
        // Signal should be played (sound=on, no screen reader requirement)
        assert.strictEqual(testAccessibilitySignalService.signalPlayedCalls.length, 1, 'sound should be played when sound=on');
        const call1 = testAccessibilitySignalService.signalPlayedCalls[0];
        assert.strictEqual(call1.options?.modality, undefined, 'should use default modality for sound');
        IChatToolInvocation.confirmWith(published1, { type: 4 /* ToolConfirmKind.UserAction */ });
        await promise1;
        testAccessibilitySignalService.reset();
        // Test case 2: Sound auto, announcement auto, screen reader on
        const testConfigService2 = new TestConfigurationService();
        testConfigService2.setUserConfiguration('chat.tools.global.autoApprove', false);
        testConfigService2.setUserConfiguration('accessibility.signals.chatUserActionRequired', { sound: 'auto', announcement: 'auto' });
        const testAccessibilityService2 = new class extends TestAccessibilityService {
            isScreenReaderOptimized() { return true; }
        }();
        const instaService2 = workbenchInstantiationService({
            contextKeyService: () => store.add(new ContextKeyService(testConfigService2)),
            configurationService: () => testConfigService2
        }, store);
        instaService2.stub(IChatService, chatService);
        instaService2.stub(IAccessibilityService, testAccessibilityService2);
        instaService2.stub(IAccessibilitySignalService, testAccessibilitySignalService);
        instaService2.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
        const testService2 = store.add(instaService2.createInstance(LanguageModelToolsService));
        const tool2 = registerToolForTest(testService2, store, 'autoScreenReaderTool', {
            prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Auto Test', message: 'Testing auto with screen reader' } }),
            invoke: async () => ({ content: [{ kind: 'text', value: 'executed' }] })
        });
        const sessionId2 = 'auto-sr-test';
        const capture2 = {};
        stubGetSession(chatService, sessionId2, { requestId: 'req2', capture: capture2 });
        const promise2 = testService2.invokeTool(tool2.makeDto({ test: 2 }, { sessionId: sessionId2 }), async () => 0, CancellationToken.None);
        const published2 = await waitForPublishedInvocation(capture2);
        // Signal should be played (both sound and announcement enabled for screen reader)
        assert.strictEqual(testAccessibilitySignalService.signalPlayedCalls.length, 1, 'signal should be played with screen reader optimization');
        const call2 = testAccessibilitySignalService.signalPlayedCalls[0];
        assert.ok(call2.options?.customAlertMessage, 'should have custom alert message');
        assert.strictEqual(call2.options?.userGesture, true, 'should mark as user gesture');
        IChatToolInvocation.confirmWith(published2, { type: 4 /* ToolConfirmKind.UserAction */ });
        await promise2;
        testAccessibilitySignalService.reset();
        // Test case 3: Sound off, announcement off - no signal
        const testConfigService3 = new TestConfigurationService();
        testConfigService3.setUserConfiguration('chat.tools.global.autoApprove', false);
        testConfigService3.setUserConfiguration('accessibility.signals.chatUserActionRequired', { sound: 'off', announcement: 'off' });
        const testAccessibilityService3 = new class extends TestAccessibilityService {
            isScreenReaderOptimized() { return true; }
        }();
        const instaService3 = workbenchInstantiationService({
            contextKeyService: () => store.add(new ContextKeyService(testConfigService3)),
            configurationService: () => testConfigService3
        }, store);
        instaService3.stub(IChatService, chatService);
        instaService3.stub(IAccessibilityService, testAccessibilityService3);
        instaService3.stub(IAccessibilitySignalService, testAccessibilitySignalService);
        instaService3.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
        const testService3 = store.add(instaService3.createInstance(LanguageModelToolsService));
        const tool3 = registerToolForTest(testService3, store, 'offTool', {
            prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Off Test', message: 'Testing off settings' } }),
            invoke: async () => ({ content: [{ kind: 'text', value: 'executed' }] })
        });
        const sessionId3 = 'off-test';
        const capture3 = {};
        stubGetSession(chatService, sessionId3, { requestId: 'req3', capture: capture3 });
        const promise3 = testService3.invokeTool(tool3.makeDto({ test: 3 }, { sessionId: sessionId3 }), async () => 0, CancellationToken.None);
        const published3 = await waitForPublishedInvocation(capture3);
        // No signal should be played
        assert.strictEqual(testAccessibilitySignalService.signalPlayedCalls.length, 0, 'no signal should be played when both sound and announcement are off');
        IChatToolInvocation.confirmWith(published3, { type: 4 /* ToolConfirmKind.UserAction */ });
        await promise3;
    });
    test('createToolSet and getToolSet', () => {
        const toolSet = store.add(service.createToolSet(ToolDataSource.Internal, 'testToolSetId', 'testToolSetName', { icon: undefined, description: 'Test tool set' }));
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
        store.add(service.createToolSet(ToolDataSource.Internal, 'toolSet1', 'refName1'));
        store.add(service.createToolSet(ToolDataSource.Internal, 'toolSet2', 'refName2'));
        // Should find by reference name
        assert.strictEqual(service.getToolSetByName('refName1')?.id, 'toolSet1');
        assert.strictEqual(service.getToolSetByName('refName2')?.id, 'toolSet2');
        // Should not find non-existent name
        assert.strictEqual(service.getToolSetByName('nonExistentName'), undefined);
    });
    test('getTools with includeDisabled parameter', () => {
        // Test the includeDisabled parameter behavior with context keys
        contextKeyService.createKey('testKey', false);
        const disabledTool = {
            id: 'disabledTool',
            modelDescription: 'Disabled Tool',
            displayName: 'Disabled Tool',
            source: ToolDataSource.Internal,
            when: ContextKeyEqualsExpr.create('testKey', true), // Will be disabled since testKey is false
        };
        const enabledTool = {
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
        const toolData = {
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
        const toolImpl = {
            invoke: async () => ({ content: [] }),
        };
        // Should throw when registering implementation for non-existent tool
        assert.throws(() => {
            service.registerToolImplementation('nonExistentTool', toolImpl);
        }, /Tool "nonExistentTool" was not contributed/);
    });
    test('tool implementation duplicate registration throws', () => {
        const toolData = {
            id: 'testTool',
            modelDescription: 'Test Tool',
            displayName: 'Test Tool',
            source: ToolDataSource.Internal,
        };
        const toolImpl1 = {
            invoke: async () => ({ content: [] }),
        };
        const toolImpl2 = {
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
        const dto = {
            callId: '1',
            toolId: 'unknownTool',
            tokenBudget: 100,
            parameters: {},
            context: undefined,
        };
        await assert.rejects(service.invokeTool(dto, async () => 0, CancellationToken.None), /Tool unknownTool was not contributed/);
    });
    test('invokeTool without implementation activates extension and throws if still not found', async () => {
        const toolData = {
            id: 'extensionActivationTool',
            modelDescription: 'Extension Tool',
            displayName: 'Extension Tool',
            source: ToolDataSource.Internal,
        };
        store.add(service.registerToolData(toolData));
        const dto = {
            callId: '1',
            toolId: 'extensionActivationTool',
            tokenBudget: 100,
            parameters: {},
            context: undefined,
        };
        // Should throw after attempting extension activation
        await assert.rejects(service.invokeTool(dto, async () => 0, CancellationToken.None), /Tool extensionActivationTool does not have an implementation registered/);
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
        }
        catch (err) {
            threwError = true;
            // Verify it's one of the expected error types
            assert.ok(err instanceof Error && (err.message.includes('Tool called for unknown chat session') ||
                err.message.includes('getRequests is not a function')), `Unexpected error: ${err.message}`);
        }
        assert.strictEqual(threwError, true, 'Should have thrown an error');
    });
    test('tool error with alwaysDisplayInputOutput includes details', async () => {
        const toolData = {
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
            await service.invokeTool(tool.makeDto(input), async () => 0, CancellationToken.None);
            assert.fail('Should have thrown');
        }
        catch (err) {
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
        const toolData = {
            id: 'contextTool',
            modelDescription: 'Context Tool',
            displayName: 'Context Tool',
            source: ToolDataSource.Internal,
            when: ContextKeyEqualsExpr.create('dynamicKey', true),
        };
        store.add(service.registerToolData(toolData));
        // Change the context key value
        contextKeyService.createKey('dynamicKey', true);
        service.flushToolUpdates();
        assert.strictEqual(changeEventFired, true, 'onDidChangeTools should fire when context keys change');
    });
    test('configuration changes trigger tool updates', async () => {
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
            change: null,
            source: 2 /* ConfigurationTarget.USER */
        });
        service.flushToolUpdates();
        assert.strictEqual(changeEventFired, true, 'onDidChangeTools should fire when configuration changes');
    });
    test('toToolAndToolSetEnablementMap with MCP toolset enables contained tools', () => {
        // Create MCP toolset
        const mcpToolSet = store.add(service.createToolSet({ type: 'mcp', label: 'testServer', serverLabel: 'testServer', instructions: undefined, collectionId: 'testCollection', definitionId: 'testDef' }, 'mcpSet', 'mcpSetRef'));
        const mcpTool = {
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
            const result = service.toToolAndToolSetEnablementMap(enabledNames, undefined);
            assert.strictEqual(result.get(mcpToolSet), true, 'MCP toolset should be enabled'); // Ensure the toolset is in the map
            assert.strictEqual(result.get(mcpTool), true, 'MCP tool should be enabled when its toolset is enabled'); // Ensure the tool is in the map
            const fullReferenceNames = service.toFullReferenceNames(result);
            assert.deepStrictEqual(fullReferenceNames.sort(), enabledNames.sort(), 'toFullReferenceNames should return the original enabled names');
        }
        // Enable a tool from the MCP toolset
        {
            const enabledNames = [mcpTool].map(t => service.getFullReferenceName(t, mcpToolSet));
            const result = service.toToolAndToolSetEnablementMap(enabledNames, undefined);
            assert.strictEqual(result.get(mcpToolSet), false, 'MCP toolset should be disabled'); // Ensure the toolset is in the map
            assert.strictEqual(result.get(mcpTool), true, 'MCP tool should be enabled'); // Ensure the tool is in the map
            const fullReferenceNames = service.toFullReferenceNames(result);
            assert.deepStrictEqual(fullReferenceNames.sort(), enabledNames.sort(), 'toFullReferenceNames should return the original enabled names');
        }
    });
    test('shouldAutoConfirm with workspace-specific tool configuration', async () => {
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                config.setUserConfiguration('chat.tools.global.autoApprove', { 'workspaceTool': true });
            }
        });
        const workspaceTool = registerToolForTest(testService, store, 'workspaceTool', {
            prepareToolInvocation: async () => ({ confirmationMessages: { title: 'Test', message: 'Workspace tool' } }),
            invoke: async () => ({ content: [{ kind: 'text', value: 'workspace result' }] })
        }, { runsInWorkspace: true });
        const sessionId = 'workspace-test';
        stubGetSession(testChatService, sessionId, { requestId: 'req1' });
        // Should auto-approve based on user configuration
        const result = await testService.invokeTool(workspaceTool.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
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
    test('getDeprecatedFullReferenceNames includes namespaced legacy names for tools in toolsets', () => {
        // When a tool is in a toolset and has legacy names, the deprecated names map
        // should also include the namespaced form (e.g. 'vscode/oldName' → 'vscode/newName')
        const toolWithLegacy = {
            id: 'myNewBrowser',
            toolReferenceName: 'openIntegratedBrowser',
            legacyToolReferenceFullNames: ['openSimpleBrowser'],
            modelDescription: 'Open browser',
            displayName: 'Open Integrated Browser',
            source: ToolDataSource.Internal,
            canBeReferencedInPrompt: true,
        };
        store.add(service.registerToolData(toolWithLegacy));
        store.add(service.vscodeToolSet.addTool(toolWithLegacy));
        const deprecated = service.getDeprecatedFullReferenceNames();
        // The simple legacy name should map to the full reference name
        assert.deepStrictEqual(deprecated.get('openSimpleBrowser'), new Set(['vscode/openIntegratedBrowser']));
        // The namespaced legacy name should also map to the full reference name
        assert.deepStrictEqual(deprecated.get('vscode/openSimpleBrowser'), new Set(['vscode/openIntegratedBrowser']));
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
        assert.strictEqual(toolInSet.id, 'internalToolSet');
    });
    test('eligibleForAutoApproval setting can be configured via policy', async () => {
        // Test that policy configuration works for eligibleForAutoApproval
        // Policy values should be JSON strings for object-type settings
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                // Simulate policy configuration (would come from policy file)
                config.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
                    'toolA': true,
                    'toolB': false
                });
            }
        });
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
        stubGetSession(testChatService, sessionId, { requestId: 'req1' });
        // Tool A should execute without confirmation (eligible)
        const resultA = await testService.invokeTool(toolA.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
        assert.strictEqual(resultA.content[0].value, 'toolA executed');
        // Tool B should require confirmation (ineligible)
        const capture = {};
        stubGetSession(testChatService, sessionId + '2', { requestId: 'req2', capture });
        const promiseB = testService.invokeTool(toolB.makeDto({ test: 2 }, { sessionId: sessionId + '2' }), async () => 0, CancellationToken.None);
        const published = await waitForPublishedInvocation(capture);
        assert.ok(published?.confirmationMessages, 'toolB should require confirmation due to policy');
        assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, 'should not allow auto confirm');
        IChatToolInvocation.confirmWith(published, { type: 4 /* ToolConfirmKind.UserAction */ });
        const resultB = await promiseB;
        assert.strictEqual(resultB.content[0].value, 'toolB executed');
    });
    test('eligibleForAutoApproval with legacy tool reference names - eligible', async () => {
        // Test backwards compatibility: configuring a legacy name as eligible should work
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                config.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
                    'oldToolName': true // Using legacy name
                });
            }
        });
        // Tool has been renamed but has legacy name
        const renamedTool = registerToolForTest(testService, store, 'renamedTool', {
            prepareToolInvocation: async () => ({}),
            invoke: async () => ({ content: [{ kind: 'text', value: 'tool executed via legacy name' }] })
        }, {
            toolReferenceName: 'newToolName',
            legacyToolReferenceFullNames: ['oldToolName']
        });
        const sessionId = 'test-legacy-eligible';
        stubGetSession(testChatService, sessionId, { requestId: 'req1' });
        // Tool should be eligible even though we configured the legacy name
        const result = await testService.invokeTool(renamedTool.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
        assert.strictEqual(result.content[0].value, 'tool executed via legacy name');
    });
    test('eligibleForAutoApproval with legacy tool reference names - ineligible', async () => {
        // Test backwards compatibility: configuring a legacy name as ineligible should work
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                config.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
                    'deprecatedToolName': false // Using legacy name
                });
            }
        });
        // Tool has been renamed but has legacy name
        const renamedTool = registerToolForTest(testService, store, 'renamedTool2', {
            prepareToolInvocation: async () => ({}),
            invoke: async () => ({ content: [{ kind: 'text', value: 'tool requires confirmation' }] })
        }, {
            toolReferenceName: 'modernToolName',
            legacyToolReferenceFullNames: ['deprecatedToolName']
        });
        const sessionId = 'test-legacy-ineligible';
        const capture = {};
        stubGetSession(testChatService, sessionId, { requestId: 'req1', capture });
        // Tool should be ineligible and require confirmation
        const promise = testService.invokeTool(renamedTool.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
        const published = await waitForPublishedInvocation(capture);
        assert.ok(published?.confirmationMessages, 'tool should require confirmation when legacy name is ineligible');
        assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, 'should not allow auto confirm');
        IChatToolInvocation.confirmWith(published, { type: 4 /* ToolConfirmKind.UserAction */ });
        const result = await promise;
        assert.strictEqual(result.content[0].value, 'tool requires confirmation');
    });
    test('eligibleForAutoApproval with multiple legacy names', async () => {
        // Test that any of the legacy names can be used in the configuration
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                config.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
                    'secondLegacyName': true // Using the second legacy name
                });
            }
        });
        // Tool has multiple legacy names
        const multiLegacyTool = registerToolForTest(testService, store, 'multiLegacyTool', {
            prepareToolInvocation: async () => ({}),
            invoke: async () => ({ content: [{ kind: 'text', value: 'multi legacy executed' }] })
        }, {
            toolReferenceName: 'currentToolName',
            legacyToolReferenceFullNames: ['firstLegacyName', 'secondLegacyName', 'thirdLegacyName']
        });
        const sessionId = 'test-multi-legacy';
        stubGetSession(testChatService, sessionId, { requestId: 'req1' });
        // Tool should be eligible via second legacy name
        const result = await testService.invokeTool(multiLegacyTool.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
        assert.strictEqual(result.content[0].value, 'multi legacy executed');
    });
    test('eligibleForAutoApproval current name takes precedence over legacy names', async () => {
        // Test forward compatibility: current name in config should take precedence
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                config.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
                    'currentName': false, // Current name says ineligible
                    'oldName': true // Legacy name says eligible
                });
            }
        });
        const tool = registerToolForTest(testService, store, 'precedenceTool', {
            prepareToolInvocation: async () => ({}),
            invoke: async () => ({ content: [{ kind: 'text', value: 'precedence test' }] })
        }, {
            toolReferenceName: 'currentName',
            legacyToolReferenceFullNames: ['oldName']
        });
        const sessionId = 'test-precedence';
        const capture = {};
        stubGetSession(testChatService, sessionId, { requestId: 'req1', capture });
        // Current name should take precedence, so tool should be ineligible
        const promise = testService.invokeTool(tool.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
        const published = await waitForPublishedInvocation(capture);
        assert.ok(published?.confirmationMessages, 'current name should take precedence over legacy name');
        assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, 'should not allow auto confirm');
        IChatToolInvocation.confirmWith(published, { type: 4 /* ToolConfirmKind.UserAction */ });
        const result = await promise;
        assert.strictEqual(result.content[0].value, 'precedence test');
    });
    test('eligibleForAutoApproval with legacy full reference names from toolsets', async () => {
        // Test legacy names that include toolset prefixes (e.g., 'oldToolSet/oldToolName')
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                config.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
                    'oldToolSet/oldToolName': false // Legacy full reference name from old toolset
                });
            }
        });
        // Tool was in an old toolset but now standalone
        const migratedTool = registerToolForTest(testService, store, 'migratedTool', {
            prepareToolInvocation: async () => ({}),
            invoke: async () => ({ content: [{ kind: 'text', value: 'migrated tool' }] })
        }, {
            toolReferenceName: 'standaloneToolName',
            legacyToolReferenceFullNames: ['oldToolSet/oldToolName']
        });
        const sessionId = 'test-fullReferenceName-legacy';
        const capture = {};
        stubGetSession(testChatService, sessionId, { requestId: 'req1', capture });
        // Tool should be ineligible based on legacy full reference name
        const promise = testService.invokeTool(migratedTool.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
        const published = await waitForPublishedInvocation(capture);
        assert.ok(published?.confirmationMessages, 'tool should be ineligible via legacy full reference name');
        assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, 'should not allow auto confirm');
        IChatToolInvocation.confirmWith(published, { type: 4 /* ToolConfirmKind.UserAction */ });
        const result = await promise;
        assert.strictEqual(result.content[0].value, 'migrated tool');
    });
    test('eligibleForAutoApproval mixed current and legacy names', async () => {
        // Test realistic migration scenario with mixed current and legacy names
        const { service: testService, chatService: testChatService } = createTestToolsService(store, {
            configureServices: config => {
                config.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
                    'modernTool': true, // Current name
                    'legacyToolOld': false, // Legacy name
                    'unchangedTool': true // Tool that never changed
                });
            }
        });
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
        stubGetSession(testChatService, sessionId, { requestId: 'req1' });
        // Tool 1 should be eligible (current name)
        const result1 = await testService.invokeTool(tool1.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
        assert.strictEqual(result1.content[0].value, 'modern executed');
        // Tool 2 should be ineligible (legacy name)
        const capture2 = {};
        stubGetSession(testChatService, sessionId + '2', { requestId: 'req2', capture: capture2 });
        const promise2 = testService.invokeTool(tool2.makeDto({ test: 2 }, { sessionId: sessionId + '2' }), async () => 0, CancellationToken.None);
        const published2 = await waitForPublishedInvocation(capture2);
        assert.ok(published2?.confirmationMessages, 'tool2 should require confirmation via legacy name');
        IChatToolInvocation.confirmWith(published2, { type: 4 /* ToolConfirmKind.UserAction */ });
        const result2 = await promise2;
        assert.strictEqual(result2.content[0].value, 'legacy needs confirmation');
        // Tool 3 should be eligible (unchanged)
        const result3 = await testService.invokeTool(tool3.makeDto({ test: 3 }, { sessionId }), async () => 0, CancellationToken.None);
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
        const capture = {};
        stubGetSession(chatService, sessionId, { requestId: 'req1' });
        // Tool should be eligible via legacy extension-prefixed name
        const result = await testService.invokeTool(tool.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
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
        const capture = {};
        stubGetSession(chatService, sessionId, { requestId: 'req1' });
        // Tool should be eligible via legacy extension-prefixed name
        const result = await testService.invokeTool(tool.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
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
        const capture = {};
        stubGetSession(chatService, sessionId, { requestId: 'req1', capture });
        // Tool should be ineligible via legacy extension-prefixed name
        const promise = testService.invokeTool(tool.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
        const published = await waitForPublishedInvocation(capture);
        assert.ok(published?.confirmationMessages, 'tool should require confirmation when legacy full name is ineligible');
        assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, 'should not allow auto confirm');
        IChatToolInvocation.confirmWith(published, { type: 4 /* ToolConfirmKind.UserAction */ });
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
        const capture = {};
        stubGetSession(chatService, sessionId, { requestId: 'req1', capture });
        // Tool should be ineligible via trimmed legacy name
        const promise = testService.invokeTool(tool.makeDto({ test: 1 }, { sessionId }), async () => 0, CancellationToken.None);
        const published = await waitForPublishedInvocation(capture);
        assert.ok(published?.confirmationMessages, 'tool should require confirmation when legacy trimmed name is ineligible');
        assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, 'should not allow auto confirm');
        IChatToolInvocation.confirmWith(published, { type: 4 /* ToolConfirmKind.UserAction */ });
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
        let receivedRawInput;
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
        const gpt4ToolDef = {
            id: 'gpt4Tool',
            toolReferenceName: 'gpt4ToolRef',
            modelDescription: 'GPT-4 Tool',
            displayName: 'GPT-4 Tool',
            source: ToolDataSource.Internal,
            canBeReferencedInPrompt: true,
            models: [{ family: 'gpt-4' }],
        };
        // Tool with no models selector (available for all models)
        const anyModelToolDef = {
            id: 'anyModelTool',
            toolReferenceName: 'anyModelToolRef',
            modelDescription: 'Any Model Tool',
            displayName: 'Any Model Tool',
            source: ToolDataSource.Internal,
            canBeReferencedInPrompt: true,
        };
        // Tool that requires claude family (won't match)
        const claudeToolDef = {
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
        const modelMetadata = { id: 'gpt-4-turbo', vendor: 'openai', family: 'gpt-4', version: '1.0' };
        const enabledNames = ['gpt4ToolRef', 'anyModelToolRef', 'claudeToolRef'];
        const result = service.toToolAndToolSetEnablementMap(enabledNames, modelMetadata);
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
            const enabledTool = {
                id: 'enabledObsTool',
                modelDescription: 'Enabled Tool',
                displayName: 'Enabled Tool',
                source: ToolDataSource.Internal,
                when: ContextKeyEqualsExpr.create('featureEnabled', true),
            };
            const disabledTool = {
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
        const capture = {};
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
        const dto = {
            callId: 'different-call-id',
            toolId: tool.id,
            tokenBudget: 100,
            parameters: { test: 1 },
            context: {
                sessionResource: LocalChatSessionUri.forSession(sessionId),
            },
            chatStreamToolCallId: 'stream-call-id', // This should correlate
        };
        const result = await service.invokeTool(dto, async () => 0, CancellationToken.None);
        assert.strictEqual(result.content[0].value, 'correlated result');
    });
    test('getAllToolsIncludingDisabled returns tools regardless of when clause', () => {
        contextKeyService.createKey('featureFlag', false);
        const enabledTool = {
            id: 'enabledTool',
            modelDescription: 'Enabled Tool',
            displayName: 'Enabled Tool',
            source: ToolDataSource.Internal,
        };
        const disabledTool = {
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
        const gpt4Tool = {
            id: 'gpt4Tool',
            modelDescription: 'GPT-4 Tool',
            displayName: 'GPT-4 Tool',
            source: ToolDataSource.Internal,
            models: [{ id: 'gpt-4-turbo' }],
        };
        const claudeTool = {
            id: 'claudeTool',
            modelDescription: 'Claude Tool',
            displayName: 'Claude Tool',
            source: ToolDataSource.Internal,
            models: [{ id: 'claude-3-opus' }],
        };
        const universalTool = {
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
        const modelMetadata = { id: 'gpt-4-turbo', vendor: 'openai', family: 'gpt-4', version: '1.0' };
        const tools = Array.from(service.getTools(modelMetadata));
        assert.strictEqual(tools.length, 2, 'should return 2 tools');
        assert.ok(tools.some(t => t.id === 'gpt4Tool'), 'should include GPT-4 tool');
        assert.ok(tools.some(t => t.id === 'universalTool'), 'should include universal tool');
        assert.ok(!tools.some(t => t.id === 'claudeTool'), 'should NOT include Claude tool');
    });
    test('getTools filters by model vendor using models property', () => {
        const anthropicTool = {
            id: 'anthropicTool',
            modelDescription: 'Anthropic Tool',
            displayName: 'Anthropic Tool',
            source: ToolDataSource.Internal,
            models: [{ vendor: 'anthropic' }],
        };
        const openaiTool = {
            id: 'openaiTool',
            modelDescription: 'OpenAI Tool',
            displayName: 'OpenAI Tool',
            source: ToolDataSource.Internal,
            models: [{ vendor: 'openai' }],
        };
        store.add(service.registerToolData(anthropicTool));
        store.add(service.registerToolData(openaiTool));
        // Mock model metadata with vendor 'anthropic'
        const modelMetadata = { id: 'claude-3', vendor: 'anthropic', family: 'claude-3', version: '1.0' };
        const tools = Array.from(service.getTools(modelMetadata));
        assert.strictEqual(tools.length, 1, 'should return 1 tool');
        assert.strictEqual(tools[0].id, 'anthropicTool', 'should include Anthropic tool');
    });
    test('getTools filters by model family using models property', () => {
        const gpt4FamilyTool = {
            id: 'gpt4FamilyTool',
            modelDescription: 'GPT-4 Family Tool',
            displayName: 'GPT-4 Family Tool',
            source: ToolDataSource.Internal,
            models: [{ family: 'gpt-4' }],
        };
        const gpt35FamilyTool = {
            id: 'gpt35FamilyTool',
            modelDescription: 'GPT-3.5 Family Tool',
            displayName: 'GPT-3.5 Family Tool',
            source: ToolDataSource.Internal,
            models: [{ family: 'gpt-3.5' }],
        };
        store.add(service.registerToolData(gpt4FamilyTool));
        store.add(service.registerToolData(gpt35FamilyTool));
        // Mock model metadata with family 'gpt-4'
        const modelMetadata = { id: 'gpt-4-turbo', vendor: 'openai', family: 'gpt-4', version: '1.0' };
        const tools = Array.from(service.getTools(modelMetadata));
        assert.strictEqual(tools.length, 1, 'should return 1 tool');
        assert.strictEqual(tools[0].id, 'gpt4FamilyTool', 'should include GPT-4 family tool');
    });
    test('getTools with undefined model skips model filtering', () => {
        const gpt4Tool = {
            id: 'gpt4Tool',
            modelDescription: 'GPT-4 Tool',
            displayName: 'GPT-4 Tool',
            source: ToolDataSource.Internal,
            models: [{ id: 'gpt-4-turbo' }],
        };
        const claudeTool = {
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
        const disabledTool = {
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
        const disabledTool = {
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
        const toolWithModels = {
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
        const extensionTool = {
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
    test('observeTools changes when context key changes', () => {
        const testCtxKey = contextKeyService.createKey('dynamicTestKey', 'value1');
        const tool1 = {
            id: 'dynamicTool1',
            modelDescription: 'Dynamic Tool 1',
            displayName: 'Dynamic Tool 1',
            source: ToolDataSource.Internal,
            when: ContextKeyEqualsExpr.create('dynamicTestKey', 'value1'),
        };
        const tool2 = {
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
        service.flushToolUpdates();
        // Now tool2 should be available
        tools = toolsObs.get();
        assert.strictEqual(tools.length, 1, 'should have 1 tool after change');
        assert.strictEqual(tools[0].id, 'dynamicTool2', 'should be dynamicTool2 after context change');
    });
    test('isPermitted allows tools in permitted toolsets when agent mode is disabled', () => {
        // Disable agent mode
        configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);
        // Create tool in the 'read' toolset (permitted)
        const readTool = {
            id: 'readToolInSet',
            toolReferenceName: 'readToolRef',
            modelDescription: 'Read Tool in Set',
            displayName: 'Read Tool',
            source: ToolDataSource.Internal,
        };
        store.add(service.registerToolData(readTool));
        store.add(service.readToolSet.addTool(readTool));
        // Create standalone tool not in any permitted toolset
        const standaloneTool = {
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
        const readTool = {
            id: 'readToolEnabled',
            toolReferenceName: 'readToolEnabledRef',
            modelDescription: 'Read Tool',
            displayName: 'Read Tool',
            source: ToolDataSource.Internal,
        };
        store.add(service.registerToolData(readTool));
        store.add(service.readToolSet.addTool(readTool));
        // Create standalone tool not in any permitted toolset
        const standaloneTool = {
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
        const customToolSet = store.add(service.createToolSet(ToolDataSource.Internal, 'customToolSet', 'customToolSetRef', { description: 'Custom Tool Set' }));
        const customTool = {
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
        const executeTool = {
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
        const executeTool = {
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
        const searchToolSet = store.add(service.createToolSet(ToolDataSource.Internal, 'search', SpecedToolAliases.search, { description: 'Search Tool Set' }));
        const searchTool = {
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
        const webToolSet = store.add(service.createToolSet(ToolDataSource.Internal, 'web', SpecedToolAliases.web, { description: 'Web Tool Set' }));
        const webTool = {
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
        const fetchTool = {
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
        const extensionTool = {
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
        const mcpToolSet = store.add(service.createToolSet({ type: 'mcp', label: 'Test MCP', serverLabel: 'Test MCP Server', instructions: undefined, collectionId: 'testMcp', definitionId: 'testMcpDef' }, 'mcpToolSetBlocked', 'mcpToolSetBlockedRef', { description: 'MCP Tool Set' }));
        const mcpTool = {
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
        const agentTool = {
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
        const multiSetTool = {
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
        const customToolSet = store.add(service.createToolSet(ToolDataSource.Internal, 'customMultiSet', 'customMultiSetRef', { description: 'Custom Multi Set' }));
        store.add(customToolSet.addTool(multiSetTool));
        // Get tools - tool should be available because it's in the 'read' toolset
        const tools = Array.from(service.getTools(undefined));
        const toolIds = tools.map(t => t.id);
        assert.ok(toolIds.includes('multiSetTool'), 'Tool should be permitted if it belongs to at least one permitted toolset');
    });
    test('isPermitted allows internal tools with canBeReferencedInPrompt=false when agent mode is disabled (issue #292935)', () => {
        // Disable agent mode
        configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);
        // Create internal infrastructure tool that explicitly cannot be referenced in prompts
        const infrastructureTool = {
            id: 'infrastructureToolInternal',
            toolReferenceName: 'infrastructureToolRef',
            modelDescription: 'Infrastructure Tool',
            displayName: 'Infrastructure Tool',
            source: ToolDataSource.Internal,
            canBeReferencedInPrompt: false,
        };
        store.add(service.registerToolData(infrastructureTool));
        // Create internal tool with canBeReferencedInPrompt=true (should be blocked)
        const referencableTool = {
            id: 'referencableTool',
            toolReferenceName: 'referencableToolRef',
            modelDescription: 'Referencable Tool',
            displayName: 'Referencable Tool',
            source: ToolDataSource.Internal,
            canBeReferencedInPrompt: true,
        };
        store.add(service.registerToolData(referencableTool));
        // Create internal tool with canBeReferencedInPrompt=undefined (should be blocked)
        const undefinedTool = {
            id: 'undefinedTool',
            toolReferenceName: 'undefinedToolRef',
            modelDescription: 'Undefined Tool',
            displayName: 'Undefined Tool',
            source: ToolDataSource.Internal,
            // canBeReferencedInPrompt is undefined
        };
        store.add(service.registerToolData(undefinedTool));
        // Get tools - only the infrastructure tool should be available
        const tools = Array.from(service.getTools(undefined));
        const toolIds = tools.map(t => t.id);
        assert.ok(toolIds.includes('infrastructureToolInternal'), 'Internal infrastructure tool with canBeReferencedInPrompt=false should be permitted when agent mode is disabled');
        assert.ok(!toolIds.includes('referencableTool'), 'Internal tool with canBeReferencedInPrompt=true should NOT be permitted when agent mode is disabled');
        assert.ok(!toolIds.includes('undefinedTool'), 'Internal tool with canBeReferencedInPrompt=undefined should NOT be permitted when agent mode is disabled');
    });
    suite('ToolSet when clause filtering (issue #291154)', () => {
        test('ToolSet.getTools filters tools by when clause', () => {
            // Create a context key for testing
            contextKeyService.createKey('testFeatureEnabled', false);
            // Create tools with different when clauses
            const toolWithWhenTrue = {
                id: 'toolWithWhenTrue',
                modelDescription: 'Tool with when true',
                displayName: 'Tool with when true',
                source: ToolDataSource.Internal,
                when: ContextKeyEqualsExpr.create('testFeatureEnabled', true),
            };
            const toolWithWhenFalse = {
                id: 'toolWithWhenFalse',
                modelDescription: 'Tool with when false',
                displayName: 'Tool with when false',
                source: ToolDataSource.Internal,
                when: ContextKeyEqualsExpr.create('testFeatureEnabled', false),
            };
            const toolWithoutWhen = {
                id: 'toolWithoutWhen',
                modelDescription: 'Tool without when',
                displayName: 'Tool without when',
                source: ToolDataSource.Internal,
            };
            // Create a tool set and add the tools
            const testToolSet = store.add(service.createToolSet(ToolDataSource.Internal, 'testToolSet', 'testToolSetRef', { description: 'Test Tool Set' }));
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
        test('ToolSet.getTools updates when context key changes', () => {
            // Create a context key for testing
            const testKey = contextKeyService.createKey('dynamicTestKey', 'value1');
            // Create tools with when clauses
            const toolWithValue1 = {
                id: 'toolWithValue1',
                modelDescription: 'Tool with value1',
                displayName: 'Tool with value1',
                source: ToolDataSource.Internal,
                when: ContextKeyEqualsExpr.create('dynamicTestKey', 'value1'),
            };
            const toolWithValue2 = {
                id: 'toolWithValue2',
                modelDescription: 'Tool with value2',
                displayName: 'Tool with value2',
                source: ToolDataSource.Internal,
                when: ContextKeyEqualsExpr.create('dynamicTestKey', 'value2'),
            };
            // Create a tool set and add the tools
            const dynamicToolSet = store.add(service.createToolSet(ToolDataSource.Internal, 'dynamicToolSet', 'dynamicToolSetRef', { description: 'Dynamic Tool Set' }));
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
            service.flushToolUpdates();
            // Now toolWithValue2 should be available
            tools = Array.from(dynamicToolSet.getTools());
            toolIds = tools.map(t => t.id);
            assert.strictEqual(tools.length, 1, 'Should have 1 tool after change');
            assert.strictEqual(toolIds[0], 'toolWithValue2', 'Should be toolWithValue2 after context change');
        });
        test('ToolSet.getTools with complex when expressions', () => {
            // Create multiple context keys for testing complex expressions
            contextKeyService.createKey('featureA', true);
            contextKeyService.createKey('featureB', false);
            contextKeyService.createKey('featureC', true);
            const toolWithAnd = {
                id: 'toolWithAnd',
                modelDescription: 'Tool with AND expression',
                displayName: 'Tool with AND',
                source: ToolDataSource.Internal,
                when: ContextKeyExpr.and(ContextKeyExpr.has('featureA'), ContextKeyExpr.has('featureC')),
            };
            const toolWithOr = {
                id: 'toolWithOr',
                modelDescription: 'Tool with OR expression',
                displayName: 'Tool with OR',
                source: ToolDataSource.Internal,
                when: ContextKeyExpr.or(ContextKeyExpr.has('featureA'), ContextKeyExpr.has('featureC')),
            };
            const toolWithNot = {
                id: 'toolWithNot',
                modelDescription: 'Tool with NOT expression',
                displayName: 'Tool with NOT',
                source: ToolDataSource.Internal,
                when: ContextKeyExpr.not('featureB'),
            };
            // Create a tool set and add the tools
            const complexToolSet = store.add(service.createToolSet(ToolDataSource.Internal, 'complexToolSet', 'complexToolSetRef', { description: 'Complex Tool Set' }));
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
            const parentTool = {
                id: 'parentTool',
                modelDescription: 'Parent Tool',
                displayName: 'Parent Tool',
                source: ToolDataSource.Internal,
            };
            // Create tools in child tool set with when clause
            const childToolWithWhen = {
                id: 'childToolWithWhen',
                modelDescription: 'Child Tool with When',
                displayName: 'Child Tool with When',
                source: ToolDataSource.Internal,
                when: ContextKeyEqualsExpr.create('nestedFeature', true),
            };
            const childToolWithoutWhen = {
                id: 'childToolWithoutWhen',
                modelDescription: 'Child Tool without When',
                displayName: 'Child Tool without When',
                source: ToolDataSource.Internal,
            };
            // Create parent tool set
            const parentToolSet = store.add(service.createToolSet(ToolDataSource.Internal, 'parentToolSet', 'parentToolSetRef', { description: 'Parent Tool Set' }));
            // Create child tool set
            const childToolSet = store.add(service.createToolSet(ToolDataSource.Internal, 'childToolSet', 'childToolSetRef', { description: 'Child Tool Set' }));
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
    suite('preToolUse hooks', () => {
        let hookService;
        let hookChatService;
        setup(() => {
            const setup = createTestToolsService(store);
            hookService = setup.service;
            hookChatService = setup.chatService;
        });
        test('when hook denies, tool returns error and creates cancelled invocation', async () => {
            const tool = registerToolForTest(hookService, store, 'hookDenyTool', {
                invoke: async () => ({ content: [{ kind: 'text', value: 'should not run' }] })
            });
            const capture = {};
            stubGetSession(hookChatService, 'hook-test', { requestId: 'req1', capture });
            const dto = tool.makeDto({ test: 1 }, { sessionId: 'hook-test' });
            dto.preToolUseResult = {
                permissionDecision: 'deny',
                permissionDecisionReason: 'Destructive operations require approval',
            };
            const result = await hookService.invokeTool(dto, async () => 0, CancellationToken.None);
            // Verify error result returned
            assert.ok(result.toolResultError);
            assert.ok(result.toolResultError.includes('Destructive operations require approval'));
            assert.strictEqual(result.content[0].kind, 'text');
            assert.ok(result.content[0].value.includes('Tool execution denied'));
            // Verify a cancelled invocation was created
            const invocation = await waitForPublishedInvocation(capture);
            assert.ok(invocation);
            const state = invocation.state.get();
            assert.strictEqual(state.type, 5 /* IChatToolInvocation.StateKind.Cancelled */);
            if (state.type === 5 /* IChatToolInvocation.StateKind.Cancelled */) {
                assert.strictEqual(state.reason, 0 /* ToolConfirmKind.Denied */);
                assert.strictEqual(state.reasonMessage, 'Denied by PreToolUse hook: Destructive operations require approval');
            }
        });
        test('when hook allows, tool executes normally', async () => {
            const tool = registerToolForTest(hookService, store, 'hookAllowTool', {
                invoke: async () => ({ content: [{ kind: 'text', value: 'success' }] })
            });
            const capture = {};
            stubGetSession(hookChatService, 'hook-test-allow', { requestId: 'req1', capture });
            const dto = tool.makeDto({ test: 1 }, { sessionId: 'hook-test-allow' });
            dto.preToolUseResult = {
                permissionDecision: 'allow',
            };
            const result = await hookService.invokeTool(dto, async () => 0, CancellationToken.None);
            assert.strictEqual(result.content[0].kind, 'text');
            assert.strictEqual(result.content[0].value, 'success');
            assert.ok(!result.toolResultError);
        });
        test('when hook returns undefined, tool executes normally', async () => {
            const tool = registerToolForTest(hookService, store, 'hookUndefinedTool', {
                invoke: async () => ({ content: [{ kind: 'text', value: 'success' }] })
            });
            stubGetSession(hookChatService, 'hook-test-undefined', { requestId: 'req1' });
            const result = await hookService.invokeTool(tool.makeDto({ test: 1 }, { sessionId: 'hook-test-undefined' }), async () => 0, CancellationToken.None);
            assert.strictEqual(result.content[0].kind, 'text');
            assert.strictEqual(result.content[0].value, 'success');
        });
        test('when hook denies, tool invoke is never called', async () => {
            let invokeCalled = false;
            const tool = registerToolForTest(hookService, store, 'hookNeverInvokeTool', {
                invoke: async () => {
                    invokeCalled = true;
                    return { content: [{ kind: 'text', value: 'should not run' }] };
                }
            });
            const capture = {};
            stubGetSession(hookChatService, 'hook-test-no-invoke', { requestId: 'req1', capture });
            const dto = tool.makeDto({ test: 1 }, { sessionId: 'hook-test-no-invoke' });
            dto.preToolUseResult = {
                permissionDecision: 'deny',
                permissionDecisionReason: 'Operation not allowed',
            };
            await hookService.invokeTool(dto, async () => 0, CancellationToken.None);
            assert.strictEqual(invokeCalled, false, 'Tool invoke should not be called when hook denies');
        });
        test('when hook returns ask, tool is not auto-approved', async () => {
            let invokeCompleted = false;
            const tool = registerToolForTest(hookService, store, 'hookAskTool', {
                invoke: async () => {
                    invokeCompleted = true;
                    return { content: [{ kind: 'text', value: 'success' }] };
                },
                prepareToolInvocation: async () => ({
                    confirmationMessages: {
                        title: 'Confirm this action?',
                        message: 'This tool requires confirmation',
                        allowAutoConfirm: true
                    }
                })
            });
            const capture = {};
            stubGetSession(hookChatService, 'hook-test-ask', { requestId: 'req1', capture });
            const dto = tool.makeDto({ test: 1 }, { sessionId: 'hook-test-ask' });
            dto.preToolUseResult = {
                permissionDecision: 'ask',
                permissionDecisionReason: 'Requires user confirmation',
            };
            // Start invocation - it should wait for confirmation
            const invokePromise = hookService.invokeTool(dto, async () => 0, CancellationToken.None);
            const invocation = await waitForPublishedInvocation(capture);
            assert.ok(invocation, 'Tool invocation should be created');
            // Check that the tool is waiting for confirmation (not auto-approved)
            const state = invocation.state.get();
            assert.strictEqual(state.type, 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */, 'Tool should be waiting for confirmation when hook returns ask');
            // Confirm the tool to let the test complete
            IChatToolInvocation.confirmWith(invocation, { type: 4 /* ToolConfirmKind.UserAction */ });
            await invokePromise;
            assert.strictEqual(invokeCompleted, true, 'Tool should complete after confirmation');
        });
        test('when hook returns allow, tool is auto-approved', async () => {
            let invokeCompleted = false;
            const tool = registerToolForTest(hookService, store, 'hookAutoApproveTool', {
                invoke: async () => {
                    invokeCompleted = true;
                    return { content: [{ kind: 'text', value: 'success' }] };
                },
                prepareToolInvocation: async () => ({
                    confirmationMessages: {
                        title: 'Confirm this action?',
                        message: 'This tool would normally require confirmation',
                        allowAutoConfirm: true
                    }
                })
            });
            const capture = {};
            stubGetSession(hookChatService, 'hook-test-auto-approve', { requestId: 'req1', capture });
            const dto = tool.makeDto({ test: 1 }, { sessionId: 'hook-test-auto-approve' });
            dto.preToolUseResult = {
                permissionDecision: 'allow',
            };
            // Invoke the tool - it should auto-approve due to hook
            const result = await hookService.invokeTool(dto, async () => 0, CancellationToken.None);
            // Tool should have completed without waiting for confirmation
            assert.strictEqual(invokeCompleted, true, 'Tool should complete immediately when hook allows');
            assert.strictEqual(result.content[0].kind, 'text');
            assert.strictEqual(result.content[0].value, 'success');
        });
        test('when hook returns updatedInput, tool is invoked with replaced parameters', async () => {
            let receivedParameters;
            const tool = registerToolForTest(hookService, store, 'hookUpdatedInputTool', {
                invoke: async (dto) => {
                    receivedParameters = dto.parameters;
                    return { content: [{ kind: 'text', value: 'done' }] };
                },
                prepareToolInvocation: async () => ({
                    confirmationMessages: {
                        title: 'Confirm?',
                        message: 'Confirm action',
                        allowAutoConfirm: true
                    }
                })
            });
            stubGetSession(hookChatService, 'hook-test-updated-input', { requestId: 'req1' });
            const dto = tool.makeDto({ originalCommand: 'rm -rf /' }, { sessionId: 'hook-test-updated-input' });
            dto.preToolUseResult = {
                permissionDecision: 'allow',
                updatedInput: { safeCommand: 'echo hello' },
            };
            await hookService.invokeTool(dto, async () => 0, CancellationToken.None);
            assert.deepStrictEqual(receivedParameters, { safeCommand: 'echo hello' });
        });
        test('when hook returns updatedInput that fails schema validation, original parameters are kept', async () => {
            const mockCommandService = {
                executeCommand: async (commandId) => {
                    if (commandId === 'json.validate') {
                        return [{ message: 'Missing required property "command"', range: [{ line: 0, character: 0 }, { line: 0, character: 1 }], severity: 'Error' }];
                    }
                    return undefined;
                }
            };
            const setup = createTestToolsService(store, {
                commandService: mockCommandService,
            });
            let receivedParameters;
            const tool = registerToolForTest(setup.service, store, 'hookValidationFailTool', {
                invoke: async (dto) => {
                    receivedParameters = dto.parameters;
                    return { content: [{ kind: 'text', value: 'done' }] };
                },
                prepareToolInvocation: async () => ({
                    confirmationMessages: {
                        title: 'Confirm?',
                        message: 'Confirm action',
                        allowAutoConfirm: true
                    }
                })
            }, {
                inputSchema: {
                    type: 'object',
                    properties: { command: { type: 'string' } },
                    required: ['command'],
                }
            });
            stubGetSession(setup.chatService, 'hook-test-validation-fail', { requestId: 'req1' });
            const dto = tool.makeDto({ command: 'original' }, { sessionId: 'hook-test-validation-fail' });
            dto.preToolUseResult = {
                permissionDecision: 'allow',
                updatedInput: { invalidField: 'wrong' },
            };
            await setup.service.invokeTool(dto, async () => 0, CancellationToken.None);
            // Original parameters should be kept since validation failed
            assert.deepStrictEqual(receivedParameters, { command: 'original' });
        });
        test('when hook returns updatedInput that passes schema validation, parameters are replaced', async () => {
            const mockCommandService = {
                executeCommand: async (commandId) => {
                    if (commandId === 'json.validate') {
                        return []; // no diagnostics = valid
                    }
                    return undefined;
                }
            };
            const setup = createTestToolsService(store, {
                commandService: mockCommandService,
            });
            let receivedParameters;
            const tool = registerToolForTest(setup.service, store, 'hookValidationPassTool', {
                invoke: async (dto) => {
                    receivedParameters = dto.parameters;
                    return { content: [{ kind: 'text', value: 'done' }] };
                },
                prepareToolInvocation: async () => ({
                    confirmationMessages: {
                        title: 'Confirm?',
                        message: 'Confirm action',
                        allowAutoConfirm: true
                    }
                })
            }, {
                inputSchema: {
                    type: 'object',
                    properties: { command: { type: 'string' } },
                    required: ['command'],
                }
            });
            stubGetSession(setup.chatService, 'hook-test-validation-pass', { requestId: 'req1' });
            const dto = tool.makeDto({ command: 'original' }, { sessionId: 'hook-test-validation-pass' });
            dto.preToolUseResult = {
                permissionDecision: 'allow',
                updatedInput: { command: 'safe-command' },
            };
            await setup.service.invokeTool(dto, async () => 0, CancellationToken.None);
            // Updated parameters should be applied since validation passed
            assert.deepStrictEqual(receivedParameters, { command: 'safe-command' });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDbEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLG1CQUFtQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDakcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzVILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHNGQUFzRixDQUFDO0FBQ3hKLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUV6RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUN2RyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7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