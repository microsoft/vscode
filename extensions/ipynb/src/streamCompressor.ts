/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { NotebookCellOutputItem } from 'vscode';


/**
 * Given a stream of individual stdout outputs, this function will return the compressed lines, escaping some of the common terminal escape codes.
 * E.g. some terminal escape codes would result in the previous line getting cleared, such if we had 3 lines and
 * last line contained such a code, then the result string would be just the first two lines.
 */
export function compressOutputItemStreams(mimeType: string, outputs: NotebookCellOutputItem[]) {
	// return outputs.find(op => op.mime === mimeType)!.data.buffer;

	const buffers: Uint8Array[] = [];
	let startAppending = false;
	// Pick the first set of outputs with the same mime type.
	for (const output of outputs) {
		if (output.mime === mimeType) {
			if ((buffers.length === 0 || startAppending)) {
				buffers.push(output.data);
				startAppending = true;
			}
		} else if (startAppending) {
			startAppending = false;
		}
	}
	compressStreamBuffer(buffers);
	const totalBytes = buffers.reduce((p, c) => p + c.byteLength, 0);
	const combinedBuffer = new Uint8Array(totalBytes);
	let offset = 0;
	for (const buffer of buffers) {
		combinedBuffer.set(buffer, offset);
		offset = offset + buffer.byteLength;
	}
	return combinedBuffer;
}
const MOVE_CURSOR_1_LINE_COMMAND = `${String.fromCharCode(27)}[A`;
const MOVE_CURSOR_1_LINE_COMMAND_BYTES = MOVE_CURSOR_1_LINE_COMMAND.split('').map(c => c.charCodeAt(0));
const LINE_FEED = 10;
function compressStreamBuffer(streams: Uint8Array[]) {
	streams.forEach((stream, index) => {
		if (index === 0 || stream.length < MOVE_CURSOR_1_LINE_COMMAND.length) {
			return;
		}

		const previousStream = streams[index - 1];

		// Remove the previous line if required.
		const command = stream.subarray(0, MOVE_CURSOR_1_LINE_COMMAND.length);
		if (command[0] === MOVE_CURSOR_1_LINE_COMMAND_BYTES[0] && command[1] === MOVE_CURSOR_1_LINE_COMMAND_BYTES[1] && command[2] === MOVE_CURSOR_1_LINE_COMMAND_BYTES[2]) {
			const lastIndexOfLineFeed = previousStream.lastIndexOf(LINE_FEED);
			if (lastIndexOfLineFeed === -1) {
				return;
			}
			streams[index - 1] = previousStream.subarray(0, lastIndexOfLineFeed);
			streams[index] = stream.subarray(MOVE_CURSOR_1_LINE_COMMAND.length);
		}
	});
	return streams;
}
