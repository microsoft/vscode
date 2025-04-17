/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../baseToken.js';
import { assert, assertNever } from '../../../../base/common/assert.js';
import { ObservableDisposable } from '../../../../base/common/observableDisposable.js';
import { newWriteableStream, WriteableStream, ReadableStream } from '../../../../base/common/stream.js';

/**
 * A readable stream of provided tokens.
 */
export class TokenStream<T extends BaseToken> extends ObservableDisposable implements ReadableStream<T> {
	/**
	 * Underlying writable stream instance.
	 */
	private readonly stream: WriteableStream<T>;

	/**
	 * Index of the next token to be sent.
	 */
	private index: number;

	/**
	 * Interval reference that is used to periodically send
	 * tokens to the stream in the background.
	 */
	private interval: ReturnType<typeof setInterval> | undefined;

	/**
	 * Number of tokens left to be sent.
	 */
	private get tokensLeft(): number {
		return this.tokens.length - this.index;
	}

	constructor(
		private readonly tokens: readonly T[],
	) {
		super();

		this.stream = newWriteableStream<T>(null);
		this.index = 0;

		// send couple of tokens immediately
		this.sendTokens();
	}

	/**
	 * Start periodically sending tokens to the stream
	 * asynchronously in the background.
	 */
	public startStream(): this {
		// already running, noop
		if (this.interval !== undefined) {
			return this;
		}

		// no tokens to send, end the stream immediately
		if (this.tokens.length === 0) {
			this.stream.end();
			return this;
		}

		// periodically send tokens to the stream
		this.interval = setInterval(() => {
			if (this.tokensLeft === 0) {
				clearInterval(this.interval);
				delete this.interval;

				return;
			}

			this.sendTokens();
		}, 1);

		return this;
	}

	/**
	 * Stop tokens sending interval.
	 */
	public stopStream(): this {
		if (this.interval === undefined) {
			return this;
		}

		clearInterval(this.interval);
		delete this.interval;

		return this;
	}

	/**
	 * Sends a provided number of tokens to the stream.
	 */
	private sendTokens(
		tokensCount: number = 25,
	): void {
		if (this.tokensLeft <= 0) {
			return;
		}

		// send up to 10 tokens at a time
		let tokensToSend = Math.min(this.tokensLeft, tokensCount);
		while (tokensToSend > 0) {
			assert(
				this.index < this.tokens.length,
				`Token index '${this.index}' is out of bounds.`,
			);

			this.stream.write(this.tokens[this.index]);
			this.index++;
			tokensToSend--;
		}

		// if sent all tokens, end the stream immediately
		if (this.tokensLeft === 0) {
			this.stream.end();
		}
	}

	public pause(): void {
		this.stopStream();

		return this.stream.pause();
	}

	public resume(): void {
		this.startStream();

		return this.stream.resume();
	}

	public destroy(): void {
		this.dispose();
	}

	public removeListener(event: string, callback: Function): void {
		return this.stream.removeListener(event, callback);
	}

	public on(event: 'data', callback: (data: T) => void): void;
	public on(event: 'error', callback: (err: Error) => void): void;
	public on(event: 'end', callback: () => void): void;
	public on(event: 'data' | 'error' | 'end', callback: (arg?: any) => void): void {
		if (event === 'data') {
			this.stream.on(event, callback);
			// this is the convention of the readable stream, - when
			// the `data` event is registered, the stream is started
			this.startStream();

			return;
		}

		if (event === 'error') {
			return this.stream.on(event, callback);
		}

		if (event === 'end') {
			return this.stream.on(event, callback);
		}

		assertNever(
			event,
			`Unexpected event name '${event}'.`,
		);
	}

	/**
	 * Cleanup send interval and destroy the stream.
	 */
	public override dispose(): void {
		this.stopStream();
		this.stream.destroy();

		super.dispose();
	}
}
