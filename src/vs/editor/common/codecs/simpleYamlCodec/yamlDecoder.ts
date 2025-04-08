/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PartialYamlObject } from './parsers/yamlObject.js';
import { PartialYamlString } from './parsers/yamlString.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { assertDefined } from '../../../../base/common/types.js';
import { ReadableStream } from '../../../../base/common/stream.js';
import { BaseDecoder } from '../../../../base/common/codecs/baseDecoder.js';
import { SimpleDecoder, TSimpleDecoderToken } from '../simpleCodec/simpleDecoder.js';
import { Dash, DoubleQuote, LeftAngleBracket, LeftParenthesis, Quote, RightAngleBracket, RightParenthesis, Slash, Space, Word } from '../simpleCodec/tokens/index.js';

/**
 * TODO: @legomushroom
 */
const VALID_START_TOKENS = [
	Word, Dash, Space, Quote, DoubleQuote, Slash, LeftParenthesis, RightParenthesis, LeftAngleBracket, RightAngleBracket
];

/**
 * Tokens produced by this decoder.
 */
export type TYamlToken = TSimpleDecoderToken;

/**
 * TODO: @legomushroom
 */
export class YamlDecoder extends BaseDecoder<TYamlToken, TSimpleDecoderToken> {
	/**
	 * Current parser object that is responsible for parsing a sequence of tokens into
	 * some yaml entity. Set to `undefined` when no parsing is in progress at the moment.
	 */
	private current?: PartialYamlString | PartialYamlObject;

	/**
	 * TODO: @legomushroom
	 */
	private readonly indentation: Space[] = [];

	/**
	 * TODO: @legomushroom
	 */
	private indentationFinished: boolean = false;

	constructor(
		stream: ReadableStream<VSBuffer>,
	) {
		super(new SimpleDecoder(stream));
	}

	protected override onStreamData(token: TSimpleDecoderToken): void {
		if (this.indentationFinished === true) {
			assertDefined(
				this.current,
				'Current parser must be defined.',
			);

			const acceptResult = this.current.accept(token);
			const { wasTokenConsumed } = acceptResult;

			if (acceptResult.result === 'success') {
				const { nextParser } = acceptResult;

				if ((nextParser instanceof PartialYamlObject) || (nextParser instanceof PartialYamlString)) {
					this.current = nextParser;

					if (wasTokenConsumed === false) {
						this._onData.fire(token);
					}

					return;
				}

				this._onData.fire(nextParser);
				delete this.current;

				return;
			}

			this.reEmitCurrentTokens();

			if (wasTokenConsumed === false) {
				this._onData.fire(token);
			}

			delete this.current;

			return;
		}

		if (token instanceof Space) {
			this.indentation.push(token);
			return;
		}

		for (const ValidToken of VALID_START_TOKENS) {
			if (token instanceof ValidToken) {
				this.indentationFinished = true;
				this.current = new PartialYamlString(this.indentation, token);
				return;
			}
		}

		if (this.current) {
			// TODO: @legomushroom
			for (const accumulatedToken of this.current.tokens) {
				this._onData.fire(accumulatedToken);
			}
			delete this.current;
		}

		this._onData.fire(token);
	}

	protected override onStreamEnd(): void {
		if (this.current === undefined) {
			return;
		}

		try {
			// TODO: @legomushroom
			if (this.current instanceof PartialYamlString) {
				this._onData.fire(
					this.current.asYamlString(),
				);
				delete this.current;

				return;
			}

			if (this.current instanceof PartialYamlObject) {
				this._onData.fire(
					this.current.asYamlObject(),
				);
				delete this.current;

				return;
			}

		} catch (_error) {
			// if failed to convert current parser object to a token,
			// re-emit the tokens accumulated so far
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
