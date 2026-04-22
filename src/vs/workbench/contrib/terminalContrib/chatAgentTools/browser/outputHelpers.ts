/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstance } from '../../../terminal/browser/terminal.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';
import { truncateOutputKeepingTail } from './runInTerminalHelpers.js';

const MAX_OUTPUT_LENGTH = 60000;

export interface IGetOutputOptions {
	/** When set, only return the last N non-empty lines from the bottom of the buffer. */
	lastNLines?: number;
}

export function getOutput(instance: ITerminalInstance, startMarker?: IXtermMarker, options?: IGetOutputOptions): string {
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

	if (options?.lastNLines !== undefined) {
		const nonEmpty = lines.filter(l => l.trim().length > 0);
		return nonEmpty.slice(-options.lastNLines).join('\n');
	}

	let output = lines.join('\n');
	if (output.length > MAX_OUTPUT_LENGTH) {
		output = truncateOutputKeepingTail(output, MAX_OUTPUT_LENGTH);
	}
	return output;
}
