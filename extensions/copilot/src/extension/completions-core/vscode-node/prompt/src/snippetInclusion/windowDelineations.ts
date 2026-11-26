/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Returns a list of (startline, endline) pairs representing fixed size windows
 *
 * @param windowLength length of fixed size window
 * @param lines lines to extract fixed size windows from
 * @returns list of (startline, endline) pairs
 */
export function getBasicWindowDelineations(windowLength: number, lines: string[]): [number, number][] {
	const windows: [number, number][] = [];
	const length = lines.length;
	if (length === 0) {
		return [];
	}
	if (length < windowLength) {
		// if not long enough to reach a single window length, return full document
		return [[0, length]];
	}
	for (let startLine = 0; startLine < length - windowLength + 1; startLine++) {
		windows.push([startLine, startLine + windowLength]);
	}
	return windows;
}
