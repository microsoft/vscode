/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleFindWidget } from 'vs/editor/contrib/find/browser/simpleFindWidget';
import * as dom from 'vs/base/browser/dom';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { ITerminalService } from 'vs/workbench/parts/terminal/common/terminal';

export class TerminalFindWidget extends SimpleFindWidget {
	private _focusTracker: dom.IFocusTracker;

	constructor(
		@IContextViewService _contextViewService: IContextViewService,
		@ITerminalService private _terminalService: ITerminalService
	) {
		super(_contextViewService);
		this._focusTracker = this._register(dom.trackFocus(this._findInput.inputBox.inputElement));
		this._register(this._focusTracker.addFocusListener(() => this._terminalService.getActiveInstance().notifyFindWidgetFocusChanged(true)));
		this._register(this._focusTracker.addBlurListener(() => this._terminalService.getActiveInstance().notifyFindWidgetFocusChanged(false)));
	}

	public find(previous) {
		let val = this.inputValue;
		let instance = this._terminalService.getActiveInstance();
		if (instance !== null) {
			if (previous) {
				instance.findPrevious(val);
			} else {
				instance.findNext(val);
			}
		}
	};

	public hide() {
		super.hide();
		this._terminalService.getActiveInstance().focus();
	}

	protected onInputChanged() {
		// Ignore input changes for now
	}
}