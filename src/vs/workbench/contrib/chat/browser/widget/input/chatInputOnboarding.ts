/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, setVisibility, trackFocus } from '../../../../../../base/browser/dom.js';
import { alert } from '../../../../../../base/browser/ui/aria/aria.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';

interface IChatInputOnboardingHost {
	readonly container: HTMLElement;
	readonly focusRoot: HTMLElement;
	readonly focus: (() => void) | undefined;
	readonly tipContainer: HTMLElement | undefined;
	readonly onDidChangeVisible: ((visible: boolean) => void) | undefined;
	lastFocused: number;
}

export interface IChatInputOnboardingOptions {
	readonly storageKey: string;
	readonly hostClass: string;
}

export interface IChatInputOnboardingContext {
	readonly container: HTMLElement;
	readonly dismiss: (restoreFocus?: boolean) => void;
}

/**
 * The onboarding card returned by the create callback. `announce` alerts that
 * the card opened without moving focus; `focus` moves focus onto the card and
 * announces it, so screen reader users can hear and reach it.
 */
export interface IChatInputOnboardingBanner extends IDisposable {
	announce(): void;
	focus(): void;
}

/**
 * Builds the announcement hint that tells screen reader users how to move focus
 * onto the card by running `commandId`, including its keybinding when one is
 * bound. Returned as a sentence so it can be appended to the card label.
 */
export function focusHintForCommand(keybindingService: IKeybindingService, commandId: string): string {
	const keybinding = keybindingService.lookupKeybinding(commandId)?.getAriaLabel();
	return keybinding
		? localize('chatInputOnboarding.focusHint.keybinding', "Press {0} to focus the introduction.", keybinding)
		: localize('chatInputOnboarding.focusHint.command', "Run the Show Introduction command to focus it.");
}

export interface IChatInputOnboardingCardOptions {
	readonly container: HTMLElement;
	readonly className: string;
	readonly ariaLabel: string;
	readonly ariaDescription?: string;
	/**
	 * Optional hint appended to the open announcement telling screen reader
	 * users how to move focus onto the card (e.g. which command to run), since
	 * the card is out of the Tab order and cannot otherwise be reached.
	 */
	readonly focusHint?: string;
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
	private currentBanner: IChatInputOnboardingBanner | undefined;
	private activeHost: IChatInputOnboardingHost | undefined;

	get isVisible(): boolean {
		return !!this.currentOnboarding.value;
	}

	constructor(
		private readonly options: IChatInputOnboardingOptions,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
	}

	registerHost(container: HTMLElement, focusRoot: HTMLElement, focus?: () => void, tipContainer?: HTMLElement, onDidChangeVisible?: (visible: boolean) => void): IDisposable {
		const host: IChatInputOnboardingHost = {
			container,
			focusRoot,
			focus,
			tipContainer,
			onDidChangeVisible,
			lastFocused: 0,
		};
		this.hosts.add(host);

		const focusTracker = trackFocus(focusRoot);
		const focusListener = focusTracker.onDidFocus(() => host.lastFocused = Date.now());

		return toDisposable(() => {
			focusListener.dispose();
			focusTracker.dispose();
			this.hosts.delete(host);
			if (this.activeHost === host) {
				this.hide(false);
			}
		});
	}

	showIfNeeded(createOnboarding: (context: IChatInputOnboardingContext) => IChatInputOnboardingBanner): boolean {
		if (this.currentOnboarding.value) {
			return true;
		}
		if (this.storageService.getBoolean(this.options.storageKey, StorageScope.APPLICATION, false)) {
			return false;
		}
		return this.show(createOnboarding);
	}

	show(createOnboarding: (context: IChatInputOnboardingContext) => IChatInputOnboardingBanner): boolean {
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

		this.currentBanner = banner;
		onboardingStore.add(toDisposable(() => {
			if (this.currentBanner === banner) {
				this.currentBanner = undefined;
			}
		}));
		this.currentOnboarding.value = onboardingStore;
		this.setTipsVisible(host, false);
		host.onDidChangeVisible?.(true);
		this.storageService.store(this.options.storageKey, true, StorageScope.APPLICATION, StorageTarget.USER);

		// Let screen reader users know a card just opened. Focus is left where it
		// was so the user is not pulled away; a command moves focus onto the card
		// on demand and reads its label.
		banner.announce();
		return true;
	}

	/**
	 * Move focus onto the visible card so its label is announced. Returns `false`
	 * when there is no card to focus.
	 */
	focusCard(): boolean {
		if (!this.currentBanner) {
			return false;
		}
		this.currentBanner.focus();
		return true;
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
		if (wasVisible) {
			this.setTipsVisible(host, true);
			host?.onDidChangeVisible?.(false);
		}
		if (restoreFocus) {
			host?.focus?.();
		}
	}

	private setTipsVisible(host: IChatInputOnboardingHost | undefined, visible: boolean): void {
		if (host?.tipContainer) {
			setVisibility(visible, host.tipContainer);
		}
	}
}

export class ChatInputOnboardingCard extends Disposable {

	readonly domNode: HTMLElement;

	private readonly ariaLabel: string;
	private readonly ariaDescription: string | undefined;
	private readonly focusHint: string | undefined;

	constructor(options: IChatInputOnboardingCardOptions) {
		super();

		this.ariaLabel = options.ariaLabel;
		this.ariaDescription = options.ariaDescription;
		this.focusHint = options.focusHint;

		this.domNode = options.container.ownerDocument.createElement('div');
		this.domNode.classList.add(options.className);
		this.domNode.setAttribute('role', 'region');
		this.domNode.setAttribute('aria-label', options.ariaLabel);
		if (options.ariaDescription) {
			this.domNode.setAttribute('aria-description', options.ariaDescription);
		}

		options.container.appendChild(this.domNode);
		this._register(toDisposable(() => this.domNode.remove()));

		// Make the card a focus target so a command (or the controller when the
		// card is shown) can move focus onto it, letting the screen reader read
		// the region label and description. `-1` keeps it out of the Tab order.
		this.domNode.tabIndex = -1;

		this._register(addDisposableListener(this.domNode, EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Escape)) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				options.onEscape();
			}
		}));
	}

	/**
	 * Announce that the card opened without moving focus, so screen reader users
	 * are told something appeared while staying where they are. Includes the
	 * focus hint, if provided, so they know how to reach the card on demand.
	 */
	announce(): void {
		alert(this.focusHint ? `${this.ariaLabel}. ${this.focusHint}` : this.ariaLabel);
	}

	/**
	 * Move focus onto the card and announce its label so screen reader users
	 * hear what opened. Focusing the region alone is not reliably announced, so
	 * the label (and description, if any) are alerted explicitly.
	 */
	focus(): void {
		this.domNode.focus();
		alert(this.ariaDescription ? `${this.ariaLabel}. ${this.ariaDescription}` : this.ariaLabel);
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
