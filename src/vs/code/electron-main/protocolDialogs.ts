/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { BrowserWindow, MessageBoxOptions } from 'electron';
import { IAuxiliaryWindowsMainService } from '../../platform/auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { IDialogMainService } from '../../platform/dialogs/electron-main/dialogMainService.js';
import { IWindowsMainService } from '../../platform/windows/electron-main/windows.js';

type ProtocolDialogWindows = Pick<IWindowsMainService, 'getFocusedWindow' | 'getLastActiveWindow'>;
type ProtocolDialogWindowMessaging = ProtocolDialogWindows & Pick<IWindowsMainService, 'sendToFocused' | 'sendToOpeningWindow'>;
type ProtocolDialogAuxiliaryWindows = Pick<IAuxiliaryWindowsMainService, 'getFocusedWindow'>;

/**
 * Resolves the window that should own a protocol link confirmation dialog:
 * the focused auxiliary window, else the focused main window, else the last
 * active main window. Returns `undefined` when no usable window exists, in
 * which case the dialog stays unparented.
 *
 * The window that will eventually handle the link is not known yet when the
 * confirmation is shown, so the owner may differ from the destination window.
 */
export function getProtocolDialogParentWindow(windowsMainService: ProtocolDialogWindows, auxiliaryWindowsMainService?: ProtocolDialogAuxiliaryWindows): BrowserWindow | undefined {
	const candidates = [
		() => auxiliaryWindowsMainService?.getFocusedWindow()?.win,
		() => windowsMainService.getFocusedWindow()?.win,
		() => windowsMainService.getLastActiveWindow()?.win,
	];

	for (const candidate of candidates) {
		const win = candidate();
		if (win && !win.isDestroyed()) {
			return win;
		}
	}

	return undefined;
}

/**
 * Shows the confirmation dialog for opening a protocol link, parented to the
 * window from {@link getProtocolDialogParentWindow}.
 *
 * Fails closed: if the parent window is destroyed while the dialog is pending,
 * the request is blocked regardless of how the dialog settles.
 *
 * @returns `true` if the request is blocked.
 */
export async function confirmProtocolOpenable(options: MessageBoxOptions, scheme: 'local' | 'remote', windowsMainService: ProtocolDialogWindowMessaging, dialogMainService: Pick<IDialogMainService, 'showMessageBox'>, auxiliaryWindowsMainService?: ProtocolDialogAuxiliaryWindows): Promise<boolean> {
	const parent = getProtocolDialogParentWindow(windowsMainService, auxiliaryWindowsMainService);

	let result;
	try {
		result = await dialogMainService.showMessageBox(options, parent);
	} catch (error) {
		if (parent?.isDestroyed()) {
			return true; // blocked because the dialog's window went away
		}

		throw error;
	}

	if (parent?.isDestroyed()) {
		return true; // blocked because the dialog's window went away
	}

	if (result.response !== 0) {
		return true; // blocked by user choice
	}

	if (result.checkboxChecked) {
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
