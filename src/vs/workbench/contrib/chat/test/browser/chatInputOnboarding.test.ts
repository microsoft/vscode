/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatInputOnboarding, ChatInputOnboardingCard, IChatInputOnboardingContext } from '../../browser/widget/input/chatInputOnboarding.js';

suite('Chat input onboarding', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHost(store: Pick<DisposableStore, 'add'>): { root: HTMLElement; container: HTMLElement } {
		const root = dom.$('div');
		root.tabIndex = 0;
		const container = dom.append(root, dom.$('.chat-input-onboarding-container'));
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		return { root, container };
	}

	function createOnboarding(store: Pick<DisposableStore, 'add'>, storageKey: string): ChatInputOnboarding {
		const instantiationService = workbenchInstantiationService(undefined, store);
		return store.add(instantiationService.createInstance(ChatInputOnboarding, {
			storageKey,
			hostClass: 'has-chat-input-onboarding',
		}));
	}

	function createCard(context: IChatInputOnboardingContext) {
		const card = context.container.ownerDocument.createElement('div');
		card.classList.add('chat-input-onboarding-card');
		context.container.appendChild(card);
		return toDisposable(() => card.remove());
	}

	test('owns one card and restores focus when it is dismissed', () => {
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.ownsCard');
		const host = createHost(disposables);
		let focusCalls = 0;
		disposables.add(onboarding.registerHost(host.container, host.root, () => focusCalls++));

		let context: IChatInputOnboardingContext | undefined;
		let cardsCreated = 0;
		const shown = onboarding.showIfNeeded(value => {
			context = value;
			cardsCreated++;
			return createCard(value);
		});
		const stillTakenOver = onboarding.showIfNeeded(value => {
			cardsCreated++;
			return createCard(value);
		});

		assert.deepStrictEqual(
			{
				shown,
				stillTakenOver,
				cardsCreated,
				visible: host.container.classList.contains('has-chat-input-onboarding'),
				cards: host.container.querySelectorAll('.chat-input-onboarding-card').length,
			},
			{ shown: true, stillTakenOver: true, cardsCreated: 1, visible: true, cards: 1 });

		context!.dismiss();

		assert.deepStrictEqual(
			{
				focusCalls,
				visible: host.container.classList.contains('has-chat-input-onboarding'),
				cards: host.container.querySelectorAll('.chat-input-onboarding-card').length,
				shownAgain: onboarding.showIfNeeded(createCard),
			},
			{ focusCalls: 1, visible: false, cards: 0, shownAgain: false });
	});

	test('does not consume first-run state until a card can be shown', () => {
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.waitsForHost');

		assert.strictEqual(onboarding.showIfNeeded(createCard), false);

		const host = createHost(disposables);
		disposables.add(onboarding.registerHost(host.container, host.root));

		assert.strictEqual(onboarding.showIfNeeded(createCard), true);
	});

	test('handles unmodified keyboard dismissal and action activation', () => {
		const host = createHost(disposables);
		let dismissals = 0;
		let activations = 0;
		const card = disposables.add(new ChatInputOnboardingCard({
			container: host.container,
			className: 'chat-input-onboarding-card',
			ariaLabel: 'Test onboarding',
			onEscape: () => dismissals++,
		}));
		const action = card.addAction({
			className: 'chat-input-onboarding-action',
			ariaLabel: 'Continue',
			icon: Codicon.check,
			onActivate: () => activations++,
		});

		action.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, ctrlKey: true, bubbles: true }));
		card.domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, shiftKey: true, bubbles: true }));
		action.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		card.domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));

		assert.deepStrictEqual({ dismissals, activations }, { dismissals: 1, activations: 1 });
	});
});
