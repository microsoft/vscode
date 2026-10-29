/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { buildMicrophoneOptions, DictationOnboardingBanner, DictationOnboardingService, indexOfMicrophone } from '../../browser/speechToText/dictationOnboarding.js';
import { isChatInputStackSlotShowing } from '../../browser/widget/input/chatInputStack.js';

/** Minimal stand-in for the browser's device descriptor. */
function device(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
	return { kind, deviceId, label, groupId: '', toJSON: () => ({}) };
}

suite('Dictation onboarding', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
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

	function createHost(store: Pick<DisposableStore, 'add'>): { root: HTMLElement; container: HTMLElement } {
		const root = dom.$('div');
		root.tabIndex = 0;
		const container = dom.append(root, dom.$('.dictation-onboarding-container'));
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		return { root, container };
	}

	function createService(store: Pick<DisposableStore, 'add'>, executed?: string[], telemetryEvents: ITelemetryEvent[] = []): DictationOnboardingService {
		const instantiationService = workbenchInstantiationService(undefined, store);
		if (executed) {
			instantiationService.stub(ICommandService, {
				executeCommand: async (id: string) => { executed.push(id); },
			} as unknown as ICommandService);
		}
		instantiationService.stub(ITelemetryService, new TestTelemetryService(telemetryEvents));
		return store.add(instantiationService.createInstance(DictationOnboardingService));
	}

	test('labels the physical default microphone without listing it twice', () => {
		const options = buildMicrophoneOptions([
			// The virtual entries duplicate a real device under a synthetic id.
			device('audioinput', 'default', 'Default - Studio Mic'),
			device('audioinput', 'communications', 'Communications - Studio Mic'),
			device('audioinput', 'mic-a', 'Studio Mic'),
			// Same device reported twice, and a device that is not a microphone.
			device('audioinput', 'mic-a', 'Studio Mic'),
			device('audiooutput', 'speaker-a', 'Speakers'),
			// Labels stay empty until permission has been granted at least once.
			device('audioinput', 'abcdefghij-unlabelled', ''),
		]);

		assert.deepStrictEqual(options, [
			{ deviceId: '', label: 'Studio Mic (System default)' },
			{ deviceId: 'abcdefghij-unlabelled', label: 'Unknown device (abcdefgh)' },
		]);
	});

	test('uses the first physical microphone when the virtual default has no identity', () => {
		const options = buildMicrophoneOptions([
			device('audioinput', 'default', 'System default'),
			device('audioinput', 'mic-a', 'Studio Mic'),
			device('audioinput', 'mic-b', 'Built-in Mic'),
		]);

		assert.deepStrictEqual(options, [
			{ deviceId: '', label: 'Studio Mic (System default)' },
			{ deviceId: 'mic-b', label: 'Built-in Mic' },
		]);
	});

	test('falls back to the system default when the remembered device is gone', () => {
		const options = buildMicrophoneOptions([
			device('audioinput', 'default', 'Default - Built-in Mic'),
			device('audioinput', 'built-in', 'Built-in Mic'),
			device('audioinput', 'mic-a', 'Studio Mic'),
		]);

		assert.deepStrictEqual(
			{
				remembered: indexOfMicrophone(options, 'mic-a'),
				systemDefault: indexOfMicrophone(options, ''),
				unplugged: indexOfMicrophone(options, 'mic-that-was-unplugged'),
			},
			{ remembered: 1, systemDefault: 0, unplugged: 0 });
	});

	test('shows alongside the first dictation, then never returns', () => {
		const telemetryEvents: ITelemetryEvent[] = [];
		const service = createService(disposables, undefined, telemetryEvents);
		const host = createHost(disposables);
		disposables.add(service.registerHost({ container: host.container, focusRoot: host.root }));

		const shownFirstTime = service.showIfNeeded();
		const shown = isChatInputStackSlotShowing(host.container);

		const closeIcon = host.container.querySelector('.dictation-onboarding-close')?.className;
		const hasMicrophoneControls = host.container.querySelector('.dictation-onboarding-device') !== null;
		const hasWaveform = host.container.querySelector('.dictation-onboarding-waveform') !== null;
		host.container.querySelector<HTMLElement>('.dictation-onboarding-close')!.click();
		const shownAgain = service.showIfNeeded();

		assert.deepStrictEqual(
			{
				shownFirstTime, shown, closeIcon,
				hasMicrophoneControls,
				hasWaveform,
				visibleAfterClose: isChatInputStackSlotShowing(host.container),
				shownAgain,
				telemetryEvents,
			},
			{
				shownFirstTime: true, shown: true, closeIcon: 'action-label codicon codicon-close-compact dictation-onboarding-close chat-input-notice-dismiss',
				hasMicrophoneControls: true,
				hasWaveform: true,
				visibleAfterClose: false,
				shownAgain: false,
				telemetryEvents: [
					{ name: 'dictationOnboarding.action', data: { action: 'shown', source: 'automatic' } },
					{ name: 'dictationOnboarding.action', data: { action: 'close', source: 'automatic' } },
				],
			});
	});

	test('shows populated microphone picker after dictation acquires permission without another capture', async () => {
		const host = createHost(disposables);
		let getUserMediaCalls = 0;
		const selectedDeviceIds: string[] = [];
		const mediaDevices = Object.assign(new EventTarget(), {
			enumerateDevices: async () => [
				device('audioinput', 'default', 'Default - Studio Mic'),
				device('audioinput', 'studio', 'Studio Mic'),
				device('audioinput', 'built-in', 'Built-in Mic'),
			],
			getUserMedia: async (): Promise<MediaStream> => {
				getUserMediaCalls++;
				throw new Error('Automatic onboarding must not acquire a stream');
			},
		});
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const banner = disposables.add(instantiationService.createInstance(DictationOnboardingBanner, {
			container: host.container,
			onDismiss: () => { },
			previewMicrophone: false,
			source: 'automatic',
		}, mediaDevices));

		const analyser = new class extends mock<AnalyserNode>() {
			override readonly fftSize = 256;
			override getByteTimeDomainData(): void { }
		};
		await banner.refreshMicrophones(analyser, async deviceId => {
			selectedDeviceIds.push(deviceId);
			return analyser;
		});
		const picker = host.container.querySelector<HTMLSelectElement>('.dictation-onboarding-picker select')!;
		picker.selectedIndex = 1;
		picker.dispatchEvent(new Event('change', { bubbles: true }));

		assert.deepStrictEqual(
			{
				pickerHidden: host.container.querySelector<HTMLElement>('.dictation-onboarding-picker')?.hidden,
				options: Array.from(host.container.querySelectorAll<HTMLOptionElement>('.dictation-onboarding-picker option'), option => option.textContent),
				hasWaveform: host.container.querySelector('.dictation-onboarding-waveform') !== null,
				getUserMediaCalls,
				selectedDeviceIds,
			},
			{
				pickerHidden: false,
				options: ['Studio Mic (System default)', 'Built-in Mic'],
				hasWaveform: true,
				getUserMediaCalls: 0,
				selectedDeviceIds: ['built-in'],
			});
	});

	test('keeps the picker hidden until a microphone reports a real label', async () => {
		const host = createHost(disposables);
		let labelled = false;
		const mediaDevices = Object.assign(new EventTarget(), {
			enumerateDevices: async () => labelled
				? [
					device('audioinput', 'default', 'Default - Studio Mic'),
					device('audioinput', 'studio', 'Studio Mic'),
					device('audioinput', 'built-in', 'Built-in Mic'),
				]
				: [
					device('audioinput', 'default', ''),
					device('audioinput', 'studio', ''),
					device('audioinput', 'built-in', ''),
				],
			getUserMedia: async (): Promise<MediaStream> => { throw new Error('Automatic onboarding must not acquire a stream'); },
		});
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const banner = disposables.add(instantiationService.createInstance(DictationOnboardingBanner, {
			container: host.container,
			onDismiss: () => { },
			previewMicrophone: false,
			source: 'automatic',
		}, mediaDevices));

		const analyser = new class extends mock<AnalyserNode>() {
			override readonly fftSize = 256;
			override getByteTimeDomainData(): void { }
		};
		await banner.refreshMicrophones(analyser);
		const hiddenWhileUnlabelled = host.container.querySelector<HTMLElement>('.dictation-onboarding-picker')?.hidden;

		labelled = true;
		await banner.refreshMicrophones(analyser);

		assert.deepStrictEqual(
			{
				hiddenWhileUnlabelled,
				hiddenAfterLabelled: host.container.querySelector<HTMLElement>('.dictation-onboarding-picker')?.hidden,
				options: Array.from(host.container.querySelectorAll<HTMLOptionElement>('.dictation-onboarding-picker option'), option => option.textContent),
			},
			{
				hiddenWhileUnlabelled: true,
				hiddenAfterLabelled: false,
				options: ['Studio Mic (System default)', 'Built-in Mic'],
			});
	});

	test('escape dismisses the card', () => {
		const service = createService(disposables);
		const host = createHost(disposables);
		disposables.add(service.registerHost({ container: host.container, focusRoot: host.root }));

		service.showIfNeeded();
		host.container.querySelector<HTMLElement>('.dictation-onboarding-banner')!
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));

		assert.strictEqual(isChatInputStackSlotShowing(host.container), false);
	});

	test('dictates straight away when there is no chat input to dock to', () => {
		const service = createService(disposables);

		assert.strictEqual(service.showIfNeeded(), false);
	});

	test('showing again replaces the card rather than hiding it', () => {
		const service = createService(disposables);
		const host = createHost(disposables);
		disposables.add(service.registerHost({ container: host.container, focusRoot: host.root }));

		service.show();
		service.show();

		const microphonePicker = host.container.querySelector<HTMLElement>('.dictation-onboarding-picker');
		assert.deepStrictEqual(
			{
				visible: isChatInputStackSlotShowing(host.container),
				cards: host.container.querySelectorAll('.dictation-onboarding-banner').length,
				hasMicrophoneControls: host.container.querySelector('.dictation-onboarding-device') !== null,
				hasWaveform: host.container.querySelector('.dictation-onboarding-waveform') !== null,
				microphonePickerHidden: microphonePicker?.hidden,
				microphonePickerDisplay: microphonePicker && dom.getWindow(microphonePicker).getComputedStyle(microphonePicker).display,
			},
			{ visible: true, cards: 1, hasMicrophoneControls: true, hasWaveform: true, microphonePickerHidden: true, microphonePickerDisplay: 'none' });
	});

	test('reset shows the introduction on the next dictation', () => {
		const service = createService(disposables);
		const host = createHost(disposables);
		disposables.add(service.registerHost({ container: host.container, focusRoot: host.root }));

		service.showIfNeeded();
		host.container.querySelector<HTMLElement>('.dictation-onboarding-close')!.click();
		service.reset();

		assert.strictEqual(service.showIfNeeded(), true);
	});

	test('attaches to the most recently focused host', () => {
		const service = createService(disposables);
		const first = createHost(disposables);
		const second = createHost(disposables);
		disposables.add(service.registerHost({ container: first.container, focusRoot: first.root }));
		disposables.add(service.registerHost({ container: second.container, focusRoot: second.root }));

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

	test('offers a way to change the settings and how dictation writes', () => {
		const executed: string[] = [];
		const telemetryEvents: ITelemetryEvent[] = [];
		const service = createService(disposables, executed, telemetryEvents);
		const host = createHost(disposables);
		disposables.add(service.registerHost({ container: host.container, focusRoot: host.root }));

		service.show();
		const links = host.container.querySelectorAll<HTMLAnchorElement>('.dictation-onboarding-description a');
		links.forEach(link => link.click());

		assert.deepStrictEqual(
			{
				count: links.length,
				// Every link has to be reachable without a mouse, not just the first.
				keyboardReachable: Array.from(links).every(link => link.tabIndex === 0),
				executed,
				telemetryEvents,
			},
			{
				count: 2,
				keyboardReachable: true,
				executed: ['workbench.action.openSettings', 'workbench.action.chat.configureDictationInstructions'],
				telemetryEvents: [
					{ name: 'dictationOnboarding.action', data: { action: 'shown', source: 'manual' } },
					{ name: 'dictationOnboarding.action', data: { action: 'openSettings', source: 'manual' } },
					{ name: 'dictationOnboarding.action', data: { action: 'openInstructions', source: 'manual' } },
				],
			});
	});

	test('disposing the host it is docked to takes the card down with it', () => {
		const service = createService(disposables);
		const host = createHost(disposables);
		const registration = service.registerHost({ container: host.container, focusRoot: host.root });

		service.show();
		registration.dispose();

		assert.deepStrictEqual(
			{
				visible: isChatInputStackSlotShowing(host.container),
				cards: host.container.querySelectorAll('.dictation-onboarding-banner').length,
			},
			{ visible: false, cards: 0 });
	});
});
