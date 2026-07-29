/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { buildMicrophoneOptions, DictationOnboardingService, indexOfMicrophone } from '../../browser/speechToText/dictationOnboarding.js';

/**
 * Comfortably longer than the card's hand-off delay, so the tests observe the
 * settled state rather than racing it.
 */
const HANDOFF_GRACE_MS = 500;

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

	test('lists every real microphone once, behind the system default', () => {
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
			{ deviceId: '', label: 'System default' },
			{ deviceId: 'mic-a', label: 'Studio Mic' },
			{ deviceId: 'abcdefghij-unlabelled', label: 'Unknown device (abcdefgh)' },
		]);
	});

	test('falls back to the system default when the remembered device is gone', () => {
		const options = buildMicrophoneOptions([device('audioinput', 'mic-a', 'Studio Mic')]);

		assert.deepStrictEqual(
			{
				remembered: indexOfMicrophone(options, 'mic-a'),
				systemDefault: indexOfMicrophone(options, ''),
				unplugged: indexOfMicrophone(options, 'mic-that-was-unplugged'),
			},
			{ remembered: 1, systemDefault: 0, unplugged: 0 });
	});

	test('takes over the first dictation, then never returns', async () => {
		const telemetryEvents: ITelemetryEvent[] = [];
		const service = createService(disposables, undefined, telemetryEvents);
		const host = createHost(disposables);
		disposables.add(service.registerHost(host.container, host.root));

		let dictations = 0;
		const tookOver = service.showIfNeeded(() => dictations++);
		const shown = host.container.classList.contains('has-dictation-onboarding');

		// Nothing is recorded while the card is up: confirming it is the only
		// thing that starts the dictation it deferred, and even that waits a beat
		// for the card to hand the microphone back.
		const dictationsWhileOpen = dictations;
		host.container.querySelector<HTMLElement>('.dictation-onboarding-close')!.click();
		const dictationsBeforeHandoff = dictations;
		await timeout(HANDOFF_GRACE_MS);

		const tookOverAgain = service.showIfNeeded(() => dictations++);

		assert.deepStrictEqual(
			{
				tookOver, shown, dictationsWhileOpen, dictationsBeforeHandoff,
				dictationsAfterHandoff: dictations,
				visibleAfterHandoff: host.container.classList.contains('has-dictation-onboarding'),
				tookOverAgain,
				telemetryEvents,
			},
			{
				tookOver: true, shown: true, dictationsWhileOpen: 0, dictationsBeforeHandoff: 0,
				dictationsAfterHandoff: 1,
				visibleAfterHandoff: false,
				tookOverAgain: false,
				telemetryEvents: [
					{ name: 'dictationOnboarding.action', data: { action: 'shown', source: 'automatic' } },
					{ name: 'dictationOnboarding.action', data: { action: 'startDictation', source: 'automatic' } },
				],
			});
	});

	test('escape dismisses the card without dictating', async () => {
		const service = createService(disposables);
		const host = createHost(disposables);
		disposables.add(service.registerHost(host.container, host.root));

		let dictations = 0;
		service.showIfNeeded(() => dictations++);
		host.container.querySelector<HTMLElement>('.dictation-onboarding-banner')!
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		await timeout(HANDOFF_GRACE_MS);

		assert.deepStrictEqual(
			{ dictations, visible: host.container.classList.contains('has-dictation-onboarding') },
			{ dictations: 0, visible: false });
	});

	test('dictates straight away when there is no chat input to dock to', () => {
		const service = createService(disposables);

		assert.strictEqual(service.showIfNeeded(() => { }), false);
	});

	test('showing again replaces the card rather than hiding it', () => {
		const service = createService(disposables);
		const host = createHost(disposables);
		disposables.add(service.registerHost(host.container, host.root));

		service.show();
		service.show();

		assert.deepStrictEqual(
			{
				visible: host.container.classList.contains('has-dictation-onboarding'),
				cards: host.container.querySelectorAll('.dictation-onboarding-banner').length,
			},
			{ visible: true, cards: 1 });
	});

	test('attaches to the most recently focused host', () => {
		const service = createService(disposables);
		const first = createHost(disposables);
		const second = createHost(disposables);
		disposables.add(service.registerHost(first.container, first.root));
		disposables.add(service.registerHost(second.container, second.root));

		// The renderer running these tests does not reliably hand out real focus,
		// so raise the same event the focus tracker listens for.
		second.root.focus();
		second.root.dispatchEvent(new FocusEvent('focus'));
		service.showIfNeeded(() => { });

		assert.deepStrictEqual(
			{
				first: first.container.classList.contains('has-dictation-onboarding'),
				second: second.container.classList.contains('has-dictation-onboarding'),
			},
			{ first: false, second: true });
	});

	test('offers a way to change the settings and how dictation writes', () => {
		const executed: string[] = [];
		const telemetryEvents: ITelemetryEvent[] = [];
		const service = createService(disposables, executed, telemetryEvents);
		const host = createHost(disposables);
		disposables.add(service.registerHost(host.container, host.root));

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
		const registration = service.registerHost(host.container, host.root);

		service.show();
		registration.dispose();

		assert.deepStrictEqual(
			{
				visible: host.container.classList.contains('has-dictation-onboarding'),
				cards: host.container.querySelectorAll('.dictation-onboarding-banner').length,
			},
			{ visible: false, cards: 0 });
	});
});
