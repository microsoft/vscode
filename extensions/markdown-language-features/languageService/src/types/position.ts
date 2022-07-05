/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IPosition {
	readonly line: number;
	readonly character: number;

	translate(change: { lineDelta?: number; characterDelta?: number }): IPosition;
}

export function makePosition(line: number, character: number): IPosition {
	return {
		line,
		character,
		translate(change: { lineDelta?: number; characterDelta?: number }): IPosition {
			return makePosition(line + (change.lineDelta ?? 0), character + (change.characterDelta ?? 0));
		}
	};
}
