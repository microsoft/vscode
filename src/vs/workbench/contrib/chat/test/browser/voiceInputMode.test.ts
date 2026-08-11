/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyExpression, ContextKeyValue } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { AGENTS_VOICE_CONNECTED, AGENTS_VOICE_ENTITLED } from '../../../agentsVoice/common/agentsVoice.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from '../../browser/speechToText/chatSpeechToTextService.js';
import { VoiceInputModeService } from '../../browser/voiceInputMode/voiceInputMode.js';
import { SegmentedVoiceInputModePillActive, SegmentedVoiceInputModePillInactive } from '../../browser/voiceInputMode/voiceInputModeContextKeys.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

suite('VoiceInputModeService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createDictationService(configured: boolean): IChatSpeechToTextService {
		return {
			onDidChangeState: store.add(new Emitter<ChatSpeechToTextState>()).event,
			get state() { return ChatSpeechToTextState.Idle; },
			get isConfigured() { return configured; },
		} as IChatSpeechToTextService;
	}

	function createService(options: { voiceEnabled?: boolean; voiceButtonShown?: boolean; dictationConfigured?: boolean; dictationButtonShown?: boolean } = {}) {
		const storageService = store.add(new TestStorageService());
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration('agents.voice.enabled', options.voiceEnabled ?? false);
		configurationService.setUserConfiguration('agents.voice.showButton', options.voiceButtonShown ?? true);
		configurationService.setUserConfiguration('dictation.showButton', options.dictationButtonShown ?? true);
		const contextKeyService = new MockContextKeyService();
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		AGENTS_VOICE_ENTITLED.bindTo(contextKeyService).set(true);
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

	test('excludes hidden controls from mode availability', () => {
		const { service } = createService({
			voiceEnabled: true,
			voiceButtonShown: false,
			dictationConfigured: true,
			dictationButtonShown: false,
		});

		assert.deepStrictEqual(
			{ voice: service.voiceAvailable.get(), dictation: service.dictationAvailable.get() },
			{ voice: false, dictation: false }
		);
	});

	test('shows the segmented pill only when it has multiple active controls', () => {
		const values: Record<string, ContextKeyValue> = {
			[ChatContextKeys.enabled.key]: true,
			[AGENTS_VOICE_ENTITLED.key]: true,
			[ChatContextKeys.speechToTextConfigured.key]: true,
			'config.agents.voice.enabled': true,
			'config.agents.voice.showButton': true,
			'config.dictation.showButton': true,
			'config.agents.voice.handsFree': true,
			[AGENTS_VOICE_CONNECTED.key]: false,
		};
		const matches = (expression: ContextKeyExpression) => expression.evaluate({
			getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string) => values[key] as T,
		});

		assert.strictEqual(matches(SegmentedVoiceInputModePillActive), true);
		assert.strictEqual(matches(SegmentedVoiceInputModePillInactive), false);

		values[ChatContextKeys.speechToTextConfigured.key] = false;
		assert.strictEqual(matches(SegmentedVoiceInputModePillActive), false);
		assert.strictEqual(matches(SegmentedVoiceInputModePillInactive), true);

		values['config.agents.voice.handsFree'] = false;
		values[AGENTS_VOICE_CONNECTED.key] = true;
		assert.strictEqual(matches(SegmentedVoiceInputModePillActive), true);
		assert.strictEqual(matches(SegmentedVoiceInputModePillInactive), false);
	});
});
