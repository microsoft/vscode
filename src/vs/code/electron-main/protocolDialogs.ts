/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { BrowserWindow, MessageBoxOptions } from 'electron';
import { IDialogMainService } from '../../platform/dialogs/electron-main/dialogMainService.js';
import { IWindowsMainService } from '../../platform/windows/electron-main/windows.js';

type ProtocolDialogWindows = Pick<IWindowsMainService, 'getFocusedWindow' | 'getLastActiveWindow'>;
type ProtocolDialogWindowMessaging = ProtocolDialogWindows & Pick<IWindowsMainService, 'sendToFocused' | 'sendToOpeningWindow'>;

/**
 * Resolves the window that should own a protocol link confirmation dialog:
 * the focused window, or else the last active window. Returns `undefined`
 * when no usable window exists, in which case the dialog stays unparented.
 *
 * The window that will eventually handle the link is not known yet when the
 * confirmation is shown, so the owner may differ from the destination window.
 */
export function getProtocolDialogParentWindow(windowsMainService: ProtocolDialogWindows): BrowserWindow | undefined {
	const win = (windowsMainService.getFocusedWindow() ?? windowsMainService.getLastActiveWindow())?.win;
	if (!win || win.isDestroyed()) {
		return undefined;
	}

	return win;
}

/**
 * Shows the confirmation dialog for opening a protocol link, parented to the
 * window from {@link getProtocolDialogParentWindow}.
 *
 * @returns `true` if the user blocked the request.
 */
export async function confirmProtocolOpenable(options: MessageBoxOptions, scheme: 'local' | 'remote', windowsMainService: ProtocolDialogWindowMessaging, dialogMainService: Pick<IDialogMainService, 'showMessageBox'>): Promise<boolean> {
	const { response, checkboxChecked } = await dialogMainService.showMessageBox(options, getProtocolDialogParentWindow(windowsMainService));

	if (response !== 0) {
		return true; // blocked by user choice
	}

	if (checkboxChecked) {
		// Due to https://github.com/microsoft/vscode/issues/195436, we can only
		// update settings from within a window. But we do not know if a window
		// is about to open or can already handle the request, so we have to send
		// to any current window and any newly opening window.
		const request = { channel: 'vscode:disablePromptForProtocolHandling', args: scheme };
		windowsMainService.sendToFocused(request.channel, request.args);
		windowsMainService.sendToOpeningWindow(request.channel, request.args);
	}

	return false; // not blocked by user choice
}
