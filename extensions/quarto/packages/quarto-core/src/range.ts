/*
 * range.ts
 *
 * Copyright (C) 2023 by Posit Software, PBC
 * Copyright (c) Microsoft Corporation. All rights reserved.
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import { Range as VSCodeRange } from 'vscode-languageserver-types';
import { Position, arePositionsEqual, isBefore, isPosition } from './position.js';

export type Range = VSCodeRange;


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isRange(thing: any): thing is Range {
	if (!thing) {
		return false;
	}
	return isPosition((<Range>thing).start)
		&& isPosition((<Range>thing.end));
}

export function makeRange(startLine: number, startCharacter: number, endLine: number, endCharacter: number): Range;
export function makeRange(start: Position, end: Position): Range;
export function makeRange(startOrStartLine: Position | number, endOrStartCharacter: Position | number, endLine?: number, endCharacter?: number): Range {
	if (typeof startOrStartLine === 'number') {
		return {
			start: { line: startOrStartLine, character: endOrStartCharacter as number },
			end: { line: endLine as number, character: endCharacter as number },
		};
	}
	return { start: startOrStartLine, end: endOrStartCharacter as Position };
}

export function areRangesEqual(a: Range, b: Range): boolean {
	return arePositionsEqual(a.start, b.start) && arePositionsEqual(a.end, b.end);
}

export function modifyRange(range: Range, start?: Position, end?: Position): Range {
	return {
		start: start ?? range.start,
		end: end ?? range.end,
	};
}

export function rangeContains(range: Range, other: Position | Range): boolean {
	if (isRange(other)) {
		return rangeContains(range, other.start) && rangeContains(range, other.end);
	}
	return !isBefore(other, range.start) && !isBefore(range.end, other);
}

export function rangeIntersects(a: Range, b: Range): boolean {
	if (rangeContains(a, b.start) || rangeContains(a, b.end)) {
		return true;
	}
	// Check case where `a` is entirely contained in `b`
	return rangeContains(b, a.start) || rangeContains(b, a.end);
}
