/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseDecoder } from '../baseDecoder.js';
import { Line, NewLine } from './tokens/index.js';
import { assert } from '../../../../base/common/assert.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { assertDefined } from '../../../../base/common/assertDefined.js';

/**
 * Tokens produced by the `LinesDecoder`.
 */
export type TLineToken = Line | NewLine;

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

		this.processData(this.buffer, false);
	}

	/**
	 * Process provided data.
	 *
	 * @param data The data to process.
	 * @param streamEnded Flag that indicates if the input stream has ended,
	 * 					  which means that is the last call of this method.
	 */
	private processData(
		data: VSBuffer,
		streamEnded: boolean,
	): void {
		// get previous emitted line number, if any
		const lastLineNumber = this.lastEmittedLine
			? this.lastEmittedLine.range.startLineNumber
			: 0;

		// split existing received data into a list of lines
		// Note! we are doing `toString().split()` here with the assumption that
		// 		 the `split()` method is faster than interating over the buffer
		//       because it is inmplemented in `C`, otherwise it would make more
		// 		 sense to implement the explicit iteration logic over here
		const lines = data.toString().split(NewLine.symbol);

		// iterate over all lines, emitting `line` objects for each of them,
		// then shorten the `currentChunk` buffer value accordingly
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const maybeNextLine = lines[i + 1];

			// current line number is the last emitted line number plus one
			// plus the current line index in the lines list
			const lineNumber = lastLineNumber + 1 + i;

			// the line is not empty and there is a next line present, then we
			// can emit the current line because we know that it's a full line
			if (maybeNextLine !== undefined) {
				this.emitLine(lineNumber, line);
				this.emitNewLine();

				continue;
			}

			// unless `streamEnded` is `true`, in which case we need to emit
			// the remaining data as the last line immediately
			if (streamEnded) {
				this.emitLine(lineNumber, line);

				continue;
			}

			// there is no next line, hence we don't know if the `line` is a "full"
			// line yet, so we need to wait for some more data to arrive to be sure;
			// this can happen only for the last line in the chunk, so assert that here
			assert(
				i === lines.length - 1,
				`The loop must break only on the last line in the chunk, did on ${i}th iteration instead.`,
			);

			break;
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
	 * Emit a provided line to the output stream then
	 * shorten the `currentChunk` buffer accordingly.
	 */
	private emitLine(
		lineNumber: number, // Note! 1-based indexing
		lineText: string,
	): void {
		const lineByteLength = VSBuffer.fromString(lineText).byteLength;
		// assert that the buffer has enough data, otherwise
		// there is an logic error in the data processing
		assert(
			this.buffer.byteLength >= lineByteLength,
			[
				'Not enough data in the input data buffer to emit the line',
				`(line length: ${lineByteLength}, buffer length: ${this.buffer.byteLength}).`,
			].join(' '),
		);

		const line = new Line(lineNumber, lineText);
		this._onData.fire(line);

		// store the last emitted line so we can use it when we need
		// to send the remaining line in the `onStreamEnd` method
		this.lastEmittedLine = line;

		// remove line-length of data from the buffer
		this.buffer = this.buffer.slice(lineByteLength);
	}

	/**
	 * Emit a `NewLine` token.
	 */
	private emitNewLine(): void {
		// there must always be a last emitted line when we send a `newline`
		// even if an input source starts with a `\n`, we should have emitted
		// an empty line before before this point
		assertDefined(
			this.lastEmittedLine,
			'No last emitted line found.',
		);

		this._onData.fire(
			NewLine.newOnLine(
				this.lastEmittedLine,
				this.lastEmittedLine.range.endColumn,
			),
		);

		// remove the newline symbol from the input data buffer
		this.buffer = this.buffer.slice(NewLine.symbol.length);
	}

	/**
	 * Handle the end of the input stream - if the buffer still has some data,
	 * emit it as the last available line token before firing the `onEnd` event.
	 */
	protected override onStreamEnd(): void {
		// if the input data buffer is not empty when the input stream ends,
		// emit the remaining data as the last line before firing the `onEnd`
		// event on this stream
		if (this.buffer.byteLength > 0) {
			this.processData(this.buffer, true);
		}

		super.onStreamEnd();
	}
}
