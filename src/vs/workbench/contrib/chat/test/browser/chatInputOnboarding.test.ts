/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { setARIAContainer } from '../../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ChatInputOnboarding, ChatInputOnboardingCard, IChatInputNoticeSlot, IChatInputOnboardingContext } from '../../browser/widget/input/chatInputOnboarding.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from '../../browser/widget/input/chatInputNoticeHost.js';

suite('Chat input onboarding', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHost(store: Pick<DisposableStore, 'add'>): { root: HTMLElement; container: HTMLElement; addContainer(): HTMLElement } {
		const root = dom.$('div');
		root.tabIndex = 0;
		const container = dom.append(root, dom.$('.chat-input-onboarding-container'));
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		return { root, container, addContainer: () => dom.append(root, dom.$('.chat-input-onboarding-container')) };
	}

	/**
	 * The space above the input, wired exactly as `registerChatInputOnboardingHosts`
	 * wires it, so these tests exercise the real arbitration rather than a stand-in.
	 */
	function createSlot(noticeHost: ChatInputNoticeHost): IChatInputNoticeSlot {
		return { claim: options => noticeHost.occupy(ChatInputNoticeLane.Onboarding, options) };
	}

	function createNoticeHost(store: Pick<DisposableStore, 'add'>): ChatInputNoticeHost {
		return store.add(new ChatInputNoticeHost(() => { }));
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
		card.tabIndex = 0;
		const disposable = toDisposable(() => card.remove());
		return {
			announce: () => { announceCalls++; },
			hasFocus: () => dom.isAncestorOfActiveElement(card),
			focus: () => card.focus(),
			dispose: () => disposable.dispose(),
		};
	}

	/** A card is on screen only if it is built and its container is not hidden. */
	function visibleCards(container: HTMLElement): number {
		return container.style.display === 'none' ? 0 : container.querySelectorAll('.chat-input-onboarding-card').length;
	}

	let announceCalls = 0;
	setup(() => {
		announceCalls = 0;
	});

	test('owns one card and restores focus when it is dismissed', () => {
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.ownsCard');
		const host = createHost(disposables);
		const noticeHost = createNoticeHost(disposables);
		let focusCalls = 0;
		disposables.add(onboarding.registerHost({
			container: host.container,
			focusRoot: host.root,
			focus: () => focusCalls++,
			noticeSlot: createSlot(noticeHost),
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
				laneClaimed: noticeHost.isSuppressed(ChatInputNoticeLane.Tip, undefined),
				cards: visibleCards(host.container),
			},
			{ shown: true, stillTakenOver: true, cardsCreated: 1, visible: true, isVisible: true, laneClaimed: true, cards: 1 });

		context!.dismiss();

		assert.deepStrictEqual(
			{
				focusCalls,
				visible: host.container.classList.contains('has-chat-input-onboarding'),
				isVisible: onboarding.isVisible,
				// Dismissal releases the space, so a tip may take it.
				laneClaimed: noticeHost.isSuppressed(ChatInputNoticeLane.Tip, undefined),
				cards: visibleCards(host.container),
				shownAgain: onboarding.showIfNeeded(createCard),
			},
			{ focusCalls: 1, visible: false, isVisible: false, laneClaimed: false, cards: 0, shownAgain: false });
	});

	test('does not consume first-run state until a card can be shown', () => {
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.waitsForHost');

		assert.strictEqual(onboarding.showIfNeeded(createCard), false);

		const host = createHost(disposables);
		disposables.add(onboarding.registerHost({ container: host.container, focusRoot: host.root }));

		assert.strictEqual(onboarding.showIfNeeded(createCard), true);
	});

	test('builds nothing while the space is taken, then shows the card once', () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, store);
		const storageService = instantiationService.get(IStorageService);
		const onboarding = store.add(instantiationService.createInstance(ChatInputOnboarding, {
			storageKey: 'test.chatInputOnboarding.deferWhenTaken',
			hostClass: 'has-chat-input-onboarding',
		}));
		const host = createHost(store);
		const noticeHost = createNoticeHost(store);
		store.add(onboarding.registerHost({
			container: host.container,
			focusRoot: host.root,
			noticeSlot: createSlot(noticeHost),
		}));

		const notification = noticeHost.occupy(ChatInputNoticeLane.Notification);
		let cardsCreated = 0;
		onboarding.showIfNeeded(context => {
			cardsCreated++;
			return createCard(context);
		});

		// Nothing is built, announced or recorded while the card could not be seen:
		// the one first-run showing is not spent on a space the user never saw.
		const whileTaken = {
			cardsCreated,
			announceCalls,
			seen: storageService.getBoolean('test.chatInputOnboarding.deferWhenTaken', StorageScope.APPLICATION, false),
			isVisible: onboarding.isVisible,
		};
		notification.dispose();

		assert.deepStrictEqual(
			{
				whileTaken,
				afterFreed: {
					cardsCreated,
					announceCalls,
					seen: storageService.getBoolean('test.chatInputOnboarding.deferWhenTaken', StorageScope.APPLICATION, false),
					isVisible: onboarding.isVisible,
				},
			},
			{
				whileTaken: { cardsCreated: 0, announceCalls: 0, seen: false, isVisible: false },
				afterFreed: { cardsCreated: 1, announceCalls: 1, seen: true, isVisible: true },
			});
	});

	test('stands down while the space is taken and comes back without rebuilding', () => {
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.standsDown');
		const host = createHost(disposables);
		const noticeHost = createNoticeHost(disposables);
		disposables.add(onboarding.registerHost({
			container: host.container,
			focusRoot: host.root,
			noticeSlot: createSlot(noticeHost),
		}));

		let cardsCreated = 0;
		onboarding.showIfNeeded(context => {
			cardsCreated++;
			return createCard(context);
		});

		const whileFree = onboarding.isVisible;
		const notification = noticeHost.occupy(ChatInputNoticeLane.Notification);
		const whileTaken = { isVisible: onboarding.isVisible, cards: visibleCards(host.container) };
		// The card is only put away, so the tip must not move into the space.
		const tipWhileTaken = noticeHost.isSuppressed(ChatInputNoticeLane.Tip, undefined);
		notification.dispose();

		// One card, built and announced once: standing down hides it rather than
		// tearing it down, so in-flight state survives and it is not re-announced.
		assert.deepStrictEqual(
			{ whileFree, whileTaken, tipWhileTaken, afterFreed: onboarding.isVisible, cardsCreated, announceCalls },
			{
				whileFree: true,
				whileTaken: { isVisible: false, cards: 0 },
				tipWhileTaken: true,
				afterFreed: true,
				cardsCreated: 1,
				announceCalls: 1,
			});
	});

	test('hands focus back to the input when a focused card stands down', () => {
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.displacedFocus');
		const host = createHost(disposables);
		const noticeHost = createNoticeHost(disposables);
		let focusCalls = 0;
		disposables.add(onboarding.registerHost({
			container: host.container,
			focusRoot: host.root,
			focus: () => focusCalls++,
			noticeSlot: createSlot(noticeHost),
		}));

		let card: HTMLElement | undefined;
		onboarding.showIfNeeded(context => {
			const created = createCard(context);
			card = context.container.querySelector<HTMLElement>('.chat-input-onboarding-card') ?? undefined;
			return created;
		});
		card!.focus();
		const focusedBeforeStandDown = dom.isAncestorOfActiveElement(host.container);
		disposables.add(noticeHost.occupy(ChatInputNoticeLane.Notification));

		// Focus must not be left on <body> when the card goes out of view.
		assert.deepStrictEqual(
			{ focusedBeforeStandDown, focusCalls },
			{ focusedBeforeStandDown: true, focusCalls: 1 });
	});

	test('a dismissed card does not come back when the space frees', () => {
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.dismissedStaysGone');
		const host = createHost(disposables);
		const noticeHost = createNoticeHost(disposables);
		disposables.add(onboarding.registerHost({
			container: host.container,
			focusRoot: host.root,
			noticeSlot: createSlot(noticeHost),
		}));

		let dismiss: (() => void) | undefined;
		onboarding.showIfNeeded(context => {
			dismiss = () => context.dismiss(false);
			return createCard(context);
		});
		dismiss!();
		const notification = noticeHost.occupy(ChatInputNoticeLane.Notification);
		notification.dispose();

		assert.deepStrictEqual(
			{ isVisible: onboarding.isVisible, laneClaimed: noticeHost.isSuppressed(ChatInputNoticeLane.Tip, undefined) },
			{ isVisible: false, laneClaimed: false });
	});

	test('only the newest introduction is on screen, and the other returns after it', () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, store);
		const make = (storageKey: string) => store.add(instantiationService.createInstance(ChatInputOnboarding, {
			storageKey,
			hostClass: 'has-chat-input-onboarding',
		}));
		const first = make('test.chatInputOnboarding.introA');
		const second = make('test.chatInputOnboarding.introB');
		const host = createHost(store);
		const noticeHost = createNoticeHost(store);
		// Each introduction owns its own container, as voice and dictation do.
		const firstContainer = host.addContainer();
		const secondContainer = host.addContainer();
		const slot = createSlot(noticeHost);
		store.add(first.registerHost({ container: firstContainer, focusRoot: host.root, noticeSlot: slot }));
		store.add(second.registerHost({ container: secondContainer, focusRoot: host.root, noticeSlot: slot }));

		let dismissSecond: (() => void) | undefined;
		first.showIfNeeded(createCard);
		second.showIfNeeded(context => {
			dismissSecond = () => context.dismiss(false);
			return createCard(context);
		});
		// Two introductions share the onboarding lane, so the newer one takes the
		// space through the same mechanism a notification would.
		const whileBothWant = { first: first.isVisible, second: second.isVisible };
		dismissSecond!();

		assert.deepStrictEqual(
			{ whileBothWant, afterSecondDismissed: { first: first.isVisible, second: second.isVisible } },
			{ whileBothWant: { first: false, second: true }, afterSecondDismissed: { first: true, second: false } });
	});

	test('alternating introductions settle instead of reopening forever', () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, store);
		const make = (storageKey: string) => store.add(instantiationService.createInstance(ChatInputOnboarding, {
			storageKey,
			hostClass: 'has-chat-input-onboarding',
		}));
		const first = make('test.chatInputOnboarding.pingA');
		const second = make('test.chatInputOnboarding.pingB');
		const host = createHost(store);
		const noticeHost = createNoticeHost(store);
		const slot = createSlot(noticeHost);
		store.add(first.registerHost({ container: host.addContainer(), focusRoot: host.root, noticeSlot: slot }));
		store.add(second.registerHost({ container: host.addContainer(), focusRoot: host.root, noticeSlot: slot }));

		// Each introduction is built at most once: standing down for the other no
		// longer hands back a first-run showing, so there is nothing to ping-pong.
		let cardsCreated = 0;
		for (let i = 0; i < 10; i++) {
			const onboarding = i % 2 === 0 ? first : second;
			onboarding.showIfNeeded(context => {
				cardsCreated++;
				return createCard(context);
			});
		}

		assert.strictEqual(cardsCreated, 2);
	});

	test('a card that fails to build releases the space it was standing on', () => {
		// `build()` runs from the host reporting that we lead, which happens before
		// the claim disposable is in hand. A throw there must not strand the claim:
		// the lane would stay occupied forever with nothing on screen, silently
		// suppressing everything below it.
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.buildThrows');
		const host = createHost(disposables);
		const noticeHost = createNoticeHost(disposables);
		disposables.add(onboarding.registerHost({
			container: host.container,
			focusRoot: host.root,
			noticeSlot: createSlot(noticeHost),
		}));

		const originalHandler = errorHandler.getUnexpectedErrorHandler();
		const reported: string[] = [];
		setUnexpectedErrorHandler(error => reported.push((error as Error).message));
		try {
			onboarding.showIfNeeded(() => { throw new Error('card exploded'); });
		} finally {
			setUnexpectedErrorHandler(originalHandler);
		}

		assert.deepStrictEqual(
			{
				reported,
				isVisible: onboarding.isVisible,
				laneClaimed: noticeHost.isSuppressed(ChatInputNoticeLane.Tip, undefined),
				hostClass: host.container.classList.contains('has-chat-input-onboarding'),
			},
			{ reported: ['card exploded'], isVisible: false, laneClaimed: false, hostClass: false });
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
