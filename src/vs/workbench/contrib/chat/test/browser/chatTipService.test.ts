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
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ChatTipService, ITipDefinition, TipEligibilityTracker } from '../../browser/chatTipService.js';
import { IPromptsService, IResolvedAgentFile } from '../../common/promptSyntax/service/promptsService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatModeKind } from '../../common/constants.js';

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
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ICommandService, {
			onDidExecuteCommand: commandExecutedEmitter.event,
			onWillExecuteCommand: testDisposables.add(new Emitter<ICommandEvent>()).event,
		} as Partial<ICommandService> as ICommandService);
		instantiationService.stub(IPromptsService, {
			listAgentInstructions: async () => mockInstructionFiles,
		} as Partial<IPromptsService> as IPromptsService);
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

	test('disableTips fires onDidDisableTips event', () => {
		const service = createService();
		const now = Date.now();

		service.getNextTip('request-1', now + 1000, contextKeyService);

		let fired = false;
		testDisposables.add(service.onDidDisableTips(() => { fired = true; }));
		service.disableTips();

		assert.ok(fired, 'onDidDisableTips should fire');
	});

	test('disableTips resets state so re-enabling works', () => {
		const service = createService();
		const now = Date.now();

		// Show a tip
		const tip1 = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.ok(tip1);

		// Disable tips
		service.disableTips();

		// Re-enable tips
		configurationService.setUserConfiguration('chat.tips.enabled', true);

		// Should be able to get a tip again on a new request
		const tip2 = service.getNextTip('request-2', now + 2000, contextKeyService);
		assert.ok(tip2, 'Should return a tip after disabling and re-enabling');
	});

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
			{ listAgentInstructions: async () => [] } as Partial<IPromptsService> as IPromptsService,
		));

		assert.strictEqual(tracker.isExcluded(tip), false, 'Should not be excluded before command is executed');

		commandExecutedEmitter.fire({ commandId: 'workbench.action.chat.restoreCheckpoint', args: [] });

		assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded after command is executed');
	});

	test('excludes tip.customInstructions when instruction files exist in workspace', async () => {
		const tip: ITipDefinition = {
			id: 'tip.customInstructions',
			message: 'test',
		};

		const tracker = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			{ listAgentInstructions: async () => [{ uri: { path: '/.github/copilot-instructions.md' } } as IResolvedAgentFile] } as Partial<IPromptsService> as IPromptsService,
		));

		// Wait for the async file check to complete
		await new Promise(r => setTimeout(r, 0));

		assert.strictEqual(tracker.isExcluded(tip), true, 'Should be excluded when instruction files exist');
	});

	test('does not exclude tip.customInstructions when no instruction files exist', async () => {
		const tip: ITipDefinition = {
			id: 'tip.customInstructions',
			message: 'test',
		};

		const tracker = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			{ listAgentInstructions: async () => [] } as Partial<IPromptsService> as IPromptsService,
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
			{ listAgentInstructions: async () => [] } as Partial<IPromptsService> as IPromptsService,
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
			{ listAgentInstructions: async () => [] } as Partial<IPromptsService> as IPromptsService,
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
			{ listAgentInstructions: async () => [] } as Partial<IPromptsService> as IPromptsService,
		));

		commandExecutedEmitter.fire({ commandId: 'workbench.action.chat.restoreCheckpoint', args: [] });
		assert.strictEqual(tracker1.isExcluded(tip), true);

		// Second tracker reads from storage — should be excluded immediately
		const tracker2 = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			{ listAgentInstructions: async () => [] } as Partial<IPromptsService> as IPromptsService,
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
			{ listAgentInstructions: async () => [] } as Partial<IPromptsService> as IPromptsService,
		));

		tracker1.recordCurrentMode(contextKeyService);
		assert.strictEqual(tracker1.isExcluded(tip), true);

		// Second tracker reads from storage — should be excluded immediately
		const tracker2 = testDisposables.add(new TipEligibilityTracker(
			[tip],
			{ onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None } as Partial<ICommandService> as ICommandService,
			storageService,
			{ listAgentInstructions: async () => [] } as Partial<IPromptsService> as IPromptsService,
		));

		assert.strictEqual(tracker2.isExcluded(tip), true, 'New tracker should read persisted mode exclusion from workspace storage');
	});
});
