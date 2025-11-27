/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../core/range.js';
import { IModelDecoration } from '../model.js';

export interface DecorationProvider {
	/**
	 * Gets all the decorations in a range as an array. Only `startLineNumber` and `endLineNumber` from `range` are used for filtering.
	 * So for now it returns all the decorations on the same line as `range`.
	 * @param range The range to search in
	 * @param ownerId If set, it will ignore decorations belonging to other owners.
	 * @param filterOutValidation If set, it will ignore decorations specific to validation (i.e. warnings, errors).
	 * @return An array with the decorations
	 */
	getDecorationsInRange(range: Range, ownerId?: number, filterOutValidation?: boolean): IModelDecoration[];

	/**
	 * Gets all the decorations as an array.
	 * @param ownerId If set, it will ignore decorations belonging to other owners.
	 * @param filterOutValidation If set, it will ignore decorations specific to validation (i.e. warnings, errors).
	 */
	getAllDecorations(ownerId?: number, filterOutValidation?: boolean, onlyMinimapDecorations?: boolean): IModelDecoration[];

}

export class LineHeightChangingDecoration {

	public static toKey(obj: LineHeightChangingDecoration): string {
		return `${obj.ownerId};${obj.decorationId};${obj.lineNumber}`;
	}

	constructor(
		public readonly ownerId: number,
		public readonly decorationId: string,
		public readonly lineNumber: number,
		public readonly lineHeight: number | null
	) { }
}

export class LineFontChangingDecoration {

	public static toKey(obj: LineFontChangingDecoration): string {
		return `${obj.ownerId};${obj.decorationId};${obj.lineNumber}`;
	}

	constructor(
		public readonly ownerId: number,
		public readonly decorationId: string,
		public readonly lineNumber: number
	) { }
}
