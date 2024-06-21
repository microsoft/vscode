/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { Range } from 'vs/editor/common/core/range';
import { NotebookFindScopeType } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export interface INotebookFindChangeEvent {
	markupInput?: boolean;
	markupPreview?: boolean;
	codeInput?: boolean;
	codeOutput?: boolean;
	findInSelection?: boolean;
}

export class NotebookFindFilters extends Disposable {
	private readonly _onDidChange: Emitter<INotebookFindChangeEvent> = this._register(new Emitter<INotebookFindChangeEvent>());
	readonly onDidChange: Event<INotebookFindChangeEvent> = this._onDidChange.event;

	private _markupInput: boolean = true;

	get markupInput(): boolean {
		return this._markupInput;
	}

	set markupInput(value: boolean) {
		if (this._markupInput !== value) {
			this._markupInput = value;
			this._onDidChange.fire({ markupInput: value });
		}
	}

	private _markupPreview: boolean = true;

	get markupPreview(): boolean {
		return this._markupPreview;
	}

	set markupPreview(value: boolean) {
		if (this._markupPreview !== value) {
			this._markupPreview = value;
			this._onDidChange.fire({ markupPreview: value });
		}
	}
	private _codeInput: boolean = true;

	get codeInput(): boolean {
		return this._codeInput;
	}

	set codeInput(value: boolean) {
		if (this._codeInput !== value) {
			this._codeInput = value;
			this._onDidChange.fire({ codeInput: value });
		}
	}

	private _codeOutput: boolean = true;

	get codeOutput(): boolean {
		return this._codeOutput;
	}

	set codeOutput(value: boolean) {
		if (this._codeOutput !== value) {
			this._codeOutput = value;
			this._onDidChange.fire({ codeOutput: value });
		}
	}

	private _findInSelection: boolean = false;

	get findInSelection(): boolean {
		return this._findInSelection;
	}

	set findInSelection(value: boolean) {
		if (this._findInSelection !== value) {
			this._findInSelection = value;
			this._onDidChange.fire({ findInSelection: value });
		}
	}

	private _findScopeType: NotebookFindScopeType = NotebookFindScopeType.Cells;

	get findScopeType(): NotebookFindScopeType {
		return this._findScopeType;
	}

	set findScopeType(value: NotebookFindScopeType) {
		if (this._findScopeType !== value) {
			this._findScopeType = value;
			this._onDidChange.fire({ findInSelection: this._findInSelection });
		}
	}

	private _selectedCellRanges: ICellRange[] | undefined = undefined;

	get selectedCellRanges(): ICellRange[] | undefined {
		return this._selectedCellRanges;
	}

	set selectedCellRanges(value: ICellRange[] | undefined) {
		if (this._selectedCellRanges !== value) {
			this._selectedCellRanges = value;
			this._onDidChange.fire({ findInSelection: this._findInSelection });
		}
	}

	private _selectedTextRanges: Range[] | undefined = undefined;

	get selectedTextRanges(): Range[] | undefined {
		return this._selectedTextRanges;
	}

	set selectedTextRanges(value: Range[] | undefined) {
		if (this._selectedTextRanges !== value) {
			this._selectedTextRanges = value;
			this._onDidChange.fire({ findInSelection: this._findInSelection });
		}
	}

	private readonly _initialMarkupInput: boolean;
	private readonly _initialMarkupPreview: boolean;
	private readonly _initialCodeInput: boolean;
	private readonly _initialCodeOutput: boolean;

	constructor(
		markupInput: boolean,
		markupPreview: boolean,
		codeInput: boolean,
		codeOutput: boolean,
		findInSelection: boolean,
		searchScopeType: NotebookFindScopeType,
		selectedCellRanges?: ICellRange[],
		selectedTextRanges?: Range[]
	) {
		super();

		this._markupInput = markupInput;
		this._markupPreview = markupPreview;
		this._codeInput = codeInput;
		this._codeOutput = codeOutput;
		this._findInSelection = findInSelection;
		this._findScopeType = searchScopeType;
		this._selectedCellRanges = selectedCellRanges;
		this._selectedTextRanges = selectedTextRanges;

		this._initialMarkupInput = markupInput;
		this._initialMarkupPreview = markupPreview;
		this._initialCodeInput = codeInput;
		this._initialCodeOutput = codeOutput;
	}

	isModified(): boolean {
		// do not include findInSelection or either selectedRanges in the check. This will incorrectly mark the filter icon as modified
		return (
			this._markupInput !== this._initialMarkupInput
			|| this._markupPreview !== this._initialMarkupPreview
			|| this._codeInput !== this._initialCodeInput
			|| this._codeOutput !== this._initialCodeOutput
		);
	}

	update(v: NotebookFindFilters) {
		this._markupInput = v.markupInput;
		this._markupPreview = v.markupPreview;
		this._codeInput = v.codeInput;
		this._codeOutput = v.codeOutput;
		this._findInSelection = v.findInSelection;
		this._findScopeType = v.findScopeType;
		this._selectedCellRanges = v.selectedCellRanges;
		this._selectedTextRanges = v.selectedTextRanges;
	}
}
