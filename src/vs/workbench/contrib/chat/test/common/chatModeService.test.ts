/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IChatAgentService } from '../../common/chatAgents.js';
import { ChatMode, ChatModeService } from '../../common/chatModes.js';
import { ChatModeKind } from '../../common/constants.js';
import { ICustomChatMode, IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { MockPromptsService } from './mockPromptsService.js';

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

	let instantiationService: TestInstantiationService;
	let promptsService: MockPromptsService;
	let chatAgentService: TestChatAgentService;
	let storageService: TestStorageService;
	let chatModeService: ChatModeService;

	setup(async () => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		promptsService = new MockPromptsService();
		chatAgentService = new TestChatAgentService();
		storageService = testDisposables.add(new TestStorageService());

		instantiationService.stub(IPromptsService, promptsService);
		instantiationService.stub(IChatAgentService, chatAgentService);
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());

		chatModeService = testDisposables.add(instantiationService.createInstance(ChatModeService));
	});

	test('should return builtin modes', () => {
		const modes = chatModeService.getModes();

		assert.strictEqual(modes.builtin.length, 3);
		assert.strictEqual(modes.custom.length, 0);

		// Check that Ask mode is always present
		const askMode = modes.builtin.find(mode => mode.id === ChatModeKind.Ask);
		assert.ok(askMode);
		assert.strictEqual(askMode.label, 'Ask');
		assert.strictEqual(askMode.name, 'ask');
		assert.strictEqual(askMode.kind, ChatModeKind.Ask);
	});

	test('should adjust builtin modes based on tools agent availability', () => {
		// With tools agent
		chatAgentService.setHasToolsAgent(true);
		let modes = chatModeService.getModes();
		assert.ok(modes.builtin.find(mode => mode.id === ChatModeKind.Agent));

		// Without tools agent - Agent mode should not be present
		chatAgentService.setHasToolsAgent(false);
		modes = chatModeService.getModes();
		assert.strictEqual(modes.builtin.find(mode => mode.id === ChatModeKind.Agent), undefined);

		// But Ask and Edit modes should always be present
		assert.ok(modes.builtin.find(mode => mode.id === ChatModeKind.Ask));
		assert.ok(modes.builtin.find(mode => mode.id === ChatModeKind.Edit));
	});

	test('should find builtin modes by id', () => {
		const agentMode = chatModeService.findModeById(ChatModeKind.Agent);
		assert.ok(agentMode);
		assert.strictEqual(agentMode.id, ChatMode.Agent.id);
		assert.strictEqual(agentMode.kind, ChatModeKind.Agent);
	});

	test('should return undefined for non-existent mode', () => {
		const mode = chatModeService.findModeById('non-existent-mode');
		assert.strictEqual(mode, undefined);
	});

	test('should handle custom modes from prompts service', async () => {
		const customMode: ICustomChatMode = {
			uri: URI.parse('file:///test/custom-mode.md'),
			name: 'Test Mode',
			description: 'A test custom mode',
			tools: ['tool1', 'tool2'],
			body: 'Custom mode body'
		};

		promptsService.setCustomModes([customMode]);

		// Wait for the service to refresh
		await timeout(0);

		const modes = chatModeService.getModes();
		assert.strictEqual(modes.custom.length, 1);

		const testMode = modes.custom[0];
		assert.strictEqual(testMode.id, customMode.uri.toString());
		assert.strictEqual(testMode.name, customMode.name);
		assert.strictEqual(testMode.label, customMode.name);
		assert.strictEqual(testMode.description.get(), customMode.description);
		assert.strictEqual(testMode.kind, ChatModeKind.Agent);
		assert.deepStrictEqual(testMode.customTools?.get(), customMode.tools);
		assert.strictEqual(testMode.body?.get(), customMode.body);
		assert.strictEqual(testMode.uri?.get().toString(), customMode.uri.toString());
	});

	test('should fire change event when custom modes are updated', async () => {
		let eventFired = false;
		testDisposables.add(chatModeService.onDidChangeChatModes(() => {
			eventFired = true;
		}));

		const customMode: ICustomChatMode = {
			uri: URI.parse('file:///test/custom-mode.md'),
			name: 'Test Mode',
			description: 'A test custom mode',
			tools: [],
			body: 'Custom mode body'
		};

		promptsService.setCustomModes([customMode]);

		// Wait for the event to fire
		await timeout(0);

		assert.ok(eventFired);
	});

	test('should find custom modes by id', async () => {
		const customMode: ICustomChatMode = {
			uri: URI.parse('file:///test/findable-mode.md'),
			name: 'Findable Mode',
			description: 'A findable custom mode',
			tools: [],
			body: 'Findable mode body'
		};

		promptsService.setCustomModes([customMode]);

		// Wait for the service to refresh
		await timeout(0);

		const foundMode = chatModeService.findModeById(customMode.uri.toString());
		assert.ok(foundMode);
		assert.strictEqual(foundMode.id, customMode.uri.toString());
		assert.strictEqual(foundMode.name, customMode.name);
		assert.strictEqual(foundMode.label, customMode.name);
	});

	test('should update existing custom mode instances when data changes', async () => {
		const uri = URI.parse('file:///test/updateable-mode.md');
		const initialMode: ICustomChatMode = {
			uri,
			name: 'Initial Mode',
			description: 'Initial description',
			tools: ['tool1'],
			body: 'Initial body',
			model: 'gpt-4'
		};

		promptsService.setCustomModes([initialMode]);
		await timeout(0);

		const initialModes = chatModeService.getModes();
		const initialCustomMode = initialModes.custom[0];
		assert.strictEqual(initialCustomMode.description.get(), 'Initial description');

		// Update the mode data
		const updatedMode: ICustomChatMode = {
			...initialMode,
			description: 'Updated description',
			tools: ['tool1', 'tool2'],
			body: 'Updated body',
			model: 'Updated model'
		};

		promptsService.setCustomModes([updatedMode]);
		await timeout(0);

		const updatedModes = chatModeService.getModes();
		const updatedCustomMode = updatedModes.custom[0];

		// The instance should be the same (reused)
		assert.strictEqual(initialCustomMode, updatedCustomMode);

		// But the observable properties should be updated
		assert.strictEqual(updatedCustomMode.description.get(), 'Updated description');
		assert.deepStrictEqual(updatedCustomMode.customTools?.get(), ['tool1', 'tool2']);
		assert.strictEqual(updatedCustomMode.body?.get(), 'Updated body');
		assert.strictEqual(updatedCustomMode.model?.get(), 'Updated model');
	});

	test('should remove custom modes that no longer exist', async () => {
		const mode1: ICustomChatMode = {
			uri: URI.parse('file:///test/mode1.md'),
			name: 'Mode 1',
			description: 'First mode',
			tools: [],
			body: 'Mode 1 body'
		};

		const mode2: ICustomChatMode = {
			uri: URI.parse('file:///test/mode2.md'),
			name: 'Mode 2',
			description: 'Second mode',
			tools: [],
			body: 'Mode 2 body'
		};

		// Add both modes
		promptsService.setCustomModes([mode1, mode2]);
		await timeout(0);

		let modes = chatModeService.getModes();
		assert.strictEqual(modes.custom.length, 2);

		// Remove one mode
		promptsService.setCustomModes([mode1]);
		await timeout(0);

		modes = chatModeService.getModes();
		assert.strictEqual(modes.custom.length, 1);
		assert.strictEqual(modes.custom[0].id, mode1.uri.toString());
	});
});
