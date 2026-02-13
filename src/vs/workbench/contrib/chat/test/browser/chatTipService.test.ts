/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandEvent, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ChatTipService, ITipDefinition, TipEligibilityTracker } from '../../browser/chatTipService.js';
import { AgentFileType, IPromptPath, IPromptsService, IResolvedAgentFile, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { MockLanguageModelToolsService } from '../common/tools/mockLanguageModelToolsService.js';

class MockContextKeyServiceWithRulesMatching extends MockContextKeyService {
	override contextMatchesRules(): boolean {
		return true;
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
	});

	test('returns a tip for new requests with timestamp after service creation', () => {
		const service = createService();
		const now = Date.now();

		// Request created after service initialization
		const tip = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.ok(tip, 'Should return a tip for requests created after service instantiation');
		assert.ok(tip.id.startsWith('tip.'), 'Tip should have a valid ID');
		assert.ok(tip.content.value.length > 0, 'Tip should have content');
	});

	test('returns undefined for old requests with timestamp before service creation', () => {
		const service = createService();
		const now = Date.now();

		// Request created before service initialization (simulating restored chat)
		const tip = service.getNextTip('old-request', now - 10000, contextKeyService);
		assert.strictEqual(tip, undefined, 'Should not return a tip for requests created before service instantiation');
	});

	test('only shows one tip per session', () => {
		const service = createService();
		const now = Date.now();

		// First request gets a tip
		const tip1 = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.ok(tip1, 'First request should get a tip');

		// Second request does not get a tip
		const tip2 = service.getNextTip('request-2', now + 2000, contextKeyService);
		assert.strictEqual(tip2, undefined, 'Second request should not get a tip');
	});

	test('returns same tip on rerender of same request', () => {
		const service = createService();
		const now = Date.now();

		// First call gets a tip
		const tip1 = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.ok(tip1);

		// Same request ID gets the same tip on rerender
		const tip2 = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.ok(tip2);
		assert.strictEqual(tip1.id, tip2.id, 'Should return same tip for stable rerender');
		assert.strictEqual(tip1.content.value, tip2.content.value);
	});

	test('returns undefined when Copilot is not enabled', () => {
		const service = createService(/* hasCopilot */ false);
		const now = Date.now();

		const tip = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.strictEqual(tip, undefined, 'Should not return a tip when Copilot is not enabled');
	});

	test('returns undefined when tips setting is disabled', () => {
		const service = createService(/* hasCopilot */ true, /* tipsEnabled */ false);
		const now = Date.now();

		const tip = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.strictEqual(tip, undefined, 'Should not return a tip when tips setting is disabled');
	});

	test('returns undefined when location is terminal', () => {
		const service = createService();
		const now = Date.now();

		const terminalContextKeyService = new MockContextKeyServiceWithRulesMatching();
		terminalContextKeyService.createKey(ChatContextKeys.location.key, ChatAgentLocation.Terminal);

		const tip = service.getNextTip('request-1', now + 1000, terminalContextKeyService);
		assert.strictEqual(tip, undefined, 'Should not return a tip in terminal inline chat');
	});

	test('returns undefined when location is editor inline', () => {
		const service = createService();
		const now = Date.now();

		const editorContextKeyService = new MockContextKeyServiceWithRulesMatching();
		editorContextKeyService.createKey(ChatContextKeys.location.key, ChatAgentLocation.EditorInline);

		const tip = service.getNextTip('request-1', now + 1000, editorContextKeyService);
		assert.strictEqual(tip, undefined, 'Should not return a tip in editor inline chat');
	});

	test('old requests do not consume the session tip allowance', () => {
		const service = createService();
		const now = Date.now();

		// Old request should not consume the tip allowance
		const oldTip = service.getNextTip('old-request', now - 10000, contextKeyService);
		assert.strictEqual(oldTip, undefined);

		// New request should still be able to get a tip
		const newTip = service.getNextTip('new-request', now + 1000, contextKeyService);
		assert.ok(newTip, 'New request should get a tip after old request was skipped');
	});

	test('multiple old requests do not affect new request tip', () => {
		const service = createService();
		const now = Date.now();

		// Simulate multiple restored requests being rendered
		service.getNextTip('old-1', now - 30000, contextKeyService);
		service.getNextTip('old-2', now - 20000, contextKeyService);
		service.getNextTip('old-3', now - 10000, contextKeyService);

		// New request should still get a tip
		const tip = service.getNextTip('new-request', now + 1000, contextKeyService);
		assert.ok(tip, 'New request should get a tip after multiple old requests');
	});

	test('dismissTip excludes the dismissed tip and allows a new one', () => {
		const service = createService();
		const now = Date.now();

		// Get a tip
		const tip1 = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.ok(tip1);

		// Dismiss it
		service.dismissTip();

		// Next call should return a different tip (since the dismissed one is excluded)
		const tip2 = service.getNextTip('request-1', now + 1000, contextKeyService);
		if (tip2) {
			assert.notStrictEqual(tip1.id, tip2.id, 'Dismissed tip should not be shown again');
		}
		// tip2 may be undefined if it was the only eligible tip — that's also valid
	});

	test('dismissTip fires onDidDismissTip event', () => {
		const service = createService();
		const now = Date.now();

		service.getNextTip('request-1', now + 1000, contextKeyService);

		let fired = false;
		testDisposables.add(service.onDidDismissTip(() => { fired = true; }));
		service.dismissTip();

		assert.ok(fired, 'onDidDismissTip should fire');
	});

	test('disableTips fires onDidDisableTips event', async () => {
		const service = createService();
		const now = Date.now();

		service.getNextTip('request-1', now + 1000, contextKeyService);

		let fired = false;
		testDisposables.add(service.onDidDisableTips(() => { fired = true; }));
		await service.disableTips();

		assert.ok(fired, 'onDidDisableTips should fire');
	});

	test('disableTips resets state so re-enabling works', async () => {
		const service = createService();
		const now = Date.now();

		// Show a tip
		const tip1 = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.ok(tip1);

		// Disable tips
		await service.disableTips();

		// Re-enable tips
		configurationService.setUserConfiguration('chat.tips.enabled', true);

		// Should be able to get a tip again on a new request
		const tip2 = service.getNextTip('request-2', now + 2000, contextKeyService);
		assert.ok(tip2, 'Should return a tip after disabling and re-enabling');
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

	test('resetSession allows tips in a new conversation', () => {
		const service = createService();
		const now = Date.now();

		// Show a tip in the first conversation
		const tip1 = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.ok(tip1, 'First request should get a tip');

		// Second request — no tip (one per session)
		const tip2 = service.getNextTip('request-2', now + 2000, contextKeyService);
		assert.strictEqual(tip2, undefined, 'Second request should not get a tip');

		// Start a new conversation
		service.resetSession();

		// New request after reset should get a tip
		const tip3 = service.getNextTip('request-3', Date.now() + 1000, contextKeyService);
		assert.ok(tip3, 'First request after resetSession should get a tip');
	});

	test('chatResponse tip shows regardless of welcome tip', () => {
		const service = createService();
		const now = Date.now();

		// Show a welcome tip (simulating the getting-started view)
		const welcomeTip = service.getWelcomeTip(contextKeyService);
		assert.ok(welcomeTip, 'Welcome tip should be shown');

		// First new request should still get a chatResponse tip
		const tip = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.ok(tip, 'ChatResponse tip should show even when welcome tip was shown');
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
