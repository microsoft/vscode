/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ChatInputNoticeClaim, ChatInputOnboarding, IChatInputOnboardingContext } from '../../browser/widget/input/chatInputOnboarding.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from '../../browser/widget/input/chatInputNoticeHost.js';
import { isChatInputStackSlotShowing } from '../../browser/widget/input/chatInputStack.js';

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
	function createClaim(noticeHost: ChatInputNoticeHost): ChatInputNoticeClaim {
		return options => noticeHost.occupy(ChatInputNoticeLane.Onboarding, options);
	}

	/**
	 * Whether anything is still holding the space above the input. Probed by
	 * claiming the lowest lane and asking whether it got to lead.
	 */
	function laneClaimed(noticeHost: ChatInputNoticeHost): boolean {
		let led = false;
		noticeHost.occupy(ChatInputNoticeLane.Tip, { onDidChangeLeading: leading => { led ||= leading; } }).dispose();
		return !led;
	}

	function createNoticeHost(store: Pick<DisposableStore, 'add'>, focusInput: () => void = () => { }): ChatInputNoticeHost {
		return store.add(new ChatInputNoticeHost(focusInput));
	}

	function createOnboarding(store: Pick<DisposableStore, 'add'>, storageKey: string): ChatInputOnboarding {
		const instantiationService = workbenchInstantiationService(undefined, store);
		return store.add(instantiationService.createInstance(ChatInputOnboarding, {
			storageKey,
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
		return isChatInputStackSlotShowing(container) ? container.querySelectorAll('.chat-input-onboarding-card').length : 0;
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
			claimNotice: createClaim(noticeHost),
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
				visible: isChatInputStackSlotShowing(host.container),
				isVisible: onboarding.isVisible,
				laneClaimed: laneClaimed(noticeHost),
				cards: visibleCards(host.container),
			},
			{ shown: true, stillTakenOver: true, cardsCreated: 1, visible: true, isVisible: true, laneClaimed: true, cards: 1 });

		context!.dismiss();

		assert.deepStrictEqual(
			{
				focusCalls,
				visible: isChatInputStackSlotShowing(host.container),
				isVisible: onboarding.isVisible,
				// Dismissal releases the space, so a tip may take it.
				laneClaimed: laneClaimed(noticeHost),
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
		}));
		const host = createHost(store);
		const noticeHost = createNoticeHost(store);
		store.add(onboarding.registerHost({
			container: host.container,
			focusRoot: host.root,
			claimNotice: createClaim(noticeHost),
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
			claimNotice: createClaim(noticeHost),
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
		const tipWhileTaken = laneClaimed(noticeHost);
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

	test('stands the card\'s live parts down while it is put away', () => {
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.suspends');
		const host = createHost(disposables);
		const noticeHost = createNoticeHost(disposables);
		disposables.add(onboarding.registerHost({
			container: host.container,
			focusRoot: host.root,
			claimNotice: createClaim(noticeHost),
		}));

		// The card is kept alive while displaced, so anything it runs while on
		// screen - microphone capture, audio, animation - has to be told to stop.
		// Otherwise a hidden introduction holds the microphone open.
		const visibility: boolean[] = [];
		onboarding.showIfNeeded(context => ({
			...createCard(context),
			setVisible: (visible: boolean) => visibility.push(visible),
		}));
		const notification = noticeHost.occupy(ChatInputNoticeLane.Notification);
		notification.dispose();

		assert.deepStrictEqual(visibility, [false, true]);
	});

	test('docks to the input the user is in, even before it is the most recent', () => {
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.picksFocused');
		const store = disposables.add(new DisposableStore());
		const noticeHost = createNoticeHost(store);
		const first = createHost(store);
		const second = createHost(store);
		store.add(onboarding.registerHost({ container: first.container, focusRoot: first.root, claimNotice: createClaim(noticeHost) }));
		store.add(onboarding.registerHost({ container: second.container, focusRoot: second.root, claimNotice: createClaim(noticeHost) }));

		// Real focus only: no synthetic focus event, so neither input has recorded
		// any recency. The one holding focus is still the one the user would see a
		// card in, so ranking by recency alone is not enough.
		second.root.focus();
		onboarding.show(createCard);

		assert.deepStrictEqual(
			{ first: visibleCards(first.container), second: visibleCards(second.container) },
			{ first: 0, second: 1 });
	});

	test('a dismissed card does not come back when the space frees', () => {
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.dismissedStaysGone');
		const host = createHost(disposables);
		const noticeHost = createNoticeHost(disposables);
		disposables.add(onboarding.registerHost({
			container: host.container,
			focusRoot: host.root,
			claimNotice: createClaim(noticeHost),
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
			{ isVisible: onboarding.isVisible, laneClaimed: laneClaimed(noticeHost) },
			{ isVisible: false, laneClaimed: false });
	});

	test('only the newest introduction is on screen, and the other returns after it', () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, store);
		const make = (storageKey: string) => store.add(instantiationService.createInstance(ChatInputOnboarding, {
			storageKey,
		}));
		const first = make('test.chatInputOnboarding.introA');
		const second = make('test.chatInputOnboarding.introB');
		const host = createHost(store);
		const noticeHost = createNoticeHost(store);
		// Each introduction owns its own container, as voice and dictation do.
		const firstContainer = host.addContainer();
		const secondContainer = host.addContainer();
		const claim = createClaim(noticeHost);
		store.add(first.registerHost({ container: firstContainer, focusRoot: host.root, claimNotice: claim }));
		store.add(second.registerHost({ container: secondContainer, focusRoot: host.root, claimNotice: claim }));

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

	test('moving an introduction to another input does not put the new card away', () => {
		const onboarding = createOnboarding(disposables, 'test.chatInputOnboarding.movesHosts');
		const store = disposables.add(new DisposableStore());
		// Two chat inputs, each with its own notice host - a panel and an editor,
		// or a second Agents window composer.
		const first = createHost(store);
		const second = createHost(store);
		const firstNoticeHost = createNoticeHost(store);
		const secondNoticeHost = createNoticeHost(store);
		store.add(onboarding.registerHost({ container: first.container, focusRoot: first.root, claimNotice: createClaim(firstNoticeHost) }));
		onboarding.show(createCard);

		// The second input becomes the most recently focused one, so an explicit
		// re-show moves the card there. Releasing the claim left behind on the
		// first input must not be mistaken for the new card standing down.
		store.add(onboarding.registerHost({ container: second.container, focusRoot: second.root, claimNotice: createClaim(secondNoticeHost) }));
		// The renderer running these tests does not reliably hand out real focus,
		// so raise the same event the focus tracker listens for.
		second.root.focus();
		second.root.dispatchEvent(new FocusEvent('focus'));
		onboarding.show(createCard);

		assert.deepStrictEqual(
			{
				isVisible: onboarding.isVisible,
				movedOff: visibleCards(first.container),
				movedTo: visibleCards(second.container),
			},
			{ isVisible: true, movedOff: 0, movedTo: 1 });
	});

	test('alternating introductions settle instead of reopening forever', () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, store);
		const make = (storageKey: string) => store.add(instantiationService.createInstance(ChatInputOnboarding, {
			storageKey,
		}));
		const first = make('test.chatInputOnboarding.pingA');
		const second = make('test.chatInputOnboarding.pingB');
		const host = createHost(store);
		const noticeHost = createNoticeHost(store);
		const claim = createClaim(noticeHost);
		store.add(first.registerHost({ container: host.addContainer(), focusRoot: host.root, claimNotice: claim }));
		store.add(second.registerHost({ container: host.addContainer(), focusRoot: host.root, claimNotice: claim }));

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
			claimNotice: createClaim(noticeHost),
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
				laneClaimed: laneClaimed(noticeHost),
				showing: isChatInputStackSlotShowing(host.container),
			},
			{ reported: ['card exploded'], isVisible: false, laneClaimed: false, showing: false });
	});

	test('a card that is taken down while building is not installed anyway', () => {
		// The factory can synchronously take the card down - by dismissing straight
		// away, or because the input it is docked to goes away mid-construction.
		// Committing it regardless would show a card in an unregistered host and
		// spend its one showing.
		const store = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, store);
		const storageService = instantiationService.get(IStorageService);
		const onboarding = store.add(instantiationService.createInstance(ChatInputOnboarding, {
			storageKey: 'test.chatInputOnboarding.cancelledWhileBuilding',
		}));
		const host = createHost(store);
		const noticeHost = createNoticeHost(store);
		const registration = store.add(onboarding.registerHost({
			container: host.container,
			focusRoot: host.root,
			claimNotice: createClaim(noticeHost),
		}));

		onboarding.showIfNeeded(context => {
			const card = createCard(context);
			registration.dispose();
			return card;
		});

		assert.deepStrictEqual(
			{
				isVisible: onboarding.isVisible,
				cards: host.container.querySelectorAll('.chat-input-onboarding-card').length,
				showing: isChatInputStackSlotShowing(host.container),
				laneClaimed: laneClaimed(noticeHost),
				announceCalls,
				seen: storageService.getBoolean('test.chatInputOnboarding.cancelledWhileBuilding', StorageScope.APPLICATION, false),
			},
			{ isVisible: false, cards: 0, showing: false, laneClaimed: false, announceCalls: 0, seen: false });
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

});
