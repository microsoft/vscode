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

export interface IChatInputOnboardingBanner extends IDisposable {
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

		this.currentOnboarding.value = onboardingStore;
		this.setTipsVisible(host, false);
		host.onDidChangeVisible?.(true);
		this.storageService.store(this.options.storageKey, true, StorageScope.APPLICATION, StorageTarget.USER);

		banner.announce();
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
