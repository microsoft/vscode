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
export type TLinesDecoderToken = Line | NewLine;

/**
 * The `decoder` part of the `LinesCodec` and is able to transform
 * data from a binary stream into a stream of text lines(`Line`).
 */
export class LinesDecoder extends BaseDecoder<TLinesDecoderToken> {
	// Remaining received string data yet to be processed.
	private buffer: string = '';

	// TODO: @legomushroom - update this comment
	// Line number of the last emitted `Line` token, if any.
	// The line numbers are 1-based, hence the default value is `0`.
	// The value is used to correctly emit remaining line range in
	// the `onStreamEnd` method when underlying input stream ends.
	private lastEmittedLine?: Line;

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

			// // the current line is `empty`, so we can `newline` here,
			// // because the original text had a `\n` at this position
			// if (line === '') {
			// 	this.emitLine(lineNumber, line);
			// 	this.emitNewLine();

			// 	continue;
			// }

			// the line is not empty and there is a next line present, then we
			// can emit the current line because we know that it's a full line
			if (maybeNextLine !== undefined) {
				this.emitLine(lineNumber, line);
				this.emitNewLine();

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
	}

	/**
	 * Emit a provided line to the output stream then
	 * shorten the `currentChunk` buffer accordingly.
	 */
	private emitLine(
		lineNumber: number, // Note! 1-based indexing
		lineText: string,
	): void {
		const line = new Line(lineNumber, lineText);
		this._onData.fire(line);

		// store the last emitted line so we can use it when we need
		// to send the remaining line in the `onStreamEnd` method
		this.lastEmittedLine = line;

		// remove line-length of data from the buffer
		// TODO: @legomushroom - assert that the buffer has enough data
		// TODO: @legomushroom - assert that this works with emojies
		this.buffer = this.buffer.slice(lineText.length);
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

		const newLine = NewLine.newOnLine(
			this.lastEmittedLine,
			this.lastEmittedLine.range.endColumn,
		);
		this._onData.fire(newLine);

		// TODO: @legomushroom - when `\r\n` is handled, should it be `2` at that point?
		this.buffer = this.buffer.slice(1);
	}

	/**
	 * Handle the end of the input stream - if the buffer still has some data,
	 * emit it as the last available line token before firing the `onEnd` event.
	 */
	protected override onStreamEnd(): void {
		// if the `currentChunk` is not empty when the input stream ends,
		// emit the `currentChunk` buffer as the last available line token
		// before firing the `onEnd` event on this stream
		// TODO: @legomushroom - what is the buffer also contains newlines?
		if (this.buffer) {
			const lineNumber = this.lastEmittedLine
				? this.lastEmittedLine.range.startLineNumber + 1
				: 1;

			this.emitLine(
				lineNumber,
				this.buffer,
			);
		}

		super.onStreamEnd();
	}
}
