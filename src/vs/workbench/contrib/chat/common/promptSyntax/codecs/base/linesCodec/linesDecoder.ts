/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Line } from './tokens/line.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { NewLine } from './tokens/newLine.js';
import { assert } from '../../../../../../../../base/common/assert.js';
import { CarriageReturn } from './tokens/carriageReturn.js';
import { VSBuffer } from '../../../../../../../../base/common/buffer.js';
import { assertDefined } from '../../../../../../../../base/common/types.js';
import { BaseDecoder } from '../baseDecoder.js';

/**
 * Any line break token type.
 */
export type TLineBreakToken = CarriageReturn | NewLine;

/**
 * Tokens produced by the {@link LinesDecoder}.
 */
export type TLineToken = Line | TLineBreakToken;

/**
 * The `decoder` part of the `LinesCodec` and is able to transform
 * data from a binary stream into a stream of text lines(`Line`).
 */
export class LinesDecoder extends BaseDecoder<TLineToken, VSBuffer> {
	/**
	 * Buffered received data yet to be processed.
	 */
	private buffer: VSBuffer = VSBuffer.alloc(0);

	/**
	 * The last emitted `Line` token, if any. The value is used
	 * to correctly emit remaining line range in the `onStreamEnd`
	 * method when underlying input stream ends and `buffer` still
	 * contains some data that must be emitted as the last line.
	 */
	private lastEmittedLine?: Line;

	/**
	 * Process data received from the input stream.
	 */
	protected override onStreamData(chunk: VSBuffer): void {
		this.buffer = VSBuffer.concat([this.buffer, chunk]);

		this.processData(false);
	}

	/**
	 * Process buffered data.
	 *
	 * @param streamEnded Flag that indicates if the input stream has ended,
	 * 					  which means that is the last call of this method.
	 * @throws If internal logic implementation error is detected.
	 */
	private processData(
		streamEnded: boolean,
	): void {
		// iterate over each line of the data buffer, emitting each line
		// as a `Line` token followed by a `NewLine` token, if applies
		while (this.buffer.byteLength > 0) {
			// get line number based on a previously emitted line, if any
			const lineNumber = this.lastEmittedLine
				? this.lastEmittedLine.range.startLineNumber + 1
				: 1;

			// find the `\r`, `\n`, or `\r\n` tokens in the data
			const endOfLineTokens = this.findEndOfLineTokens(
				lineNumber,
				streamEnded,
			);
			const firstToken: (NewLine | CarriageReturn | undefined) = endOfLineTokens[0];

			// if no end-of-the-line tokens found, stop the current processing
			// attempt because we either (1) need more data to be received or
			// (2) the stream has ended; in the case (2) remaining data must
			// be emitted as the last line
			if (firstToken === undefined) {
				// (2) if `streamEnded`, we need to emit the whole remaining
				// data as the last line immediately
				if (streamEnded) {
					this.emitLine(lineNumber, this.buffer.slice(0));
				}

				break;
			}

			// emit the line found in the data as the `Line` token
			this.emitLine(lineNumber, this.buffer.slice(0, firstToken.range.startColumn - 1));

			// must always hold true as the `emitLine` above sets this
			assertDefined(
				this.lastEmittedLine,
				'No last emitted line found.',
			);

			// Note! A standalone `\r` token case is not a well-defined case, and
			// 		 was primarily used by old Mac OSx systems which treated it as
			// 		 a line ending (same as `\n`). Hence for backward compatibility
			// 		 with those systems, we treat it as a new line token as well.
			// 		 We do that by replacing standalone `\r` token with `\n` one.
			if ((endOfLineTokens.length === 1) && (firstToken instanceof CarriageReturn)) {
				endOfLineTokens.splice(0, 1, new NewLine(firstToken.range));
			}

			// emit the end-of-the-line tokens
			let startColumn = this.lastEmittedLine.range.endColumn;
			for (const token of endOfLineTokens) {
				const byteLength = token.byte.byteLength;
				const endColumn = startColumn + byteLength;
				// emit the token updating its column start/end numbers based on
				// the emitted line text length and previous end-of-the-line token
				this._onData.fire(token.withRange({ startColumn, endColumn }));
				// shorten the data buffer by the length of the token
				this.buffer = this.buffer.slice(byteLength);
				// update the start column for the next token
				startColumn = endColumn;
			}
		}

		// if the stream has ended, assert that the input data buffer is now empty
		// otherwise we have a logic error and leaving some buffered data behind
		if (streamEnded) {
			assert(
				this.buffer.byteLength === 0,
				'Expected the input data buffer to be empty when the stream ends.',
			);
		}
	}

	/**
	 * Find the end of line tokens in the data buffer.
	 * Can return:
	 *  - [`\r`, `\n`] tokens if the sequence is found
	 *  - [`\r`] token if only the carriage return is found
	 *  - [`\n`] token if only the newline is found
	 *  - an `empty array` if no end of line tokens found
	 */
	private findEndOfLineTokens(
		lineNumber: number,
		streamEnded: boolean,
	): (CarriageReturn | NewLine)[] {
		const result = [];

		// find the first occurrence of the carriage return and newline tokens
		const carriageReturnIndex = this.buffer.indexOf(CarriageReturn.byte);
		const newLineIndex = this.buffer.indexOf(NewLine.byte);

		// if the `\r` comes before the `\n`(if `\n` present at all)
		if (carriageReturnIndex >= 0 && ((carriageReturnIndex < newLineIndex) || (newLineIndex === -1))) {
			// add the carriage return token first
			result.push(
				new CarriageReturn(new Range(
					lineNumber,
					(carriageReturnIndex + 1),
					lineNumber,
					(carriageReturnIndex + 1) + CarriageReturn.byte.byteLength,
				)),
			);

			// if the `\r\n` sequence
			if (newLineIndex === carriageReturnIndex + 1) {
				// add the newline token to the result
				result.push(
					new NewLine(new Range(
						lineNumber,
						(newLineIndex + 1),
						lineNumber,
						(newLineIndex + 1) + NewLine.byte.byteLength,
					)),
				);
			}

			// either `\r` or `\r\n` cases found; if we have the `\r` token, we can return
			// the end-of-line tokens only, if the `\r` is followed by at least one more
			// character (it could be a `\n` or any other character), or if the stream has
			// ended (which means the `\r` is at the end of the line)
			if ((this.buffer.byteLength > carriageReturnIndex + 1) || streamEnded) {
				return result;
			}

			// in all other cases, return the empty array (no lend-of-line tokens found)
			return [];
		}

		// no `\r`, but there is `\n`
		if (newLineIndex >= 0) {
			result.push(
				new NewLine(new Range(
					lineNumber,
					(newLineIndex + 1),
					lineNumber,
					(newLineIndex + 1) + NewLine.byte.byteLength,
				)),
			);
		}

		// neither `\r` nor `\n` found, no end of line found at all
		return result;
	}

	/**
	 * Emit a provided line as the `Line` token to the output stream.
	 */
	private emitLine(
		lineNumber: number, // Note! 1-based indexing
		lineBytes: VSBuffer,
	): void {

		const line = new Line(lineNumber, lineBytes.toString());
		this._onData.fire(line);

		// store the last emitted line so we can use it when we need
		// to send the remaining line in the `onStreamEnd` method
		this.lastEmittedLine = line;

		// shorten the data buffer by the length of the line emitted
		this.buffer = this.buffer.slice(lineBytes.byteLength);
	}

	/**
	 * Handle the end of the input stream - if the buffer still has some data,
	 * emit it as the last available line token before firing the `onEnd` event.
	 */
	protected override onStreamEnd(): void {
		// if the input data buffer is not empty when the input stream ends, emit
		// the remaining data as the last line before firing the `onEnd` event
		if (this.buffer.byteLength > 0) {
			this.processData(true);
		}

		super.onStreamEnd();
	}
}
