/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookCommon';

function selectionsEqual(a: number[], b: number[]) {
	if (a.length !== b.length) {
		return false;
	}

	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}

	return true;
}

function rangesEqual(a: ICellRange[], b: ICellRange[]) {
	if (a.length !== b.length) {
		return false;
	}

	for (let i = 0; i < a.length; i++) {
		if (a[i].start !== b[i].start || a[i].end !== b[i].end) {
			return false;
		}
	}

	return true;
}

// Handle first, then we migrate to ICellRange competely
// Challenge is List View talks about `element`, which needs extra work to convert to ICellRange as we support Folding and Cell Move
export class NotebookCellSelectionCollection extends Disposable {
	private readonly _onDidChangeSelection = this._register(new Emitter<void>());
	get onDidChangeSelection(): Event<void> { return this._onDidChangeSelection.event; }

	private _primarySelectionHandle: number | null = null;

	get primaryHandle() {
		return this._primarySelectionHandle;
	}

	set primaryHandle(primary: number | null) {
		throw new Error('use setSelections');
	}
	private _selectionHandles: number[] = [];

	get allSelectionHandles() {
		return this._selectionHandles;
	}

	set allSelectionHandles(selections: number[]) {
		throw new Error('use setSelections');
	}

	constructor() {
		super();
	}

	private _setState(primary: number | null, selections: number[]) {
		if (primary === null) {
			const changed = primary !== this._primarySelectionHandle || !selectionsEqual(selections, this._selectionHandles);

			this._primarySelectionHandle = primary;
			this._selectionHandles = selections;
			if (changed) {
				this._onDidChangeSelection.fire();
			}
		} else {
			const newSelections = [primary, ...selections.filter(selection => selection !== primary)];
			const changed = primary !== this._primarySelectionHandle || !selectionsEqual(newSelections, this._selectionHandles);

			this._primarySelectionHandle = primary;
			this._selectionHandles = selections;
			if (changed) {
				this._onDidChangeSelection.fire();
			}
		}
	}

	setSelections(handles: number[]) {
		this._setState(this._primarySelectionHandle, handles);
	}

	setFocus(handle: number | null) {
		this._setState(handle, this._selectionHandles);
	}

	private _primary: number | null = null;

	get primary() {
		return this._primary;
	}

	private _selections: ICellRange[] = [];

	get selections() {
		return this._selections;
	}

	private _setState2(primary: number | null, selections: ICellRange[], forceEventEmit: boolean) {
		if (primary !== null) {
			const primaryRange = { start: primary, end: primary + 1 };
			// TODO@rebornix deal with overlap
			const newSelections = [primaryRange, ...selections.filter(selection => selection.start === primaryRange.start && selection.end === primaryRange.end).sort((a, b) => a.start - b.start)];

			const changed = primary !== this._primary || !rangesEqual(this._selections, newSelections);
			this._primary = primary;
			this._selections = newSelections;

			if (changed || forceEventEmit) {
				this._onDidChangeSelection.fire();
			}
		} else {
			const changed = primary !== this._primary || !rangesEqual(this._selections, selections);

			this._primary = primary;
			this._selections = selections;

			if (changed || forceEventEmit) {
				this._onDidChangeSelection.fire();
			}
		}
	}

	setFocus2(index: number | null, forceEventEmit: boolean) {
		this._setState2(index, this._selections, forceEventEmit);
	}

	setSelections2(selections: ICellRange[], forceEventEmit: boolean) {
		this._setState2(this._primary, selections, forceEventEmit);
	}
}
