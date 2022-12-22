/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { ITerminalLinkDetector, ITerminalSimpleLink, TerminalLinkType } from 'vs/workbench/contrib/terminal/browser/links/links';
import { IBufferLine } from 'xterm';

export async function assertLinkHelper(
	text: string,
	expected: (Pick<ITerminalSimpleLink, 'text'> & { range: [number, number][] })[],
	detector: ITerminalLinkDetector,
	expectedType: TerminalLinkType
) {
	detector.xterm.reset();

	// Write the text and wait for the parser to finish
	await new Promise<void>(r => detector.xterm.write(text, r));

	// Ensure all links are provided
	const lines: IBufferLine[] = [];
	for (let i = 0; i < detector.xterm.buffer.active.cursorY + 1; i++) {
		lines.push(detector.xterm.buffer.active.getLine(i)!);
	}

	const actualLinks = (await detector.detect(lines, 0, detector.xterm.buffer.active.cursorY)).map(e => {
		return {
			text: e.text,
			type: expectedType,
			bufferRange: e.bufferRange
		};
	});
	const expectedLinks = expected.map(e => {
		return {
			type: expectedType,
			text: e.text,
			bufferRange: {
				start: { x: e.range[0][0], y: e.range[0][1] },
				end: { x: e.range[1][0], y: e.range[1][1] },
			}
		};
	});
	deepStrictEqual(actualLinks, expectedLinks);
}
