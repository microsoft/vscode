/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleFindWidget } from 'vs/editor/contrib/find/browser/simpleFindWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { ITerminalService } from 'vs/workbench/parts/terminal/common/terminal';

export class TerminalFindWidget extends SimpleFindWidget {

	constructor(
		@IContextViewService _contextViewService: IContextViewService,
		@ITerminalService private _terminalService: ITerminalService
	) {
		super(_contextViewService);
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

	protected onFocusTrackerFocus() {
		this._terminalService.getActiveInstance().notifyFindWidgetFocusChanged(true);
	}

	protected onFocusTrackerBlur() {
		this._terminalService.getActiveInstance().notifyFindWidgetFocusChanged(false);
	}
}