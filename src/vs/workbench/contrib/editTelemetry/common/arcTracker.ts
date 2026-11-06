/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditArcTracker, IArcTextEdit } from '../../../../base/common/editArcTracker.js';
import { BaseStringEdit } from '../../../../editor/common/core/edits/stringEdit.js';
import { AbstractText } from '../../../../editor/common/core/text/abstractText.js';

/**
 * The ARC (accepted and retained characters) counts how many characters inserted by the initial suggestion (trackedEdit)
 * stay unmodified after a certain amount of time after acceptance.
*/
export class ArcTracker {
	private readonly _tracker: EditArcTracker;

	constructor(
		valueBeforeTrackedEdit: AbstractText,
		trackedEdit: BaseStringEdit,
	) {
		this._tracker = new EditArcTracker(valueBeforeTrackedEdit.getValue(), toArcTextEdit(trackedEdit));
	}

	getOriginalCharacterCount(): number {
		return this._tracker.getOriginalCharacterCount();
	}

	/**
	 * edit must apply to _updatedTrackedEdit.apply(_valueBeforeTrackedEdit)
	*/
	handleEdits(edit: BaseStringEdit): void {
		this._tracker.handleEdits(toArcTextEdit(edit));
	}

	getAcceptedRestrainedCharactersCount(): number {
		return this._tracker.getAcceptedRestrainedCharactersCount();
	}

	public getLineCountInfo(): { deletedLineCounts: number; insertedLineCounts: number } {
		return this._tracker.getLineCountInfo();
	}

	public getValues(): unknown {
		return this._tracker.getValues();
	}
}

function toArcTextEdit(edit: BaseStringEdit): IArcTextEdit {
	return {
		replacements: edit.replacements.map(replacement => ({
			start: replacement.replaceRange.start,
			endExclusive: replacement.replaceRange.endExclusive,
			text: replacement.newText,
		}))
	};
}
