/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { AgentsVoiceStorageKeys } from '../../common/agentsVoice.js';
import { IVoiceSessionController, VoiceState } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { VoiceModeOnboardingBanner, VoiceModeOnboardingService } from '../../browser/voiceModeOnboarding.js';
import { isChatInputStackSlotShowing } from '../../../chat/browser/widget/input/chatInputStack.js';

suite('Voice Mode onboarding', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface ITestHost { root: HTMLElement; container: HTMLElement; focused: number }
	interface ITelemetryEvent { readonly name: string; readonly data: unknown }

	class TestTelemetryService extends NullTelemetryServiceShape {
		constructor(private readonly events: ITelemetryEvent[]) {
			super();
		}

		override publicLog2(eventName?: string, data?: unknown): void {
			if (eventName) {
				this.events.push({ name: eventName, data });
			}
		}
	}

	function createHost(store: Pick<DisposableStore, 'add'>): ITestHost {
		const root = dom.$('div');
		root.tabIndex = 0;
		const container = dom.append(root, dom.$('.voice-mode-onboarding-container'));
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		return { root, container, focused: 0 };
	}

	function register(service: VoiceModeOnboardingService, host: ITestHost) {
		return service.registerHost({
			container: host.container,
			focusRoot: host.root,
			focus: () => {
				host.focused++;
				host.root.focus();
			},
		});
	}

	function createTestInstantiationService(store: Pick<DisposableStore, 'add'>, screenReaderOptimized = false) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IAccessibilityService, new class extends mock<IAccessibilityService>() {
			override readonly onDidChangeScreenReaderOptimized = Event.None;
			override readonly onDidChangeReducedMotion = Event.None;
			override isScreenReaderOptimized(): boolean { return screenReaderOptimized; }
			override isMotionReduced(): boolean { return false; }
		});
		return instantiationService;
	}

	function createService(store: Pick<DisposableStore, 'add'>, executed: string[] = [], holds: boolean[] = [], telemetryEvents: ITelemetryEvent[] = [], screenReaderOptimized = false): VoiceModeOnboardingService {
		const instantiationService = createTestInstantiationService(store, screenReaderOptimized);
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override executeCommand(id: string): Promise<undefined> {
				executed.push(id);
				return Promise.resolve(undefined);
			}
		});
		instantiationService.stub(IVoiceSessionController, new class extends mock<IVoiceSessionController>() {
			override readonly voiceState = constObservable<VoiceState>('idle');
			override setAutoListenHeld(held: boolean): void { holds.push(held); }
			override stopListening(): void { }
			override pttDown(): void { }
			override pttUp(): void { }
		});
		instantiationService.stub(ITelemetryService, new TestTelemetryService(telemetryEvents));
		return store.add(instantiationService.createInstance(VoiceModeOnboardingService));
	}

	test('auditions a voice, dismisses, and never returns', () => {
		const telemetryEvents: ITelemetryEvent[] = [];
		const service = createService(disposables, [], [], telemetryEvents);
		const host = createHost(disposables);
		disposables.add(register(service, host));

		service.showIfNeeded();
		const shown = isChatInputStackSlotShowing(host.container);

		// Nothing is chosen until the user chooses: the card asks a question
		// rather than arriving with an answer already filled in.
		const selectedOnOpen = host.container.querySelectorAll('.voice-mode-onboarding-voice.selected').length;
		const voices = [...host.container.querySelectorAll<HTMLElement>('.voice-mode-onboarding-voice-label')].map(element => element.textContent);
		const voicesLabel = host.container.querySelector<HTMLElement>('.voice-mode-onboarding-voices-label')?.textContent;
		const microphonePicker = host.container.querySelector<HTMLElement>('.voice-mode-onboarding-microphone-picker');
		const microphonePickerHidden = microphonePicker?.hidden;
		const microphonePickerDisplay = microphonePicker && dom.getWindow(microphonePicker).getComputedStyle(microphonePicker).display;
		host.container.querySelector<HTMLElement>('.voice-mode-onboarding-voice')!.click();
		const selectedAfterPick = host.container.querySelectorAll('.voice-mode-onboarding-voice.selected').length;

		// Dismissal is never gated, and having been seen it must not come back.
		host.container.querySelector<HTMLElement>('.voice-mode-onboarding-close')!.click();
		const shownAfterClose = isChatInputStackSlotShowing(host.container);
		service.showIfNeeded();
		const shownAgain = isChatInputStackSlotShowing(host.container);

		assert.deepStrictEqual(
			{
				shown,
				microphonePickerHidden,
				microphonePickerDisplay,
				selectedOnOpen,
				voices,
				voicesLabel,
				selectedAfterPick,
				shownAfterClose,
				shownAgain,
				telemetryEvents,
			},
			{
				shown: true,
				microphonePickerHidden: true,
				microphonePickerDisplay: 'none',
				selectedOnOpen: 0,
				voices: ['Birch (Default)', 'Harper', 'Oak', 'Junho'],
				voicesLabel: 'Agent Voice:',
				selectedAfterPick: 1,
				shownAfterClose: false,
				shownAgain: false,
				telemetryEvents: [
					{ name: 'voiceModeOnboarding.action', data: { action: 'shown', source: 'automatic' } },
					{ name: 'voiceModeOnboarding.action', data: { action: 'selectVoice', source: 'automatic' } },
					{ name: 'voiceModeOnboarding.action', data: { action: 'close', source: 'automatic' } },
				],
			});
	});

	test('clicking the playing voice stops its preview without changing the selection', () => {
		const instantiationService = createTestInstantiationService(disposables);

		const audio = document.createElement('audio');
		let playCount = 0;
		let pauseCount = 0;
		audio.play = () => {
			playCount++;
			return Promise.resolve();
		};
		audio.pause = () => pauseCount++;

		const host = createHost(disposables);
		disposables.add(instantiationService.createInstance(VoiceModeOnboardingBanner, {
			container: host.container,
			onDismiss: () => undefined,
			source: 'manual',
			audioFactory: () => audio,
		}));

		const defaultVoiceOption = host.container.querySelector<HTMLElement>('.voice-mode-onboarding-voice')!;
		defaultVoiceOption.click();
		const playingAfterFirstClick = defaultVoiceOption.classList.contains('playing');
		const ariaLabelAfterFirstClick = defaultVoiceOption.getAttribute('aria-label');
		defaultVoiceOption.click();

		assert.deepStrictEqual(
			{
				label: defaultVoiceOption.querySelector('.voice-mode-onboarding-voice-label')?.textContent,
				playCount,
				pauseCount,
				playingAfterFirstClick,
				ariaLabelAfterFirstClick,
				playingAfterSecondClick: defaultVoiceOption.classList.contains('playing'),
				ariaLabelAfterSecondClick: defaultVoiceOption.getAttribute('aria-label'),
				selectedAfterSecondClick: defaultVoiceOption.classList.contains('selected'),
			},
			{
				label: 'Birch (Default)',
				playCount: 1,
				pauseCount: 1,
				playingAfterFirstClick: true,
				ariaLabelAfterFirstClick: 'Stop Birch (Default) preview.',
				playingAfterSecondClick: false,
				ariaLabelAfterSecondClick: 'Birch (Default). Hear this voice and use it for every conversation.',
				selectedAfterSecondClick: true,
			});
	});

	test('previews the native voice per language and keeps the chooser only for English', () => {
		const instantiationService = createTestInstantiationService(disposables);

		// A language Voice Mode speaks natively shows its one voice with no
		// chooser; English and languages without a native voice keep the four.
		const cases = [
			{ language: 'de-DE', options: 1, chooser: false, sample: 'de_marc_neutral.mp3' },
			{ language: 'es-MX', options: 1, chooser: false, sample: 'es-ES_maria_neutral.mp3' },
			{ language: 'fr-CA', options: 1, chooser: false, sample: 'fr_david_neutral.mp3' },
			{ language: 'it-IT', options: 1, chooser: false, sample: 'it_eva_neutral.mp3' },
			{ language: 'ja-JP', options: 1, chooser: false, sample: 'ja_aruha_neutral.mp3' },
			{ language: 'ko-KR', options: 1, chooser: false, sample: 'ko_jiyon_neutral.mp3' },
			{ language: 'pt-PT', options: 1, chooser: false, sample: 'pt-BR_gil_neutral.mp3' },
			{ language: 'zh-TW', options: 1, chooser: false, sample: 'zh_wuzhi_neutral.mp3' },
			{ language: 'en-GB', options: 4, chooser: true, sample: 'maya_neutral.mp3' },
			{ language: 'is', options: 4, chooser: true, sample: 'maya_neutral.mp3' },
		];
		const actual: { language: string; options: number; chooser: boolean; sample: string }[] = [];

		for (const { language } of cases) {
			const host = createHost(disposables);
			const audio = document.createElement('audio');
			audio.play = () => Promise.resolve();
			disposables.add(instantiationService.createInstance(VoiceModeOnboardingBanner, {
				container: host.container,
				onDismiss: () => undefined,
				source: 'manual',
				audioFactory: () => audio,
				voiceLanguage: language,
			}));

			const options = host.container.querySelectorAll('.voice-mode-onboarding-voice').length;
			const chooser = !!host.container.querySelector('.voice-mode-onboarding-voices[role="radiogroup"]');
			host.container.querySelector<HTMLElement>('.voice-mode-onboarding-voice')!.click();
			const sample = audio.src.split(/[?#]/)[0].split('/').pop() ?? '';
			actual.push({ language, options, chooser, sample });
		}

		assert.deepStrictEqual(actual, cases);
	});

	test('swaps the chips when the spoken language changes', () => {
		const instantiationService = createTestInstantiationService(disposables);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration('agents.voice.language', 'en');
		instantiationService.stub(IConfigurationService, configurationService);

		const host = createHost(disposables);
		const audio = document.createElement('audio');
		audio.play = () => Promise.resolve();
		disposables.add(instantiationService.createInstance(VoiceModeOnboardingBanner, {
			container: host.container,
			onDismiss: () => undefined,
			source: 'manual',
			audioFactory: () => audio,
		}));

		const countVoices = () => host.container.querySelectorAll('.voice-mode-onboarding-voice').length;
		const englishOptions = countVoices();

		configurationService.setUserConfiguration('agents.voice.language', 'zh');
		configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set(['agents.voice.language']),
			change: { keys: ['agents.voice.language'], overrides: [] },
			affectsConfiguration: candidate => candidate === 'agents.voice.language',
		});
		const chineseOptions = countVoices();
		host.container.querySelector<HTMLElement>('.voice-mode-onboarding-voice')!.click();
		const chineseSample = audio.src.split(/[?#]/)[0].split('/').pop() ?? '';

		assert.deepStrictEqual(
			{ englishOptions, chineseOptions, chineseSample },
			{ englishOptions: 4, chineseOptions: 1, chineseSample: 'zh_wuzhi_neutral.mp3' });
	});

	test('can be shown again manually', () => {
		const telemetryEvents: ITelemetryEvent[] = [];
		const service = createService(disposables, [], [], telemetryEvents);
		const host = createHost(disposables);
		disposables.add(register(service, host));

		const shown = service.show();
		host.container.querySelector<HTMLElement>('.voice-mode-onboarding-close')!.click();

		assert.deepStrictEqual(
			{ shown, telemetryEvents },
			{
				shown: true,
				telemetryEvents: [
					{ name: 'voiceModeOnboarding.action', data: { action: 'shown', source: 'manual' } },
					{ name: 'voiceModeOnboarding.action', data: { action: 'close', source: 'manual' } },
				],
			});
	});

	test('can be dismissed without choosing a voice', () => {
		const service = createService(disposables);
		const host = createHost(disposables);
		disposables.add(register(service, host));

		service.showIfNeeded();
		host.container.querySelector<HTMLElement>('.voice-mode-onboarding-close')!.click();

		assert.strictEqual(isChatInputStackSlotShowing(host.container), false);
	});

	test('places the introduction in the tab order', () => {
		const service = createService(disposables);
		const host = createHost(disposables);
		disposables.add(register(service, host));

		service.show();
		const card = host.container.querySelector<HTMLElement>('.voice-mode-onboarding-banner');

		assert.deepStrictEqual(
			{
				activeElement: document.activeElement,
				card,
				tabIndex: card?.tabIndex,
				closeIcon: host.container.querySelector('.voice-mode-onboarding-close')?.className,
				listeningNotice: host.container.querySelector('.voice-mode-onboarding-listening-notice'),
			},
			{
				activeElement: document.body,
				card,
				tabIndex: 0,
				closeIcon: 'action-label codicon codicon-close-compact voice-mode-onboarding-close chat-input-notice-dismiss',
				listeningNotice: null,
			});
	});

	test('asking twice in one session leaves exactly one card', () => {
		const service = createService(disposables);
		const host = createHost(disposables);
		disposables.add(register(service, host));

		// Voice Mode reports connecting and then connected, so the trigger fires
		// more than once for a single session start.
		service.showIfNeeded();
		service.showIfNeeded();

		assert.deepStrictEqual(
			{
				visible: isChatInputStackSlotShowing(host.container),
				cards: host.container.querySelectorAll('.voice-mode-onboarding-banner').length,
			},
			{ visible: true, cards: 1 });
	});

	test('keeps its one showing when there is no chat to dock to', () => {
		const service = createService(disposables);

		// Nothing registered yet: the introduction cannot be shown, and must not
		// burn its single appearance doing nothing.
		service.showIfNeeded();

		const host = createHost(disposables);
		disposables.add(register(service, host));
		service.showIfNeeded();

		assert.strictEqual(isChatInputStackSlotShowing(host.container), true);
	});

	test('the description links open Voice Mode settings and instructions', () => {
		const executed: string[] = [];
		const service = createService(disposables, executed);
		const host = createHost(disposables);
		disposables.add(register(service, host));

		service.showIfNeeded();
		const links = [...host.container.querySelectorAll<HTMLElement>('.voice-mode-onboarding-description a')];
		for (const link of links) {
			link.click();
		}

		assert.deepStrictEqual(
			{ labels: links.map(link => link.textContent), executed },
			{
				labels: ['settings', 'how it\'s written'],
				executed: ['agentsVoice.openSettings', 'workbench.action.chat.configureVoiceInstructions'],
			});
	});

	test('does not block Voice Mode from listening while the card is up', () => {
		const holds: boolean[] = [];
		const service = createService(disposables, [], holds);
		const host = createHost(disposables);
		disposables.add(register(service, host));

		service.showIfNeeded();
		host.container.querySelector<HTMLElement>('.voice-mode-onboarding-close')!.click();

		assert.deepStrictEqual(holds, []);
	});

	test('the one appearance is only spent once the card is really up', () => {
		// The guarantee is ordering. Anything the card needs at construction can
		// throw, and if the key were written first the user would silently lose
		// their only showing - so by the time it is written the card must already
		// be built and attached.
		let cardWhenStored: { visible: boolean; cards: number } | undefined;
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IVoiceSessionController, new class extends mock<IVoiceSessionController>() {
			override readonly voiceState = constObservable<VoiceState>('idle');
			override setAutoListenHeld(): void { }
			override stopListening(): void { }
		});
		const host = createHost(disposables);
		const storageService = instantiationService.get(IStorageService);
		const store = storageService.store.bind(storageService);
		instantiationService.stub(IStorageService, new Proxy(storageService, {
			get: (target, property, receiver) => property === 'store'
				? (key: string, value: boolean, scope: StorageScope, target2: StorageTarget) => {
					if (key === AgentsVoiceStorageKeys.IntroBannerShown) {
						cardWhenStored = {
							visible: isChatInputStackSlotShowing(host.container),
							cards: host.container.querySelectorAll('.voice-mode-onboarding-banner').length,
						};
					}
					store(key, value, scope, target2);
				}
				: Reflect.get(target, property, receiver),
		}));

		const service = disposables.add(instantiationService.createInstance(VoiceModeOnboardingService));
		disposables.add(register(service, host));
		service.showIfNeeded();

		assert.deepStrictEqual(cardWhenStored, { visible: true, cards: 1 });
	});

	test('hands focus back to the chat input when dismissed from the keyboard', () => {
		const service = createService(disposables);
		const host = createHost(disposables);
		disposables.add(register(service, host));

		service.showIfNeeded();
		const close = host.container.querySelector<HTMLElement>('.voice-mode-onboarding-close')!;
		close.focus();
		const dismissedFromInside = dom.isAncestorOfActiveElement(host.container);
		close.click();

		// Dismissing from inside the card must not drop the caret on the body.
		assert.deepStrictEqual(
			{ dismissedFromInside, focused: host.focused },
			{ dismissedFromInside: true, focused: 1 });
	});

	test('leaves focus alone when the card is dismissed from elsewhere', () => {
		const service = createService(disposables);
		const host = createHost(disposables);
		disposables.add(register(service, host));

		service.showIfNeeded();
		const elsewhere = document.body.appendChild(dom.$('div'));
		disposables.add(toDisposable(() => elsewhere.remove()));
		elsewhere.tabIndex = 0;
		elsewhere.focus();
		host.container.querySelector<HTMLElement>('.voice-mode-onboarding-close')!.click();

		// The user already moved on; yanking the caret back would be rude.
		assert.strictEqual(host.focused, 0);
	});

	test('attaches to the most recently focused host', () => {
		const service = createService(disposables);
		const first = createHost(disposables);
		const second = createHost(disposables);
		disposables.add(register(service, first));
		disposables.add(register(service, second));

		// The renderer running these tests does not reliably hand out real focus,
		// so raise the same event the focus tracker listens for.
		second.root.focus();
		second.root.dispatchEvent(new FocusEvent('focus'));
		service.showIfNeeded();

		assert.deepStrictEqual(
			{
				first: isChatInputStackSlotShowing(first.container),
				second: isChatInputStackSlotShowing(second.container),
			},
			{ first: false, second: true });
	});
});
