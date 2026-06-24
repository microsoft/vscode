/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { INotebookFindScope, NotebookFindScopeType } from '../../../common/notebookCommon.js';

export interface INotebookFindChangeEvent {
	markupInput?: boolean;
	markupPreview?: boolean;
	codeInput?: boolean;
	codeOutput?: boolean;
	findScope?: boolean;
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

	private _findScope: INotebookFindScope = { findScopeType: NotebookFindScopeType.None };

	get findScope(): INotebookFindScope {
		return this._findScope;
	}

	set findScope(value: INotebookFindScope) {
		if (this._findScope !== value) {
			this._findScope = value;
			this._onDidChange.fire({ findScope: true });
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
		findScope: INotebookFindScope
	) {
		super();

		this._markupInput = markupInput;
		this._markupPreview = markupPreview;
		this._codeInput = codeInput;
		this._codeOutput = codeOutput;
		this._findScope = findScope;

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
		this._findScope = v.findScope;
	}
}
