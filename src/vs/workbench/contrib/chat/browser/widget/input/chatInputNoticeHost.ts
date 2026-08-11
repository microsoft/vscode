/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError, onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IReader, observableValue } from '../../../../../../base/common/observable.js';
import { IChatInputNoticeSlot } from './chatInputOnboarding.js';
import { IDictationOnboardingService } from '../../speechToText/dictationOnboarding.js';
import { IVoiceModeOnboardingService } from '../../../../agentsVoice/browser/voiceModeOnboarding.js';

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

/** Claims that keep answering each other are a bug, not something to spin on. */
const MAX_NOTIFY_ITERATIONS = 100;

/** A notice keyboard focus can be moved into and back out of. */
export interface IChatInputNoticeFocusTarget {
	hasFocus(): boolean;
	focus(): void;
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
	private readonly _occupiedLane = observableValue<ChatInputNoticeLane | undefined>(this, undefined);
	/** The claim currently announced as being on screen. */
	private _leadingClaim: IClaim | undefined;
	private _notifying = false;

	constructor(private readonly _focusInput: () => void) {
		super();
	}

	/**
	 * Claim `lane` until the returned disposable is disposed. Claims are counted,
	 * so producers sharing a lane do not release each other.
	 */
	occupy(lane: ChatInputNoticeLane, options?: IChatInputNoticeClaimOptions): IDisposable {
		const claim: IClaim = options ?? {};
		this._claims[lane].push(claim);
		this._update();

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
			this._update();
		});
	}

	/** Claim or release `lane` on behalf of a producer that reports visibility. */
	setOccupied(lane: ChatInputNoticeLane, occupied: boolean, focusTarget?: IChatInputNoticeFocusTarget): void {
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
		this._leases.set(lane, lease);
	}

	/** Whether content in `lane` should yield to something already showing. */
	isSuppressed(lane: ChatInputNoticeLane, reader: IReader | undefined): boolean {
		const occupied = this._occupiedLane.read(reader);
		return occupied !== undefined && occupied < lane;
	}

	/**
	 * Moves focus into the notice currently showing, or back to the input when it
	 * already has focus. Returns false when there is nothing to focus.
	 */
	toggleFocus(): boolean {
		const focusTarget = this._leadingFocusTarget();
		if (!focusTarget) {
			return false;
		}

		if (focusTarget.hasFocus()) {
			this._focusInput();
		} else {
			focusTarget.focus();
		}
		return true;
	}

	/**
	 * The focus target of the notice that is actually leading, so focus can never
	 * land on a notice that something else has put away, and a target cannot
	 * outlive the claim that supplied it.
	 */
	private _leadingFocusTarget(): IChatInputNoticeFocusTarget | undefined {
		return this._leadingClaim?.focusTarget;
	}

	private _update(): void {
		const lane = this._claims.findIndex(claims => claims.length > 0);
		// May re-enter through a reaction that claims or releases a lane.
		this._occupiedLane.set(lane === -1 ? undefined : lane, undefined);
		this._notifyLeading();
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
			for (let iteration = 0; ; iteration++) {
				const lane = this._claims.findIndex(claims => claims.length > 0);
				const leading = lane === -1 ? undefined : this._claims[lane].at(-1);
				if (leading === this._leadingClaim) {
					return;
				}
				if (iteration >= MAX_NOTIFY_ITERATIONS) {
					onUnexpectedError(new BugIndicatingError('Chat input notice claims did not settle'));
					return;
				}

				if (this._leadingClaim) {
					const previous = this._leadingClaim;
					this._leadingClaim = undefined;
					previous.onDidChangeLeading?.(false);
				} else {
					this._leadingClaim = leading;
					leading?.onDidChangeLeading?.(true);
				}
			}
		} finally {
			this._notifying = false;
		}
	}
}

/**
 * Docks the voice and dictation introductions above one chat input. Both claim
 * the onboarding lane directly, so the host arbitrates between them the same way
 * it arbitrates against a notification: the newest claim leads, the other stands
 * down and comes back when the newer one goes away.
 */
export function registerChatInputOnboardingHosts(
	host: ChatInputNoticeHost,
	containers: { readonly voice: HTMLElement; readonly dictation: HTMLElement },
	focusRoot: HTMLElement,
	focusInput: () => void,
	voiceModeOnboardingService: IVoiceModeOnboardingService,
	dictationOnboardingService: IDictationOnboardingService,
): IDisposable {
	const slot: IChatInputNoticeSlot = {
		claim: options => host.occupy(ChatInputNoticeLane.Onboarding, options),
	};

	const store = new DisposableStore();
	store.add(voiceModeOnboardingService.registerHost({
		container: containers.voice,
		focusRoot,
		focus: focusInput,
		noticeSlot: slot,
	}));
	store.add(dictationOnboardingService.registerHost({
		container: containers.dictation,
		focusRoot,
		focus: focusInput,
		noticeSlot: slot,
	}));
	return store;
}
