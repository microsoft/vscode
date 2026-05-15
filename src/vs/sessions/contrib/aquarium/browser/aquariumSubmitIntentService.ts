/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Maximum age, in milliseconds, of a submit intent that the session-population
 * driver will still associate with an incoming session. Beyond this window the
 * intent is considered stale (the user likely cancelled or the underlying
 * provider failed) and the next session add is treated as ambient.
 */
export const SUBMIT_INTENT_WINDOW_MS = 5000;

export const IAquariumSubmitIntentService = createDecorator<IAquariumSubmitIntentService>('aquariumSubmitIntentService');

/**
 * Lightweight bus that bridges the chat input's send button to the
 * sessions-aware aquarium driver. The chat input calls
 * {@link recordIntent} synchronously when the user clicks send; the driver
 * calls {@link consumeIntent} when it observes a freshly-added agent-host
 * session and uses the result to opt the fish into the "grow from spawn"
 * tween.
 *
 * Decoupled via a service rather than a direct reference because the chat
 * input doesn't know whether the aquarium experience is active — it just
 * always reports intents and the driver chooses whether to consume them.
 */
export interface IAquariumSubmitIntentService {
	readonly _serviceBrand: undefined;

	/**
	 * Record that the user has just submitted a new chat. Subsequent calls
	 * within {@link SUBMIT_INTENT_WINDOW_MS} overwrite the previous timestamp
	 * (latest intent wins).
	 */
	recordIntent(): void;

	/**
	 * Consume the most recent intent if it was recorded within
	 * {@link SUBMIT_INTENT_WINDOW_MS}. Returns `true` exactly once per
	 * recorded intent; the timestamp is cleared on consumption.
	 */
	consumeIntent(): boolean;
}

export class AquariumSubmitIntentService implements IAquariumSubmitIntentService {
	declare readonly _serviceBrand: undefined;

	private _lastIntentAt: number | undefined;

	recordIntent(): void {
		this._lastIntentAt = Date.now();
	}

	consumeIntent(): boolean {
		const at = this._lastIntentAt;
		if (at === undefined) {
			return false;
		}
		this._lastIntentAt = undefined;
		return Date.now() - at <= SUBMIT_INTENT_WINDOW_MS;
	}
}
