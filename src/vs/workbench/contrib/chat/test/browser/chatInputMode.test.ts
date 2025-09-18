/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IChatService } from '../../common/chatService.js';
import { MockChatService } from '../common/mockChatService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

// Basic sanity tests for the new chat.input.mode setting and keybinding remapping.
// These tests do not simulate full widget interactions, but ensure that
// the keybinding labels adapt when the configuration toggles.

suite('ChatInputMode', () => {
	let store: DisposableStore;
	let configurationService: TestConfigurationService;
	let keybindingService: IKeybindingService;

	setup(() => {
		store = new DisposableStore();
		configurationService = new TestConfigurationService();
		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(configurationService)),
			configurationService: () => configurationService,
		}, store);
		instaService.stub(IChatService, new MockChatService());
		store.add(instaService);
		keybindingService = instaService.get(IKeybindingService);
	});

	teardown(() => store.dispose());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Default is singleLine', () => {
		assert.strictEqual(configurationService.getValue('chat.input.mode'), undefined, 'Test config returns undefined until requested default');
		// Updating to get default value semantics: config service returns default after registration (happens during import of chat code)
		configurationService.onDidChangeConfigurationEmitter.fire({} as any);
		const bindings = keybindingService.lookupKeybindings('workbench.action.chat.submit');
		// Expect to find a plain Enter binding (platform-specific label contains Enter without Ctrl/Cmd)
		const hasPlainEnter = bindings.some(kb => /(^|\s)Enter$/.test(kb.getAriaLabel() ?? ''));
		assert.ok(hasPlainEnter, 'Expected plain Enter keybinding when in singleLine mode');
	});

	test('Switch to multiLine changes submit keybinding to Ctrl/Cmd+Enter', async () => {
		await configurationService.updateValue('chat.input.mode', 'multiLine');
		const bindings = keybindingService.lookupKeybindings('workbench.action.chat.submit');
		const hasChord = bindings.some(kb => /(Ctrl|⌘).*Enter/.test(kb.getAriaLabel() ?? ''));
		assert.ok(hasChord, 'Expected Ctrl/Cmd+Enter keybinding when in multiLine mode');
	});
});
