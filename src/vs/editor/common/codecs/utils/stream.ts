/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from '../../model.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { assert, assertNever } from '../../../../base/common/assert.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ObservableDisposable } from '../../../../base/common/observableDisposable.js';
import { newWriteableStream, WriteableStream, ReadableStream } from '../../../../base/common/stream.js';

/**
 * A readable stream of provided tokens.
 */
export class Stream<T extends object> extends ObservableDisposable implements ReadableStream<T> {
	/**
	 * Flag that indicates whether the stream has ended.
	 */
	private ended: boolean = false;

	/**
	 * Underlying writable stream instance.
	 */
	private readonly stream: WriteableStream<T>;

	/**
	 * Interval reference that is used to periodically send
	 * tokens to the stream in the background.
	 */
	private interval: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly data: Generator<T, undefined>,
		private readonly cancellationToken?: CancellationToken,
	) {
		super();

		this.stream = newWriteableStream<T>(null);

		if (cancellationToken?.isCancellationRequested) {
			this.end();
			return;
		}

		// send a first batch of tokens immediately
		this.send(true);
	}

	/**
	 * Starts process of sending tokens to the stream.
	 *
	 * @param stopAfterFirstSend whether to continue sending data to the stream or
	 *             stop sending after the first batch of data is sent
	 */
	public send(
		stopAfterFirstSend: boolean = false,
	): void {
		if (this.cancellationToken?.isCancellationRequested) {
			this.end();

			return;
		}

		assert(
			this.ended === false,
			'Cannot send on already ended stream.',
		);

		this.sendTokens()
			.then(() => {
				if (this.cancellationToken?.isCancellationRequested) {
					this.end();

					return;
				}

				if (this.ended) {
					this.end();

					return;
				}

				if (stopAfterFirstSend === true) {
					this.stopStream();
					return;
				}

				this.interval = setTimeout(this.send.bind(this));
			})
			.catch((error) => {
				this.stream.error(error);
				this.dispose();
			});
	}

	/**
	 * Stop tokens sending interval.
	 */
	public stopStream(): this {
		if (this.interval === undefined) {
			return this;
		}

		clearTimeout(this.interval);
		delete this.interval;

		return this;
	}

	/**
	 * Sends a provided number of tokens to the stream.
	 */
	private async sendTokens(
		tokensCount: number = 25,
	): Promise<void> {
		// send up to 'tokensCount' tokens at a time
		while (tokensCount > 0) {
			try {
				const token = this.data.next();
				if (token.done || this.cancellationToken?.isCancellationRequested) {
					this.end();

					return;
				}

				await this.stream.write(token.value);
				tokensCount--;
			} catch (error) {
				this.stream.error(error);
				this.dispose();
				return;
			}
		}
	}

	/**
	 * Ends the stream and stops sending tokens.
	 */
	private end(): this {
		if (this.ended) {
			return this;
		}
		this.ended = true;

		this.stopStream();
		this.stream.end();
		return this;
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

	public removeListener(event: string, callback: (...args: any[]) => void): void {
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

	/**
	 * Create new instance of the stream from a provided array.
	 */
	public static fromArray<T extends object>(
		array: T[],
		cancellationToken?: CancellationToken,
	): Stream<T> {
		return new Stream(arrayToGenerator(array), cancellationToken);
	}

	/**
	 * Create new instance of the stream from a provided text model.
	 */
	public static fromTextModel(
		model: ITextModel,
		cancellationToken?: CancellationToken,
	): Stream<VSBuffer> {
		return new Stream(modelToGenerator(model), cancellationToken);
	}
}

/**
 * Create a generator out of a provided array.
 */
export const arrayToGenerator = <T extends NonNullable<unknown>>(array: T[]): Generator<T, undefined> => {
	return (function* (): Generator<T, undefined> {
		for (const item of array) {
			yield item;
		}
	})();
};

/**
 * Create a generator out of a provided text model.
 */
export const modelToGenerator = (model: ITextModel): Generator<VSBuffer, undefined> => {
	return (function* (): Generator<VSBuffer, undefined> {
		const totalLines = model.getLineCount();
		let currentLine = 1;

		while (currentLine <= totalLines) {
			if (model.isDisposed()) {
				return undefined;
			}

			yield VSBuffer.fromString(
				model.getLineContent(currentLine),
			);
			if (currentLine !== totalLines) {
				yield VSBuffer.fromString(
					model.getEOL(),
				);
			}

			currentLine++;
		}
	})();
};
