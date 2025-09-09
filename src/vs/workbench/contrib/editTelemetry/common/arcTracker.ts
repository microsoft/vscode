/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sumBy } from '../../../../base/common/arrays.js';
import { LineEdit } from '../../../../editor/common/core/edits/lineEdit.js';
import { AnnotatedStringEdit, BaseStringEdit, IEditData } from '../../../../editor/common/core/edits/stringEdit.js';
import { AbstractText } from '../../../../editor/common/core/text/abstractText.js';

/**
 * The ARC (accepted and retained characters) counts how many characters inserted by the initial suggestion (trackedEdit)
 * stay unmodified after a certain amount of time after acceptance.
*/
export class ArcTracker {
	private _updatedTrackedEdit: AnnotatedStringEdit<IsTrackedEditData>;
	private _trackedEdit: BaseStringEdit;

	constructor(
		private readonly _valueBeforeTrackedEdit: AbstractText,
		trackedEdit: BaseStringEdit,
	) {
		this._trackedEdit = trackedEdit.removeCommonSuffixPrefix(_valueBeforeTrackedEdit.getValue());
		this._updatedTrackedEdit = this._trackedEdit.mapData(() => new IsTrackedEditData(true));
	}

	getOriginalCharacterCount(): number {
		return sumBy(this._trackedEdit.replacements, e => e.getNewLength());
	}

	/**
	 * edit must apply to _updatedTrackedEdit.apply(_valueBeforeTrackedEdit)
	*/
	handleEdits(edit: BaseStringEdit): void {
		const e = edit.mapData(_d => new IsTrackedEditData(false));
		const composedEdit = this._updatedTrackedEdit.compose(e); // (still) applies to _valueBeforeTrackedEdit

		// TODO@hediet improve memory by using:
		// composedEdit = const onlyTrackedEdit = composedEdit.decomposeSplit(e => !e.data.isTrackedEdit).e2;

		this._updatedTrackedEdit = composedEdit;
	}

	getAcceptedRestrainedCharactersCount(): number {
		const s = sumBy(this._updatedTrackedEdit.replacements, e => e.data.isTrackedEdit ? e.getNewLength() : 0);
		return s;
	}

	getDebugState(): unknown {
		return {
			edits: this._updatedTrackedEdit.replacements.map(e => ({
				range: e.replaceRange.toString(),
				newText: e.newText,
				isTrackedEdit: e.data.isTrackedEdit,
			}))
		};
	}

	public getLineCountInfo(): { deletedLineCounts: number; insertedLineCounts: number } {
		const e = this._updatedTrackedEdit.toStringEdit(r => r.data.isTrackedEdit);
		const le = LineEdit.fromStringEdit(e, this._valueBeforeTrackedEdit);
		const deletedLineCount = sumBy(le.replacements, r => r.lineRange.length);
		const insertedLineCount = sumBy(le.getNewLineRanges(), r => r.length);
		return {
			deletedLineCounts: deletedLineCount,
			insertedLineCounts: insertedLineCount,
		};
	}

	public getValues(): unknown {
		return {
			arc: this.getAcceptedRestrainedCharactersCount(),
			...this.getLineCountInfo(),
		};
	}
}

export class IsTrackedEditData implements IEditData<IsTrackedEditData> {
	constructor(
		public readonly isTrackedEdit: boolean
	) { }

	join(data: IsTrackedEditData): IsTrackedEditData | undefined {
		if (this.isTrackedEdit !== data.isTrackedEdit) {
			return undefined;
		}
		return this;
	}
}
