/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IChatAgentService } from '../../common/participants/chatAgents.js';
import { ChatMode, ChatModeService } from '../../common/chatModes.js';
import { ChatModeKind } from '../../common/constants.js';
import { IAgentSource, ICustomAgent, IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { createVSCodeHarnessDescriptor, CustomizationHarnessServiceBase, ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { MockPromptsService } from './promptSyntax/service/mockPromptsService.js';
import { Target } from '../../common/promptSyntax/promptTypes.js';
import { SessionType } from '../../common/chatSessionsService.js';

class TestChatAgentService implements Partial<IChatAgentService> {
	_serviceBrand: undefined;

	private _hasToolsAgent = true;
	private readonly _onDidChangeAgents = new Emitter<any>();

	get hasToolsAgent(): boolean {
		return this._hasToolsAgent;
	}

	setHasToolsAgent(value: boolean): void {
		this._hasToolsAgent = value;
		this._onDidChangeAgents.fire(undefined);
	}

	readonly onDidChangeAgents = this._onDidChangeAgents.event;
}

suite('ChatModeService', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	const workspaceSource: IAgentSource = { storage: PromptsStorage.local };

	let instantiationService: TestInstantiationService;
	let promptsService: MockPromptsService;
	let chatAgentService: TestChatAgentService;
	let storageService: TestStorageService;
	let configurationService: TestConfigurationService;
	let chatModeService: ChatModeService;
	let customizationHarnessService: CustomizationHarnessServiceBase;

	setup(async () => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		promptsService = new MockPromptsService();
		chatAgentService = new TestChatAgentService();
		storageService = testDisposables.add(new TestStorageService());
		configurationService = new TestConfigurationService();
		customizationHarnessService = testDisposables.add(new CustomizationHarnessServiceBase([createVSCodeHarnessDescriptor([PromptsStorage.extension])], SessionType.Local, promptsService));
		instantiationService.stub(IPromptsService, promptsService);
		instantiationService.stub(IChatAgentService, chatAgentService);
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ICustomizationHarnessService, customizationHarnessService);

		chatModeService = testDisposables.add(instantiationService.createInstance(ChatModeService));
		// Eagerly create the ChatModes for the local session type and await
		// its initial async refresh so tests can rely on a settled state.
		await chatModeService.getLocalModes();
	});

	const waitForRefresh = async (): Promise<void> => {
		await (await chatModeService.getLocalModes()).waitForPendingUpdates();
	};

	test('should return builtin modes', async () => {
		const modes = await chatModeService.getLocalModes();

		assert.strictEqual(modes.builtin.length, 3);
		assert.strictEqual(modes.custom.length, 0);

		// Check that Ask mode is always present
		const askMode = modes.builtin.find(mode => mode.id === ChatModeKind.Ask);
		assert.ok(askMode);
		assert.strictEqual(askMode.label.get(), 'Ask');
		assert.strictEqual(askMode.name.get(), 'ask');
		assert.strictEqual(askMode.kind, ChatModeKind.Ask);
	});

	test('should adjust builtin modes based on tools agent availability', async () => {
		// Agent mode should always be present regardless of tools agent availability
		chatAgentService.setHasToolsAgent(true);
		let agents = await chatModeService.getLocalModes();
		assert.ok(agents.builtin.find(agent => agent.id === ChatModeKind.Agent));

		// Without tools agent - Agent mode should not be present
		chatAgentService.setHasToolsAgent(false);
		agents = await chatModeService.getLocalModes();
		assert.strictEqual(agents.builtin.find(agent => agent.id === ChatModeKind.Agent), undefined);

		// Ask and Edit modes should always be present
		assert.ok(agents.builtin.find(agent => agent.id === ChatModeKind.Ask));
		assert.ok(agents.builtin.find(agent => agent.id === ChatModeKind.Edit));
	});

	test('should find builtin modes by id', async () => {
		const agentMode = (await chatModeService.getLocalModes()).findModeById(ChatModeKind.Agent);
		assert.ok(agentMode);
		assert.strictEqual(agentMode.id, ChatMode.Agent.id);
		assert.strictEqual(agentMode.kind, ChatModeKind.Agent);
	});

	test('should return undefined for non-existent mode', async () => {
		const mode = (await chatModeService.getLocalModes()).findModeById('non-existent-mode');
		assert.strictEqual(mode, undefined);
	});

	test('should handle custom modes from prompts service', async () => {
		const customMode: ICustomAgent = {
			id: 'custom-mode',
			uri: URI.parse('file:///test/custom-mode.md'),
			name: 'Test Mode',
			description: 'A test custom mode',
			tools: ['tool1', 'tool2'],
			agentInstructions: { content: 'Custom mode body', toolReferences: [] },
			source: workspaceSource,
			target: Target.Undefined,
			visibility: { userInvocable: true, agentInvocable: true },
			enabled: true
		};

		promptsService.setCustomModes([customMode]);

		await waitForRefresh();

		const modes = await chatModeService.getLocalModes();

		assert.strictEqual(modes.custom.length, 1);

		const testMode = modes.custom[0];
		assert.strictEqual(testMode.id, customMode.uri.toString());
		assert.strictEqual(testMode.name.get(), customMode.name);
		assert.strictEqual(testMode.label.get(), customMode.name);
		assert.strictEqual(testMode.description.get(), customMode.description);
		assert.strictEqual(testMode.kind, ChatModeKind.Agent);
		assert.deepStrictEqual(testMode.customTools?.get(), customMode.tools);
		assert.deepStrictEqual(testMode.modeInstructions?.get(), customMode.agentInstructions);
		assert.deepStrictEqual(testMode.handOffs?.get(), customMode.handOffs);
		assert.strictEqual(testMode.uri?.get().toString(), customMode.uri.toString());
		assert.deepStrictEqual(testMode.source, workspaceSource);
	});

	test('should fire change event when custom modes are updated', async () => {
		let eventFired = false;
		testDisposables.add((await chatModeService.getLocalModes()).onDidChange(() => {
			eventFired = true;
		}));

		const customMode: ICustomAgent = {
			id: 'custom-mode',
			uri: URI.parse('file:///test/custom-mode.md'),
			name: 'Test Mode',
			description: 'A test custom mode',
			tools: [],
			agentInstructions: { content: 'Custom mode body', toolReferences: [] },
			source: workspaceSource,
			target: Target.Undefined,
			visibility: { userInvocable: true, agentInvocable: true },
			enabled: true
		};

		promptsService.setCustomModes([customMode]);

		await waitForRefresh();

		assert.ok(eventFired);
	});

	test('should find custom modes by id', async () => {
		const customMode: ICustomAgent = {
			id: 'findable-mode',
			uri: URI.parse('file:///test/findable-mode.md'),
			name: 'Findable Mode',
			description: 'A findable custom mode',
			tools: [],
			agentInstructions: { content: 'Findable mode body', toolReferences: [] },
			source: workspaceSource,
			target: Target.Undefined,
			visibility: { userInvocable: true, agentInvocable: true },
			enabled: true
		};

		promptsService.setCustomModes([customMode]);

		await waitForRefresh();

		const foundMode = (await chatModeService.getLocalModes()).findModeById(customMode.uri.toString());
		assert.ok(foundMode);
		assert.strictEqual(foundMode.id, customMode.uri.toString());
		assert.strictEqual(foundMode.name.get(), customMode.name);
		assert.strictEqual(foundMode.label.get(), customMode.name);
	});

	test('should update existing custom mode instances when data changes', async () => {
		const uri = URI.parse('file:///test/updateable-mode.md');
		const initialMode: ICustomAgent = {
			id: 'updateable-mode',
			uri,
			name: 'Initial Mode',
			description: 'Initial description',
			tools: ['tool1'],
			agentInstructions: { content: 'Initial body', toolReferences: [] },
			model: ['gpt-4'],
			source: workspaceSource,
			target: Target.Undefined,
			visibility: { userInvocable: true, agentInvocable: true },
			enabled: true
		};

		promptsService.setCustomModes([initialMode]);
		await waitForRefresh();

		const initialModes = await chatModeService.getLocalModes();
		const initialCustomMode = initialModes.custom[0];
		assert.strictEqual(initialCustomMode.description.get(), 'Initial description');

		// Update the mode data
		const updatedMode: ICustomAgent = {
			...initialMode,
			description: 'Updated description',
			tools: ['tool1', 'tool2'],
			agentInstructions: { content: 'Updated body', toolReferences: [] },
			model: ['Updated model']
		};

		promptsService.setCustomModes([updatedMode]);
		await waitForRefresh();

		const updatedModes = await chatModeService.getLocalModes();
		const updatedCustomMode = updatedModes.custom[0];

		// The instance should be the same (reused)
		assert.strictEqual(initialCustomMode, updatedCustomMode);

		// But the observable properties should be updated
		assert.strictEqual(updatedCustomMode.description.get(), 'Updated description');
		assert.deepStrictEqual(updatedCustomMode.customTools?.get(), ['tool1', 'tool2']);
		assert.deepStrictEqual(updatedCustomMode.modeInstructions?.get(), { content: 'Updated body', toolReferences: [] });
		assert.deepStrictEqual(updatedCustomMode.model?.get(), ['Updated model']);
		assert.deepStrictEqual(updatedCustomMode.source, workspaceSource);
	});

	test('should not fire change event when custom mode payload is unchanged', async () => {
		const baseMode: ICustomAgent = {
			id: 'stable-mode',
			uri: URI.parse('file:///test/stable-mode.md'),
			name: 'Stable Mode',
			description: 'Stable description',
			tools: ['tool1'],
			agentInstructions: { content: 'Stable body', toolReferences: [] },
			source: workspaceSource,
			target: Target.Undefined,
			visibility: { userInvocable: true, agentInvocable: true },
			enabled: true
		};

		promptsService.setCustomModes([baseMode]);
		await waitForRefresh();

		let eventCount = 0;
		testDisposables.add((await chatModeService.getLocalModes()).onDidChange(() => {
			eventCount++;
		}));

		const equivalentMode: ICustomAgent = {
			...baseMode,
			tools: [...(baseMode.tools ?? [])],
			agentInstructions: {
				content: baseMode.agentInstructions.content,
				toolReferences: [...baseMode.agentInstructions.toolReferences],
			},
			visibility: { ...baseMode.visibility },
		};

		promptsService.setCustomModes([equivalentMode]);
		await waitForRefresh();

		assert.strictEqual(eventCount, 0);
	});

	test('should remove custom modes that no longer exist', async () => {
		const mode1: ICustomAgent = {
			id: 'mode1',
			uri: URI.parse('file:///test/mode1.md'),
			name: 'Mode 1',
			description: 'First mode',
			tools: [],
			agentInstructions: { content: 'Mode 1 body', toolReferences: [] },
			source: workspaceSource,
			target: Target.Undefined,
			visibility: { userInvocable: true, agentInvocable: true },
			enabled: true
		};

		const mode2: ICustomAgent = {
			id: 'mode2',
			uri: URI.parse('file:///test/mode2.md'),
			name: 'Mode 2',
			description: 'Second mode',
			tools: [],
			agentInstructions: { content: 'Mode 2 body', toolReferences: [] },
			source: workspaceSource,
			target: Target.Undefined,
			visibility: { userInvocable: true, agentInvocable: true },
			enabled: true
		};

		// Add both modes
		promptsService.setCustomModes([mode1, mode2]);
		await waitForRefresh();

		let modes = await chatModeService.getLocalModes();
		assert.strictEqual(modes.custom.length, 2);

		// Remove one mode
		promptsService.setCustomModes([mode1]);
		await waitForRefresh();

		modes = await chatModeService.getLocalModes();
		assert.strictEqual(modes.custom.length, 1);
		assert.strictEqual(modes.custom[0].id, mode1.uri.toString());
	});

});
