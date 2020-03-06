/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleFindWidget } from 'vs/workbench/contrib/codeEditor/browser/find/simpleFindWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED, INotebookEditor, CellFindMatch, NotebookFindDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { FindDecorations } from 'vs/editor/contrib/find/findDecorations';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { ICellModelDeltaDecorations, ICellModelDecorations } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';

export class NotebookFindWidget extends SimpleFindWidget {
	protected _findWidgetFocused: IContextKey<boolean>;
	private _findMatches: CellFindMatch[] = [];
	private _currentMatch: CellFindMatch | null = null;
	private _decorations: ICellModelDecorations[] = [];

	constructor(
		private readonly _notebookEditor: INotebookEditor & NotebookFindDelegate,
		@IContextViewService contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(contextViewService, contextKeyService);
		this._findWidgetFocused = KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED.bindTo(contextKeyService);
	}

	protected onInputChanged(): boolean {
		const val = this.inputValue;
		if (val) {
			this._findMatches = this._notebookEditor.startFind(val);
			if (this._findMatches.length) {
				this._currentMatch = this._findMatches[0];
				this.set(this._findMatches);
				return true;
			} else {
				this._currentMatch = null;
				return false;
			}
		} else {
			this.set([]);
			this._notebookEditor.stopFind(false);
		}
		return false;
	}

	protected find(previous: boolean): void {
		if (this._currentMatch && this._findMatches.length) {
			let len = this._findMatches.length;
			let index = this._findMatches.indexOf(this._currentMatch);

			let nextIndex = previous ? (index - 1 + len) % len : index + 1 % len;
			let nextMatch = this._findMatches[nextIndex];

			this._notebookEditor.focusNext(nextMatch);
			this._currentMatch = nextMatch;
		}

		return;
	}

	public hide() {
		super.hide();
		this.set([]);
		this._notebookEditor.stopFind(true);
		this._notebookEditor.focus();
	}

	protected findFirst(): void { }

	protected onFocusTrackerFocus() {
		this._findWidgetFocused.set(true);
	}

	protected onFocusTrackerBlur() {
		this._findWidgetFocused.reset();
	}

	protected onFindInputFocusTrackerFocus(): void { }
	protected onFindInputFocusTrackerBlur(): void { }

	public set(cellFindMatches: CellFindMatch[]): void {

		this._notebookEditor.changeDecorations((accessor) => {

			let findMatchesOptions: ModelDecorationOptions = FindDecorations._FIND_MATCH_DECORATION;

			let deltaDecorations: ICellModelDeltaDecorations[] = cellFindMatches.map(cellFindMatch => {
				const findMatches = cellFindMatch.matches;

				// Find matches
				let newFindMatchesDecorations: IModelDeltaDecoration[] = new Array<IModelDeltaDecoration>(findMatches.length);
				for (let i = 0, len = findMatches.length; i < len; i++) {
					newFindMatchesDecorations[i] = {
						range: findMatches[i].range,
						options: findMatchesOptions
					};
				}

				return { ownerId: cellFindMatch.cell.handle, decorations: newFindMatchesDecorations };
			});

			this._decorations = accessor.deltaDecorations(this._decorations, deltaDecorations);
		});
	}
}
