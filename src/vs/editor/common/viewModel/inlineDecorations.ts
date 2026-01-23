/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../core/range.js';

export const enum InlineDecorationType {
	Regular = 0,
	Before = 1,
	After = 2,
	RegularAffectingLetterSpacing = 3
}

export class InlineDecoration {
	constructor(
		public readonly range: Range,
		public readonly inlineClassName: string,
		public readonly type: InlineDecorationType
	) { }
}

export class SingleLineInlineDecoration {
	constructor(
		public readonly startOffset: number,
		public readonly endOffset: number,
		public readonly inlineClassName: string,
		public readonly inlineClassNameAffectsLetterSpacing: boolean
	) {
	}

	toInlineDecoration(lineNumber: number): InlineDecoration {
		return new InlineDecoration(
			new Range(lineNumber, this.startOffset + 1, lineNumber, this.endOffset + 1),
			this.inlineClassName,
			this.inlineClassNameAffectsLetterSpacing ? InlineDecorationType.RegularAffectingLetterSpacing : InlineDecorationType.Regular
		);
	}
}
