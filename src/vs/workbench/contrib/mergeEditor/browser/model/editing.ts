/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from 'vs/base/common/arrays';
import { Range } from 'vs/editor/common/core/range';
import { IIdentifiedSingleEditOperation } from 'vs/editor/common/model';
import { LineRange } from './lineRange';

/**
 * Represents an edit, expressed in whole lines:
 * At (before) {@link LineRange.startLineNumber}, delete {@link LineRange.lineCount} many lines and insert {@link newLines}.
*/
export class LineRangeEdit {
	constructor(
		public readonly range: LineRange,
		public readonly newLines: string[]
	) { }

	public equals(other: LineRangeEdit): boolean {
		return this.range.equals(other.range) && equals(this.newLines, other.newLines);
	}

	public toEdits(modelLineCount: number): IIdentifiedSingleEditOperation[] {
		return new LineEdits([this]).toEdits(modelLineCount);
	}
}

export class RangeEdit {
	constructor(
		public readonly range: Range,
		public readonly newText: string
	) { }

	public equals(other: RangeEdit): boolean {
		return Range.equalsRange(this.range, other.range) && this.newText === other.newText;
	}
}

export class LineEdits {
	constructor(public readonly edits: readonly LineRangeEdit[]) { }

	public toEdits(modelLineCount: number): IIdentifiedSingleEditOperation[] {
		return this.edits.map((e) => {
			if (e.range.endLineNumberExclusive <= modelLineCount) {
				return {
					range: new Range(e.range.startLineNumber, 1, e.range.endLineNumberExclusive, 1),
					text: e.newLines.map(s => s + '\n').join(''),
				};
			}

			if (e.range.startLineNumber === 1) {
				return {
					range: new Range(1, 1, modelLineCount, Number.MAX_SAFE_INTEGER),
					text: e.newLines.join('\n'),
				};
			}

			return {
				range: new Range(e.range.startLineNumber - 1, Number.MAX_SAFE_INTEGER, modelLineCount, Number.MAX_SAFE_INTEGER),
				text: e.newLines.map(s => '\n' + s).join(''),
			};
		});
	}
}
