/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleFindWidget } from 'vs/editor/contrib/find/simpleFindWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { ITerminalService, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_INPUT_FOCUSED } from 'vs/workbench/parts/terminal/common/terminal';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';

export class TerminalFindWidget extends SimpleFindWidget {
	protected _findWidgetVisible: IContextKey<boolean>;
	protected _findInputFocused: IContextKey<boolean>;

	constructor(
		@IContextViewService _contextViewService: IContextViewService,
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@ITerminalService private _terminalService: ITerminalService
	) {
		super(_contextViewService);
		this._findWidgetVisible = KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE.bindTo(this._contextKeyService);
		this._findInputFocused = KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_INPUT_FOCUSED.bindTo(this._contextKeyService);
	}

	public find(previous: boolean) {
		let val = this.inputValue;
		let instance = this._terminalService.getActiveInstance();
		if (instance !== null) {
			this.reveal(undefined, false);
			if (previous) {
				instance.findPrevious(val);
			} else {
				instance.findNext(val);
			}
		}
	}

	public reveal(initialInput?: string, focusFindInput = true): void {
		super.reveal(initialInput, focusFindInput);
		this._findWidgetVisible.set(true);
	}

	public hide() {
		super.hide();
		this._findWidgetVisible.reset();
		this._terminalService.getActiveInstance().focus();
	}

	protected onInputChanged() {
		// Ignore input changes for now
	}

	protected onFocusTrackerFocus() {
		this._terminalService.getActiveInstance().notifyFindWidgetFocusChanged(true);
	}

	protected onFocusTrackerBlur() {
		this._terminalService.getActiveInstance().notifyFindWidgetFocusChanged(false);
	}

	protected onFindInputFocusTrackerFocus() {
		this._findInputFocused.set(true);
	}

	protected onFindInputFocusTrackerBlur() {
		this._findInputFocused.reset();
	}
}