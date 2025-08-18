/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal, IMarker as IXtermMarker } from '@xterm/xterm';

export function getOutput(terminal?: Pick<RawXtermTerminal, 'buffer'>, startMarker?: IXtermMarker): string {
	if (!terminal) {
		return '';
	}
	const buffer = terminal.buffer.active;
	const startLine = Math.max(startMarker?.line ?? 0, 0);
	const endLine = buffer.length;
	const lines: string[] = new Array(endLine - startLine);

	for (let y = startLine; y < endLine; y++) {
		const line = buffer.getLine(y);
		lines[y - startLine] = line ? line.translateToString(true) : '';
	}

	let output = lines.join('\n');
	if (output.length > 16000) {
		output = output.slice(-16000);
	}
	return output;
}
