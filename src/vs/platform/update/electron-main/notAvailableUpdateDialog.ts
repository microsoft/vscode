/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import electron from 'electron';
import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../base/common/platform.js';
import { localize } from '../../../nls.js';
import { IDialogMainService } from '../../dialogs/electron-main/dialogMainService.js';
import { IUpdateService, StateType } from '../common/update.js';

/**
 * Shows a native "no updates available" dialog when an explicit update check
 * finds nothing. Shown by whichever app currently owns focus, so it appears
 * once across sibling apps (VS Code / Agents). On macOS the dialog is also
 * shown when the app is active but has no focused window (e.g. "Check for
 * Updates" invoked from the menu bar with all windows closed/minimized).
 */
export class NotAvailableUpdateDialog extends Disposable {

	// macOS: tracks whether this app is currently the active app (NSApp is
	// active) regardless of whether any `BrowserWindow` is focused. Apps start
	// active when launched.
	private macAppActive = isMacintosh;

	constructor(
		updateService: IUpdateService,
		private readonly dialogMainService: IDialogMainService,
	) {
		super();

		if (isMacintosh) {
			this._register(Event.fromNodeEventEmitter(electron.app, 'did-become-active')(() => this.macAppActive = true));
			this._register(Event.fromNodeEventEmitter(electron.app, 'did-resign-active')(() => this.macAppActive = false));
		}

		this._register(updateService.onStateChange(state => {
			if (state.type === StateType.Idle && state.notAvailable && !state.error) {
				this.show();
			}
		}));
	}

	private show(): void {
		const focusedWindow = electron.BrowserWindow.getFocusedWindow();
		if (!focusedWindow && !(isMacintosh && this.macAppActive)) {
			return; // focus is not in this app — let the focused app show the dialog
		}

		this.dialogMainService.showMessageBox({
			type: 'info',
			message: localize('noUpdatesAvailable', "There are currently no updates available."),
		}, focusedWindow ?? undefined);
	}
}
