/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';

/** What opening a chat window has set up so far, which a failure has to take down again. */
export interface IChatWindowOpening {
	readonly disposables: DisposableStore;
	/** Closes the part of the window, once it is created. */
	close?: () => boolean;
}

/** Runs `open`, and when it fails, disposes what it set up and closes the part it created, before rethrowing. */
export async function openCleaningUpOnFailure<T>(open: (opening: IChatWindowOpening) => Promise<T>): Promise<T> {
	const opening: IChatWindowOpening = { disposables: new DisposableStore() };
	try {
		return await open(opening);
	} catch (error) {
		opening.disposables.dispose();
		opening.close?.();
		throw error;
	}
}

/** Gives the same promise to everyone who asks for the same key while it is pending. */
export class InFlightOperations<T> {

	private readonly _pending = new Map<string, Promise<T>>();

	run(key: string, operation: () => Promise<T>): Promise<T> {
		const pending = this._pending.get(key);
		if (pending) {
			return pending;
		}
		const promise = operation().finally(() => this._pending.delete(key));
		this._pending.set(key, promise);
		return promise;
	}
}

/** How long a chat model stays held for its view to bind to it, when the view never reports having done so. */
export const CHAT_MODEL_HOLD_TIMEOUT = 10_000;

/**
 * Holds the loaded model of a chat while it moves between views, such as from the main window's grid to a chat window:
 * the model is released when its last view lets go, so without it the view that takes over loads the history again.
 * The hold only bridges the move: it is released as soon as the new view has bound to the model, so that switching chats
 * afterwards does not keep a large model alive, and in any case after {@link CHAT_MODEL_HOLD_TIMEOUT}, or when disposed.
 */
export class ChatModelHold extends Disposable {

	private readonly _hold = this._register(new MutableDisposable<IDisposable>());
	private readonly _poll = this._register(new IntervalTimer());

	constructor(
		private readonly _acquire: (resource: URI) => IDisposable | undefined,
		private readonly _timeout = CHAT_MODEL_HOLD_TIMEOUT,
		private readonly _pollInterval = 100,
	) {
		super();
	}

	/** Holds the model of `resource` if it is loaded, instead of what is held; nothing when `resource` is undefined. `isBound` tells when the new view has bound. */
	hold(resource: URI | undefined, isBound: () => boolean): void {
		this._poll.cancel();
		this._hold.value = resource ? this._acquire(resource) : undefined;
		if (!this._hold.value) {
			return;
		}
		let waited = 0;
		this._poll.cancelAndSet(() => {
			waited += this._pollInterval;
			if (isBound() || waited >= this._timeout) {
				this.release();
			}
		}, this._pollInterval);
	}

	release(): void {
		this._poll.cancel();
		this._hold.clear();
	}

	get isHolding(): boolean {
		return !!this._hold.value;
	}
}
