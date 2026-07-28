/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AgentsVoiceStorageKeys } from '../../common/agentsVoice.js';
import { IVoiceSessionController, VoiceState } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { VoiceModeOnboardingService } from '../../browser/voiceModeOnboarding.js';

suite('Voice Mode onboarding', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface ITestHost { root: HTMLElement; container: HTMLElement; focused: number }

	function createHost(store: Pick<DisposableStore, 'add'>): ITestHost {
		const root = dom.$('div');
		root.tabIndex = 0;
		const container = dom.append(root, dom.$('.voice-mode-onboarding-container'));
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		return { root, container, focused: 0 };
	}

	function register(service: VoiceModeOnboardingService, host: ITestHost) {
		return service.registerHost(host.container, host.root, () => {
			host.focused++;
			host.root.focus();
		});
	}

	function createService(store: Pick<DisposableStore, 'add'>, executed: string[] = [], holds: boolean[] = []): VoiceModeOnboardingService {
		const instantiationService = workbenchInstantiationService(undefined, store);
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
		return store.add(instantiationService.createInstance(VoiceModeOnboardingService));
	}

	test('auditions a voice, dismisses, and never returns', () => {
		const service = createService(disposables);
		const host = createHost(disposables);
		disposables.add(register(service, host));

		service.showIfNeeded();
		const shown = host.container.classList.contains('has-voice-mode-onboarding');

		// Nothing is chosen until the user chooses: the card asks a question
		// rather than arriving with an answer already filled in.
		const selectedOnOpen = host.container.querySelectorAll('.voice-mode-onboarding-voice.selected').length;
		host.container.querySelector<HTMLElement>('.voice-mode-onboarding-voice')!.click();
		const selectedAfterPick = host.container.querySelectorAll('.voice-mode-onboarding-voice.selected').length;

		// Dismissal is never gated, and having been seen it must not come back.
		host.container.querySelector<HTMLElement>('.voice-mode-onboarding-close')!.click();
		const shownAfterClose = host.container.classList.contains('has-voice-mode-onboarding');
		service.showIfNeeded();
		const shownAgain = host.container.classList.contains('has-voice-mode-onboarding');

		assert.deepStrictEqual(
			{ shown, selectedOnOpen, selectedAfterPick, shownAfterClose, shownAgain },
			{ shown: true, selectedOnOpen: 0, selectedAfterPick: 1, shownAfterClose: false, shownAgain: false });
	});

	test('can be dismissed without choosing a voice', () => {
		const service = createService(disposables);
		const host = createHost(disposables);
		disposables.add(register(service, host));

		service.showIfNeeded();
		host.container.querySelector<HTMLElement>('.voice-mode-onboarding-close')!.click();

		assert.strictEqual(host.container.classList.contains('has-voice-mode-onboarding'), false);
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
				visible: host.container.classList.contains('has-voice-mode-onboarding'),
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

		assert.strictEqual(host.container.classList.contains('has-voice-mode-onboarding'), true);
	});

	test('each link in the sentence routes to its own command', () => {
		const executed: string[] = [];
		const service = createService(disposables, executed);
		const host = createHost(disposables);
		disposables.add(register(service, host));

		service.showIfNeeded();
		const links = [...host.container.querySelectorAll<HTMLElement>('.voice-mode-onboarding-description a')];
		for (const link of links) {
			link.click();
		}

		// Order matters: `renderFormattedText` numbers the `[[...]]` segments in
		// source order, and the callback dispatches on that index.
		assert.deepStrictEqual(
			{ labels: links.map(link => link.textContent), executed },
			{
				labels: ['settings', 'how it responds'],
				executed: ['agentsVoice.openSettings', 'workbench.action.chat.configureVoiceInstructions'],
			});
	});

	test('holds the microphone shut for as long as the card is up', () => {
		const holds: boolean[] = [];
		const service = createService(disposables, [], holds);
		const host = createHost(disposables);
		disposables.add(register(service, host));

		// The card goes up while the session is still connecting, so a plain
		// `stopListening()` would no-op and hands-free would open the microphone
		// on `session_init` with the card still on screen.
		service.showIfNeeded();
		const heldWhileOpen = holds.slice();
		host.container.querySelector<HTMLElement>('.voice-mode-onboarding-close')!.click();

		assert.deepStrictEqual(
			{ heldWhileOpen, afterDismiss: holds },
			{ heldWhileOpen: [true], afterDismiss: [true, false] });
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
							visible: host.container.classList.contains('has-voice-mode-onboarding'),
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
				first: first.container.classList.contains('has-voice-mode-onboarding'),
				second: second.container.classList.contains('has-voice-mode-onboarding'),
			},
			{ first: false, second: true });
	});
});
