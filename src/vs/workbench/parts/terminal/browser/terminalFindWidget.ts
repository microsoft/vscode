/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleFindWidget } from 'vs/editor/contrib/find/simpleFindWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { ITerminalService, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_INPUT_FOCUSED } from 'vs/workbench/parts/terminal/common/terminal';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService } from 'vs/platform/storage/common/storage';

export class TerminalFindWidget extends SimpleFindWidget {
	protected _findInputFocused: IContextKey<boolean>;

	constructor(
		@IContextViewService _contextViewService: IContextViewService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService
	) {
		super(_contextViewService, _contextKeyService, keybindingService, notificationService, storageService);
		this._findInputFocused = KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_INPUT_FOCUSED.bindTo(this._contextKeyService);
	}

	public find(previous: boolean) {
		let val = this.inputValue;
		let instance = this._terminalService.getActiveInstance();
		if (instance !== null) {
			if (previous) {
				instance.findPrevious(val);
			} else {
				instance.findNext(val);
			}
		}
	}

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

	protected onFindInputFocusTrackerFocus() {
		this._findInputFocused.set(true);
	}

	protected onFindInputFocusTrackerBlur() {
		this._findInputFocused.reset();
	}
}