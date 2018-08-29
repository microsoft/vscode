/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { canceled, isPromiseCanceledError } from './errors';

/**
 * A cancellation token is passed to an asynchronous or long running
 * operation to request cancellation, like cancelling a request
 * for completion items because the user continued to type.
 *
 * To get an instance of a `CancellationToken` use a
 * [CancellationTokenSource](#CancellationTokenSource).
 */
export interface CancellationToken {
	/**
	 * Checks whether this token has already been canceled.
	 */
	readonly isCancellationRequested: boolean;

	/**
	 * An event emitted when cancellation is requested
	 * @event
	 */
	readonly onCancellationRequested: Event<any>;

	/**
	 * Throws if this token has already been canceled.
	 */
	throwIfCancellationRequested();
}

const shortcutEvent = Object.freeze(function (callback, context?): IDisposable {
	let handle = setTimeout(callback.bind(context), 0);
	return { dispose() { clearTimeout(handle); } };
} as Event<any>);

export namespace CancellationToken {

	/**
	 * A token that will never be canceled.
	 */
	export const None: CancellationToken = Object.freeze({
		isCancellationRequested: false,
		onCancellationRequested: Event.None,
		throwIfCancellationRequested() { },
	});

	/**
	 * A token that is already canceled.
	 */
	export const Cancelled: CancellationToken = Object.freeze({
		isCancellationRequested: true,
		onCancellationRequested: shortcutEvent,
		throwIfCancellationRequested() {
			throw canceledError();
		},
	});

	/**
	 * Returns an error that may be used to communicate cancellation.
	 */
	export function canceledError() {
		return canceled();
	}

	/**
	 * Tests an error to see whether it indicates cancellation.
	 * @param error The error to test.
	 */
	export function isCanceledError(error: any): boolean {
		return isPromiseCanceledError(error);
	}
}

class MutableToken implements CancellationToken {

	private _isCancelled: boolean = false;
	private _emitter: Emitter<any>;

	public cancel() {
		if (!this._isCancelled) {
			this._isCancelled = true;
			if (this._emitter) {
				this._emitter.fire(undefined);
				this.dispose();
			}
		}
	}

	get isCancellationRequested(): boolean {
		return this._isCancelled;
	}

	get onCancellationRequested(): Event<any> {
		if (this._isCancelled) {
			return shortcutEvent;
		}
		if (!this._emitter) {
			this._emitter = new Emitter<any>();
		}
		return this._emitter.event;
	}

	throwIfCancellationRequested() {
		if (this._isCancelled) {
			throw CancellationToken.canceledError();
		}
	}

	public dispose(): void {
		if (this._emitter) {
			this._emitter.dispose();
			this._emitter = undefined;
		}
	}
}

export class CancellationTokenSource {

	private _token: CancellationToken;

	get token(): CancellationToken {
		if (!this._token) {
			// be lazy and create the token only when
			// actually needed
			this._token = new MutableToken();
		}
		return this._token;
	}

	cancel(): void {
		if (!this._token) {
			// save an object by returning the default
			// cancelled token when cancellation happens
			// before someone asks for the token
			this._token = CancellationToken.Cancelled;

		} else if (this._token instanceof MutableToken) {
			// actually cancel
			this._token.cancel();
		}
	}

	dispose(): void {
		if (!this._token) {
			// ensure to initialize with an empty token if we had none
			this._token = CancellationToken.None;

		} else if (this._token instanceof MutableToken) {
			// actually dispose
			this._token.dispose();
		}
	}
}
