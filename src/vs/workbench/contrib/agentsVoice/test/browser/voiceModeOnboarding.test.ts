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
import { IVoiceSessionController, VoiceState } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { VoiceModeOnboardingService } from '../../browser/voiceModeOnboarding.js';

suite('Voice Mode onboarding', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHost(store: Pick<DisposableStore, 'add'>): { root: HTMLElement; container: HTMLElement } {
		const root = dom.$('div');
		root.tabIndex = 0;
		const container = dom.append(root, dom.$('.voice-mode-onboarding-container'));
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		return { root, container };
	}

	function createService(store: Pick<DisposableStore, 'add'>, executed: string[] = []): VoiceModeOnboardingService {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override executeCommand(id: string): Promise<undefined> {
				executed.push(id);
				return Promise.resolve(undefined);
			}
		});
		instantiationService.stub(IVoiceSessionController, new class extends mock<IVoiceSessionController>() {
			override readonly voiceState = constObservable<VoiceState>('idle');
			override stopListening(): void { }
			override pttDown(): void { }
			override pttUp(): void { }
		});
		return store.add(instantiationService.createInstance(VoiceModeOnboardingService));
	}

	test('auditions a voice, dismisses, and never returns', () => {
		const service = createService(disposables);
		const host = createHost(disposables);
		disposables.add(service.registerHost(host.container, host.root));

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
		disposables.add(service.registerHost(host.container, host.root));

		service.showIfNeeded();
		host.container.querySelector<HTMLElement>('.voice-mode-onboarding-close')!.click();

		assert.strictEqual(host.container.classList.contains('has-voice-mode-onboarding'), false);
	});

	test('asking twice in one session leaves exactly one card', () => {
		const service = createService(disposables);
		const host = createHost(disposables);
		disposables.add(service.registerHost(host.container, host.root));

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
		disposables.add(service.registerHost(host.container, host.root));
		service.showIfNeeded();

		assert.strictEqual(host.container.classList.contains('has-voice-mode-onboarding'), true);
	});

	test('the settings link routes to Voice Mode settings', () => {
		const executed: string[] = [];
		const service = createService(disposables, executed);
		const host = createHost(disposables);
		disposables.add(service.registerHost(host.container, host.root));

		service.showIfNeeded();
		const link = host.container.querySelector<HTMLElement>('.voice-mode-onboarding-description a');
		link?.click();

		assert.deepStrictEqual(
			{ hasLink: !!link, executed },
			{ hasLink: true, executed: ['agentsVoice.openSettings'] });
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
		service.showIfNeeded();

		assert.deepStrictEqual(
			{
				first: first.container.classList.contains('has-voice-mode-onboarding'),
				second: second.container.classList.contains('has-voice-mode-onboarding'),
			},
			{ first: false, second: true });
	});
});
