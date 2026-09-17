/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AnnotatedStringEdit, BaseStringEdit, IEditData } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { sum } from '../../inlineEdits/common/workspaceEditTracker/nesHistoryContextProvider';

/**
 * The ARC (accepted and retained characters) counts how many characters inserted by the initial suggestion (trackedEdit)
 * stay unmodified after a certain amount of time after acceptance.
*/
export class ArcTracker {
	private _updatedTrackedEdit: AnnotatedStringEdit<IsTrackedEditData>;

	constructor(
		public readonly originalText: string,
		private readonly _trackedEdit: BaseStringEdit,
	) {
		const eNormalized = _trackedEdit.removeCommonSuffixPrefix(originalText);
		this._updatedTrackedEdit = eNormalized.mapData(() => new IsTrackedEditData(true));
	}

	handleEdits(edit: BaseStringEdit): void {
		const e = edit.mapData(_d => new IsTrackedEditData(false));
		const composedEdit = this._updatedTrackedEdit.compose(e);
		const onlyTrackedEdit = composedEdit.decomposeSplit(e => !e.data.isTrackedEdit).e2;
		this._updatedTrackedEdit = onlyTrackedEdit;
	}

	getAcceptedRestrainedCharactersCount(): number {
		const s = sum(this._updatedTrackedEdit.replacements, e => e.getNewLength());
		return s;
	}

	getOriginalCharacterCount(): number {
		return sum(this._trackedEdit.replacements, e => e.getNewLength());
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
