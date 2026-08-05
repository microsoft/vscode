/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { setARIAContainer } from '../../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
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
		const disposable = toDisposable(() => card.remove());
		return {
			announce: () => { announceCalls++; },
			dispose: () => disposable.dispose(),
		};
	}

	let announceCalls = 0;
	setup(() => {
		announceCalls = 0;
	});

	test('owns one card and restores focus when it is dismissed', () => {
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.ownsCard');
		const host = createHost(disposables);
		let focusCalls = 0;
		const visibleChanges: boolean[] = [];
		disposables.add(onboarding.registerHost({
			container: host.container,
			focusRoot: host.root,
			focus: () => focusCalls++,
			onDidChangeVisible: visible => visibleChanges.push(visible),
		}));

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
				isVisible: onboarding.isVisible,
				visibleChanges: [...visibleChanges],
				cards: host.container.querySelectorAll('.chat-input-onboarding-card').length,
			},
			{ shown: true, stillTakenOver: true, cardsCreated: 1, visible: true, isVisible: true, visibleChanges: [true], cards: 1 });

		context!.dismiss();

		assert.deepStrictEqual(
			{
				focusCalls,
				visible: host.container.classList.contains('has-chat-input-onboarding'),
				isVisible: onboarding.isVisible,
				visibleChanges,
				cards: host.container.querySelectorAll('.chat-input-onboarding-card').length,
				shownAgain: onboarding.showIfNeeded(createCard),
			},
			{ focusCalls: 1, visible: false, isVisible: false, visibleChanges: [true, false], cards: 0, shownAgain: false });
	});

	test('does not consume first-run state until a card can be shown', () => {
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.waitsForHost');

		assert.strictEqual(onboarding.showIfNeeded(createCard), false);

		const host = createHost(disposables);
		disposables.add(onboarding.registerHost({ container: host.container, focusRoot: host.root }));

		assert.strictEqual(onboarding.showIfNeeded(createCard), true);
	});

	test('defers a first-run card while higher-precedence content owns the space', () => {
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.deferWhenBlocked');
		const host = createHost(disposables);
		let blocked = true;
		disposables.add(onboarding.registerHost({
			container: host.container,
			focusRoot: host.root,
			isBlocked: () => blocked,
		}));

		const whileBlocked = onboarding.showIfNeeded(createCard);
		blocked = false;
		const afterUnblocked = onboarding.showIfNeeded(createCard);

		// The one first-run showing must survive being blocked.
		assert.deepStrictEqual(
			{ whileBlocked, afterUnblocked, cards: host.container.querySelectorAll('.chat-input-onboarding-card').length },
			{ whileBlocked: false, afterUnblocked: true, cards: 1 });
	});

	test('shows an explicitly requested card even while blocked', () => {
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.manualWhenBlocked');
		const host = createHost(disposables);
		disposables.add(onboarding.registerHost({
			container: host.container,
			focusRoot: host.root,
			isBlocked: () => true,
		}));

		// `show()` is an explicit request, so it ignores the blocker `showIfNeeded` respects.
		assert.strictEqual(onboarding.show(createCard), true);
	});

	test('only the most recent card in an exclusion group stays visible', () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, store);
		const storageService = instantiationService.get(IStorageService);
		const first = store.add(instantiationService.createInstance(ChatInputOnboarding, {
			storageKey: 'test.chatInputOnboarding.groupA',
			hostClass: 'has-chat-input-onboarding',
			exclusionGroup: 'test.group',
		}));
		const second = store.add(instantiationService.createInstance(ChatInputOnboarding, {
			storageKey: 'test.chatInputOnboarding.groupB',
			hostClass: 'has-chat-input-onboarding',
			exclusionGroup: 'test.group',
		}));
		const host = createHost(store);
		store.add(first.registerHost({ container: host.container, focusRoot: host.root }));
		store.add(second.registerHost({ container: host.container, focusRoot: host.root }));

		first.showIfNeeded(createCard);
		second.showIfNeeded(createCard);

		assert.deepStrictEqual(
			{
				firstVisible: first.isVisible,
				secondVisible: second.isVisible,
				// The displaced card was never read, so it keeps its first-run showing.
				firstCanShowAgain: !storageService.getBoolean('test.chatInputOnboarding.groupA', StorageScope.APPLICATION, false),
			},
			{ firstVisible: false, secondVisible: true, firstCanShowAgain: true });
	});

	test('restores a displaced first-run showing at most once', () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, store);
		const make = (storageKey: string) => store.add(instantiationService.createInstance(ChatInputOnboarding, {
			storageKey,
			hostClass: 'has-chat-input-onboarding',
			exclusionGroup: 'test.pingGroup',
		}));
		const first = make('test.chatInputOnboarding.pingA');
		const second = make('test.chatInputOnboarding.pingB');
		const host = createHost(store);
		store.add(first.registerHost({ container: host.container, focusRoot: host.root }));
		store.add(second.registerHost({ container: host.container, focusRoot: host.root }));

		// Alternating first-run cards preempt each other. Each may reclaim its
		// showing once; without that bound they would reopen forever.
		let cardsCreated = 0;
		for (let i = 0; i < 10; i++) {
			const onboarding = i % 2 === 0 ? first : second;
			onboarding.showIfNeeded(context => {
				cardsCreated++;
				return createCard(context);
			});
		}

		assert.strictEqual(cardsCreated, 4);
	});

	test('announces once on show', () => {
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.announces');
		const host = createHost(disposables);
		disposables.add(onboarding.registerHost({ container: host.container, focusRoot: host.root }));

		const shown = onboarding.show(createCard);
		onboarding.showIfNeeded(createCard); // no-op while already visible, must not re-announce

		assert.deepStrictEqual(
			{ shown, announceCalls },
			{ shown: true, announceCalls: 1 });
	});

	test('announces how to reach the card in the tab order', () => {
		const host = createHost(disposables);
		const ariaContainer = dom.append(host.root, dom.$('div'));
		setARIAContainer(ariaContainer);
		const card = disposables.add(new ChatInputOnboardingCard({
			container: host.container,
			className: 'chat-input-onboarding-card',
			ariaLabel: 'Test onboarding',
			ariaDescription: 'Test description.',
			onEscape: () => { },
		}));

		card.announce();
		const announced = ariaContainer.textContent;

		assert.deepStrictEqual(
			{ announced, tabIndex: card.domNode.tabIndex },
			{ announced: 'Test onboarding. Use Shift+Tab to reach the introduction.', tabIndex: 0 });
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
