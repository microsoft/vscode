/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NewLine } from '../linesCodec/tokens/newLine.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { FrontMatterToken } from './tokens/frontMatterToken.js';
import { Space, Tab, Word } from '../simpleCodec/tokens/index.js';
import { CarriageReturn } from '../linesCodec/tokens/carriageReturn.js';
import { assert, assertNever } from '../../../../base/common/assert.js';
import { BaseDecoder } from '../../../../base/common/codecs/baseDecoder.js';
import { ObservableDisposable } from '../../../../base/common/observableDisposable.js';
import { SimpleDecoder, type TSimpleDecoderToken } from '../simpleCodec/simpleDecoder.js';
import { newWriteableStream, WriteableStream, ReadableStream } from '../../../../base/common/stream.js';
import { FrontMatterRecord, PartialFrontMatterRecord, PartialFrontMatterRecordName, PartialFrontMatterRecordNameWithDelimiter } from './parsers/frontMatterRecord.js';

/**
 * Tokens produced by this decoder.
 */
export type TFrontMatterToken = FrontMatterRecord | TSimpleDecoderToken;

/**
 * TODO: @legomushroom
 */
class TokenStream<T> extends ObservableDisposable implements ReadableStream<T> {
	private readonly _stream: WriteableStream<T>;

	/**
	 * TODO: @legomushroom
	 */
	private index: number;

	constructor(
		private readonly tokens: readonly T[],
	) {
		super();

		this._stream = newWriteableStream<T>(null);
		this.index = 0;

		this.startSendingTokens();
	}

	/**
	 * TODO: @legomushroom
	 */
	private interval: NodeJS.Timeout | undefined;

	/**
	 * TODO: @legomushroom
	 */
	private startSendingTokens(): void {
		assert(
			this.interval === undefined,
			'Tokens are already being sent.',
		);

		assert(
			this.index === 0,
			'Tokens are already being sent.',
		);

		if (this.tokens.length === 0) {
			this._stream.end();
			return;
		}

		this.interval = setInterval(() => {
			if (this.index >= this.tokens.length) {
				clearInterval(this.interval);
				delete this.interval;

				this._stream.end();

				return;
			}

			this.sendSomeTokens();
		}, 1);

		this._register({
			dispose: () => {
				clearInterval(this.interval);
				delete this.interval;
			}
		});
	}

	/**
	 * TODO: @legomushroom
	 */
	private sendSomeTokens(): void {
		const tokensLeft = this.tokens.length - this.index;
		if (tokensLeft <= 0) {
			return;
		}

		// send up to 10 tokens at a time
		let tokensToSend = Math.min(tokensLeft, 10);
		while (tokensToSend > 0) {
			assert(
				this.index < this.tokens.length,
				`Token index '${this.index}' is out of bounds.`,
			);

			this._stream.write(this.tokens[this.index]);
			this.index++;
			tokensToSend--;
		}
	}

	public pause(): void {
		return this._stream.pause();
	}

	public resume(): void {
		return this._stream.resume();
	}

	public destroy(): void {
		this._stream.destroy();
		this.dispose();
	}

	public removeListener(event: string, callback: Function): void {
		return this._stream.removeListener(event, callback);
	}

	public on(event: 'data', callback: (data: T) => void): void;
	public on(event: 'error', callback: (err: Error) => void): void;
	public on(event: 'end', callback: () => void): void;
	public on(event: 'data' | 'error' | 'end', callback: (arg?: any) => void): void {
		if (event === 'data') {
			return this._stream.on(event, callback);
		}

		if (event === 'error') {
			return this._stream.on(event, callback);
		}

		if (event === 'end') {
			return this._stream.on(event, callback);
		}

		assertNever(
			event,
			`Unexpected event name '${event}'.`,
		);
	}
}

/**
 * TODO: @legomushroom
 */
export class FrontMatterDecoder extends BaseDecoder<TFrontMatterToken, TSimpleDecoderToken> {
	/**
	 * TODO: @legomushroom
	 */
	private current?: PartialFrontMatterRecordName | PartialFrontMatterRecordNameWithDelimiter | PartialFrontMatterRecord;

	constructor(
		stream: ReadableStream<VSBuffer> | TokenStream<TSimpleDecoderToken> | SimpleDecoder,
	) {
		if ((stream instanceof TokenStream) || (stream instanceof SimpleDecoder)) {
			super(stream);

			return;
		}

		super(new SimpleDecoder(stream));
	}

	/**
	 * TODO: @legomushroom
	 */
	public static fromTokens(
		tokens: readonly TSimpleDecoderToken[],
	): FrontMatterDecoder {
		return new FrontMatterDecoder(new TokenStream(tokens));
	}

	protected override onStreamData(token: TSimpleDecoderToken): void {
		if (this.current !== undefined) {
			const acceptResult = this.current.accept(token);
			const { result, wasTokenConsumed } = acceptResult;

			if (result === 'failure') {
				this.reEmitCurrentTokens();

				if (wasTokenConsumed === false) {
					this._onData.fire(token);
				}

				delete this.current;
				return;
			}

			const { nextParser } = acceptResult;

			if (nextParser instanceof FrontMatterToken) {
				this._onData.fire(nextParser);

				if (wasTokenConsumed === false) {
					this._onData.fire(token);
				}

				delete this.current;
				return;
			}

			this.current = nextParser;
			if (wasTokenConsumed === false) {
				this._onData.fire(token);
			}

			return;
		}

		// TODO: @legomushroom - add other tokens?
		// TODO: @legomushroom - reuse common constant with the tokens list
		if ((token instanceof Space) || (token instanceof Tab) || (token instanceof CarriageReturn) || (token instanceof NewLine)) {
			this._onData.fire(token);
			return;
		}

		if (token instanceof Word) {
			this.current = new PartialFrontMatterRecordName(token);
			return;
		}

		// unexpected token type, re-emit existing tokens and continue
		// TODO: @legomushroom - fire an error event?
		this.reEmitCurrentTokens();
	}

	protected override onStreamEnd(): void {
		try {
			if (this.current === undefined) {
				return;
			}

			// TODO: @legomushroom - fire an error event?
			this.reEmitCurrentTokens();
		} finally {
			delete this.current;
			super.onStreamEnd();
		}
	}

	/**
	 * Re-emit tokens accumulated so far in the current parser object.
	 */
	protected reEmitCurrentTokens(): void {
		if (this.current === undefined) {
			return;
		}

		for (const token of this.current.tokens) {
			this._onData.fire(token);
		}
		delete this.current;
	}
}
