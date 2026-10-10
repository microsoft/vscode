/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import electron, { WebContents, WebFrameMain } from 'electron';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { hasKey } from '../../../base/common/types.js';
import { FindInFrameOptions, FoundInFrameResult, IWebviewManagerService, WebviewWebContentsId, WebviewWindowId } from '../common/webviewManagerService.js';
import { WebviewProtocolProvider } from './webviewProtocolProvider.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';

export class WebviewMainService extends Disposable implements IWebviewManagerService {

	declare readonly _serviceBrand: undefined;

	private readonly _onFoundInFrame = this._register(new Emitter<FoundInFrameResult>());
	public readonly onFoundInFrame = this._onFoundInFrame.event;

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
		if (!contents.isDestroyed()) {
			contents.setIgnoreMenuShortcuts(enabled);
		}
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
