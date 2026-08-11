/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, isAncestorOfActiveElement, setVisibility, trackFocus } from '../../../../../../base/browser/dom.js';
import { alert } from '../../../../../../base/browser/ui/aria/aria.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';

/** A card keyboard focus can be moved into and back out of. */
export interface IChatInputOnboardingFocusTarget {
	hasFocus(): boolean;
	focus(): void;
}

/**
 * The space above one chat input, as offered to an introduction. Claiming it is
 * the only way a card gets on screen: the slot decides who leads, so precedence
 * against notifications and recency against a peer introduction are one thing.
 */
export interface IChatInputNoticeSlot {
	/**
	 * Hold the space until the returned disposable is disposed. `onDidChangeLeading`
	 * reports whether this claim is the one currently on screen.
	 */
	claim(options: {
		readonly focusTarget?: IChatInputOnboardingFocusTarget;
		readonly onDidChangeLeading: (leading: boolean) => void;
	}): IDisposable;
}

export interface IChatInputOnboardingHostOptions {
	/** The element the card is appended to. */
	readonly container: HTMLElement;
	/** The element whose focus marks this host as the most recent one. */
	readonly focusRoot: HTMLElement;
	/** Hands focus back to this host's input when the card closes. */
	readonly focus?: () => void;
	/**
	 * The space this host offers. Without one the card shows unconditionally,
	 * which is what the tests and any host with nothing else above the input want.
	 */
	readonly noticeSlot?: IChatInputNoticeSlot;
}

interface IChatInputOnboardingHost extends IChatInputOnboardingHostOptions {
	lastFocused: number;
}

type ChatInputOnboardingFactory = (context: IChatInputOnboardingContext) => IChatInputOnboardingBanner;

export interface IChatInputOnboardingOptions {
	readonly storageKey: string;
	readonly hostClass: string;
}

export interface IChatInputOnboardingContext {
	readonly container: HTMLElement;
	readonly dismiss: (restoreFocus?: boolean) => void;
}

export interface IChatInputOnboardingBanner extends IDisposable, IChatInputOnboardingFocusTarget {
	announce(): void;
}

export interface IChatInputOnboardingCardOptions {
	readonly container: HTMLElement;
	readonly className: string;
	readonly ariaLabel: string;
	readonly ariaDescription?: string;
	readonly onEscape: () => void;
}

export interface IChatInputOnboardingActionOptions {
	readonly className: string;
	readonly ariaLabel: string;
	readonly icon: ThemeIcon;
	readonly onActivate: () => void;
}

export class ChatInputOnboarding extends Disposable {

	private readonly hosts = new Set<IChatInputOnboardingHost>();
	/** The built card, kept alive while standing down so its state survives. */
	private readonly currentOnboarding = this._register(new MutableDisposable<IDisposable>());
	/** The held space. Outlives the card: it is what brings a card back. */
	private readonly claim = this._register(new MutableDisposable<IDisposable>());
	private activeHost: IChatInputOnboardingHost | undefined;
	private activeBanner: IChatInputOnboardingBanner | undefined;
	/** Builds the card once this claim leads. */
	private wanted: ChatInputOnboardingFactory | undefined;
	private leading = false;

	/** Whether a card is built and on screen. */
	get isVisible(): boolean {
		return !!this.currentOnboarding.value && this.leading;
	}

	constructor(
		private readonly options: IChatInputOnboardingOptions,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
	}

	registerHost(options: IChatInputOnboardingHostOptions): IDisposable {
		const host: IChatInputOnboardingHost = { ...options, lastFocused: 0 };
		this.hosts.add(host);

		const store = new DisposableStore();
		const focusTracker = store.add(trackFocus(options.focusRoot));
		store.add(focusTracker.onDidFocus(() => host.lastFocused = Date.now()));
		store.add(toDisposable(() => {
			this.hosts.delete(host);
			if (this.activeHost === host) {
				this.hide(false);
			}
		}));
		return store;
	}

	/**
	 * Show the card the first time the feature is used. Nothing is built until
	 * the space is actually available, so a card never spends its one showing -
	 * or reports itself shown - somewhere the user would not have seen it.
	 */
	showIfNeeded(createOnboarding: ChatInputOnboardingFactory): boolean {
		if (this.wanted) {
			return true;
		}
		if (this.storageService.getBoolean(this.options.storageKey, StorageScope.APPLICATION, false)) {
			return false;
		}
		return this.request(createOnboarding);
	}

	/** Show the card again regardless of whether it has already been seen. */
	show(createOnboarding: ChatInputOnboardingFactory): boolean {
		return this.request(createOnboarding);
	}

	private request(createOnboarding: ChatInputOnboardingFactory): boolean {
		const host = this.getActiveHost();
		if (!host) {
			return false;
		}

		this.hide(false);
		this.activeHost = host;
		this.wanted = createOnboarding;

		const slot = host.noticeSlot;
		if (!slot) {
			this.setLeading(true);
			return true;
		}

		// A newer claim leads its lane, so this both takes the space from a peer
		// introduction and yields to a notification, through one mechanism.
		//
		// The host reports leading synchronously from `claim()`, before the lease
		// is in hand. That first answer is held until the lease is stored, so a
		// card that fails to build can release the claim it is standing on rather
		// than leaving the lane occupied with nothing on screen.
		let holdsLease = false;
		let leadsImmediately = false;
		const lease = slot.claim({
			focusTarget: { hasFocus: () => this.activeBanner?.hasFocus() ?? false, focus: () => this.activeBanner?.focus() },
			onDidChangeLeading: leading => {
				if (holdsLease) {
					this.setLeading(leading);
				} else {
					leadsImmediately = leading;
				}
			},
		});
		this.claim.value = lease;
		holdsLease = true;
		if (leadsImmediately) {
			this.setLeading(true);
		}
		return true;
	}

	private setLeading(leading: boolean): void {
		if (this.leading === leading || !this.wanted) {
			return;
		}

		this.leading = leading;
		if (leading) {
			this.build();
		} else {
			this.standDown();
		}
	}

	/** Put the card away for whatever now owns the space, without losing it. */
	private standDown(): void {
		const host = this.activeHost;
		if (!host || !this.currentOnboarding.value) {
			return;
		}

		// Hiding the card would strand keyboard focus on <body>, so hand it back
		// to the input first, the same way dismissing the card does.
		const hadFocus = this.activeBanner?.hasFocus() ?? false;
		setVisibility(false, host.container);
		if (hadFocus) {
			host.focus?.();
		}
	}

	private build(): void {
		const host = this.activeHost;
		const createOnboarding = this.wanted;
		if (!host || !createOnboarding) {
			return;
		}

		// Already built and merely standing down: show it again rather than
		// rebuilding, so in-flight state survives and it is not announced twice.
		if (this.currentOnboarding.value) {
			setVisibility(true, host.container);
			return;
		}

		const onboardingStore = new DisposableStore();
		host.container.classList.add(this.options.hostClass);
		onboardingStore.add(toDisposable(() => host.container.classList.remove(this.options.hostClass)));

		let banner: IChatInputOnboardingBanner;
		try {
			banner = createOnboarding({
				container: host.container,
				dismiss: (restoreFocus = true) => this.hide(restoreFocus),
			});
			onboardingStore.add(banner);
		} catch (error) {
			// Reported rather than rethrown: this runs from the notice host telling
			// us we lead, and unwinding through that would strand the claim we hold.
			onboardingStore.dispose();
			this.hide(false);
			onUnexpectedError(error);
			return;
		}

		this.currentOnboarding.value = onboardingStore;
		this.activeBanner = banner;
		setVisibility(true, host.container);
		// Recorded when the card is actually put in front of the user, so being
		// deferred or put away never counts as having been seen.
		this.storageService.store(this.options.storageKey, true, StorageScope.APPLICATION, StorageTarget.USER);
		banner.announce();
	}

	private getActiveHost(): IChatInputOnboardingHost | undefined {
		const visibleHosts = [...this.hosts].filter(host => host.container.isConnected && host.focusRoot.getClientRects().length > 0);
		if (visibleHosts.length === 0) {
			return undefined;
		}

		return visibleHosts.reduce((mostRecent, host) => host.lastFocused > mostRecent.lastFocused ? host : mostRecent);
	}

	private hide(restoreFocus: boolean): void {
		const host = this.activeHost;
		const wasVisible = this.isVisible;
		this.activeHost = undefined;
		this.activeBanner = undefined;
		this.wanted = undefined;
		this.leading = false;
		this.currentOnboarding.clear();
		this.claim.clear();
		if (host) {
			setVisibility(true, host.container);
		}
		if (wasVisible && restoreFocus) {
			host?.focus?.();
		}
	}
}

export class ChatInputOnboardingCard extends Disposable {

	readonly domNode: HTMLElement;

	private readonly ariaLabel: string;

	constructor(options: IChatInputOnboardingCardOptions) {
		super();

		this.ariaLabel = options.ariaLabel;

		this.domNode = options.container.ownerDocument.createElement('div');
		this.domNode.classList.add(options.className);
		this.domNode.setAttribute('role', 'region');
		this.domNode.setAttribute('aria-label', options.ariaLabel);
		if (options.ariaDescription) {
			this.domNode.setAttribute('aria-description', options.ariaDescription);
		}

		options.container.appendChild(this.domNode);
		this._register(toDisposable(() => this.domNode.remove()));

		this.domNode.tabIndex = 0;

		this._register(addDisposableListener(this.domNode, EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Escape)) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				options.onEscape();
			}
		}));
	}

	announce(): void {
		alert(localize('chatInputOnboarding.focusHint', "{0}. Use Shift+Tab to reach the introduction.", this.ariaLabel));
	}

	hasFocus(): boolean {
		return isAncestorOfActiveElement(this.domNode);
	}

	focus(): void {
		this.domNode.focus();
	}

	addAction(options: IChatInputOnboardingActionOptions): HTMLElement {
		const action = this.domNode.ownerDocument.createElement('div');
		action.classList.add(options.className);
		action.setAttribute('role', 'button');
		action.tabIndex = 0;
		action.setAttribute('aria-label', options.ariaLabel);
		const icon = this.domNode.ownerDocument.createElement('span');
		icon.classList.add(...ThemeIcon.asClassNameArray(options.icon));
		icon.setAttribute('aria-hidden', 'true');
		action.appendChild(icon);
		this.domNode.appendChild(action);

		const activate = () => options.onActivate();
		this._register(addDisposableListener(action, EventType.CLICK, activate));
		this._register(addDisposableListener(action, EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				activate();
			}
		}));

		return action;
	}
}
