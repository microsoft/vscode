/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../lifecycle.js';
import { BaseDecoder } from './baseDecoder.js';

/**
 * Asynchronous interator wrapper for a decoder.
 */
export class AsyncDecoder<T extends NonNullable<unknown>, K extends NonNullable<unknown> = NonNullable<unknown>> extends Disposable {
	// Buffer of messages that have been decoded but not yet consumed.
	private readonly messages: T[] = [];

	/**
	 * A transient promise that is resolved when a new event
	 * is received. Used in the situation when there is no new
	 * data avaialble and decoder stream did not finish yet,
	 * hence we need to wait until new event is received.
	 */
	private resolveOnNewEvent?: (value: void) => void;

	/**
	 * @param decoder The decoder instance to wrap.
	 *
	 * Note! Assumes ownership of the `decoder` object, hence will `dipose`
	 * 		 it when the decoder stream is ended.
	 */
	constructor(
		private readonly decoder: BaseDecoder<T, K>,
	) {
		super();

		this._register(decoder);
	}

	/**
	 * Async iterator implementation.
	 */
	async *[Symbol.asyncIterator](): AsyncIterator<T | null> {
		// callback is called when `data` or `end` event is received
		const callback = (data?: T) => {
			if (data !== undefined) {
				this.messages.push(data);
			} else {
				this.decoder.removeListener('data', callback);
				this.decoder.removeListener('end', callback);
			}

			// is the promise resolve callback is present,
			// then call it and remove the reference
			if (this.resolveOnNewEvent) {
				this.resolveOnNewEvent();
				delete this.resolveOnNewEvent;
			}
		};
		this.decoder.on('data', callback);
		this.decoder.on('end', callback);

		// start flowing the decoder stream
		this.decoder.start();

		while (true) {
			const maybeMessage = this.messages.shift();
			if (maybeMessage !== undefined) {
				yield maybeMessage;
				continue;
			}

			// if no data available and stream ended, we're done
			if (this.decoder.ended) {
				this.dispose();

				return null;
			}

			// stream isn't ended so wait for the new
			// `data` or `end` event to be received
			await new Promise((resolve) => {
				this.resolveOnNewEvent = resolve;
			});
		}
	}
}
