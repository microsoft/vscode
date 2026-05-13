/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';

/**
 * Registry of parked deferred promises keyed by string id. Used to
 * track request/response round-trips where a callback fires a signal
 * that an external responder may resolve synchronously.
 *
 * The atomic register-then-fire is enforced by {@link registerAndFire}
 * rather than by convention: a synchronous responder (e.g.
 * `agentSideEffects.ts:_handleToolReady` auto-approving writes inside
 * the listener for the fired signal) registered AFTER the fire would
 * miss its response and the awaited promise would deadlock — a
 * regression caught in Claude phase 7.
 */
export class PendingRequestRegistry<T> {
	private readonly _entries = new Map<string, DeferredPromise<T>>();

	registerAndFire(key: string, fire: () => void): Promise<T> {
		const deferred = new DeferredPromise<T>();
		this._entries.set(key, deferred);
		fire();
		return deferred.p;
	}

	respond(key: string, value: T): boolean {
		const deferred = this._entries.get(key);
		if (!deferred) {
			return false;
		}
		this._entries.delete(key);
		deferred.complete(value);
		return true;
	}

	denyAll(denyValue: T): void {
		for (const [, deferred] of this._entries) {
			if (!deferred.isSettled) {
				deferred.complete(denyValue);
			}
		}
		this._entries.clear();
	}
}
