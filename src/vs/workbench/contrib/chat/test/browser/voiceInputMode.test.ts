/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { EventType as TouchEventType, Gesture } from '../../../../../base/browser/touch.js';
import { Action } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextKeyExpression, ContextKeyValue } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { AGENTS_VOICE_CONNECTED, AGENTS_VOICE_ENTITLED } from '../../../agentsVoice/common/agentsVoice.js';
import { IMicCaptureService } from '../../browser/voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../browser/voiceClient/ttsPlaybackService.js';
import { IVoiceSessionController } from '../../browser/voiceClient/voiceSessionController.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from '../../browser/speechToText/chatSpeechToTextService.js';
import { IVoiceInputModeService, VoiceInputModeService } from '../../browser/voiceInputMode/voiceInputMode.js';
import { VoiceInputModeActionViewItem } from '../../browser/voiceInputMode/voiceInputModeActionViewItem.js';
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

		values[AGENTS_VOICE_CONNECTED.key] = true;
		assert.strictEqual(matches(SegmentedVoiceInputModePillActive), true);
		assert.strictEqual(matches(SegmentedVoiceInputModePillInactive), false);
	});
});

suite('VoiceInputModeActionViewItem', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('touch activates Voice power and mute exactly once', () => {
		const ignoredTargets = new Set<HTMLElement>();
		sinon.stub(Gesture, 'ignoreTarget').callsFake(element => {
			ignoredTargets.add(element);
			return { dispose: () => ignoredTargets.delete(element) };
		});
		sinon.stub(Gesture, 'addTarget').callsFake(element => dom.addDisposableListener(element, 'touchend', event => {
			const target = event.target;
			if (target instanceof Node && [...ignoredTargets].some(ignoredTarget => ignoredTarget.contains(target))) {
				return;
			}
			element.dispatchEvent(new CustomEvent(TouchEventType.Tap));
			event.preventDefault();
		}));

		const selectedMode = observableValue<'dictation' | 'voice'>('selectedMode', 'voice');
		const voiceInputModeService = upcastPartial<IVoiceInputModeService>({
			selectedMode,
			voiceAvailable: observableValue('voiceAvailable', true),
			dictationAvailable: observableValue('dictationAvailable', true),
			handsFree: observableValue('handsFree', true),
			simulatedVoiceState: observableValue('simulatedVoiceState', undefined),
			simulatedHandsFree: observableValue('simulatedHandsFree', undefined),
			simulatedVersion: observableValue('simulatedVersion', undefined),
			simulatedHover: observableValue('simulatedHover', false),
			setSelectedMode: mode => selectedMode.set(mode, undefined),
		});
		const isConnected = observableValue('isConnected', true);
		const isMuted = observableValue('isMuted', false);
		let voicePowerCount = 0;
		let muteCount = 0;
		const voiceSessionController = upcastPartial<IVoiceSessionController>({
			isConnected,
			isConnecting: observableValue('isConnecting', false),
			isReconnecting: observableValue('isReconnecting', false),
			isMuted,
			voiceState: observableValue('voiceState', 'idle'),
			disconnect: () => voicePowerCount++,
			setMuted: () => muteCount++,
		});
		const chatSpeechToTextService = upcastPartial<IChatSpeechToTextService>({
			onDidChangeState: Event.None,
			onDidChangePreparingModel: Event.None,
			onDidChangeDownloadingModel: Event.None,
			state: ChatSpeechToTextState.Idle,
			currentSurface: undefined,
			isPreparingModel: false,
			isDownloadingModel: false,
		});
		const action = store.add(new Action('voiceInputMode', 'Voice Input Mode'));
		const viewItem = store.add(new VoiceInputModeActionViewItem(
			action,
			undefined,
			voiceInputModeService,
			voiceSessionController,
			upcastPartial<ICommandService>({ executeCommand: async () => undefined }),
			new TestConfigurationService(),
			new MockKeybindingService() as IKeybindingService,
			upcastPartial<IContextMenuService>({}),
			NullHoverService as IHoverService,
			upcastPartial<IMicCaptureService>({ analyserNode: undefined }),
			upcastPartial<ITtsPlaybackService>({ analyserNode: undefined }),
			chatSpeechToTextService,
			new TestAccessibilityService() as IAccessibilityService,
			new TestThemeService() as IThemeService,
		));
		const container = dom.append(document.body, dom.$('.action-item'));
		store.add({ dispose: () => container.remove() });
		viewItem.render(container);

		const touch = (selector: string) => {
			const button = container.querySelector<HTMLButtonElement>(selector)!;
			const touchEnd = new (dom.getWindow(button).Event)('touchend', { bubbles: true, cancelable: true });
			button.dispatchEvent(touchEnd);
			if (!touchEnd.defaultPrevented) {
				button.click();
			}
		};
		touch('.chat-voice-input-mode-cell.voice');
		touch('.chat-voice-input-mode-cell.mute');

		assert.deepStrictEqual({ voicePowerCount, muteCount }, { voicePowerCount: 1, muteCount: 1 });
	});
});
