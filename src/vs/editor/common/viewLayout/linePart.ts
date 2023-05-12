/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum LinePartMetadata {
	IS_WHITESPACE = 1,
	PSEUDO_BEFORE = 2,
	PSEUDO_AFTER = 4,

	IS_WHITESPACE_MASK = 0b001,
	PSEUDO_BEFORE_MASK = 0b010,
	PSEUDO_AFTER_MASK = 0b100,
}

export class LinePart {
	_linePartBrand: void = undefined;

	constructor(
		/**
		 * last char index of this token (not inclusive).
		 */
		public readonly endIndex: number,
		public readonly type: string,
		public readonly metadata: number,
		public readonly containsRTL: boolean
	) { }

	public isWhitespace(): boolean {
		return (this.metadata & LinePartMetadata.IS_WHITESPACE_MASK ? true : false);
	}

	public isPseudoAfter(): boolean {
		return (this.metadata & LinePartMetadata.PSEUDO_AFTER_MASK ? true : false);
	}
}
