/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ChatTipService, CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND, CREATE_AGENT_TRACKING_COMMAND, CREATE_PROMPT_TRACKING_COMMAND, CREATE_SKILL_TRACKING_COMMAND, FORK_CONVERSATION_TRACKING_COMMAND, TipEligibilityTracker } from '../../browser/chatTipService.js';
import { AgentInstructionFileType, IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { MockLanguageModelToolsService } from '../common/tools/mockLanguageModelToolsService.js';
import { TIP_CATALOG } from '../../browser/chatTipCatalog.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { TestChatEntitlementService } from '../../../../test/common/workbenchTestServices.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { MockChatService } from '../common/chatService/mockChatService.js';
import { CreateSlashCommandsUsageTracker } from '../../browser/createSlashCommandsUsageTracker.js';
import { ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart } from '../../common/requestParser/chatParserTypes.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { localChatSessionType } from '../../common/chatSessionsService.js';
import { GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID, GENERATE_PROMPT_COMMAND_ID } from '../../browser/actions/chatActions.js';
class MockContextKeyServiceWithRulesMatching extends MockContextKeyService {
    contextMatchesRules(rules) {
        return rules.evaluate({ getValue: (key) => this.getContextKeyValue(key) });
    }
}
class TrackingConfigurationService extends TestConfigurationService {
    updateValue(key, value, arg3) {
        this.lastUpdateKey = key;
        this.lastUpdateValue = value;
        this.lastUpdateTarget = arg3;
        return Promise.resolve(undefined);
    }
}
suite('ChatTipService', () => {
    const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let contextKeyService;
    let configurationService;
    let commandExecutedEmitter;
    let storageService;
    let mockInstructionFiles;
    let mockPromptInstructionFiles;
    let chatEntitlementService;
    function createProductService(hasCopilot) {
        return {
            _serviceBrand: undefined,
            defaultChatAgent: hasCopilot ? { chatExtensionId: 'github.copilot-chat' } : undefined,
        };
    }
    function createService(hasCopilot = true, tipsEnabled = true) {
        instantiationService.stub(IProductService, createProductService(hasCopilot));
        configurationService.setUserConfiguration('chat.tips.enabled', tipsEnabled);
        return testDisposables.add(instantiationService.createInstance(ChatTipService));
    }
    /**
     * Creates a mock ITipDefinition with a buildMessage function.
     * Tests can provide any ITipDefinition properties except buildMessage.
     */
    function createMockTip(overrides) {
        const { message, ...rest } = overrides;
        return {
            tier: "qol" /* ChatTipTier.Qol */,
            ...rest,
            buildMessage: () => new MarkdownString(message ?? 'test'),
        };
    }
    setup(() => {
        instantiationService = testDisposables.add(new TestInstantiationService());
        contextKeyService = new MockContextKeyServiceWithRulesMatching();
        contextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 1);
        configurationService = new TestConfigurationService();
        commandExecutedEmitter = testDisposables.add(new Emitter());
        storageService = testDisposables.add(new InMemoryStorageService());
        mockInstructionFiles = [];
        mockPromptInstructionFiles = [];
        instantiationService.stub(IContextKeyService, contextKeyService);
        instantiationService.stub(IConfigurationService, configurationService);
        instantiationService.stub(IStorageService, storageService);
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(ICommandService, {
            onDidExecuteCommand: commandExecutedEmitter.event,
            onWillExecuteCommand: testDisposables.add(new Emitter()).event,
        });
        instantiationService.stub(IPromptsService, {
            listAgentInstructions: async () => mockInstructionFiles,
            listPromptFiles: async () => mockPromptInstructionFiles,
            onDidChangeCustomAgents: Event.None,
        });
        instantiationService.stub(ILanguageModelToolsService, testDisposables.add(new MockLanguageModelToolsService()));
        chatEntitlementService = new TestChatEntitlementService();
        chatEntitlementService.entitlement = ChatEntitlement.Available;
        instantiationService.stub(IChatEntitlementService, chatEntitlementService);
        instantiationService.stub(IChatService, new MockChatService());
        instantiationService.stub(ITelemetryService, NullTelemetryService);
        instantiationService.stub(IKeybindingService, {
            lookupKeybinding: () => undefined,
        });
    });
    test('returns a welcome tip', () => {
        const service = createService();
        const tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip, 'Should return a welcome tip');
        assert.ok(tip.id.startsWith('tip.'), 'Tip should have a valid ID');
        assert.ok(tip.content.value.length > 0, 'Tip should have content');
    });
    test('uses descriptive titles for tip command links', () => {
        for (const tip of TIP_CATALOG) {
            const markdown = tip.buildMessage({
                keybindingService: {
                    lookupKeybinding: () => undefined,
                },
            }).value;
            const commandLinkRegex = /\[[^\]]+\]\((command:[^)]+)\)/g;
            let match;
            while ((match = commandLinkRegex.exec(markdown)) !== null) {
                assert.ok(/\s"[^"]+"$/.test(match[1]), `Expected command link in ${tip.id} to include a descriptive title: ${match[0]}`);
            }
        }
    });
    test('records # file reference usage for attach files tip eligibility', () => {
        const submitRequestEmitter = testDisposables.add(new Emitter());
        instantiationService.stub(IChatService, {
            onDidSubmitRequest: submitRequestEmitter.event,
            getSession: () => undefined,
        });
        createService();
        submitRequestEmitter.fire({
            chatSessionResource: URI.parse('chat:session-attach-file'),
            message: {
                text: 'what does #file:README.md say',
                parts: [new ChatRequestDynamicVariablePart(new OffsetRange(10, 26), new Range(1, 11, 1, 27), '#file:README.md', 'file', undefined, URI.file('/workspace/README.md'), undefined, undefined, true, false)],
            },
        });
        const executedCommands = JSON.parse(storageService.get('chat.tips.executedCommands', -1 /* StorageScope.APPLICATION */) ?? '[]');
        assert.ok(executedCommands.includes('chat.tips.attachFiles.referenceUsed'));
    });
    test('records only matching create tip usage for submitted create command', () => {
        const submitRequestEmitter = testDisposables.add(new Emitter());
        instantiationService.stub(IChatService, {
            onDidSubmitRequest: submitRequestEmitter.event,
            getSession: () => undefined,
        });
        createService();
        submitRequestEmitter.fire({
            chatSessionResource: URI.parse('chat:session-create-prompt'),
            message: {
                text: '/create-prompt scaffold a reusable prompt',
                parts: [],
            },
        });
        const executedCommands = JSON.parse(storageService.get('chat.tips.executedCommands', -1 /* StorageScope.APPLICATION */) ?? '[]');
        assert.ok(executedCommands.includes(CREATE_PROMPT_TRACKING_COMMAND));
        assert.ok(!executedCommands.includes(CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND));
        assert.ok(!executedCommands.includes(CREATE_AGENT_TRACKING_COMMAND));
        assert.ok(!executedCommands.includes(CREATE_SKILL_TRACKING_COMMAND));
        assert.ok(!executedCommands.includes(FORK_CONVERSATION_TRACKING_COMMAND));
    });
    test('records init tip usage for submitted /init command', () => {
        const submitRequestEmitter = testDisposables.add(new Emitter());
        instantiationService.stub(IChatService, {
            onDidSubmitRequest: submitRequestEmitter.event,
            getSession: () => undefined,
        });
        createService();
        submitRequestEmitter.fire({
            chatSessionResource: URI.parse('chat:session-init'),
            message: {
                text: '/init',
                parts: [],
            },
        });
        const executedCommands = JSON.parse(storageService.get('chat.tips.executedCommands', -1 /* StorageScope.APPLICATION */) ?? '[]');
        assert.ok(executedCommands.includes(CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND));
        assert.ok(!executedCommands.includes(CREATE_PROMPT_TRACKING_COMMAND));
        assert.ok(!executedCommands.includes(CREATE_AGENT_TRACKING_COMMAND));
        assert.ok(!executedCommands.includes(CREATE_SKILL_TRACKING_COMMAND));
        assert.ok(!executedCommands.includes(FORK_CONVERSATION_TRACKING_COMMAND));
    });
    test('hides shown slash tip after submitted slash command without clicking tip link', () => {
        const submitRequestEmitter = testDisposables.add(new Emitter());
        instantiationService.stub(IChatService, {
            onDidSubmitRequest: submitRequestEmitter.event,
            getSession: () => undefined,
        });
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
        let tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        for (let i = 0; i < TIP_CATALOG.length && tip?.id !== 'tip.init'; i++) {
            tip = service.navigateToNextTip();
        }
        assert.ok(tip);
        assert.strictEqual(tip.id, 'tip.init', 'Expected to navigate to the init tip before submitting /init');
        let didHide = false;
        testDisposables.add(service.onDidHideTip(() => didHide = true));
        submitRequestEmitter.fire({
            chatSessionResource: URI.parse('chat:session-advance-init'),
            message: {
                text: '/init',
                parts: [],
            },
        });
        assert.ok(didHide, 'Expected slash tip to hide after submitting /init');
        assert.notStrictEqual(service.getWelcomeTip(contextKeyService)?.id, 'tip.init', 'Expected init tip to stay excluded after slash usage');
    });
    test('removes slash tip from rotation after submitted slash command via eligibility tracking', () => {
        const submitRequestEmitter = testDisposables.add(new Emitter());
        instantiationService.stub(IChatService, {
            onDidSubmitRequest: submitRequestEmitter.event,
            getSession: () => undefined,
        });
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
        let tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        for (let i = 0; i < TIP_CATALOG.length && tip?.id !== 'tip.init'; i++) {
            tip = service.navigateToNextTip();
        }
        assert.ok(tip);
        assert.strictEqual(tip.id, 'tip.init');
        submitRequestEmitter.fire({
            chatSessionResource: URI.parse('chat:session-rotate-init'),
            message: {
                text: '/init',
                parts: [],
            },
        });
        for (let i = 0; i < TIP_CATALOG.length; i++) {
            tip = service.navigateToNextTip();
            if (!tip) {
                break;
            }
            assert.notStrictEqual(tip.id, 'tip.init', 'Expected init tip to be removed from tip rotation');
        }
        const executedCommands = JSON.parse(storageService.get('chat.tips.executedCommands', -1 /* StorageScope.APPLICATION */) ?? '[]');
        assert.ok(executedCommands.includes(CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND), 'Expected slash usage to be tracked in executed command exclusions');
    });
    test('removes slash tip from rotation when slash usage is recorded before input transformation', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
        let tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        for (let i = 0; i < TIP_CATALOG.length && tip?.id !== 'tip.init'; i++) {
            tip = service.navigateToNextTip();
        }
        assert.ok(tip);
        assert.strictEqual(tip.id, 'tip.init');
        service.recordSlashCommandUsage('init');
        for (let i = 0; i < TIP_CATALOG.length; i++) {
            tip = service.navigateToNextTip();
            if (!tip) {
                break;
            }
            assert.notStrictEqual(tip.id, 'tip.init', 'Expected init tip to be removed from tip rotation');
        }
        const executedCommands = JSON.parse(storageService.get('chat.tips.executedCommands', -1 /* StorageScope.APPLICATION */) ?? '[]');
        assert.ok(executedCommands.includes(CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND), 'Expected slash usage to be tracked in executed command exclusions');
    });
    test('records fork tip usage for submitted /fork command', () => {
        const submitRequestEmitter = testDisposables.add(new Emitter());
        instantiationService.stub(IChatService, {
            onDidSubmitRequest: submitRequestEmitter.event,
            getSession: () => undefined,
        });
        createService();
        submitRequestEmitter.fire({
            chatSessionResource: URI.parse('chat:session-fork'),
            message: {
                text: '/fork',
                parts: [],
            },
        });
        const executedCommands = JSON.parse(storageService.get('chat.tips.executedCommands', -1 /* StorageScope.APPLICATION */) ?? '[]');
        assert.ok(executedCommands.includes(FORK_CONVERSATION_TRACKING_COMMAND));
        assert.ok(!executedCommands.includes(CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND));
        assert.ok(!executedCommands.includes(CREATE_PROMPT_TRACKING_COMMAND));
        assert.ok(!executedCommands.includes(CREATE_AGENT_TRACKING_COMMAND));
        assert.ok(!executedCommands.includes(CREATE_SKILL_TRACKING_COMMAND));
    });
    test('returns Auto switch tip when current model is gpt-4.1', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatModelId.key, 'gpt-4.1');
        const tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        assert.strictEqual(tip.id, 'tip.switchToAuto');
        assert.ok(tip.content.value.includes('GPT-4.1'));
    });
    test('does not return Auto switch tip when current model is not gpt-4.1', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatModelId.key, 'auto');
        const tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        assert.notStrictEqual(tip.id, 'tip.switchToAuto');
    });
    test('does not return Auto switch tip when current model context key is empty and no fallback is available', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatModelId.key, '');
        const tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        assert.notStrictEqual(tip.id, 'tip.switchToAuto');
    });
    test('returns Auto switch tip when current model is persisted and context key is empty', () => {
        storageService.store('chat.currentLanguageModel.panel', 'copilot/gpt-4.1-2025-04-14', -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatModelId.key, '');
        const tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        assert.strictEqual(tip.id, 'tip.switchToAuto');
    });
    test('returns Auto switch tip when current model is versioned gpt-4.1', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatModelId.key, 'gpt-4.1-2025-04-14');
        const tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        assert.strictEqual(tip.id, 'tip.switchToAuto');
    });
    test('switching models advances away from gpt-4.1 tip', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatModelId.key, 'gpt-4.1');
        const firstTip = service.getWelcomeTip(contextKeyService);
        assert.ok(firstTip);
        assert.strictEqual(firstTip.id, 'tip.switchToAuto');
        const switchedContextKeyService = new MockContextKeyServiceWithRulesMatching();
        switchedContextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 1);
        switchedContextKeyService.createKey(ChatContextKeys.chatModelId.key, 'auto');
        const nextTip = service.getWelcomeTip(switchedContextKeyService);
        assert.ok(nextTip);
        assert.notStrictEqual(nextTip.id, 'tip.switchToAuto');
    });
    test('returns same welcome tip on rerender', () => {
        const service = createService();
        const tip1 = service.getWelcomeTip(contextKeyService);
        assert.ok(tip1);
        const tip2 = service.getWelcomeTip(contextKeyService);
        assert.ok(tip2);
        assert.strictEqual(tip1.id, tip2.id, 'Should return same tip for stable rerender');
        assert.strictEqual(tip1.content.value, tip2.content.value);
    });
    test('returns undefined when Copilot is not enabled', () => {
        const service = createService(/* hasCopilot */ false);
        const tip = service.getWelcomeTip(contextKeyService);
        assert.strictEqual(tip, undefined, 'Should not return a tip when Copilot is not enabled');
    });
    test('returns undefined when user is signed out', () => {
        chatEntitlementService.entitlement = ChatEntitlement.Unknown;
        const service = createService();
        const tip = service.getWelcomeTip(contextKeyService);
        assert.strictEqual(tip, undefined, 'Should not return a tip when the user is signed out');
    });
    test('returns undefined when tips setting is disabled', () => {
        const service = createService(/* hasCopilot */ true, /* tipsEnabled */ false);
        const tip = service.getWelcomeTip(contextKeyService);
        assert.strictEqual(tip, undefined, 'Should not return a tip when tips setting is disabled');
    });
    test('returns undefined when location is terminal', () => {
        const service = createService();
        const terminalContextKeyService = new MockContextKeyServiceWithRulesMatching();
        terminalContextKeyService.createKey(ChatContextKeys.location.key, ChatAgentLocation.Terminal);
        const tip = service.getWelcomeTip(terminalContextKeyService);
        assert.strictEqual(tip, undefined, 'Should not return a tip in terminal inline chat');
    });
    test('returns undefined when location is editor inline', () => {
        const service = createService();
        const editorContextKeyService = new MockContextKeyServiceWithRulesMatching();
        editorContextKeyService.createKey(ChatContextKeys.location.key, ChatAgentLocation.EditorInline);
        const tip = service.getWelcomeTip(editorContextKeyService);
        assert.strictEqual(tip, undefined, 'Should not return a tip in editor inline chat');
    });
    test('returns a tip when foreground session count is exactly one', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 1);
        const tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip, 'Should return a tip when exactly one foreground chat session is visible');
    });
    test('returns undefined when foreground session count is zero', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 0);
        const tip = service.getWelcomeTip(contextKeyService);
        assert.strictEqual(tip, undefined, 'Should not return a tip when no foreground chat sessions are visible');
    });
    test('returns undefined when foreground session count is greater than one', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 2);
        const tip = service.getWelcomeTip(contextKeyService);
        assert.strictEqual(tip, undefined, 'Should not return a tip when multiple foreground chat sessions are visible');
    });
    test('dismissTip excludes the dismissed tip and allows a new one', () => {
        const service = createService();
        const tip1 = service.getWelcomeTip(contextKeyService);
        assert.ok(tip1);
        service.dismissTip();
        const tip2 = service.getWelcomeTip(contextKeyService);
        if (tip2) {
            assert.notStrictEqual(tip1.id, tip2.id, 'Dismissed tip should not be shown again');
        }
    });
    test('dismissTip keeps navigation context for next tip traversal', () => {
        const service = createService();
        const tip1 = service.getWelcomeTip(contextKeyService);
        assert.ok(tip1);
        service.dismissTip();
        const tip2 = service.navigateToNextTip();
        if (tip2) {
            assert.notStrictEqual(tip1.id, tip2.id, 'Dismissed tip should not be returned by next navigation');
        }
    });
    test('dismissTipForSession hides tips until resetSession', () => {
        const service = createService();
        const tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        service.dismissTipForSession();
        assert.strictEqual(service.getWelcomeTip(contextKeyService), undefined, 'Tips should stay hidden for the current session after dismissing');
        service.resetSession();
        assert.ok(service.getWelcomeTip(contextKeyService), 'Tips should reappear after resetting the session');
    });
    test('navigateToNextTip keeps foundational tips before QoL tips', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
        contextKeyService.createKey(ChatContextKeys.chatModeName.key, 'Agent');
        contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
        contextKeyService.createKey(ChatContextKeys.chatModelId.key, 'auto');
        const firstTip = service.getWelcomeTip(contextKeyService);
        assert.ok(firstTip);
        assert.strictEqual(firstTip.id, 'tip.planMode');
        const secondTip = service.navigateToNextTip();
        assert.ok(secondTip);
        assert.strictEqual(secondTip.id, 'tip.createAgent', 'Expected next tip to remain in foundational tips before QoL tips');
    });
    test('navigateToPreviousTip follows reverse of preferred order', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
        contextKeyService.createKey(ChatContextKeys.chatModeName.key, 'Agent');
        contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
        contextKeyService.createKey(ChatContextKeys.chatModelId.key, 'auto');
        const firstTip = service.getWelcomeTip(contextKeyService);
        assert.ok(firstTip);
        assert.strictEqual(firstTip.id, 'tip.planMode');
        const secondTip = service.navigateToNextTip();
        assert.ok(secondTip);
        assert.strictEqual(secondTip.id, 'tip.createAgent');
        const previousTip = service.navigateToPreviousTip();
        assert.ok(previousTip);
        assert.strictEqual(previousTip.id, 'tip.planMode', 'Expected previous tip to reverse the preferred ordering');
    });
    test('getNextEligibleTip returns next tip even when only one remains', async () => {
        const service = createService();
        // Flush microtask queue so async file-check exclusions resolve
        await new Promise(r => queueMicrotask(r));
        // Get the initial tip
        const tip1 = service.getWelcomeTip(contextKeyService);
        assert.ok(tip1, 'Should have an initial tip');
        // Navigate to next tip
        const tip2 = service.navigateToNextTip();
        assert.ok(tip2, 'Should have a second tip');
        assert.notStrictEqual(tip1.id, tip2.id, 'Second tip should be different');
        // Dismiss all tips except tip1 by dismissing current tip and using getNextEligibleTip
        const dismissedIds = new Set();
        dismissedIds.add(tip2.id);
        service.dismissTip();
        // Keep dismissing until we can't get any more tips
        let nextTip = service.getNextEligibleTip();
        while (nextTip && !dismissedIds.has(nextTip.id)) {
            if (nextTip.id === tip1.id) {
                // We found tip1 again - this is the expected behavior (bug fix verification)
                break;
            }
            dismissedIds.add(nextTip.id);
            service.dismissTip();
            nextTip = service.getNextEligibleTip();
        }
        // The key assertion: getNextEligibleTip should return tip1 even if it's the only one left
        assert.ok(nextTip, 'getNextEligibleTip should return the last remaining eligible tip');
    });
    test('getNextEligibleTip returns undefined when all tips are dismissed', async () => {
        const service = createService();
        // Flush microtask queue so async file-check exclusions resolve
        await new Promise(r => queueMicrotask(r));
        // Dismiss all tips
        for (let i = 0; i < 100; i++) {
            const tip = service.getWelcomeTip(contextKeyService);
            if (!tip) {
                break;
            }
            service.dismissTip();
        }
        // After dismissing all, getNextEligibleTip should return undefined
        const nextTip = service.getNextEligibleTip();
        assert.strictEqual(nextTip, undefined, 'getNextEligibleTip should return undefined when all tips are dismissed');
    });
    test('getNextEligibleTip keeps preferred onboarding order after dismissing plan tip', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
        contextKeyService.createKey(ChatContextKeys.chatModeName.key, 'Agent');
        contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
        contextKeyService.createKey(ChatContextKeys.chatModelId.key, 'auto');
        const firstTip = service.getWelcomeTip(contextKeyService);
        assert.ok(firstTip);
        assert.strictEqual(firstTip.id, 'tip.planMode');
        service.dismissTip();
        const secondTip = service.getNextEligibleTip();
        assert.ok(secondTip);
        assert.strictEqual(secondTip.id, 'tip.createAgent', 'Expected next tip to follow preferred onboarding order before QoL tips');
    });
    test('getNextEligibleTip picks next relative to current tip after dismissing from middle of order', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
        contextKeyService.createKey(ChatContextKeys.chatModeName.key, 'Agent');
        contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
        contextKeyService.createKey(ChatContextKeys.chatModelId.key, 'auto');
        const firstTip = service.getWelcomeTip(contextKeyService);
        assert.ok(firstTip);
        const secondTip = service.navigateToNextTip();
        assert.ok(secondTip);
        const expectedNextAfterSecond = service.navigateToNextTip();
        assert.ok(expectedNextAfterSecond, 'Expected at least three tips to validate relative ordering');
        const backToSecond = service.navigateToPreviousTip();
        assert.ok(backToSecond);
        assert.strictEqual(backToSecond.id, secondTip.id);
        service.dismissTip();
        const actualNext = service.getNextEligibleTip();
        assert.ok(actualNext);
        assert.strictEqual(actualNext.id, expectedNextAfterSecond.id, 'Expected getNextEligibleTip to advance relative to current tip rather than restart from top priority tip');
    });
    test('dismissTip fires onDidDismissTip event', () => {
        const service = createService();
        service.getWelcomeTip(contextKeyService);
        let fired = false;
        testDisposables.add(service.onDidDismissTip(() => { fired = true; }));
        service.dismissTip();
        assert.ok(fired, 'onDidDismissTip should fire');
    });
    test('disableTips fires onDidDisableTips event', async () => {
        const service = createService();
        service.getWelcomeTip(contextKeyService);
        let fired = false;
        testDisposables.add(service.onDidDisableTips(() => { fired = true; }));
        await service.disableTips();
        assert.ok(fired, 'onDidDisableTips should fire');
    });
    test('disableTips writes to application settings target', async () => {
        const trackingConfigurationService = new TrackingConfigurationService();
        configurationService = trackingConfigurationService;
        instantiationService.stub(IConfigurationService, configurationService);
        const service = createService();
        await service.disableTips();
        assert.strictEqual(trackingConfigurationService.lastUpdateKey, 'chat.tips.enabled');
        assert.strictEqual(trackingConfigurationService.lastUpdateValue, false);
        assert.strictEqual(trackingConfigurationService.lastUpdateTarget, 1 /* ConfigurationTarget.APPLICATION */);
    });
    test('disableTips resets state so re-enabling works', async () => {
        const service = createService();
        const tip1 = service.getWelcomeTip(contextKeyService);
        assert.ok(tip1);
        await service.disableTips();
        configurationService.setUserConfiguration('chat.tips.enabled', true);
        const tip2 = service.getWelcomeTip(contextKeyService);
        assert.ok(tip2, 'Should return a tip after disabling and re-enabling');
    });
    test('dismissed tips stay dismissed after disabling and re-enabling tips', async () => {
        const service = createService();
        // Flush microtask queue so async file-check exclusions resolve before
        // we start dismissing tips (otherwise excludeUntilChecked tips are
        // temporarily excluded and never get dismissed in the loop below).
        await new Promise(r => queueMicrotask(r));
        for (let i = 0; i < 100; i++) {
            const tip = service.getWelcomeTip(contextKeyService);
            if (!tip) {
                break;
            }
            service.dismissTip();
        }
        assert.strictEqual(service.getWelcomeTip(contextKeyService), undefined, 'No tip should remain once all tips are dismissed');
        await service.disableTips();
        configurationService.setUserConfiguration('chat.tips.enabled', true);
        assert.strictEqual(service.getWelcomeTip(contextKeyService), undefined, 'Dismissed tips should remain dismissed after re-enabling tips');
    });
    test('clearDismissedTips restores tip visibility', () => {
        const service = createService();
        for (let i = 0; i < 100; i++) {
            const tip = service.getWelcomeTip(contextKeyService);
            if (!tip) {
                break;
            }
            service.dismissTip();
        }
        assert.strictEqual(service.getWelcomeTip(contextKeyService), undefined, 'No tip should remain once all tips are dismissed');
        service.clearDismissedTips();
        assert.ok(service.getWelcomeTip(contextKeyService), 'A tip should be visible again after clearing dismissed tips');
    });
    test('migrates dismissed tips from profile to application storage', () => {
        storageService.store('chat.tip.dismissed', JSON.stringify(['tip.switchToAuto']), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatModelId.key, 'gpt-4.1');
        const tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        assert.notStrictEqual(tip.id, 'tip.switchToAuto', 'Should honor profile-stored dismissed tip id');
        assert.ok(storageService.get('chat.tip.dismissed', -1 /* StorageScope.APPLICATION */), 'Expected dismissed tips to migrate to application storage');
    });
    test('tip.undoChanges describes where to find restore checkpoint', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
        contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
        const tip = findTipById(service, 'tip.undoChanges');
        assert.ok(tip);
        assert.ok(tip.content.value.includes('Hover a previous request'));
        assert.ok(tip.content.value.includes('Restore Checkpoint'));
    });
    test('tip.mermaid uses sentence punctuation in display text', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
        const tip = findTipById(service, 'tip.mermaid');
        assert.ok(tip);
        assert.ok(tip.content.value.includes('flow chart. It can render Mermaid diagrams directly in chat.'));
        assert.ok(!tip.content.value.includes('flow chart; it can render Mermaid diagrams directly in chat.'));
    });
    function createMockPromptsService(agentInstructions = [], promptInstructions = [], options) {
        return {
            listAgentInstructions: async () => agentInstructions,
            listPromptFiles: options?.listPromptFiles ?? (async (_type) => promptInstructions),
            onDidChangeCustomAgents: options?.onDidChangeCustomAgents ?? Event.None,
        };
    }
    function createMockToolsService() {
        return testDisposables.add(new MockLanguageModelToolsService());
    }
    test('excludes tip.undoChanges when restore checkpoint command has been executed', () => {
        const tip = createMockTip({
            id: 'tip.undoChanges',
            excludeWhenCommandsExecuted: ['workbench.action.chat.restoreCheckpoint'],
        });
        const tracker = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService(), createMockToolsService(), new NullLogService()));
        assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded before command is executed');
        commandExecutedEmitter.fire({ commandId: 'workbench.action.chat.restoreCheckpoint', args: [] });
        assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded after command is executed');
    });
    test('persists executed command exclusions in application storage', () => {
        const tip = createMockTip({
            id: 'tip.undoChanges',
            excludeWhenCommandsExecuted: ['workbench.action.chat.restoreCheckpoint'],
        });
        testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService(), createMockToolsService(), new NullLogService()));
        commandExecutedEmitter.fire({ commandId: 'workbench.action.chat.restoreCheckpoint', args: [] });
        assert.ok(storageService.get('chat.tips.executedCommands', -1 /* StorageScope.APPLICATION */), 'Expected executed command exclusions in application storage');
        assert.strictEqual(storageService.get('chat.tips.executedCommands', 0 /* StorageScope.PROFILE */), undefined, 'Did not expect executed command exclusions in profile storage');
        assert.strictEqual(storageService.get('chat.tips.executedCommands', 1 /* StorageScope.WORKSPACE */), undefined, 'Did not expect executed command exclusions in workspace storage');
    });
    test('migrates executed command exclusions from profile to application storage', () => {
        const tip = createMockTip({
            id: 'tip.undoChanges',
            excludeWhenCommandsExecuted: ['workbench.action.chat.restoreCheckpoint'],
        });
        storageService.store('chat.tips.executedCommands', JSON.stringify(['workbench.action.chat.restoreCheckpoint']), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        const tracker = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService(), createMockToolsService(), new NullLogService()));
        assert.strictEqual(tracker.isExcluded(tip), true, 'Should honor profile-stored exclusions');
        assert.ok(storageService.get('chat.tips.executedCommands', -1 /* StorageScope.APPLICATION */), 'Expected migrated exclusion data in application storage');
    });
    test('excludes tip.customInstructions when copilot-instructions.md exists in workspace', async () => {
        const tip = createMockTip({
            id: 'tip.customInstructions',
            excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentInstructionFileType.copilotInstructionsMd, excludeUntilChecked: true },
        });
        const tracker = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService([{ uri: { path: '/.github/copilot-instructions.md' }, realPath: undefined, type: AgentInstructionFileType.copilotInstructionsMd }]), createMockToolsService(), new NullLogService()));
        // Wait for the async file check to complete
        await new Promise(r => setTimeout(r, 0));
        assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded when copilot-instructions.md exists');
    });
    test('does not exclude tip.customInstructions when only AGENTS.md exists', async () => {
        const tip = createMockTip({
            id: 'tip.customInstructions',
            excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentInstructionFileType.copilotInstructionsMd, excludeUntilChecked: true },
        });
        const tracker = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService([{ uri: { path: '/AGENTS.md' }, realPath: undefined, type: AgentInstructionFileType.agentsMd }]), createMockToolsService(), new NullLogService()));
        // Wait for the async file check to complete
        await new Promise(r => setTimeout(r, 0));
        assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded when only AGENTS.md exists');
    });
    test('excludes tip.customInstructions when .instructions.md files exist in workspace', async () => {
        const tip = createMockTip({
            id: 'tip.customInstructions',
            excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentInstructionFileType.copilotInstructionsMd, excludeUntilChecked: true },
        });
        const tracker = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService([], [{ uri: URI.file('/.github/instructions/coding.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions }]), createMockToolsService(), new NullLogService()));
        // Wait for the async file check to complete
        await new Promise(r => setTimeout(r, 0));
        assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded when .instructions.md files exist');
    });
    test('does not exclude tip.customInstructions when no instruction files exist', async () => {
        const tip = createMockTip({
            id: 'tip.customInstructions',
            excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentInstructionFileType.copilotInstructionsMd, excludeUntilChecked: true },
        });
        const tracker = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService(), createMockToolsService(), new NullLogService()));
        // Wait for the async file check to complete
        await new Promise(r => setTimeout(r, 0));
        assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded when no instruction files exist');
    });
    test('excludes tip.customInstructions when generate instructions command has been executed', () => {
        const tip = createMockTip({
            id: 'tip.customInstructions',
            excludeWhenCommandsExecuted: [GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID],
        });
        const tracker = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService(), createMockToolsService(), new NullLogService()));
        assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded before command is executed');
        commandExecutedEmitter.fire({ commandId: GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID, args: [] });
        assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded after generate instructions command is executed');
    });
    test('excludes tip.agentMode when agent mode has been used in workspace', () => {
        const tip = createMockTip({
            id: 'tip.agentMode',
            excludeWhenModesUsed: [ChatModeKind.Agent],
        });
        contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
        contextKeyService.createKey(ChatContextKeys.chatModeName.key, 'Agent');
        const tracker = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService(), createMockToolsService(), new NullLogService()));
        assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded before mode is recorded');
        tracker.recordCurrentMode(contextKeyService);
        assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded after agent mode has been recorded');
    });
    test('excludes tip.planMode when Plan mode has been used in workspace', () => {
        const tip = createMockTip({
            id: 'tip.planMode',
            excludeWhenModesUsed: ['Plan'],
        });
        contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
        contextKeyService.createKey(ChatContextKeys.chatModeName.key, 'Plan');
        const tracker = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService(), createMockToolsService(), new NullLogService()));
        assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded before mode is recorded');
        tracker.recordCurrentMode(contextKeyService);
        assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded after Plan mode has been recorded');
    });
    test('excludes tip.planMode when open plan command has been executed', () => {
        const tip = createMockTip({
            id: 'tip.planMode',
            excludeWhenCommandsExecuted: ['workbench.action.chat.openPlan'],
        });
        const tracker = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService(), createMockToolsService(), new NullLogService()));
        assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded before command is executed');
        commandExecutedEmitter.fire({ commandId: 'workbench.action.chat.openPlan', args: [] });
        assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded after open plan command is executed');
    });
    test('persists command exclusions to workspace storage across tracker instances', () => {
        const tip = createMockTip({
            id: 'tip.undoChanges',
            excludeWhenCommandsExecuted: ['workbench.action.chat.restoreCheckpoint'],
        });
        const tracker1 = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService(), createMockToolsService(), new NullLogService()));
        commandExecutedEmitter.fire({ commandId: 'workbench.action.chat.restoreCheckpoint', args: [] });
        assert.strictEqual(tracker1.isExcluded(tip), true);
        // Second tracker reads from storage — should be excluded immediately
        const tracker2 = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService(), createMockToolsService(), new NullLogService()));
        assert.strictEqual(tracker2.isExcluded(tip), true, 'New tracker should read persisted exclusion from workspace storage');
    });
    test('persists mode exclusions to workspace storage across tracker instances', () => {
        const tip = createMockTip({
            id: 'tip.agentMode',
            excludeWhenModesUsed: [ChatModeKind.Agent],
        });
        contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
        contextKeyService.createKey(ChatContextKeys.chatModeName.key, 'Agent');
        const tracker1 = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService(), createMockToolsService(), new NullLogService()));
        tracker1.recordCurrentMode(contextKeyService);
        assert.strictEqual(tracker1.isExcluded(tip), true);
        // Second tracker reads from storage — should be excluded immediately
        const tracker2 = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService(), createMockToolsService(), new NullLogService()));
        assert.strictEqual(tracker2.isExcluded(tip), true, 'New tracker should read persisted mode exclusion from workspace storage');
    });
    test('prioritizes foundational tips over QoL tips when both are eligible', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
        contextKeyService.createKey(ChatContextKeys.chatModeName.key, 'Agent');
        const tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        assert.strictEqual(tip.id, 'tip.planMode', 'Expected foundational tip to be prioritized before eligible QoL tips');
    });
    test('prioritizes preferred onboarding tips in requested order', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
        contextKeyService.createKey(ChatContextKeys.chatModeName.key, 'Agent');
        contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
        contextKeyService.createKey(ChatContextKeys.chatModelId.key, 'auto');
        const seen = [];
        for (let i = 0; i < 3; i++) {
            const tip = service.getWelcomeTip(contextKeyService);
            assert.ok(tip);
            seen.push(tip.id);
            service.dismissTip();
        }
        assert.deepStrictEqual(seen, ['tip.planMode', 'tip.createAgent', 'tip.createSkill']);
    });
    test('randomizes QoL tips when no foundational tips are eligible', () => {
        const service = createService();
        const modeKindKey = contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
        const modeNameKey = contextKeyService.createKey(ChatContextKeys.chatModeName.key, 'Plan');
        contextKeyService.createKey(ChatContextKeys.chatSessionType.key, 'cloud');
        contextKeyService.createKey(ChatContextKeys.chatModelId.key, 'auto');
        const originalRandom = Math.random;
        try {
            Math.random = () => 0;
            const firstTip = service.getWelcomeTip(contextKeyService);
            service.resetSession();
            Math.random = () => 0.9999;
            const secondTip = service.getWelcomeTip(contextKeyService);
            assert.ok(firstTip);
            assert.ok(secondTip);
            assert.notStrictEqual(firstTip.id, secondTip.id, 'Expected different QoL tips for different random values');
            assert.notStrictEqual(firstTip.id, 'tip.planMode');
            assert.notStrictEqual(secondTip.id, 'tip.planMode');
        }
        finally {
            Math.random = originalRandom;
            modeKindKey.set(ChatModeKind.Agent);
            modeNameKey.set('Plan');
        }
    });
    test('resetSession reevaluates foundational tips for the next chat session', () => {
        const service = createService();
        const modeKindKey = contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
        const modeNameKey = contextKeyService.createKey(ChatContextKeys.chatModeName.key, 'Plan');
        const sessionTypeKey = contextKeyService.createKey(ChatContextKeys.chatSessionType.key, 'cloud');
        contextKeyService.createKey(ChatContextKeys.chatModelId.key, 'auto');
        const originalRandom = Math.random;
        try {
            Math.random = () => 0.9999;
            const qolTip = service.getWelcomeTip(contextKeyService);
            assert.ok(qolTip);
            assert.notStrictEqual(qolTip.id, 'tip.planMode');
            service.resetSession();
            modeNameKey.set('Agent');
            sessionTypeKey.set(localChatSessionType);
            const foundationalTip = service.getWelcomeTip(contextKeyService);
            assert.ok(foundationalTip);
            assert.strictEqual(foundationalTip.id, 'tip.createAgent', 'Expected foundational ordering to restart on new chat session');
        }
        finally {
            Math.random = originalRandom;
            modeKindKey.set(ChatModeKind.Agent);
        }
    });
    test('resetSession allows a new welcome tip', () => {
        const service = createService();
        const tip1 = service.getWelcomeTip(contextKeyService);
        assert.ok(tip1, 'Should get a welcome tip');
        service.resetSession();
        const tip2 = service.getWelcomeTip(contextKeyService);
        assert.ok(tip2, 'Should get a welcome tip after resetSession');
    });
    test('Plan tip is excluded after switching to Plan mode during stable rerender', () => {
        const service = createService();
        // Start in Agent mode — Plan tip should be eligible
        contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
        const modeNameKey = contextKeyService.createKey(ChatContextKeys.chatModeName.key, 'Agent');
        assert.ok(findTipById(service, 'tip.planMode'), 'Plan tip should be shown when in Agent mode');
        // Simulate user switching to Plan mode (context keys update, widget rerenders)
        modeNameKey.set('Plan');
        // Stable rerender — getWelcomeTip is called again without resetSession
        const rerenderTip = service.getWelcomeTip(contextKeyService);
        assert.ok(!rerenderTip || rerenderTip.id !== 'tip.planMode', 'Plan tip should not be shown after switching to Plan mode');
        // New session in Agent mode — Plan tip must NOT reappear
        service.resetSession();
        modeNameKey.set('Agent');
        assertTipNeverShown(service, 'tip.planMode');
    });
    test('excludes tip when tracked tool has been invoked', () => {
        const mockToolsService = createMockToolsService();
        const tip = createMockTip({
            id: 'tip.mermaid',
            excludeWhenToolsInvoked: ['renderMermaidDiagram'],
        });
        const tracker = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService(), mockToolsService, new NullLogService()));
        assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded before tool is invoked');
        mockToolsService.fireOnDidInvokeTool({ toolId: 'renderMermaidDiagram', sessionResource: undefined, requestId: undefined, subagentInvocationId: undefined });
        assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded after tool is invoked');
    });
    test('persists tool exclusions to workspace storage across tracker instances', () => {
        const mockToolsService = createMockToolsService();
        const tip = createMockTip({
            id: 'tip.subagents',
            excludeWhenToolsInvoked: ['runSubagent'],
        });
        const tracker1 = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService(), mockToolsService, new NullLogService()));
        mockToolsService.fireOnDidInvokeTool({ toolId: 'runSubagent', sessionResource: undefined, requestId: undefined, subagentInvocationId: undefined });
        assert.strictEqual(tracker1.isExcluded(tip), true);
        // Second tracker reads from storage — should be excluded immediately
        const tracker2 = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService(), createMockToolsService(), new NullLogService()));
        assert.strictEqual(tracker2.isExcluded(tip), true, 'New tracker should read persisted tool exclusion from workspace storage');
    });
    test('excludes tip.skill when skill files exist in workspace', async () => {
        const tip = createMockTip({
            id: 'tip.skill',
            excludeWhenPromptFilesExist: { promptType: PromptsType.skill },
        });
        const tracker = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService([], [{ uri: URI.file('/.github/skills/my-skill.skill.md'), storage: PromptsStorage.local, type: PromptsType.skill }]), createMockToolsService(), new NullLogService()));
        // Wait for the async file check to complete
        await new Promise(r => setTimeout(r, 0));
        assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded when skill files exist');
    });
    test('does not exclude tip.skill when no skill files exist', async () => {
        const tip = createMockTip({
            id: 'tip.skill',
            excludeWhenPromptFilesExist: { promptType: PromptsType.skill },
        });
        const tracker = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService(), createMockToolsService(), new NullLogService()));
        // Wait for the async file check to complete
        await new Promise(r => setTimeout(r, 0));
        assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded when no skill files exist');
    });
    test('shows all create slash command tips in local chat sessions', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
        const expectedCreateTips = new Set(['tip.init', 'tip.createPrompt', 'tip.createAgent', 'tip.createSkill']);
        const seenCreateTips = new Set();
        for (let i = 0; i < 100; i++) {
            const tip = service.getWelcomeTip(contextKeyService);
            if (!tip) {
                break;
            }
            if (expectedCreateTips.has(tip.id)) {
                seenCreateTips.add(tip.id);
                if (seenCreateTips.size === expectedCreateTips.size) {
                    break;
                }
            }
            service.dismissTip();
        }
        assert.deepStrictEqual([...seenCreateTips].sort(), [...expectedCreateTips].sort());
    });
    test('does not show create slash command tips in non-local chat sessions', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatSessionType.key, 'cloud');
        const createTipIds = new Set(['tip.init', 'tip.createPrompt', 'tip.createAgent', 'tip.createSkill']);
        for (let i = 0; i < 100; i++) {
            const tip = service.getWelcomeTip(contextKeyService);
            if (!tip) {
                break;
            }
            assert.ok(!createTipIds.has(tip.id), 'Should not show create slash command tips in non-local sessions');
            service.dismissTip();
        }
    });
    test('does not show create prompt tip when create prompt was already used', () => {
        storageService.store('chat.tips.executedCommands', JSON.stringify([CREATE_PROMPT_TRACKING_COMMAND]), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
        for (let i = 0; i < 100; i++) {
            const tip = service.getWelcomeTip(contextKeyService);
            if (!tip) {
                break;
            }
            assert.notStrictEqual(tip.id, 'tip.createPrompt', 'Should not show tip.createPrompt when create-prompt was used');
            service.dismissTip();
        }
    });
    function findTipById(service, tipId, ckService = contextKeyService) {
        for (let i = 0; i < 100; i++) {
            const tip = service.getWelcomeTip(ckService);
            if (!tip) {
                return undefined;
            }
            if (tip.id === tipId) {
                return tip;
            }
            service.dismissTip();
        }
        return undefined;
    }
    function assertTipNeverShown(service, tipId, ckService = contextKeyService) {
        for (let i = 0; i < 100; i++) {
            const tip = service.getWelcomeTip(ckService);
            if (!tip) {
                break;
            }
            assert.notStrictEqual(tip.id, tipId, `${tipId} should not be shown`);
            service.dismissTip();
        }
    }
    for (const { tipId, settingKey } of [
        { tipId: 'tip.thinkingPhrases', settingKey: 'chat.agent.thinking.phrases' },
        { tipId: 'tip.agenticBrowser', settingKey: 'workbench.browser.enableChatTools' },
    ]) {
        test(`shows ${tipId} with correct setting link when setting is at default`, async () => {
            const service = createService();
            contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
            await new Promise(r => queueMicrotask(r));
            const tip = findTipById(service, tipId);
            assert.ok(tip, `Should show ${tipId} when setting is at default`);
            assert.ok(tip.content.value.includes(settingKey), `Tip should reference ${settingKey}`);
            assert.ok(tip.enabledCommands?.includes('workbench.action.openSettings'), 'Tip should enable the openSettings command');
        });
        test(`excludes ${tipId} when setting has been changed from default`, async () => {
            configurationService.setUserConfiguration(settingKey, 'changed');
            const service = createService();
            contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
            await new Promise(r => queueMicrotask(r));
            assertTipNeverShown(service, tipId);
        });
    }
    for (const tipId of [
        'tip.thinkingPhrases',
        'tip.agenticBrowser',
    ]) {
        test(`dismisses ${tipId} after clicking its settings link`, async () => {
            const service = createService();
            contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
            await new Promise(r => queueMicrotask(r));
            const tip = findTipById(service, tipId);
            assert.ok(tip, `Should show ${tipId} before command click`);
            let dismissed = false;
            testDisposables.add(service.onDidDismissTip(() => {
                dismissed = true;
            }));
            commandExecutedEmitter.fire({ commandId: 'workbench.action.openSettings', args: [] });
            assert.strictEqual(dismissed, true, `${tipId} should dismiss when its settings command is clicked`);
            assert.notStrictEqual(service.getWelcomeTip(contextKeyService)?.id, tipId, `${tipId} should not be shown again after actioning its command link`);
            const nextService = createService();
            assertTipNeverShown(nextService, tipId);
        });
    }
    test('dismisses createPrompt tip after clicking its command link', () => {
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
        const tip = findTipById(service, 'tip.createPrompt');
        assert.ok(tip, 'Should show tip.createPrompt before command click');
        assert.ok(tip.enabledCommands?.includes(GENERATE_PROMPT_COMMAND_ID), 'Tip should enable the create prompt command');
        commandExecutedEmitter.fire({ commandId: GENERATE_PROMPT_COMMAND_ID, args: [] });
        assert.notStrictEqual(service.getWelcomeTip(contextKeyService)?.id, 'tip.createPrompt', 'tip.createPrompt should not be shown again after actioning its command link');
        const nextService = createService();
        assertTipNeverShown(nextService, 'tip.createPrompt');
    });
    test('logs telemetry when tip is shown', () => {
        const events = [];
        instantiationService.stub(ITelemetryService, {
            ...NullTelemetryService,
            publicLog2(eventName, data) {
                events.push({ eventName, data });
            },
        });
        const service = createService();
        const tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        const shownEvents = events.filter(e => e.data.action === 'shown');
        assert.strictEqual(shownEvents.length, 1, 'Should log exactly one shown event');
        assert.strictEqual(shownEvents[0].eventName, 'chatTip');
        assert.strictEqual(shownEvents[0].data.tipId, tip.id);
    });
    test('logs telemetry when tip is dismissed', () => {
        const events = [];
        instantiationService.stub(ITelemetryService, {
            ...NullTelemetryService,
            publicLog2(eventName, data) {
                events.push({ eventName, data });
            },
        });
        const service = createService();
        const tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        service.dismissTip();
        const dismissEvents = events.filter(e => e.data.action === 'dismissed');
        assert.strictEqual(dismissEvents.length, 1, 'Should log exactly one dismissed event');
        assert.strictEqual(dismissEvents[0].data.tipId, tip.id);
    });
    test('logs telemetry when navigating tips', () => {
        const events = [];
        instantiationService.stub(ITelemetryService, {
            ...NullTelemetryService,
            publicLog2(eventName, data) {
                events.push({ eventName, data });
            },
        });
        const service = createService();
        const tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        const nextTip = service.navigateToNextTip();
        assert.ok(nextTip);
        const navigateEvents = events.filter(e => e.data.action === 'navigateNext');
        assert.strictEqual(navigateEvents.length, 1, 'Should log one navigateNext event');
        assert.strictEqual(navigateEvents[0].data.tipId, tip.id, 'navigateNext should log the tip being navigated away from');
        const shownEvents = events.filter(e => e.data.action === 'shown');
        assert.strictEqual(shownEvents.length, 2, 'Should log shown for initial and navigated tip');
        assert.strictEqual(shownEvents[1].data.tipId, nextTip.id);
    });
    test('logs telemetry when tip command is clicked', () => {
        const events = [];
        instantiationService.stub(ITelemetryService, {
            ...NullTelemetryService,
            publicLog2(eventName, data) {
                events.push({ eventName, data });
            },
        });
        const service = createService();
        const tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        if (tip.enabledCommands?.length) {
            commandExecutedEmitter.fire({ commandId: tip.enabledCommands[0], args: [] });
            const clickEvents = events.filter(e => e.data.action === 'commandClicked');
            assert.strictEqual(clickEvents.length, 1, 'Should log one commandClicked event');
            assert.strictEqual(clickEvents[0].data.tipId, tip.id);
            assert.strictEqual(clickEvents[0].data.commandId, tip.enabledCommands[0]);
        }
        else {
            assert.fail('Tip has no enabled commands; cannot test command click telemetry');
        }
    });
    test('logs telemetry when tip is hidden', () => {
        const events = [];
        instantiationService.stub(ITelemetryService, {
            ...NullTelemetryService,
            publicLog2(eventName, data) {
                events.push({ eventName, data });
            },
        });
        const service = createService();
        const tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        service.hideTip();
        const hiddenEvents = events.filter(e => e.data.action === 'hidden');
        assert.strictEqual(hiddenEvents.length, 1, 'Should log one hidden event');
        assert.strictEqual(hiddenEvents[0].data.tipId, tip.id);
    });
    test('logs telemetry when tips are disabled', async () => {
        const events = [];
        instantiationService.stub(ITelemetryService, {
            ...NullTelemetryService,
            publicLog2(eventName, data) {
                events.push({ eventName, data });
            },
        });
        const service = createService();
        const tip = service.getWelcomeTip(contextKeyService);
        assert.ok(tip);
        await service.disableTips();
        const disabledEvents = events.filter(e => e.data.action === 'disabled');
        assert.strictEqual(disabledEvents.length, 1, 'Should log one disabled event');
        assert.strictEqual(disabledEvents[0].data.tipId, tip.id);
    });
    test('thinking phrases ever-modified seed checks workspaceValue', () => {
        const workspaceConfigService = new TestConfigurationService();
        const originalInspect = workspaceConfigService.inspect.bind(workspaceConfigService);
        workspaceConfigService.inspect = (key, overrides) => {
            if (key === 'chat.agent.thinking.phrases') {
                return { ...originalInspect(key, overrides), userValue: undefined, userLocalValue: undefined, workspaceValue: 'compact' };
            }
            return originalInspect(key, overrides);
        };
        configurationService = workspaceConfigService;
        instantiationService.stub(IConfigurationService, configurationService);
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
        assertTipNeverShown(service, 'tip.thinkingPhrases');
    });
    test('does not show tip.thinkingPhrases when previous modification is persisted', () => {
        storageService.store('chat.tip.thinkingPhrasesEverModified', true, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        const service = createService();
        contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
        assertTipNeverShown(service, 'tip.thinkingPhrases');
    });
    test('re-checks agent file exclusion when onDidChangeCustomAgents fires', async () => {
        const agentChangeEmitter = testDisposables.add(new Emitter());
        let agentFiles = [];
        const tip = createMockTip({
            id: 'tip.customAgent',
            excludeWhenPromptFilesExist: { promptType: PromptsType.agent, excludeUntilChecked: true },
        });
        const tracker = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService([], [], {
            onDidChangeCustomAgents: agentChangeEmitter.event,
            listPromptFiles: async () => agentFiles,
        }), createMockToolsService(), new NullLogService()));
        // Initial check: no agent files, but excludeUntilChecked means excluded first
        await new Promise(r => setTimeout(r, 0));
        assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded after initial check finds no files');
        // Simulate agent files appearing
        agentFiles = [{ uri: URI.file('/.github/agents/my-agent.agent.md'), storage: PromptsStorage.local, type: PromptsType.agent }];
        agentChangeEmitter.fire();
        await new Promise(r => setTimeout(r, 0));
        assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded after onDidChangeCustomAgents fires and agent files exist');
    });
    test('refreshPromptFileExclusions re-checks instruction files after startup', async () => {
        let instructionFiles = [];
        const tip = createMockTip({
            id: 'tip.customInstructions',
            excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentInstructionFileType.copilotInstructionsMd, excludeUntilChecked: true },
        });
        const tracker = testDisposables.add(new TipEligibilityTracker([tip], { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None }, storageService, createMockPromptsService([], [], {
            listPromptFiles: async () => instructionFiles,
        }), createMockToolsService(), new NullLogService()));
        await new Promise(r => setTimeout(r, 0));
        assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded after initial check finds no files');
        instructionFiles = [{ uri: URI.file('/.github/instructions/coding.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions }];
        tracker.refreshPromptFileExclusions();
        await new Promise(r => setTimeout(r, 0));
        assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded after refresh finds instruction files');
    });
});
suite('CreateSlashCommandsUsageTracker', () => {
    const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
    let storageService;
    let contextKeyService;
    let submitRequestEmitter;
    let sessions;
    setup(() => {
        storageService = testDisposables.add(new InMemoryStorageService());
        contextKeyService = new MockContextKeyService();
        submitRequestEmitter = testDisposables.add(new Emitter());
        sessions = new Map();
    });
    function createMockChatServiceForTracker() {
        return {
            onDidSubmitRequest: submitRequestEmitter.event,
            getSession: (resource) => sessions.get(resource.toString()),
        };
    }
    function createTracker(chatService) {
        return testDisposables.add(new CreateSlashCommandsUsageTracker(chatService ?? createMockChatServiceForTracker(), storageService, () => contextKeyService));
    }
    test('syncContextKey sets context key to false when storage is empty', () => {
        const tracker = createTracker();
        tracker.syncContextKey(contextKeyService);
        const value = contextKeyService.getContextKeyValue(ChatContextKeys.hasUsedCreateSlashCommands.key);
        assert.strictEqual(value, false, 'Context key should be false when no create commands have been used');
    });
    test('syncContextKey sets context key to true when storage has recorded usage', () => {
        storageService.store('chat.tips.usedCreateSlashCommands', true, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        const tracker = createTracker();
        tracker.syncContextKey(contextKeyService);
        const value = contextKeyService.getContextKeyValue(ChatContextKeys.hasUsedCreateSlashCommands.key);
        assert.strictEqual(value, true, 'Context key should be true when create commands have been used');
    });
    test('detects create-instructions slash command via text fallback', () => {
        const sessionResource = URI.parse('chat:session1');
        const tracker = createTracker();
        tracker.syncContextKey(contextKeyService);
        sessions.set(sessionResource.toString(), {
            lastRequest: {
                message: {
                    text: '/create-instructions test',
                    parts: [],
                },
            },
        });
        submitRequestEmitter.fire({ chatSessionResource: sessionResource });
        const value = contextKeyService.getContextKeyValue(ChatContextKeys.hasUsedCreateSlashCommands.key);
        assert.strictEqual(value, true, 'Context key should be true after /create-instructions is used');
        assert.strictEqual(storageService.getBoolean('chat.tips.usedCreateSlashCommands', -1 /* StorageScope.APPLICATION */, false), true, 'Storage should persist the create slash command usage');
    });
    test('detects create-prompt slash command via text fallback', () => {
        const sessionResource = URI.parse('chat:session2');
        const tracker = createTracker();
        tracker.syncContextKey(contextKeyService);
        sessions.set(sessionResource.toString(), {
            lastRequest: {
                message: {
                    text: '/create-prompt my-prompt',
                    parts: [],
                },
            },
        });
        submitRequestEmitter.fire({ chatSessionResource: sessionResource });
        assert.strictEqual(storageService.getBoolean('chat.tips.usedCreateSlashCommands', -1 /* StorageScope.APPLICATION */, false), true, 'Storage should persist the create-prompt usage');
    });
    test('detects create-agent slash command via parsed part', () => {
        const sessionResource = URI.parse('chat:session3');
        const tracker = createTracker();
        tracker.syncContextKey(contextKeyService);
        sessions.set(sessionResource.toString(), {
            lastRequest: {
                message: {
                    text: '/create-agent test',
                    parts: [
                        new ChatRequestSlashCommandPart(new OffsetRange(0, 13), new Range(1, 1, 1, 14), { command: 'create-agent', detail: '', locations: [] }),
                    ],
                },
            },
        });
        submitRequestEmitter.fire({ chatSessionResource: sessionResource });
        assert.strictEqual(storageService.getBoolean('chat.tips.usedCreateSlashCommands', -1 /* StorageScope.APPLICATION */, false), true, 'Storage should persist when create-agent slash command part is detected');
    });
    test('detects create command from submitted message payload when session has no last request', () => {
        const sessionResource = URI.parse('chat:session-payload');
        const tracker = createTracker();
        tracker.syncContextKey(contextKeyService);
        submitRequestEmitter.fire({
            chatSessionResource: sessionResource,
            message: {
                text: '/create-prompt payload-test',
                parts: [],
            },
        });
        assert.strictEqual(storageService.getBoolean('chat.tips.usedCreateSlashCommands', -1 /* StorageScope.APPLICATION */, false), true, 'Storage should persist usage detected from submitted message payload');
    });
    test('does not mark used for non-create slash commands', () => {
        const sessionResource = URI.parse('chat:session4');
        const tracker = createTracker();
        tracker.syncContextKey(contextKeyService);
        sessions.set(sessionResource.toString(), {
            lastRequest: {
                message: {
                    text: '/help test',
                    parts: [],
                },
            },
        });
        submitRequestEmitter.fire({ chatSessionResource: sessionResource });
        const value = contextKeyService.getContextKeyValue(ChatContextKeys.hasUsedCreateSlashCommands.key);
        assert.strictEqual(value, false, 'Context key should remain false for non-create slash commands');
    });
    test('does not mark used when session has no last request', () => {
        const sessionResource = URI.parse('chat:session5');
        const tracker = createTracker();
        tracker.syncContextKey(contextKeyService);
        sessions.set(sessionResource.toString(), { lastRequest: undefined });
        submitRequestEmitter.fire({ chatSessionResource: sessionResource });
        assert.strictEqual(storageService.getBoolean('chat.tips.usedCreateSlashCommands', -1 /* StorageScope.APPLICATION */, false), false, 'Should not mark used when there is no last request');
    });
    test('only marks used once even with multiple create commands', () => {
        const sessionResource = URI.parse('chat:session6');
        const tracker = createTracker();
        tracker.syncContextKey(contextKeyService);
        sessions.set(sessionResource.toString(), {
            lastRequest: {
                message: { text: '/create-skill test', parts: [] },
            },
        });
        submitRequestEmitter.fire({ chatSessionResource: sessionResource });
        assert.strictEqual(storageService.getBoolean('chat.tips.usedCreateSlashCommands', -1 /* StorageScope.APPLICATION */, false), true);
        // Fire again — should be a no-op
        sessions.set(sessionResource.toString(), {
            lastRequest: {
                message: { text: '/create-prompt test', parts: [] },
            },
        });
        submitRequestEmitter.fire({ chatSessionResource: sessionResource });
        assert.strictEqual(storageService.getBoolean('chat.tips.usedCreateSlashCommands', -1 /* StorageScope.APPLICATION */, false), true);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRpcFNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2NoYXRUaXBTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBaUIsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDckcsT0FBTyxFQUF1QixxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQzNILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBd0Isa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNuSCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUNoSCxPQUFPLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMzRixPQUFPLEVBQUUsZUFBZSxFQUFFLHNCQUFzQixFQUErQixNQUFNLG1EQUFtRCxDQUFDO0FBQ3pJLE9BQU8sRUFBRSxjQUFjLEVBQUUsMENBQTBDLEVBQUUsNkJBQTZCLEVB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