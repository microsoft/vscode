/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IChatInputNoticeClaimOptions, IChatInputNoticeFocusTarget, IChatInputSurface, pickActiveChatInput, trackChatInputRecency } from './chatInputNoticeHost.js';
import { ChatInputStackSlot, setChatInputStackSlot } from './chatInputStack.js';

/**
 * The space above one chat input, as offered to an introduction. Claiming it is
 * the only way a card gets on screen: the notice host decides who leads, so
 * precedence against notifications and recency against a peer introduction are
 * one thing.
 */
export type ChatInputNoticeClaim = (options: IChatInputNoticeClaimOptions) => IDisposable;

export interface IChatInputOnboardingHostOptions {
	/** The element the card is appended to. */
	readonly container: HTMLElement;
	/** The element whose focus marks this host as the most recent one. */
	readonly focusRoot: HTMLElement;
	/** Hands focus back to this host's input when the card closes. */
	readonly focus?: () => void;
	/**
	 * Holds the space this host offers. Without one the card shows unconditionally,
	 * which is what the tests and any host with nothing else above the input want.
	 */
	readonly claimNotice?: ChatInputNoticeClaim;
}

interface IChatInputOnboardingHost extends IChatInputOnboardingHostOptions, IChatInputSurface {
	lastFocused: number;
}

type ChatInputOnboardingFactory = (context: IChatInputOnboardingContext) => IChatInputOnboardingBanner;

export interface IChatInputOnboardingOptions {
	readonly storageKey: string;
}

export interface IChatInputOnboardingContext {
	readonly container: HTMLElement;
	readonly dismiss: (restoreFocus?: boolean) => void;
}

export interface IChatInputOnboardingBanner extends IDisposable, IChatInputNoticeFocusTarget {
	announce(): void;
	/**
	 * Called when the card is put away for higher-precedence content, and again
	 * when it comes back. The card is kept alive across this, so anything it runs
	 * while on screen - microphone capture, audio, animation - must stop here
	 * rather than keep going somewhere the user cannot see.
	 */
	setVisible?(visible: boolean): void;
}

export class ChatInputOnboarding extends Disposable {

	private readonly hosts = new Set<IChatInputOnboardingHost>();
	/** The built card, kept alive while standing down so its state survives. */
	private readonly currentOnboarding = this._register(new MutableDisposable<IDisposable>());
	/**
	 * The held space. Outlives the card: it is what brings a card back. Held in a
	 * plain field rather than a `MutableDisposable` so a claim can be detached and
	 * released only once its replacement is in hand.
	 */
	private claim: IDisposable | undefined;
	private activeHost: IChatInputOnboardingHost | undefined;
	private activeBanner: IChatInputOnboardingBanner | undefined;
	/** Builds the card once this claim leads. */
	private wanted: ChatInputOnboardingFactory | undefined;
	private leading = false;
	/** Identifies the current request, so claims left on other inputs are ignored. */
	private generation = 0;

	/** Whether a card is built and on screen. */
	get isVisible(): boolean {
		return !!this.currentOnboarding.value && this.leading;
	}

	constructor(
		private readonly options: IChatInputOnboardingOptions,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this._register(toDisposable(() => {
			const claim = this.claim;
			this.claim = undefined;
			claim?.dispose();
		}));
	}

	registerHost(options: IChatInputOnboardingHostOptions): IDisposable {
		const host: IChatInputOnboardingHost = { ...options, lastFocused: 0 };
		this.hosts.add(host);

		const store = new DisposableStore();
		store.add(trackChatInputRecency(host));
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

		// Detach the previous claim instead of releasing it: letting the lane fall
		// free between two cards lets lower-precedence content flash into the gap
		// and report itself shown. It is released once the new claim is in hand.
		const previousClaim = this.claim;
		this.claim = undefined;
		this.hideCard(false);

		const generation = ++this.generation;
		this.activeHost = host;
		this.wanted = createOnboarding;

		if (!host.claimNotice) {
			previousClaim?.dispose();
			this.setLeading(true);
			return true;
		}

		// A newer claim leads its lane, so this both takes the space from a peer
		// introduction and yields to a notification, through one mechanism.
		const claim = host.claimNotice({
			focusTarget: {
				hasFocus: () => this.activeBanner?.hasFocus() ?? false,
				focus: () => this.activeBanner?.focus(),
				// The claim is held from here on, but the card is only built once it
				// leads - so until then there is nothing for focus to land on.
				canFocus: () => !!this.activeBanner,
			},
			// Scoped to this request: the card can move to another input, and the
			// claim left behind on the old one still reports standing down when it
			// is released. Acting on that would put the new card away.
			onDidChangeLeading: leading => {
				if (this.generation === generation) {
					this.setLeading(leading);
				}
			},
		});

		// Leadership is announced synchronously from the call above, so the card may
		// already have been built - or have dismissed itself - by now. Keep the claim
		// only if this request is still the one meant to be on screen, so a card that
		// failed to build releases the space rather than holding it with nothing in it.
		if (this.wanted === createOnboarding) {
			this.claim = claim;
		} else {
			claim.dispose();
		}
		previousClaim?.dispose();
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

		// The card stays built, so tell it to stand its live parts down too.
		this.activeBanner?.setVisible?.(false);
		// Focus is handed back to the input by whatever took the space, so the card
		// only has to take itself off screen.
		setChatInputStackSlot(host.container, ChatInputStackSlot.Empty);
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
			setChatInputStackSlot(host.container, ChatInputStackSlot.Standalone);
			this.activeBanner?.setVisible?.(true);
			return;
		}

		const onboardingStore = new DisposableStore();

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

		// The factory can take the card down while building it - by dismissing
		// straight away, or because the input it is docked to went away. Only
		// commit if this request is still the one meant to be on screen.
		if (this.activeHost !== host || this.wanted !== createOnboarding || !this.leading) {
			onboardingStore.dispose();
			return;
		}

		this.currentOnboarding.value = onboardingStore;
		this.activeBanner = banner;
		setChatInputStackSlot(host.container, ChatInputStackSlot.Standalone);
		// Recorded when the card is actually put in front of the user, so being
		// deferred or put away never counts as having been seen.
		this.storageService.store(this.options.storageKey, true, StorageScope.APPLICATION, StorageTarget.USER);
		banner.announce();
	}

	private getActiveHost(): IChatInputOnboardingHost | undefined {
		// A card is docked to a live container, which is not always the element
		// whose focus decides recency.
		return pickActiveChatInput(this.hosts, host => host.container.isConnected);
	}

	private hide(restoreFocus: boolean): void {
		const claim = this.claim;
		this.claim = undefined;
		this.hideCard(restoreFocus);
		claim?.dispose();
	}

	/** Take the card down without giving up the space it stands on. */
	private hideCard(restoreFocus: boolean): void {
		const host = this.activeHost;
		const wasVisible = this.isVisible;
		this.activeHost = undefined;
		this.activeBanner = undefined;
		this.wanted = undefined;
		this.leading = false;
		this.currentOnboarding.clear();
		if (host) {
			setChatInputStackSlot(host.container, ChatInputStackSlot.Empty);
		}
		if (wasVisible && restoreFocus) {
			host?.focus?.();
		}
	}
}
