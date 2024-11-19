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

		this.processData(false);
	}

	/**
	 * Process provided data.
	 *
	 * @param streamEnded Flag that indicates if the input stream has ended,
	 * 					  which means that is the last call of this method.
	 * @throws If internal logic implementation error is detected.
	 */
	private processData(
		streamEnded: boolean,
	) {
		// iterate over each line of the data buffer, emitting each line
		// as a `Line` token followed by a `NewLine` token, if applies
		while (this.buffer.byteLength > 0) {
			// get line number based on a previously emitted line, if any
			const lineNumber = this.lastEmittedLine
				? this.lastEmittedLine.range.startLineNumber + 1
				: 1;

			// find the newline symbol in the data, if any
			const newLineIndex = this.buffer.indexOf(NewLine.byte);

			// no newline symbol found in the data, stop processing because we
			// either (1)need more data to arraive or (2)the stream has ended
			// in the case (2) remaining data must be emitted as the last line
			if (newLineIndex < 0) {
				// if `streamEnded`, we need to emit the whole remaining
				// data as the last line immediately
				if (streamEnded) {
					this.emitLine(lineNumber, this.buffer.slice(0));
				}

				break;
			}

			// emit the line found in the data as the `Line` token
			this.emitLine(lineNumber, this.buffer.slice(0, newLineIndex));

			// must always hold true as the `emitLine` above sets this
			assertDefined(
				this.lastEmittedLine,
				'No last emitted line found.',
			);

			// emit `NewLine` token for the newline symbol found in the data
			this._onData.fire(
				NewLine.newOnLine(
					this.lastEmittedLine,
					this.lastEmittedLine.range.endColumn,
				),
			);
			// shorten the data buffer by the length of the newline symbol
			this.buffer = this.buffer.slice(NewLine.byte.byteLength);
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
