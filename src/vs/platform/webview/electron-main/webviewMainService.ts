/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { session, WebContents, webContents, WebFrameMain } from 'electron';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITunnelService } from 'vs/platform/remote/common/tunnel';
import { FoundInFrameResult, IWebviewManagerService, webviewPartitionId, WebviewWebContentsId, WebviewWindowId } from 'vs/platform/webview/common/webviewManagerService';
import { WebviewProtocolProvider } from 'vs/platform/webview/electron-main/webviewProtocolProvider';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';

export class WebviewMainService extends Disposable implements IWebviewManagerService {

	declare readonly _serviceBrand: undefined;

	private frameHandlers = new Map<string, WebFrameMain>();
	private readonly _onFoundInFrame = this._register(new Emitter<FoundInFrameResult>());
	public onFoundInFrame = this._onFoundInFrame.event;

	constructor(
		@ITunnelService tunnelService: ITunnelService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
	) {
		super();
		this._register(new WebviewProtocolProvider());

		const sess = session.fromPartition(webviewPartitionId);
		sess.setPermissionRequestHandler((_webContents, permission, callback) => {
			if (permission === 'clipboard-read') {
				return callback(true);
			}

			return callback(false);
		});

		sess.setPermissionCheckHandler((_webContents, permission /* 'media' */) => {
			return permission === 'clipboard-read';
		});
	}

	public async setIgnoreMenuShortcuts(id: WebviewWebContentsId | WebviewWindowId, enabled: boolean): Promise<void> {
		let contents: WebContents | undefined;

		if (typeof (id as WebviewWindowId).windowId === 'number') {
			const { windowId } = (id as WebviewWindowId);
			const window = this.windowsMainService.getWindowById(windowId);
			if (!window?.win) {
				throw new Error(`Invalid windowId: ${windowId}`);
			}
			contents = window.win.webContents;
		} else {
			const { webContentsId } = (id as WebviewWebContentsId);
			contents = webContents.fromId(webContentsId);
			if (!contents) {
				throw new Error(`Invalid webContentsId: ${webContentsId}`);
			}
		}

		if (!contents.isDestroyed()) {
			contents.setIgnoreMenuShortcuts(enabled);
		}
	}

	public async findInFrame(windowId: WebviewWindowId, frameName: string, text: string, options: { findNext?: boolean, forward?: boolean }): Promise<void> {
		const frame = this.getFrameByName(windowId, frameName);
		frame.findInFrame(text, {
			findNext: options.findNext,
			forward: options.forward,
		});
		if (!this.frameHandlers.has(frameName)) {
			const event = frame.on('found-in-frame', (_, result) => {
				if (result.finalUpdate) {
					this._onFoundInFrame.fire(result);
				}
			});
			this.frameHandlers.set(frameName, event);
		}
	}

	public async stopFindInFrame(windowId: WebviewWindowId, frameName: string, options: { keepSelection?: boolean }): Promise<void> {
		const frame = this.getFrameByName(windowId, frameName);
		frame.stopFindInFrame(options.keepSelection ? 'keepSelection' : 'clearSelection');
	}

	private getFrameByName(windowId: WebviewWindowId, frameName: string): WebFrameMain {
		const window = this.windowsMainService.getWindowById(windowId.windowId);
		if (!window?.win) {
			throw new Error(`Invalid windowId: ${windowId}`);
		}
		const frame = window.win.webContents.mainFrame.framesInSubtree.find(frame => {
			return frame.name === frameName;
		});
		if (!frame) {
			throw new Error(`Unknown frame: ${frameName}`);
		}
		return frame;
	}

	override dispose() {
		this.frameHandlers.clear();
	}
}
