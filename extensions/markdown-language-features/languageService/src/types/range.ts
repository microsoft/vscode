/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPosition, makePosition } from './position';

export interface IRange {
	readonly start: IPosition;
	readonly end: IPosition;

	// isEqual(other: IRange): boolean;

	// contains(positionOrRange: IPosition | IRange): boolean;

	// with(change: { start?: IPosition; end?: IPosition }): IRange;
}

export function makeRange(startLine: number, startCharacter: number, endLine: number, endCharacter: number): IRange;
export function makeRange(start: IPosition, end: IPosition): IRange;
export function makeRange(startOrStartLine: IPosition | number, endOrStartCharacter: IPosition | number, endLine?: number, endCharacter?: number): IRange {
	if (typeof startOrStartLine === 'number') {
		return {
			start: makePosition(startOrStartLine, endOrStartCharacter as number),
			end: makePosition(endLine as number, endCharacter as number)
		};
	}
	return { start: startOrStartLine, end: endOrStartCharacter as IPosition };
}

