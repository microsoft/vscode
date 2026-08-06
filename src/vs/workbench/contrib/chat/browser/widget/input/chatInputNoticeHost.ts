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

/**
 * Tracks which kinds of notice occupy the area above a single chat input so
 * lower-precedence content can stand down, instead of each producer reaching
 * into its siblings' DOM.
 */
export class ChatInputNoticeHost extends Disposable {

	private readonly _claims: number[] = new Array(LANE_COUNT).fill(0);
	private readonly _leases = this._register(new DisposableMap<ChatInputNoticeLane>());
	private readonly _occupiedLane = observableValue<ChatInputNoticeLane | undefined>(this, undefined);

	/** Focus target of the leading notice, when it has one. */
	private _focusTarget: IChatInputNoticeFocusTarget | undefined;

	constructor(private readonly _focusInput: () => void) {
		super();
	}

	/**
	 * Claim `lane` until the returned disposable is disposed. Claims are counted,
	 * so producers sharing a lane do not release each other.
	 */
	occupy(lane: ChatInputNoticeLane, focusTarget?: IChatInputNoticeFocusTarget): IDisposable {
		this._claims[lane]++;
		if (focusTarget) {
			this._focusTarget = focusTarget;
		}
		this._update();

		let released = false;
		return toDisposable(() => {
			if (released) {
				return;
			}
			released = true;
			this._claims[lane]--;
			if (focusTarget && this._focusTarget === focusTarget) {
				this._focusTarget = undefined;
			}
			this._update();
		});
	}

	/** Claim or release `lane` on behalf of a producer that reports visibility. */
	setOccupied(lane: ChatInputNoticeLane, occupied: boolean): void {
		if (!occupied) {
			this._leases.deleteAndDispose(lane);
		} else if (!this._leases.has(lane)) {
			this._leases.set(lane, this.occupy(lane));
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
		if (!this._focusTarget) {
			return false;
		}

		if (this._focusTarget.hasFocus()) {
			this._focusInput();
		} else {
			this._focusTarget.focus();
		}
		return true;
	}

	private _update(): void {
		const lane = this._claims.findIndex(claims => claims > 0);
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
	const onDidChangeVisible = () => host.setOccupied(
		ChatInputNoticeLane.Onboarding,
		voiceModeOnboardingService.isVisible || dictationOnboardingService.isVisible);
	const isBlocked = () => host.isSuppressed(ChatInputNoticeLane.Onboarding, undefined);

	const store = new DisposableStore();
	store.add(voiceModeOnboardingService.registerHost({
		container: containers.voice,
		focusRoot,
		focus: focusInput,
		onDidChangeVisible,
		isBlocked,
	}));
	store.add(dictationOnboardingService.registerHost({
		container: containers.dictation,
		focusRoot,
		onDidChangeVisible,
		isBlocked,
	}));
	return store;
}
