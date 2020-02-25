/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleFindWidget } from 'vs/workbench/contrib/codeEditor/browser/find/simpleFindWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { Event } from 'vs/base/common/event';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/renderers/cellViewModel';
import { FindMatch } from 'vs/editor/common/model';

export interface CellFindMatch {
	cell: CellViewModel,
	match: FindMatch
}

export interface NotebookFindDelegate {
	startFind(value: string): CellFindMatch[];
	stopFind(keepSelection?: boolean): void;
	focus(): void;
	focusNext(nextMatch: CellFindMatch): void;
}


export class NotebookFindWidget extends SimpleFindWidget {
	protected _findWidgetFocused: IContextKey<boolean>;
	private _findMatches: CellFindMatch[] = [];
	private _currentMatch: CellFindMatch | null = null;

	constructor(
		private readonly _delegate: NotebookFindDelegate,
		@IContextViewService contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(contextViewService, contextKeyService);
		this._findWidgetFocused = KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED.bindTo(contextKeyService);
	}

	protected onInputChanged(): boolean {
		const val = this.inputValue;
		if (val) {
			this._findMatches = this._delegate.startFind(val);
			if (this._findMatches.length) {
				this._currentMatch = this._findMatches[0];
				return true;
			} else {
				this._currentMatch = null;
				return false;
			}
		} else {
			this._delegate.stopFind(false);
		}
		return false;
	}

	protected find(previous: boolean): void {
		if (this._currentMatch && this._findMatches.length) {
			let len = this._findMatches.length;
			let index = this._findMatches.indexOf(this._currentMatch);

			let nextIndex = previous ? (index - 1 + len) % len : index + 1 % len;
			let nextMatch = this._findMatches[nextIndex];

			this._delegate.focusNext(nextMatch);
			this._currentMatch = nextMatch;
		}

		return;
	}

	public hide() {
		super.hide();
		this._delegate.stopFind(true);
		this._delegate.focus();
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

}
