/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandEvent, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyExpression, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ChatTipService, ITipDefinition, TipEligibilityTracker } from '../../browser/chatTipService.js';
import { AgentFileType, IPromptPath, IPromptsService, IResolvedAgentFile, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { MockLanguageModelToolsService } from '../common/tools/mockLanguageModelToolsService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { TestChatEntitlementService } from '../../../../test/common/workbenchTestServices.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { MockChatService } from '../common/chatService/mockChatService.js';
import { CreateSlashCommandsUsageTracker } from '../../browser/createSlashCommandsUsageTracker.js';
import { ChatRequestSlashCommandPart } from '../../common/requestParser/chatParserTypes.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../editor/common/core/range.js';

class MockContextKeyServiceWithRulesMatching extends MockContextKeyService {
	override contextMatchesRules(rules: ContextKeyExpression): boolean {
		return rules.evaluate({ getValue: (key: string) => this.getContextKeyValue(key) });
	}
}

class TrackingConfigurationService extends TestConfigurationService {
	public lastUpdateTarget: ConfigurationTarget | undefined;
	public lastUpdateKey: string | undefined;
	public lastUpdateValue: unknown;

	override updateValue(key: string, value: unknown, arg3?: unknown): Promise<void> {
		this.lastUpdateKey = key;
		this.lastUpdateValue = value;
		this.lastUpdateTarget = arg3 as ConfigurationTarget | undefined;
		return Promise.resolve(undefined);
	}
}

suite('ChatTipService', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let contextKeyService: MockContextKeyServiceWithRulesMatching;
	let configurationService: TestConfigurationService;
	let commandExecutedEmitter: Emitter<ICommandEvent>;
	let storageService: InMemoryStorageService;
	let mockInstructionFiles: IResolvedAgentFile[];
	let mockPromptInstructionFiles: IPromptPath[];

	function createProductService(hasCopilot: boolean): IProductService {
		return {
			_serviceBrand: undefined,
			defaultChatAgent: hasCopilot ? { chatExtensionId: 'github.copilot-chat' } : undefined,
		} as IProductService;
	}

	function createService(hasCopilot: boolean = true, tipsEnabled: boolean = true): ChatTipService {
		instantiationService.stub(IProductService, createProductService(hasCopilot));
		configurationService.setUserConfiguration('chat.tips.enabled', tipsEnabled);
		return testDisposables.add(instantiationService.createInstance(ChatTipService));
	}

	setup(() => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		contextKeyService = new MockContextKeyServiceWithRulesMatching();
		configurationService = new TestConfigurationService();
		commandExecutedEmitter = testDisposables.add(new Emitter<ICommandEvent>());
		storageService = testDisposables.add(new InMemoryStorageService());
		mockInstructionFiles = [];
		mockPromptInstructionFiles = [];
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ICommandService, {
			onDidExecuteCommand: commandExecutedEmitter.event,
			onWillExecuteCommand: testDisposables.add(new Emitter<ICommandEvent>()).event,
		} as Partial<ICommandService> as ICommandService);
		instantiationService.stub(IPromptsService, {
			listAgentInstructions: async () => mockInstructionFiles,
			listPromptFiles: async () => mockPromptInstructionFiles,
			onDidChangeCustomAgents: Event.None,
		} as Partial<IPromptsService> as IPromptsService);
		instantiationService.stub(ILanguageModelToolsService, testDisposables.add(new MockLanguageModelToolsService()));
		instantiationService.stub(IChatEntitlementService, new TestChatEntitlementService());
		instantiationService.stub(IChatService, new MockChatService());
	});

	test('returns a welcome tip', () => {
		const service = createService();

		const tip = service.getWelcomeTip(contextKeyService);
		assert.ok(tip, 'Should return a welcome tip');
		assert.ok(tip.id.startsWith('tip.'), 'Tip should have a valid ID');
		assert.ok(tip.content.value.length > 0, 'Tip should have content');
	});

	test('returns Auto switch tip when current model is gpt-4.1', () => {
		const service = createService();
		contextKeyService.createKey(ChatContextKeys.chatModelId.key, 'gpt-4.1');

		const tip = service.getWelcomeTip(contextKeyService);

		assert.ok(tip);
		assert.strictEqual(tip.id, 'tip.switchToAuto');
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
		storageService.store('chat.currentLanguageModel.panel', 'copilot/gpt-4.1-2025-04-14', StorageScope.APPLICATION, StorageTarget.USER);
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
		assert.strictEqual(trackingConfigurationService.lastUpdateTarget, ConfigurationTarget.APPLICATION);
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
		await new Promise<void>(r => queueMicrotask(r));

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
		storageService.store('chat.tip.dismissed', JSON.stringify(['tip.switchToAuto']), StorageScope.PROFILE, StorageTarget.MACHINE);
		const service = createService();
		contextKeyService.createKey(ChatContextKeys.chatModelId.key, 'gpt-4.1');

		const tip = service.getWelcomeTip(contextKeyService);

		assert.ok(tip);
		assert.notStrictEqual(tip.id, 'tip.switchToAuto', 'Should honor profile-stored dismissed tip id');
		assert.ok(storageService.get('chat.tip.dismissed', StorageScope.APPLICATION), 'Expected dismissed tips to migrate to application storage');
	});

	function createMockPromptsService(
		agentInstructions: IResolvedAgentFile[] = [],
		promptInstructions: IPromptPath[] = [],
		options?: { onDidChangeCustomAgents?: Event<void>; listPromptFiles?: (_type: PromptsType) => Promise<readonly IPromptPath[]> },
	): Partial<IPromptsService> {
		return {
			listAgentInstructions: async () => agentInstructions,
			listPromptFiles: options?.listPromptFiles ?? (async (_type: PromptsType) => promptInstructions),
			onDidChangeCustomAgents: options?.onDidChangeCustomAgents ?? Event.None,
		};
	}

	function createMockToolsService(): MockLanguageModelToolsService {
		return testDisposables.add(new MockLanguageModelToolsService());
	}

	test('excludes tip.undoChanges when restore checkpoint command has been executed', () => {
		const tip: ITipDefinition = {
			id: 'tip.undoChanges',
			message: 'test',
			excludeWhenCommandsExecuted: ['workbench.action.chat.restoreCheckpoint'],
		};

		const tracker = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService() as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded before command is executed');

		commandExecutedEmitter.fire({ commandId: 'workbench.action.chat.restoreCheckpoint', args: [] });

		assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded after command is executed');
	});

	test('persists executed command exclusions in application storage', () => {
		const tip: ITipDefinition = {
			id: 'tip.undoChanges',
			message: 'test',
			excludeWhenCommandsExecuted: ['workbench.action.chat.restoreCheckpoint'],
		};

		testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService() as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		commandExecutedEmitter.fire({ commandId: 'workbench.action.chat.restoreCheckpoint', args: [] });

		assert.ok(storageService.get('chat.tips.executedCommands', StorageScope.APPLICATION), 'Expected executed command exclusions in application storage');
		assert.strictEqual(storageService.get('chat.tips.executedCommands', StorageScope.PROFILE), undefined, 'Did not expect executed command exclusions in profile storage');
		assert.strictEqual(storageService.get('chat.tips.executedCommands', StorageScope.WORKSPACE), undefined, 'Did not expect executed command exclusions in workspace storage');
	});

	test('migrates executed command exclusions from profile to application storage', () => {
		const tip: ITipDefinition = {
			id: 'tip.undoChanges',
			message: 'test',
			excludeWhenCommandsExecuted: ['workbench.action.chat.restoreCheckpoint'],
		};

		storageService.store('chat.tips.executedCommands', JSON.stringify(['workbench.action.chat.restoreCheckpoint']), StorageScope.PROFILE, StorageTarget.MACHINE);

		const tracker = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService() as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		assert.strictEqual(tracker.isExcluded(tip), true, 'Should honor profile-stored exclusions');
		assert.ok(storageService.get('chat.tips.executedCommands', StorageScope.APPLICATION), 'Expected migrated exclusion data in application storage');
	});

	test('excludes tip.customInstructions when copilot-instructions.md exists in workspace', async () => {
		const tip: ITipDefinition = {
			id: 'tip.customInstructions',
			message: 'test',
			excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentFileType.copilotInstructionsMd, excludeUntilChecked: true },
		};

		const tracker = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService([{ uri: { path: '/.github/copilot-instructions.md' }, realPath: undefined, type: AgentFileType.copilotInstructionsMd } as IResolvedAgentFile]) as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		// Wait for the async file check to complete
		await new Promise(r => setTimeout(r, 0));

		assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded when copilot-instructions.md exists');
	});

	test('does not exclude tip.customInstructions when only AGENTS.md exists', async () => {
		const tip: ITipDefinition = {
			id: 'tip.customInstructions',
			message: 'test',
			excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentFileType.copilotInstructionsMd, excludeUntilChecked: true },
		};

		const tracker = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService([{ uri: { path: '/AGENTS.md' }, realPath: undefined, type: AgentFileType.agentsMd } as IResolvedAgentFile]) as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		// Wait for the async file check to complete
		await new Promise(r => setTimeout(r, 0));

		assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded when only AGENTS.md exists');
	});

	test('excludes tip.customInstructions when .instructions.md files exist in workspace', async () => {
		const tip: ITipDefinition = {
			id: 'tip.customInstructions',
			message: 'test',
			excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentFileType.copilotInstructionsMd, excludeUntilChecked: true },
		};

		const tracker = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService([], [{ uri: URI.file('/.github/instructions/coding.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions }]) as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		// Wait for the async file check to complete
		await new Promise(r => setTimeout(r, 0));

		assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded when .instructions.md files exist');
	});

	test('does not exclude tip.customInstructions when no instruction files exist', async () => {
		const tip: ITipDefinition = {
			id: 'tip.customInstructions',
			message: 'test',
			excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentFileType.copilotInstructionsMd, excludeUntilChecked: true },
		};

		const tracker = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService() as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		// Wait for the async file check to complete
		await new Promise(r => setTimeout(r, 0));

		assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded when no instruction files exist');
	});

	test('excludes tip.agentMode when agent mode has been used in workspace', () => {
		const tip: ITipDefinition = {
			id: 'tip.agentMode',
			message: 'test',
			excludeWhenModesUsed: [ChatModeKind.Agent],
		};

		contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
		contextKeyService.createKey(ChatContextKeys.chatModeName.key, 'Agent');

		const tracker = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService() as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded before mode is recorded');

		tracker.recordCurrentMode(contextKeyService);

		assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded after agent mode has been recorded');
	});

	test('excludes tip.planMode when Plan mode has been used in workspace', () => {
		const tip: ITipDefinition = {
			id: 'tip.planMode',
			message: 'test',
			excludeWhenModesUsed: ['Plan'],
		};

		contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
		contextKeyService.createKey(ChatContextKeys.chatModeName.key, 'Plan');

		const tracker = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService() as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded before mode is recorded');

		tracker.recordCurrentMode(contextKeyService);

		assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded after Plan mode has been recorded');
	});

	test('persists command exclusions to workspace storage across tracker instances', () => {
		const tip: ITipDefinition = {
			id: 'tip.undoChanges',
			message: 'test',
			excludeWhenCommandsExecuted: ['workbench.action.chat.restoreCheckpoint'],
		};

		const tracker1 = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService() as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		commandExecutedEmitter.fire({ commandId: 'workbench.action.chat.restoreCheckpoint', args: [] });
		assert.strictEqual(tracker1.isExcluded(tip), true);

		// Second tracker reads from storage — should be excluded immediately
		const tracker2 = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService() as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		assert.strictEqual(tracker2.isExcluded(tip), true, 'New tracker should read persisted exclusion from workspace storage');
	});

	test('persists mode exclusions to workspace storage across tracker instances', () => {
		const tip: ITipDefinition = {
			id: 'tip.agentMode',
			message: 'test',
			excludeWhenModesUsed: [ChatModeKind.Agent],
		};

		contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
		contextKeyService.createKey(ChatContextKeys.chatModeName.key, 'Agent');

		const tracker1 = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService() as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		tracker1.recordCurrentMode(contextKeyService);
		assert.strictEqual(tracker1.isExcluded(tip), true);

		// Second tracker reads from storage — should be excluded immediately
		const tracker2 = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService() as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		assert.strictEqual(tracker2.isExcluded(tip), true, 'New tracker should read persisted mode exclusion from workspace storage');
	});

	test('resetSession allows a new welcome tip', () => {
		const service = createService();

		const tip1 = service.getWelcomeTip(contextKeyService);
		assert.ok(tip1, 'Should get a welcome tip');

		service.resetSession();

		const tip2 = service.getWelcomeTip(contextKeyService);
		assert.ok(tip2, 'Should get a welcome tip after resetSession');
	});

	test('excludes tip when tracked tool has been invoked', () => {
		const mockToolsService = createMockToolsService();
		const tip: ITipDefinition = {
			id: 'tip.mermaid',
			message: 'test',
			excludeWhenToolsInvoked: ['renderMermaidDiagram'],
		};

		const tracker = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService() as IPromptsService,
			mockToolsService,
			new NullLogService(),
		));

		assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded before tool is invoked');

		mockToolsService.fireOnDidInvokeTool({ toolId: 'renderMermaidDiagram', sessionResource: undefined, requestId: undefined, subagentInvocationId: undefined });

		assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded after tool is invoked');
	});

	test('persists tool exclusions to workspace storage across tracker instances', () => {
		const mockToolsService = createMockToolsService();
		const tip: ITipDefinition = {
			id: 'tip.subagents',
			message: 'test',
			excludeWhenToolsInvoked: ['runSubagent'],
		};

		const tracker1 = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService() as IPromptsService,
			mockToolsService,
			new NullLogService(),
		));

		mockToolsService.fireOnDidInvokeTool({ toolId: 'runSubagent', sessionResource: undefined, requestId: undefined, subagentInvocationId: undefined });
		assert.strictEqual(tracker1.isExcluded(tip), true);

		// Second tracker reads from storage — should be excluded immediately
		const tracker2 = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService() as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		assert.strictEqual(tracker2.isExcluded(tip), true, 'New tracker should read persisted tool exclusion from workspace storage');
	});

	test('excludes tip.skill when skill files exist in workspace', async () => {
		const tip: ITipDefinition = {
			id: 'tip.skill',
			message: 'test',
			excludeWhenPromptFilesExist: { promptType: PromptsType.skill },
		};

		const tracker = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService([], [{ uri: URI.file('/.github/skills/my-skill.skill.md'), storage: PromptsStorage.local, type: PromptsType.skill }]) as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		// Wait for the async file check to complete
		await new Promise(r => setTimeout(r, 0));

		assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded when skill files exist');
	});

	test('does not exclude tip.skill when no skill files exist', async () => {
		const tip: ITipDefinition = {
			id: 'tip.skill',
			message: 'test',
			excludeWhenPromptFilesExist: { promptType: PromptsType.skill },
		};

		const tracker = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService() as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		// Wait for the async file check to complete
		await new Promise(r => setTimeout(r, 0));

		assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded when no skill files exist');
	});

	test('shows tip.createSlashCommands when context key is false', () => {
		const service = createService();
		contextKeyService.createKey(ChatContextKeys.hasUsedCreateSlashCommands.key, false);

		// Dismiss tips until we find createSlashCommands or run out
		let found = false;
		for (let i = 0; i < 100; i++) {
			const tip = service.getWelcomeTip(contextKeyService);
			if (!tip) {
				break;
			}
			if (tip.id === 'tip.createSlashCommands') {
				found = true;
				break;
			}
			service.dismissTip();
		}

		assert.ok(found, 'Should eventually show tip.createSlashCommands when context key is false');
	});

	test('does not show tip.createSlashCommands when context key is true', () => {
		storageService.store('chat.tips.usedCreateSlashCommands', true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const service = createService();

		for (let i = 0; i < 100; i++) {
			const tip = service.getWelcomeTip(contextKeyService);
			if (!tip) {
				break;
			}
			assert.notStrictEqual(tip.id, 'tip.createSlashCommands', 'Should not show tip.createSlashCommands when context key is true');
			service.dismissTip();
		}
	});

	test('re-checks agent file exclusion when onDidChangeCustomAgents fires', async () => {
		const agentChangeEmitter = testDisposables.add(new Emitter<void>());
		let agentFiles: IPromptPath[] = [];

		const tip: ITipDefinition = {
			id: 'tip.customAgent',
			message: 'test',
			excludeWhenPromptFilesExist: { promptType: PromptsType.agent, excludeUntilChecked: true },
		};

		const tracker = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			createMockPromptsService([], [], {
				onDidChangeCustomAgents: agentChangeEmitter.event,
				listPromptFiles: async () => agentFiles,
			}) as IPromptsService,
			createMockToolsService(),
			new NullLogService(),
		));

		// Initial check: no agent files, but excludeUntilChecked means excluded first
		await new Promise(r => setTimeout(r, 0));
		assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded after initial check finds no files');

		// Simulate agent files appearing
		agentFiles = [{ uri: URI.file('/.github/agents/my-agent.agent.md'), storage: PromptsStorage.local, type: PromptsType.agent }];
		agentChangeEmitter.fire();
		await new Promise(r => setTimeout(r, 0));

		assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded after onDidChangeCustomAgents fires and agent files exist');
	});
});

suite('CreateSlashCommandsUsageTracker', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let storageService: InMemoryStorageService;
	let contextKeyService: MockContextKeyService;
	let submitRequestEmitter: Emitter<{ readonly chatSessionResource: URI }>;
	let sessions: Map<string, { lastRequest: { message: { text: string; parts: readonly { kind: string }[] } } | undefined }>;

	setup(() => {
		storageService = testDisposables.add(new InMemoryStorageService());
		contextKeyService = new MockContextKeyService();
		submitRequestEmitter = testDisposables.add(new Emitter<{ readonly chatSessionResource: URI }>());
		sessions = new Map();
	});

	function createMockChatServiceForTracker(): IChatService {
		return {
			onDidSubmitRequest: submitRequestEmitter.event,
			getSession: (resource: URI) => sessions.get(resource.toString()),
		} as Partial<IChatService> as IChatService;
	}

	function createTracker(chatService?: IChatService): CreateSlashCommandsUsageTracker {
		return testDisposables.add(new CreateSlashCommandsUsageTracker(
			chatService ?? createMockChatServiceForTracker(),
			storageService,
			() => contextKeyService,
		));
	}

	test('syncContextKey sets context key to false when storage is empty', () => {
		const tracker = createTracker();
		tracker.syncContextKey(contextKeyService);

		const value = contextKeyService.getContextKeyValue(ChatContextKeys.hasUsedCreateSlashCommands.key);
		assert.strictEqual(value, false, 'Context key should be false when no create commands have been used');
	});

	test('syncContextKey sets context key to true when storage has recorded usage', () => {
		storageService.store('chat.tips.usedCreateSlashCommands', true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const tracker = createTracker();
		tracker.syncContextKey(contextKeyService);

		const value = contextKeyService.getContextKeyValue(ChatContextKeys.hasUsedCreateSlashCommands.key);
		assert.strictEqual(value, true, 'Context key should be true when create commands have been used');
	});

	test('detects create-instruction slash command via text fallback', () => {
		const sessionResource = URI.parse('chat:session1');
		const tracker = createTracker();
		tracker.syncContextKey(contextKeyService);

		sessions.set(sessionResource.toString(), {
			lastRequest: {
				message: {
					text: '/create-instruction test',
					parts: [],
				},
			},
		});

		submitRequestEmitter.fire({ chatSessionResource: sessionResource });

		const value = contextKeyService.getContextKeyValue(ChatContextKeys.hasUsedCreateSlashCommands.key);
		assert.strictEqual(value, true, 'Context key should be true after /create-instruction is used');
		assert.strictEqual(
			storageService.getBoolean('chat.tips.usedCreateSlashCommands', StorageScope.APPLICATION, false),
			true,
			'Storage should persist the create slash command usage',
		);
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

		assert.strictEqual(
			storageService.getBoolean('chat.tips.usedCreateSlashCommands', StorageScope.APPLICATION, false),
			true,
			'Storage should persist the create-prompt usage',
		);
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
						new ChatRequestSlashCommandPart(
							new OffsetRange(0, 13),
							new Range(1, 1, 1, 14),
							{ command: 'create-agent', detail: '', locations: [] },
						),
					],
				},
			},
		});

		submitRequestEmitter.fire({ chatSessionResource: sessionResource });

		assert.strictEqual(
			storageService.getBoolean('chat.tips.usedCreateSlashCommands', StorageScope.APPLICATION, false),
			true,
			'Storage should persist when create-agent slash command part is detected',
		);
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

		assert.strictEqual(
			storageService.getBoolean('chat.tips.usedCreateSlashCommands', StorageScope.APPLICATION, false),
			false,
			'Should not mark used when there is no last request',
		);
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
		assert.strictEqual(storageService.getBoolean('chat.tips.usedCreateSlashCommands', StorageScope.APPLICATION, false), true);

		// Fire again — should be a no-op
		sessions.set(sessionResource.toString(), {
			lastRequest: {
				message: { text: '/create-prompt test', parts: [] },
			},
		});

		submitRequestEmitter.fire({ chatSessionResource: sessionResource });
		assert.strictEqual(storageService.getBoolean('chat.tips.usedCreateSlashCommands', StorageScope.APPLICATION, false), true);
	});
});
