/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IReader, observableValue } from '../../../../../../base/common/observable.js';
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

/** A notice keyboard focus can be moved into and back out of. */
export interface IChatInputNoticeFocusTarget {
	hasFocus(): boolean;
	focus(): void;
}

interface IClaim {
	readonly focusTarget: IChatInputNoticeFocusTarget | undefined;
}

/**
 * Tracks which kinds of notice occupy the area above a single chat input so
 * lower-precedence content can stand down, instead of each producer reaching
 * into its siblings' DOM.
 */
export class ChatInputNoticeHost extends Disposable {

	private readonly _claims: IClaim[][] = Array.from({ length: LANE_COUNT }, () => []);
	private readonly _leases = this._register(new DisposableMap<ChatInputNoticeLane>());
	private readonly _occupiedLane = observableValue<ChatInputNoticeLane | undefined>(this, undefined);

	constructor(private readonly _focusInput: () => void) {
		super();
	}

	/**
	 * Claim `lane` until the returned disposable is disposed. Claims are counted,
	 * so producers sharing a lane do not release each other.
	 */
	occupy(lane: ChatInputNoticeLane, focusTarget?: IChatInputNoticeFocusTarget): IDisposable {
		const claim: IClaim = { focusTarget };
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
		this._leases.deleteAndDispose(lane);
		if (occupied) {
			this._leases.set(lane, this.occupy(lane, focusTarget));
		}
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
	 * The focus target of the notice that is actually leading. Scoped to the
	 * leading lane so focus can never land on a notice that another lane has
	 * displaced, and so a target cannot outlive the claim that supplied it.
	 */
	private _leadingFocusTarget(): IChatInputNoticeFocusTarget | undefined {
		const lane = this._occupiedLane.get();
		if (lane === undefined) {
			return undefined;
		}
		const claims = this._claims[lane];
		for (let i = claims.length - 1; i >= 0; i--) {
			if (claims[i].focusTarget) {
				return claims[i].focusTarget;
			}
		}
		return undefined;
	}

	private _update(): void {
		const lane = this._claims.findIndex(claims => claims.length > 0);
		this._occupiedLane.set(lane === -1 ? undefined : lane, undefined);
	}
}

/**
 * Docks the voice and dictation introductions above one chat input. Both share
 * the onboarding lane, and each defers rather than spending its single first-run
 * showing on a card a notification would hide.
 */
export function registerChatInputOnboardingHosts(
	host: ChatInputNoticeHost,
	containers: { readonly voice: HTMLElement; readonly dictation: HTMLElement },
	focusRoot: HTMLElement,
	focusInput: () => void,
	voiceModeOnboardingService: IVoiceModeOnboardingService,
	dictationOnboardingService: IDictationOnboardingService,
): IDisposable {
	// Tracked per registration rather than read off the services: a service is
	// visible window-wide, but a lane is claimed for one input. Aggregating the
	// services would leave this input's lane claimed by a card docked elsewhere.
	let voiceVisible: IChatInputNoticeFocusTarget | undefined;
	let dictationVisible: IChatInputNoticeFocusTarget | undefined;
	const update = () => {
		const focusTarget = voiceVisible ?? dictationVisible;
		host.setOccupied(ChatInputNoticeLane.Onboarding, !!focusTarget, focusTarget);
	};
	const isBlocked = (reader?: IReader) => host.isSuppressed(ChatInputNoticeLane.Onboarding, reader);

	const store = new DisposableStore();
	store.add(voiceModeOnboardingService.registerHost({
		container: containers.voice,
		focusRoot,
		focus: focusInput,
		onDidChangeVisible: (visible, focusTarget) => {
			voiceVisible = visible ? focusTarget : undefined;
			update();
		},
		isBlocked,
	}));
	store.add(dictationOnboardingService.registerHost({
		container: containers.dictation,
		focusRoot,
		onDidChangeVisible: (visible, focusTarget) => {
			dictationVisible = visible ? focusTarget : undefined;
			update();
		},
		isBlocked,
	}));
	return store;
}
