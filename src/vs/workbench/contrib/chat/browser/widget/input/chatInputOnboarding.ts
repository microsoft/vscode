/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, isAncestorOfActiveElement, trackFocus } from '../../../../../../base/browser/dom.js';
import { alert } from '../../../../../../base/browser/ui/aria/aria.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';

/** Voice Mode and Dictation introductions never share the input at once. */
export const CHAT_INPUT_INTRODUCTION_GROUP = 'chatInputIntroduction';

/** A card keyboard focus can be moved into and back out of. */
export interface IChatInputOnboardingFocusTarget {
	hasFocus(): boolean;
	focus(): void;
}

export interface IChatInputOnboardingHostOptions {
	/** The element the card is appended to. */
	readonly container: HTMLElement;
	/** The element whose focus marks this host as the most recent one. */
	readonly focusRoot: HTMLElement;
	/** Hands focus back to this host's input when the card closes. */
	readonly focus?: () => void;
	/**
	 * Reports whether a card is currently showing in this host, and how to reach
	 * it with the keyboard while it is.
	 */
	readonly onDidChangeVisible?: (visible: boolean, focusTarget?: IChatInputOnboardingFocusTarget) => void;
	/**
	 * Whether higher-precedence content currently owns the space above the
	 * input. Read through the passed reader so the card can stand down when
	 * something takes the space, and come back when it is given up again.
	 */
	readonly isBlocked?: (reader?: IReader) => boolean;
}

interface IChatInputOnboardingHost extends IChatInputOnboardingHostOptions {
	lastFocused: number;
}

type ChatInputOnboardingFactory = (context: IChatInputOnboardingContext) => IChatInputOnboardingBanner;

export interface IChatInputOnboardingOptions {
	readonly storageKey: string;
	readonly hostClass: string;
	/**
	 * Cards sharing a group never show at the same time. The most recent one
	 * wins; a card displaced before it could be read gets its first-run showing
	 * back so it can appear again later.
	 */
	readonly exclusionGroup?: string;
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
	private readonly currentOnboarding = this._register(new MutableDisposable<IDisposable>());
	private activeHost: IChatInputOnboardingHost | undefined;
	/** Whether the visible card is what consumed this feature's first-run showing. */
	private _consumedFirstRun = false;
	/** A displaced card reclaims its showing once; more would never terminate. */
	private _restoredFirstRun = false;
	/** How to rebuild the showing card, so a displaced one can be put back. */
	private _activeFactory: ChatInputOnboardingFactory | undefined;
	/** A card waiting for the space above the input to be given up again. */
	private _pending: ChatInputOnboardingFactory | undefined;

	/** Cards that may not be visible at the same time, by group. */
	private static readonly exclusionGroups = new Map<string, Set<ChatInputOnboarding>>();

	get isVisible(): boolean {
		return !!this.currentOnboarding.value;
	}

	constructor(
		private readonly options: IChatInputOnboardingOptions,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		const group = this.options.exclusionGroup;
		if (group) {
			let members = ChatInputOnboarding.exclusionGroups.get(group);
			if (!members) {
				members = new Set();
				ChatInputOnboarding.exclusionGroups.set(group, members);
			}
			members.add(this);
			this._register(toDisposable(() => {
				members.delete(this);
				if (members.size === 0) {
					ChatInputOnboarding.exclusionGroups.delete(group);
				}
			}));
		}
	}

	registerHost(options: IChatInputOnboardingHostOptions): IDisposable {
		const host: IChatInputOnboardingHost = { ...options, lastFocused: 0 };
		this.hosts.add(host);

		const store = new DisposableStore();
		const focusTracker = store.add(trackFocus(options.focusRoot));
		store.add(focusTracker.onDidFocus(() => host.lastFocused = Date.now()));

		// Precedence is maintained for as long as the card is up, not just when it
		// is first shown: the card stands down when something takes the space and
		// comes back when that content goes away.
		if (options.isBlocked) {
			store.add(autorun(reader => this.onDidChangeBlocked(host, options.isBlocked!(reader))));
		}

		store.add(toDisposable(() => {
			this.hosts.delete(host);
			if (this.activeHost === host) {
				this.hide(false);
			}
		}));
		return store;
	}

	private onDidChangeBlocked(host: IChatInputOnboardingHost, blocked: boolean): void {
		if (blocked) {
			if (this.activeHost === host && this.isVisible) {
				this.displace();
			}
		} else {
			this.showPending();
		}
	}

	/**
	 * Stand down for higher-precedence content without spending the showing: the
	 * card is remembered so it can be put back, and its first-run key is given
	 * back in case the window closes before that happens.
	 */
	private displace(): void {
		const factory = this._activeFactory;
		this.preempt();
		this._pending = factory;
	}

	/** Put back a card that deferred or was displaced, once the space is free. */
	private showPending(): void {
		const factory = this._pending;
		if (!factory) {
			return;
		}

		const host = this.getActiveHost();
		if (!host || host.isBlocked?.()) {
			return;
		}

		this._pending = undefined;
		this.show(factory);
	}

	showIfNeeded(createOnboarding: ChatInputOnboardingFactory): boolean {
		if (this.currentOnboarding.value) {
			return true;
		}
		if (this.storageService.getBoolean(this.options.storageKey, StorageScope.APPLICATION, false)) {
			return false;
		}
		// Defer rather than consume the one first-run showing: something with
		// higher precedence owns the space. The card is held so it appears as soon
		// as that content goes away.
		if (this.getActiveHost()?.isBlocked?.()) {
			this._pending = createOnboarding;
			return false;
		}
		return this.show(createOnboarding);
	}

	show(createOnboarding: ChatInputOnboardingFactory): boolean {
		const host = this.getActiveHost();
		if (!host) {
			return false;
		}

		this.hide(false);
		this.activeHost = host;

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
			this.activeHost = undefined;
			onboardingStore.dispose();
			throw error;
		}

		this.currentOnboarding.value = onboardingStore;
		this._activeFactory = createOnboarding;
		this._consumedFirstRun = !this.storageService.getBoolean(this.options.storageKey, StorageScope.APPLICATION, false);
		host.onDidChangeVisible?.(true, banner);
		this.storageService.store(this.options.storageKey, true, StorageScope.APPLICATION, StorageTarget.USER);

		this.preemptOthers();
		banner.announce();
		return true;
	}

	/** Close cards in the same group: only the most recent one is shown. */
	private preemptOthers(): void {
		const group = this.options.exclusionGroup;
		if (!group) {
			return;
		}

		for (const other of ChatInputOnboarding.exclusionGroups.get(group) ?? []) {
			if (other !== this && other.isVisible) {
				other.preempt();
			}
		}
	}

	/** Give this card back its first-run showing: it was displaced, not read. */
	private preempt(): void {
		if (this._consumedFirstRun && !this._restoredFirstRun) {
			this._restoredFirstRun = true;
			this.storageService.remove(this.options.storageKey, StorageScope.APPLICATION);
		}
		this.hide(false);
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
		this.currentOnboarding.clear();
		this._consumedFirstRun = false;
		this._activeFactory = undefined;
		// A card that is going away is not waiting to come back. `displace` puts
		// itself back into the queue after calling this.
		this._pending = undefined;
		if (wasVisible) {
			host?.onDidChangeVisible?.(false);
		}
		if (restoreFocus) {
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
