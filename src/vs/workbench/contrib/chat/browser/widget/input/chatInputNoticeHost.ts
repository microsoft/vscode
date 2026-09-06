/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow, isAncestorOfActiveElement, trackFocus } from '../../../../../../base/browser/dom.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';

/**
 * The kinds of content competing for the space directly above a chat input, in
 * precedence order. Lower wins, so the lowest claimed lane is the one leading.
 */
export const enum ChatInputNoticeLane {
	/** Quota, promo, permission and extension-provided notifications. */
	Notification = 0,
	/** Voice and dictation introductions. */
	Onboarding = 1,
	/** Getting-started tips. Always yields to anything else. */
	Tip = 2,
}

const LANE_COUNT = 3;

/** A notice keyboard focus can be moved into and back out of. */
export interface IChatInputNoticeFocusTarget {
	hasFocus(): boolean;
	focus(): void;
	/**
	 * Whether there is anything to focus yet. Claims can be held before their
	 * content exists, and focus must not be reported as handled in that window.
	 */
	canFocus?(): boolean;
}

/** One chat input, as seen by anything that has to pick between several. */
export interface IChatInputSurface {
	readonly focusRoot: HTMLElement;
	lastFocused: number;
}

/**
 * Keeps `surface.lastFocused` current. Shared so everything ranking chat inputs
 * measures recency the same way.
 */
export function trackChatInputRecency(surface: IChatInputSurface): IDisposable {
	const store = new DisposableStore();
	const focusTracker = store.add(trackFocus(surface.focusRoot));
	store.add(focusTracker.onDidFocus(() => surface.lastFocused = Date.now()));
	return store;
}

/**
 * The chat input the user is most plausibly working in: the focused one if there
 * is one, otherwise the most recently focused. Only inputs that are on screen in
 * the active window are considered, so content is never docked to - and focus
 * never jumps to - an input in a background window.
 *
 * `isEligible` narrows the field further for callers that need something more
 * from the input than that it is usable.
 */
export function pickActiveChatInput<T extends IChatInputSurface>(surfaces: Iterable<T>, isEligible?: (surface: T) => boolean): T | undefined {
	const activeDocument = getActiveWindow().document;
	let mostRecent: T | undefined;
	for (const surface of surfaces) {
		const focusRoot = surface.focusRoot;
		if (focusRoot.ownerDocument !== activeDocument || !focusRoot.isConnected || focusRoot.getClientRects().length === 0) {
			continue;
		}
		if (isEligible && !isEligible(surface)) {
			continue;
		}
		if (isAncestorOfActiveElement(focusRoot)) {
			return surface;
		}
		if (!mostRecent || surface.lastFocused > mostRecent.lastFocused) {
			mostRecent = surface;
		}
	}
	return mostRecent;
}

export interface IChatInputNoticeClaimOptions {
	/** How to move keyboard focus into this notice while it is on screen. */
	readonly focusTarget?: IChatInputNoticeFocusTarget;
	/**
	 * Called when this claim starts or stops being the notice on screen. A claim
	 * is held while standing down, so content put away for something with higher
	 * precedence - or for a newer notice in its own lane - comes back on its own.
	 */
	readonly onDidChangeLeading?: (leading: boolean) => void;
}

interface IClaim extends IChatInputNoticeClaimOptions { }

/**
 * Tracks which kinds of notice occupy the area above a single chat input so
 * lower-precedence content can stand down, instead of each producer reaching
 * into its siblings' DOM.
 *
 * Exactly one claim leads at a time: the newest claim in the lowest occupied
 * lane. Everything else stands down but keeps its claim, so precedence between
 * categories and recency within a category are the same mechanism.
 */
export class ChatInputNoticeHost extends Disposable {

	private readonly _claims: IClaim[][] = Array.from({ length: LANE_COUNT }, () => []);
	private readonly _leases = this._register(new DisposableMap<ChatInputNoticeLane>());
	/** The claim currently announced as being on screen. */
	private _leadingClaim: IClaim | undefined;
	private _notifying = false;
	private _isDisposed = false;
	/** Identifies the current `setOccupied` call, so stale leases are not stored. */
	private _leaseToken = 0;

	constructor(private readonly _focusInput: () => void) {
		super();
	}

	/**
	 * Claim `lane` until the returned disposable is disposed. Claims are counted,
	 * so producers sharing a lane do not release each other.
	 */
	occupy(lane: ChatInputNoticeLane, options?: IChatInputNoticeClaimOptions): IDisposable {
		if (this._isDisposed) {
			// Teardown releases leases, and a producer reacting to that must not be
			// able to put content back on an input that is going away.
			return Disposable.None;
		}

		const claim: IClaim = options ?? {};
		this._claims[lane].push(claim);
		this._notifyLeading();

		let released = false;
		return toDisposable(() => {
			if (released) {
				return;
			}
			released = true;
			const claims = this._claims[lane];
			const index = claims.indexOf(claim);
			if (index !== -1) {
				claims.splice(index, 1);
			}
			this._notifyLeading();
		});
	}

	/** Claim or release `lane` on behalf of a producer that reports visibility. */
	setOccupied(lane: ChatInputNoticeLane, occupied: boolean, focusTarget?: IChatInputNoticeFocusTarget): void {
		const token = ++this._leaseToken;
		if (!occupied) {
			// Detach the lease before disposing it. Releasing a claim notifies
			// observers synchronously, and a reaction that re-claims this lane would
			// otherwise have its fresh lease dropped from the map undisposed,
			// stranding the claim and holding the lane forever.
			this._leases.deleteAndLeak(lane)?.dispose();
			return;
		}

		// Claim before releasing the previous lease, so swapping the notice in a
		// lane (or just refreshing its focus target) never leaves the lane
		// momentarily free for lower-precedence content to flash into.
		const lease = this.occupy(lane, { focusTarget });
		if (this._isDisposed || this._leaseToken !== token) {
			// A reaction to the claim above already released or replaced this lane.
			// Storing the lease now would install one nothing can reach, holding the
			// lane for good.
			lease.dispose();
			return;
		}
		this._leases.set(lane, lease);
	}

	/**
	 * Moves focus into the notice currently showing, or back to the input when it
	 * already has focus. Returns false when there is nothing to focus.
	 */
	toggleFocus(): boolean {
		if (!this.hasFocusableNotice()) {
			return false;
		}

		const focusTarget = this._leadingClaim!.focusTarget!;
		if (focusTarget.hasFocus()) {
			this._focusInput();
		} else {
			focusTarget.focus();
		}
		return true;
	}

	/**
	 * Whether focus can actually be moved into the notice leading here, so a
	 * caller choosing between hosts never settles on one that would do nothing.
	 * Only the leading claim counts, so focus can never land on a notice that
	 * something else has put away.
	 */
	hasFocusableNotice(): boolean {
		const focusTarget = this._leadingClaim?.focusTarget;
		return !!focusTarget && (focusTarget.canFocus?.() ?? true);
	}

	/**
	 * Brings the announced leader in line with the claims actually held.
	 *
	 * Standing down is a real side effect - it moves focus and hides DOM - so a
	 * callback can change who owns the space while this is still running. State
	 * is therefore re-read after every single notification rather than captured
	 * up front, so a leader that has since been replaced is never announced.
	 */
	private _notifyLeading(): void {
		if (this._notifying) {
			// The running pass re-reads state after each callback, so it picks this
			// change up itself instead of announcing it out of order.
			return;
		}

		this._notifying = true;
		try {
			while (!this._isDisposed) {
				const lane = this._claims.findIndex(claims => claims.length > 0);
				const leading = lane === -1 ? undefined : this._claims[lane].at(-1);
				if (leading === this._leadingClaim) {
					return;
				}

				// Stand the outgoing leader down before announcing the incoming one,
				// so the space is never reported as belonging to two claims at once.
				if (this._leadingClaim) {
					const previous = this._leadingClaim;
					this._leadingClaim = undefined;
					this._standDown(previous);
				} else {
					this._leadingClaim = leading;
					leading?.onDidChangeLeading?.(true);
				}
			}
		} finally {
			this._notifying = false;
		}
	}

	/**
	 * Tells `claim` it is no longer the notice on screen, and keeps keyboard focus
	 * out of the void.
	 *
	 * Standing down is not the producer's decision - the space is being taken for
	 * something else - so a producer that had focus is about to hide content that
	 * holds it. Leaving focus on `<body>` would also drop the context keys the chat
	 * keybindings depend on, so it returns to the input here rather than in every
	 * producer that can be displaced. The incoming notice is announced, not focused,
	 * so the input is always the right destination.
	 */
	private _standDown(claim: IClaim): void {
		const hadFocus = claim.focusTarget?.hasFocus() ?? false;
		claim.onDidChangeLeading?.(false);
		if (hadFocus && !this._isDisposed) {
			this._focusInput();
		}
	}

	override dispose(): void {
		// Disposal is terminal: drop every claim and stand the leader down before
		// the leases go, so releasing a notification during teardown cannot promote
		// a pending claim - and rebuild its content - on an input that is going away.
		this._isDisposed = true;
		const leading = this._leadingClaim;
		this._leadingClaim = undefined;
		for (const claims of this._claims) {
			claims.length = 0;
		}
		leading?.onDidChangeLeading?.(false);
		super.dispose();
	}
}
