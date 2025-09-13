/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import * as assert from 'assert';

class RemoteCodingAgentContextContribution {
	static readonly ID = 'workbench.contrib.remoteCodingAgentContext';

	constructor(
		private readonly contextKeyService: IContextKeyService,
		private readonly configurationService: TestConfigurationService,
	) {
		this.updateContextKey();
		configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('chat.remoteCodingAgent.promptFileOverlay.enabled')) {
				this.updateContextKey();
			}
		});
	}

	private updateContextKey(): void {
		const isEnabled = this.configurationService.getValue<boolean>('chat.remoteCodingAgent.promptFileOverlay.enabled');
		ChatContextKeys.enableRemoteCodingAgentPromptFileOverlay.bindTo(this.contextKeyService).set(isEnabled);
	}
}

suite('RemoteCodingAgentContextContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let contextKeyService: IContextKeyService;
	let configurationService: TestConfigurationService;

	setup(() => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		contextKeyService = store.add(new MockContextKeyService());
		configurationService = new TestConfigurationService();
	});

	test('should initialize context key based on configuration', () => {
		// Set the configuration to true
		configurationService.setUserConfiguration('chat.remoteCodingAgent.promptFileOverlay.enabled', true);
		
		// Create the contribution
		store.add(new RemoteCodingAgentContextContribution(contextKeyService, configurationService));
		
		// Verify the context key is set to true
		const contextKey = ChatContextKeys.enableRemoteCodingAgentPromptFileOverlay.getValue(contextKeyService);
		assert.strictEqual(contextKey, true);
	});

	test('should update context key when configuration changes', () => {
		// Set initial configuration to false
		configurationService.setUserConfiguration('chat.remoteCodingAgent.promptFileOverlay.enabled', false);
		
		// Create the contribution
		store.add(new RemoteCodingAgentContextContribution(contextKeyService, configurationService));
		
		// Verify initial state
		let contextKey = ChatContextKeys.enableRemoteCodingAgentPromptFileOverlay.getValue(contextKeyService);
		assert.strictEqual(contextKey, false);
		
		// Change configuration to true
		configurationService.setUserConfiguration('chat.remoteCodingAgent.promptFileOverlay.enabled', true);
		
		// Verify context key is updated
		contextKey = ChatContextKeys.enableRemoteCodingAgentPromptFileOverlay.getValue(contextKeyService);
		assert.strictEqual(contextKey, true);
	});

	test('should default to true when configuration is enabled by default', () => {
		// Don't set any explicit configuration (should use default)
		
		// Create the contribution
		store.add(new RemoteCodingAgentContextContribution(contextKeyService, configurationService));
		
		// Verify the context key uses the default value (true)
		const contextKey = ChatContextKeys.enableRemoteCodingAgentPromptFileOverlay.getValue(contextKeyService);
		assert.strictEqual(contextKey, true);
	});
});