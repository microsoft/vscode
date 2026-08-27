/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstance } from '../../../terminal/browser/terminal.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';

export const MAX_OUTPUT_LENGTH = 20000;
const PREVIEW_CHARS = 500;

export interface IGetOutputOptions {
	/** When set, only return the last N non-empty lines from the bottom of the buffer. */
	lastNLines?: number;
}

/**
 * Truncates output that exceeds the max length, keeping a preview from the
 * beginning and the tail of the output with guidance for the model.
 * If a filePath is provided, includes it in the message so the model can
 * read the full output using file-reading tools.
 */
export function truncateLargeOutput(output: string, filePath?: string): string {
	const totalLength = output.length;
	const previewEnd = Math.min(PREVIEW_CHARS, totalLength);
	const preview = output.slice(0, previewEnd);

	const sizeKB = Math.ceil(totalLength / 1024);
	let header: string;
	if (filePath) {
		header = `[Output too large (${sizeKB}KB). Full output saved to: ${filePath}]\n[Use readFile or grep to examine the full output.]\n\n`;
	} else {
		header = `[Output too large (${sizeKB}KB). Showing preview and tail.]\n\n`;
	}
	const separator = '\n\n[... middle of output truncated ...]\n\n';

	const availableForTail = MAX_OUTPUT_LENGTH - header.length - preview.length - separator.length;
	if (availableForTail <= 0) {
		return (header + preview).slice(0, MAX_OUTPUT_LENGTH);
	}
	const tail = output.slice(-availableForTail);
	return header + preview + separator + tail;
}

/**
 * Extracts raw output text from the terminal buffer without any truncation or formatting.
 */
export function getRawOutput(instance: ITerminalInstance, startMarker?: IXtermMarker, options?: IGetOutputOptions): string {
	if (!instance.xterm || !instance.xterm.raw) {
		return '';
	}

	const buffer = instance.xterm.raw.buffer.active;
	let startLine = Math.max(startMarker?.line ?? 0, 0);
	while (startLine > 0 && buffer.getLine(startLine)?.isWrapped) {
		startLine--;
	}
	const endLine = buffer.length;
	const lines: string[] = [];
	let currentLine = '';

	for (let y = startLine; y < endLine; y++) {
		const line = buffer.getLine(y);
		if (!line) {
			continue;
		}
		// NOTE: xterm stores wrapping state on the *next* line, not the current one.
		const isWrapped = !!buffer.getLine(y + 1)?.isWrapped;
		currentLine += line.translateToString(!isWrapped);
		if (!isWrapped) {
			lines.push(currentLine);
			currentLine = '';
		}
	}
	if (currentLine) {
		lines.push(currentLine);
	}

	const output = lines.join('\n');

	if (options?.lastNLines !== undefined) {
		const nonEmpty = output.split('\n').filter(line => line.trim().length > 0);
		return nonEmpty.slice(-options.lastNLines).join('\n');
	}

	return output;
}

/**
 * Gets output from the terminal buffer without truncation or formatting.
 *
 * NOTE: This function does NOT truncate output. Callers that return output
 * to the model should use {@link LargeOutputFileWriter.processOutput} to
 * handle large output (writes to file + truncates inline).
 */
export function getOutput(instance: ITerminalInstance, startMarker?: IXtermMarker, options?: IGetOutputOptions): string {
	return getRawOutput(instance, startMarker, options);
}
