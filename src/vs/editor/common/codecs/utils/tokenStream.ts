/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../baseToken.js';
import { assertNever } from '../../../../base/common/assert.js';
import { assertDefined } from '../../../../base/common/types.js';
import { ObservableDisposable } from '../../../../base/common/observableDisposable.js';
import { newWriteableStream, WriteableStream, ReadableStream } from '../../../../base/common/stream.js';

/**
 * A readable stream of provided tokens.
 */
// TODO: @legomushroom - add unit tests
export class TokenStream<T extends BaseToken> extends ObservableDisposable implements ReadableStream<T> {
	/**
	 * Underlying writable stream instance.
	 */
	private readonly stream: WriteableStream<T>;

	/**
	 * Interval reference that is used to periodically send
	 * tokens to the stream in the background.
	 */
	private interval: ReturnType<typeof setImmediate> | undefined;

	/**
	 * TODO: @legomushroom
	 */
	private readonly tokens: T[];

	constructor(
		tokens: readonly T[],
	) {
		super();

		this.stream = newWriteableStream<T>(null);

		// copy and reverse the tokens list so we can pop items from its e end
		this.tokens = [...tokens].reverse();
		// send couple of tokens immediately
		this.send(false);
	}

	/**
	 * TODO: @legomushroom
	 */
	public send(
		play: boolean = true,
	): void {
		this.sendTokens()
			.then(() => {
				if (this.tokens.length === 0) {
					this.stream.end();
					this.stopStream();
					return;
				}

				if (play === false) {
					this.stopStream();
					return;
				}

				this.interval = setImmediate(this.send.bind(this));
			})
			.catch(() => {
				this.stream.destroy();
				this.stream.end();
				this.stopStream();
			});
	}

	/**
	 * Stop tokens sending interval.
	 */
	public stopStream(): this {
		if (this.interval === undefined) {
			return this;
		}

		clearImmediate(this.interval);
		delete this.interval;

		return this;
	}

	/**
	 * Sends a provided number of tokens to the stream.
	 */
	private async sendTokens(
		tokensCount: number = 25,
	): Promise<void> {
		// if (this.tokens.length === 0) {
		// 	return;
		// }

		// send up to 'tokensCount' tokens at a time
		while ((tokensCount > 0) && (this.tokens.length > 0)) {
			try {
				const token = this.tokens.pop();

				assertDefined(
					token,
					`Token must be defined. Tokens left: ${this.tokens.length}.`,
				);

				await this.stream.write(token);
			} catch {
				this.stream.destroy();
				this.stream.end();
				this.stopStream();
				return;
			}
		}
	}

	public pause(): void {
		this.stopStream();
		this.stream.pause();

		return;
	}

	public resume(): void {
		this.send();
		this.stream.resume();

		return;
	}

	public destroy(): void {
		this.dispose();
	}

	public removeListener(event: string, callback: Function): void {
		this.stream.removeListener(event, callback);

		return;
	}

	public on(event: 'data', callback: (data: T) => void): void;
	public on(event: 'error', callback: (err: Error) => void): void;
	public on(event: 'end', callback: () => void): void;
	public on(event: 'data' | 'error' | 'end', callback: (...args: any[]) => void): void {
		if (event === 'data') {
			this.stream.on(event, callback);
			// this is the convention of the readable stream, - when
			// the `data` event is registered, the stream is started
			this.send();

			return;
		}

		if (event === 'error') {
			this.stream.on(event, callback);
			return;
		}

		if (event === 'end') {
			this.stream.on(event, callback);
			return;
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
