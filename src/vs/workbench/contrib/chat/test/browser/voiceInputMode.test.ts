/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from '../../browser/speechToText/chatSpeechToTextService.js';
import { VoiceInputModeService } from '../../browser/voiceInputMode/voiceInputMode.js';

suite('VoiceInputModeService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createDictationService(configured: boolean): IChatSpeechToTextService {
		return {
			onDidChangeState: store.add(new Emitter<ChatSpeechToTextState>()).event,
			get state() { return ChatSpeechToTextState.Idle; },
			get isConfigured() { return configured; },
		} as IChatSpeechToTextService;
	}

	function createService(options: { voiceEnabled?: boolean; dictationConfigured?: boolean } = {}) {
		const storageService = store.add(new TestStorageService());
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration('agents.voice.enabled', options.voiceEnabled ?? false);
		const contextKeyService = new MockContextKeyService();
		const dictationService = createDictationService(options.dictationConfigured ?? false);
		const service = store.add(new VoiceInputModeService(storageService, configurationService, contextKeyService, dictationService));
		return { service, contextKeyService };
	}

	test('defaults to voice and mirrors selection into the context key', () => {
		const { service, contextKeyService } = createService();
		assert.strictEqual(service.selectedMode.get(), 'voice');
		assert.strictEqual(contextKeyService.getContextKeyValue('chatVoiceInputMode'), 'voice');

		service.setSelectedMode('dictation');
		assert.strictEqual(service.selectedMode.get(), 'dictation');
		assert.strictEqual(contextKeyService.getContextKeyValue('chatVoiceInputMode'), 'dictation');
	});

	test('reflects mode availability from config and dictation service', () => {
		const { service } = createService({ voiceEnabled: true, dictationConfigured: true });
		assert.deepStrictEqual(
			{ voice: service.voiceAvailable.get(), dictation: service.dictationAvailable.get() },
			{ voice: true, dictation: true }
		);

		const { service: unavailable } = createService({ voiceEnabled: false, dictationConfigured: false });
		assert.deepStrictEqual(
			{ voice: unavailable.voiceAvailable.get(), dictation: unavailable.dictationAvailable.get() },
			{ voice: false, dictation: false }
		);
	});
});
