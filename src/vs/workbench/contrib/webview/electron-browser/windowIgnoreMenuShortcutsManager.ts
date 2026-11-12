/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, getWindow } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
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

	private static getFocusedWebview(element: HTMLIFrameElement | undefined): WindowIgnoreMenuShortcutsManager | undefined {
		const targetDocument = element?.ownerDocument;
		const activeElement = targetDocument?.activeElement;
		return activeElement && targetDocument?.hasFocus() ? this._webviews.get(activeElement) : undefined;
	}

	private readonly _isUsingNativeTitleBars: boolean;

	private readonly _webviewMainService: IWebviewManagerService;
	private readonly _focusListeners = this._register(new DisposableStore());
	private _focusWindow: Window | undefined;

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
			this.setWindow(getWindow(this._webviewElement));
			this._register(this._nativeHostService.onDidFocusMainOrAuxiliaryWindow(id => {
				if (this._webviewElement && getWindow(this._webviewElement).vscodeWindowId === id) {
					queueMicrotask(() => this.updateFocus());
				}
			}));
		}
	}

	public setWindow(targetWindow: Window): void {
		if (this._store.isDisposed || !this._shouldToggleMenuShortcutsEnablement || this._focusWindow === targetWindow) {
			return;
		}
		this._focusListeners.clear();
		this._focusWindow = targetWindow;
		// A short focus change can happen entirely between the webview's focus polls.
		// Wait for the DOM focus transition to finish before reconciling the native state.
		const updateFocus = () => queueMicrotask(() => this.updateFocus());
		this._focusListeners.add(addDisposableListener(targetWindow, EventType.FOCUS, updateFocus, true));
		this._focusListeners.add(addDisposableListener(targetWindow, EventType.BLUR, updateFocus, true));
		updateFocus();
	}

	public didFocus(): void {
		if (this._store.isDisposed || !this._shouldToggleMenuShortcutsEnablement) {
			return;
		}
		WindowIgnoreMenuShortcutsManager._shortcutOwners.set(this._nativeHostService.windowId, this);
		this.setIgnoreMenuShortcuts(true);
	}

	public didBlur(): void {
		this.updateFocus();
	}

	private updateFocus(): void {
		if (this._store.isDisposed) {
			return;
		}
		const owner = WindowIgnoreMenuShortcutsManager._shortcutOwners.get(this._nativeHostService.windowId);
		const focusedWebview = WindowIgnoreMenuShortcutsManager.getFocusedWebview(this._webviewElement)
			?? WindowIgnoreMenuShortcutsManager.getFocusedWebview(owner?._webviewElement);
		if (focusedWebview && focusedWebview._nativeHostService.windowId === this._nativeHostService.windowId) {
			WindowIgnoreMenuShortcutsManager._shortcutOwners.set(this._nativeHostService.windowId, focusedWebview);
			if (!owner) {
				focusedWebview.setIgnoreMenuShortcuts(true);
			}
		} else if (owner) {
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
