/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import electron, { WebContents, WebFrameMain } from 'electron';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable } from '../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../base/common/platform.js';
import { hasKey } from '../../../base/common/types.js';
import { FindInFrameOptions, FoundInFrameResult, IWebviewManagerService, WebviewWebContentsId, WebviewWindowId } from '../common/webviewManagerService.js';
import { isFocusInFrameNestedInWebview } from './webviewFrames.js';
import { WebviewProtocolProvider } from './webviewProtocolProvider.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';

/**
 * On macOS, edit shortcuts such as Cmd+C and Cmd+A only reach a page through the application menu.
 * While a webview has focus, the window ignores menu shortcuts and the webview forwards its key
 * presses to the workbench instead. A webview can't forward the key presses of frames nested in its
 * content, so the window lets the edit shortcuts through to the menu while one of those has focus.
 * Other shortcuts stay ignored, so that extensions which forward the key presses of such frames to
 * the workbench don't run commands twice.
 */
class WebviewMenuShortcuts implements IDisposable {

	private _ignore = false;

	private readonly _onBeforeInput = (_event: Electron.Event, input: Electron.Input) => {
		// Chromium sends each key press to the focused frame, which the workbench doesn't track
		// inside webviews, so decide for each one.
		if (input.type === 'keyDown' && this._ignore) {
			this._contents.setIgnoreMenuShortcuts(!isEditMenuShortcut(input) || !isFocusInFrameNestedInWebview(this._contents));
		}
	};

	constructor(private readonly _contents: WebContents) {
		_contents.on('before-input-event', this._onBeforeInput);
	}

	setIgnore(ignore: boolean): void {
		this._ignore = ignore;
		this._contents.setIgnoreMenuShortcuts(ignore);
	}

	dispose(): void {
		if (!this._contents.isDestroyed()) {
			this._contents.off('before-input-event', this._onBeforeInput);
		}
	}
}

/**
 * Whether the key press is the shortcut of a native command of the Edit menu on macOS: Select All,
 * Copy, Cut, Paste, Undo or Redo. Chromium doesn't handle these in the page on macOS.
 */
function isEditMenuShortcut(input: Electron.Input): boolean {
	if (!input.meta || input.control || input.alt) {
		return false;
	}

	// Keyboard layouts without Latin letters, such as Russian, use the position of the key
	const letter = /^[a-z]$/i.test(input.key) ? input.key.toLowerCase() : /^Key([A-Z])$/.exec(input.code)?.[1].toLowerCase();
	return input.shift ? letter === 'z' : letter === 'a' || letter === 'c' || letter === 'v' || letter === 'x' || letter === 'z';
}

export class WebviewMainService extends Disposable implements IWebviewManagerService {

	declare readonly _serviceBrand: undefined;

	private readonly _onFoundInFrame = this._register(new Emitter<FoundInFrameResult>());
	public readonly onFoundInFrame = this._onFoundInFrame.event;

	private readonly _menuShortcuts = this._register(new DisposableMap<number, WebviewMenuShortcuts>());

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(instantiationService.createInstance(WebviewProtocolProvider));
	}

	public async setIgnoreMenuShortcuts(id: WebviewWebContentsId | WebviewWindowId, enabled: boolean): Promise<void> {
		const contents = this.getWebContents(id);
		if (!contents) {
			throw new Error(hasKey(id, { windowId: true }) ? `Invalid windowId: ${id.windowId}` : `Invalid webContentsId: ${id.webContentsId}`);
		}
		if (contents.isDestroyed()) {
			return;
		}

		if (!isMacintosh) {
			contents.setIgnoreMenuShortcuts(enabled);
			return;
		}

		let menuShortcuts = this._menuShortcuts.get(contents.id);
		if (!menuShortcuts) {
			const id = contents.id;
			menuShortcuts = new WebviewMenuShortcuts(contents);
			this._menuShortcuts.set(id, menuShortcuts);
			contents.once('destroyed', () => this._menuShortcuts.deleteAndDispose(id));
		}
		menuShortcuts.setIgnore(enabled);
	}

	private getWebContents(id: WebviewWebContentsId | WebviewWindowId): WebContents | undefined {
		if (hasKey(id, { windowId: true })) {
			const window = this.windowsMainService.getWindowById(id.windowId)?.win;
			return window && !window.isDestroyed() ? window.webContents : undefined;
		}

		return electron.webContents.fromId(id.webContentsId);
	}

	public async findInFrame(id: WebviewWebContentsId | WebviewWindowId, frameName: string, text: string, options: { findNext?: boolean; forward?: boolean }): Promise<void> {
		const initialFrame = this.getFrameByName(id, frameName);
		if (!initialFrame) {
			return;
		}

		type WebFrameMainWithFindSupport = WebFrameMain & {
			findInFrame?(text: string, findOptions: FindInFrameOptions): void;
			on(event: 'found-in-frame', listener: Function): WebFrameMain;
			removeListener(event: 'found-in-frame', listener: Function): WebFrameMain;
		};
		const frame = initialFrame as unknown as WebFrameMainWithFindSupport;
		if (typeof frame.findInFrame === 'function') {
			frame.findInFrame(text, {
				findNext: options.findNext,
				forward: options.forward,
			});
			const foundInFrameHandler = (_: unknown, result: FoundInFrameResult) => {
				if (result.finalUpdate) {
					this._onFoundInFrame.fire(result);
					frame.removeListener('found-in-frame', foundInFrameHandler);
				}
			};
			frame.on('found-in-frame', foundInFrameHandler);
		}
	}

	public async stopFindInFrame(id: WebviewWebContentsId | WebviewWindowId, frameName: string, options: { keepSelection?: boolean }): Promise<void> {
		const initialFrame = this.getFrameByName(id, frameName);
		if (!initialFrame) {
			return;
		}

		type WebFrameMainWithFindSupport = WebFrameMain & {
			stopFindInFrame?(stopOption: 'keepSelection' | 'clearSelection'): void;
		};

		const frame = initialFrame as unknown as WebFrameMainWithFindSupport;
		if (typeof frame.stopFindInFrame === 'function') {
			frame.stopFindInFrame(options.keepSelection ? 'keepSelection' : 'clearSelection');
		}
	}

	private getFrameByName(id: WebviewWebContentsId | WebviewWindowId, frameName: string): WebFrameMain | undefined {
		const contents = this.getWebContents(id);
		if (!contents || contents.isDestroyed()) {
			this.logService.trace('[WebviewMainService] Skipping find request for unavailable web contents', id);
			return undefined;
		}

		const mainFrame = contents.mainFrame;
		if (!mainFrame || mainFrame.isDestroyed()) {
			this.logService.trace('[WebviewMainService] Skipping find request for an unavailable main frame', id);
			return undefined;
		}

		// Electron can fail to convert the entire subtree while a descendant is pending deletion.
		const framesInSubtree = mainFrame.framesInSubtree;
		if (!framesInSubtree) {
			this.logService.warn('[WebviewMainService] Frame subtree unavailable for find request', id);
			return undefined;
		}

		const frame = framesInSubtree.find(frame => {
			return !frame.isDestroyed() && !frame.detached && frame.name === frameName;
		});
		if (!frame) {
			this.logService.trace('[WebviewMainService] Skipping find request for a missing frame', id, frameName);
		}
		return frame;
	}
}
