/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IWebviewManagerService, MacOSMenuAction } from '../../../../platform/webview/common/webviewManagerService.js';
import { hasNativeTitlebar } from '../../../../platform/window/common/window.js';

/**
 * Shortcuts of the native macOS menu items that have no workbench command (see `menubar.ts`).
 */
const macOSMenuShortcuts: ReadonlyArray<{ readonly keybinding: number; readonly action: MacOSMenuAction }> = [
	{ keybinding: KeyMod.CtrlCmd | KeyCode.KeyH, action: 'hide' },
	{ keybinding: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyH, action: 'hideOthers' },
	{ keybinding: KeyMod.CtrlCmd | KeyCode.KeyM, action: 'minimize' },
];

export class WindowIgnoreMenuShortcutsManager {

	private readonly _isUsingNativeTitleBars: boolean;

	private readonly _webviewMainService: IWebviewManagerService;

	constructor(
		configurationService: IConfigurationService,
		mainProcessService: IMainProcessService,
		private readonly _nativeHostService: INativeHostService
	) {
		this._isUsingNativeTitleBars = hasNativeTitlebar(configurationService);

		this._webviewMainService = ProxyChannel.toService<IWebviewManagerService>(mainProcessService.getChannel('webview'));
	}

	public didFocus(): void {
		this.setIgnoreMenuShortcuts(true);
	}

	public didBlur(): void {
		this.setIgnoreMenuShortcuts(false);
	}

	/**
	 * Ignoring menu shortcuts also disables the native macOS menu items that have no
	 * workbench command, such as Hide and Minimize. Run them for key presses that the
	 * workbench did not handle so that they keep working inside webviews (#71800).
	 */
	public handleUnhandledKeyDown(event: KeyboardEvent): void {
		if (!isMacintosh) {
			return;
		}

		const keyEvent = new StandardKeyboardEvent(event);
		const shortcut = macOSMenuShortcuts.find(candidate => keyEvent.equals(candidate.keybinding));
		if (shortcut) {
			this._webviewMainService.runMacOSMenuAction(shortcut.action);
		}
	}

	private get _shouldToggleMenuShortcutsEnablement() {
		return isMacintosh || this._isUsingNativeTitleBars;
	}

	protected setIgnoreMenuShortcuts(value: boolean) {
		if (this._shouldToggleMenuShortcutsEnablement) {
			this._webviewMainService.setIgnoreMenuShortcuts({ windowId: this._nativeHostService.windowId }, value);
		}
	}
}
