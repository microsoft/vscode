/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { cellRangesEqual, ICellRange } from '../../common/notebookRange.js';

// Challenge is List View talks about `element`, which needs extra work to convert to ICellRange as we support Folding and Cell Move
export class NotebookCellSelectionCollection extends Disposable {

	private readonly _onDidChangeSelection = this._register(new Emitter<string>());
	get onDidChangeSelection(): Event<string> { return this._onDidChangeSelection.event; }

	private _primary: ICellRange = { start: 0, end: 0 };

	private _selections: ICellRange[] = [{ start: 0, end: 0 }];

	get selections(): ICellRange[] {
		return this._selections;
	}

	get focus(): ICellRange {
		return this._primary;
	}

	setState(primary: ICellRange | null, selections: ICellRange[], forceEventEmit: boolean, source: 'view' | 'model') {
		const validPrimary = primary ?? { start: 0, end: 0 };
		const validSelections = selections.length > 0 ? selections : [{ start: 0, end: 0 }];

		const changed = !cellRangesEqual([validPrimary], [this._primary]) || !cellRangesEqual(this._selections, validSelections);

		this._primary = validPrimary;
		this._selections = validSelections;
		if (changed || forceEventEmit) {
			this._onDidChangeSelection.fire(source);
		}
	}

	setSelections(selections: ICellRange[], forceEventEmit: boolean, source: 'view' | 'model') {
		this.setState(this._primary, selections, forceEventEmit, source);
	}
}
