/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Line } from './tokens/line.js';
import { BaseDecoder } from '../baseDecoder.js';
import { assert } from '../../../../base/common/assert.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

/**
 * The `decoder` part of the `LinesCodec` and is able to transform
 * data from a binary stream into a stream of text lines(`Line`).
 */
export class LinesDecoder extends BaseDecoder<Line> {
	// Remaining received string data yet to be processed.
	private buffer: string = '';

	// Line number of the last emitted `Line` token, if any.
	// The line numbers are 1-based, hence the default value is `0`.
	// The value is used to correctly emit remaining line range in
	// the `onStreamEnd` method when underlying input stream ends.
	private lastEmittedLineNumber: number = 0;

	/**
	 * TODO: @legomushroom
	 */
	protected override onStreamData(chunk: VSBuffer): void {
		this.buffer += chunk.toString();

		// TODO: legomushroom: handle `\r\n` too?
		const lines = this.buffer.split('\n');

		// iterate over all lines, emitting `line` objects for each of them,
		// then shorten the `currentChunk` buffer value accordingly
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const maybeNextLine = lines[i + 1];

			// index is 0-based but line numbers are 1-based
			const lineNumber = i + 1;

			// the next line is `undefined` and the current line is `empty`, so we can emit
			// an empty line here, because the original text had a `\n` at this position
			if (line === '') {
				this.emitLine(lineNumber, line);

				continue;
			}

			// the line is not empty, if there is a next line present, then we
			// can emit the current one because we know that it's a full line
			if (maybeNextLine !== undefined) {
				this.emitLine(lineNumber, line);

				continue;
			}

			// there is no next line, but we don't know if the `line` is a full line yet,
			// so we need to wait for some more data to arrive to be sure;
			// this can happen only for the last line in the chunk tho, so assert that here
			// TODO: @legomushroom - emit an `Error` instead?
			assert(
				i === lines.length - 1,
				`The loop must break only on the last line in the chunk, did on ${i}th iteration instead.`,
			);

			break;
		}
	}

	/**
	 * Emit a provided line to the output stream then
	 * shorten the `currentChunk` buffer accordingly.
	 */
	private emitLine(
		lineNumber: number, // Note! 1-based indexing
		line: string,
	): void {
		this._onData.fire(new Line(lineNumber, line));

		// store the last emitted line index so we can use it when we need
		// to send the remaining line in the `onStreamEnd` method
		this.lastEmittedLineNumber = lineNumber;

		// TODO: @legomushroom - when `\r\n` is handled, should it be `+ 2` at that point?
		this.buffer = this.buffer.slice(line.length + 1);
	}

	/**
	 * TODO: @legomushroom
	 */
	protected override onStreamError(error: Error): void {
		// TODO: @legomushroom - add LinesCodec specific error logic here or delete the override
		super.onStreamError(error);
	}

	/**
	 * Handle the end of the input stream - if the buffer still has some data,
	 * emit it as the last available line token before firing the `onEnd` event.
	 */
	protected override onStreamEnd(): void {
		// if the `currentChunk` is not empty when the input stream ends,
		// emit the `currentChunk` buffer as the last available line token
		// before firing the `onEnd` event on this stream
		if (this.buffer) {
			this.emitLine(
				this.lastEmittedLineNumber + 1,
				this.buffer,
			);
		}

		super.onStreamEnd();
	}
}
