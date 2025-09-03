/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sumBy } from '../../../../base/common/arrays.js';
import { LineEdit } from '../../../../editor/common/core/edits/lineEdit.js';
import { AnnotatedStringEdit, BaseStringEdit, IEditData, StringEdit } from '../../../../editor/common/core/edits/stringEdit.js';
import { AbstractText } from '../../../../editor/common/core/text/abstractText.js';

/**
 * The ARC (accepted and retained characters) counts how many characters inserted by the initial suggestion (trackedEdit)
 * stay unmodified after a certain amount of time after acceptance.
*/
export class ArcTracker {
	/** Invariant: applies to valueBeforeTrackedEdit. */
	private _updatedTrackedEdit: AnnotatedStringEdit<IsTrackedEditData>;

	constructor(
		public readonly valueBeforeTrackedEdit: AbstractText,
		private readonly _trackedEdit: BaseStringEdit,
	) {
		const eNormalized = _trackedEdit.removeCommonSuffixPrefix(valueBeforeTrackedEdit.getValue());
		this._updatedTrackedEdit = eNormalized.mapData(() => new IsTrackedEditData(true));
	}

	handleEdits(edit: BaseStringEdit): void {
		const e = edit.mapData(_d => new IsTrackedEditData(false));
		const composedEdit = this._updatedTrackedEdit.compose(e); // (still) applies to valueBeforeTrackedEdit

		// decomposeSplit computes e1 and e2 such that all replacements in e1 have the given property
		// and no replacement in e2 has the property, and such that e1.compose(e2).equals(composedEdit).
		// Thus, e1 applies to valueBeforeTrackedEdit.
		const onlyTrackedEdit = composedEdit.decomposeSplit(e => e.data.isTrackedEdit).e1;
		this._updatedTrackedEdit = onlyTrackedEdit;
	}

	getTrackedEdit(): StringEdit {
		return this._updatedTrackedEdit.toStringEdit();
	}

	getAcceptedRestrainedCharactersCount(): number {
		const s = sumBy(this._updatedTrackedEdit.replacements, e => e.getNewLength());
		return s;
	}

	getOriginalCharacterCount(): number {
		return sumBy(this._trackedEdit.replacements, e => e.getNewLength());
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
		const e = this.getTrackedEdit();
		const le = LineEdit.fromStringEdit(e, this.valueBeforeTrackedEdit);
		const deletedLineCount = sumBy(le.replacements, r => r.lineRange.length);
		const insertedLineCount = sumBy(le.getNewLineRanges(), r => r.length);
		return {
			deletedLineCounts: deletedLineCount,
			insertedLineCounts: insertedLineCount,
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
