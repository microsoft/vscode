/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import electron from 'electron';
import { Disposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IDialogMainService } from '../../dialogs/electron-main/dialogMainService.js';
import { IUpdateService, StateType } from '../common/update.js';

/**
 * Shows a native "no updates available" dialog when an explicit update check
 * finds nothing. The dialog is always parented to the currently focused
 * Electron window of this app. When this app does not own focus (focus is in
 * a sibling app such as Agents/VS Code, or in a third-party app), the dialog
 * is suppressed so it can be shown by whichever app actually has focus, and
 * to avoid showing it in two apps at the same time.
 */
export class NotAvailableUpdateDialog extends Disposable {

	constructor(
		updateService: IUpdateService,
		private readonly dialogMainService: IDialogMainService,
	) {
		super();

		this._register(updateService.onStateChange(state => {
			if (state.type === StateType.Idle && state.notAvailable && !state.error) {
				this.show();
			}
		}));
	}

	private show(): void {
		const focusedWindow = electron.BrowserWindow.getFocusedWindow();
		if (!focusedWindow) {
			return; // focus is not in this app — let the focused app show the dialog
		}

		this.dialogMainService.showMessageBox({
			type: 'info',
			message: localize('noUpdatesAvailable', "There are currently no updates available."),
		}, focusedWindow);
	}
}
