/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IWebviewManagerService } from '../../../../platform/webview/common/webviewManagerService.js';
import { hasNativeTitlebar } from '../../../../platform/window/common/window.js';

export class WindowIgnoreMenuShortcutsManager extends Disposable {

	private static readonly _webviews = new Map<Element, WindowIgnoreMenuShortcutsManager>();

	private static readonly _shortcutOwners = new Map<number, WindowIgnoreMenuShortcutsManager>();

	private readonly _isUsingNativeTitleBars: boolean;

	private readonly _webviewMainService: IWebviewManagerService;

	constructor(
		private readonly _webviewElement: HTMLIFrameElement | undefined,
		configurationService: IConfigurationService,
		mainProcessService: IMainProcessService,
		private readonly _nativeHostService: INativeHostService
	) {
		super();
		this._isUsingNativeTitleBars = hasNativeTitlebar(configurationService);

		this._webviewMainService = ProxyChannel.toService<IWebviewManagerService>(mainProcessService.getChannel('webview'));
		if (this._webviewElement && this._shouldToggleMenuShortcutsEnablement) {
			WindowIgnoreMenuShortcutsManager._webviews.set(this._webviewElement, this);
		}
	}

	public didFocus(): void {
		if (this._store.isDisposed || !this._shouldToggleMenuShortcutsEnablement) {
			return;
		}
		WindowIgnoreMenuShortcutsManager._shortcutOwners.set(this._nativeHostService.windowId, this);
		this.setIgnoreMenuShortcuts(true);
	}

	public didBlur(): void {
		if (this._store.isDisposed) {
			return;
		}
		const owner = WindowIgnoreMenuShortcutsManager._shortcutOwners.get(this._nativeHostService.windowId);
		if (!owner) {
			return;
		}

		// Programmatic focus and the webview's polling can miss a complete focus round trip.
		// Reconcile against the active iframe before releasing the window's native state.
		const targetWindow = owner._webviewElement ? getWindow(owner._webviewElement) : undefined;
		const activeElement = targetWindow?.document.activeElement;
		const focusedWebview = activeElement ? WindowIgnoreMenuShortcutsManager._webviews.get(activeElement) : undefined;
		if (focusedWebview && focusedWebview._nativeHostService.windowId === this._nativeHostService.windowId
			&& (focusedWebview !== this || targetWindow?.document.hasFocus())) {
			WindowIgnoreMenuShortcutsManager._shortcutOwners.set(this._nativeHostService.windowId, focusedWebview);
		} else {
			WindowIgnoreMenuShortcutsManager._shortcutOwners.delete(this._nativeHostService.windowId);
			owner.setIgnoreMenuShortcuts(false);
		}
	}

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}
		if (this._webviewElement) {
			WindowIgnoreMenuShortcutsManager._webviews.delete(this._webviewElement);
		}
		this.didBlur();
		super.dispose();
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
