/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleFindWidget } from 'vs/editor/contrib/find/browser/simpleFindWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService, } from 'vs/platform/contextkey/common/contextkey';
import { ITerminalService } from 'vs/workbench/parts/terminal/common/terminal';
import { ISimpleFindWidgetService } from 'vs/editor/contrib/find/browser/simpleFindWidgetService';

export class TerminalFindWidget extends SimpleFindWidget {

	constructor(
		@IContextViewService _contextViewService: IContextViewService,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@ITerminalService private _terminalService: ITerminalService,
		@ISimpleFindWidgetService _simpleFindWidgetService: ISimpleFindWidgetService
	) {
		super(_contextViewService, _contextKeyService, _simpleFindWidgetService);
	}

	public find(previous) {
		let val = this.inputValue;
		let instance = this._terminalService.getActiveInstance();
		if (instance !== null) {
			if (!this._isVisible) {
				this.reveal(false);
			}
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