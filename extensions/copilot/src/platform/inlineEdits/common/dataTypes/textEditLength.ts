/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextEdit } from '../../../../util/vs/editor/common/core/edits/textEdit';
import { Range } from '../../../../util/vs/editor/common/core/range';
import { TextLength } from '../../../../util/vs/editor/common/core/text/textLength';
import { combineTextEditInfos } from './textEditLengthHelper/combineTextEditInfos';
import { lengthsToRange, lengthToObj, toLength } from './textEditLengthHelper/length';
import { TextEditInfo } from './textEditLengthHelper/textEditInfo';

export class TextLengthEdit {
	public static readonly empty = new TextLengthEdit([]);

	public static fromTextEdit(textEdit: TextEdit): TextLengthEdit {
		const edits = textEdit.replacements.map(e => new SingleTextEditLength(e.range, TextLength.ofText(e.text)));
		return new TextLengthEdit(edits);
	}

	private static _fromTextEditInfo(info: TextEditInfo[]): TextLengthEdit {
		const edits = info.map(e => {
			const newLen = lengthToObj(e.newLength);
			return new SingleTextEditLength(
				lengthsToRange(e.startOffset, e.endOffset),
				new TextLength(newLen.lineCount, newLen.columnCount),
			);
		});
		return new TextLengthEdit(edits);
	}

	constructor(
		public readonly edits: readonly SingleTextEditLength[],
	) { }

	private _toTextEditInfo(): TextEditInfo[] {
		return this.edits.map(e => new TextEditInfo(
			toLength(e.range.startLineNumber - 1, e.range.startColumn - 1),
			toLength(e.range.endLineNumber - 1, e.range.endColumn - 1),
			toLength(e.newLength.lineCount, e.newLength.columnCount),
		));
	}

	public compose(other: TextLengthEdit): TextLengthEdit {
		const self = this._toTextEditInfo();
		const o = other._toTextEditInfo();

		const result = combineTextEditInfos(self, o);
		return TextLengthEdit._fromTextEditInfo(result);
	}

	/**
	 * Returns the range of the edit, or undefined if the edit is empty.
	 */
	public getRange(): Range | undefined {
		if (this.edits.length === 0) { return undefined; }
		return Range.fromPositions(this.edits[0].range.getStartPosition(), this.edits.at(-1)!.range.getEndPosition());
	}

	public toString() {
		return `[${this.edits.join(', ')}]`;
	}
}

export class SingleTextEditLength {
	constructor(
		public readonly range: Range,
		public readonly newLength: TextLength,
	) { }

	toString() {
		return `{ range: ${this.range}, newLength: ${this.newLength} }`;
	}
}
