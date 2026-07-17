/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebContents, webContents, WebFrameMain } from 'electron';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { FindInFrameOptions, FoundInFrameResult, IWebviewManagerService, WebviewDocumentRegistration, WebviewPortMappingRequest, WebviewResourceRequest, WebviewResourceResponse, WebviewWebContentsId, WebviewWindowId } from '../common/webviewManagerService.js';
import { WebviewProtocolProvider } from './webviewProtocolProvider.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { IFileService } from '../../files/common/files.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';

export class WebviewMainService extends Disposable implements IWebviewManagerService {

	declare readonly _serviceBrand: undefined;

	private readonly _onFoundInFrame = this._register(new Emitter<FoundInFrameResult>());
	public readonly onFoundInFrame = this._onFoundInFrame.event;
	private readonly _onDidRequestWebviewResource = this._register(new Emitter<WebviewResourceRequest>());
	public readonly onDidRequestWebviewResource = this._onDidRequestWebviewResource.event;
	private readonly _onDidCancelWebviewResource = this._register(new Emitter<number>());
	public readonly onDidCancelWebviewResource = this._onDidCancelWebviewResource.event;
	private readonly _onDidRequestWebviewPortMapping = this._register(new Emitter<WebviewPortMappingRequest>());
	public readonly onDidRequestWebviewPortMapping = this._onDidRequestWebviewPortMapping.event;
	private readonly protocolProvider: WebviewProtocolProvider;

	constructor(
		@IFileService fileService: IFileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
	) {
		super();
		this.protocolProvider = this._register(new WebviewProtocolProvider(
			request => this._onDidRequestWebviewResource.fire(request),
			requestId => this._onDidCancelWebviewResource.fire(requestId),
			request => this._onDidRequestWebviewPortMapping.fire(request),
			uriIdentityService,
			fileService,
		));
		this._register(this.windowsMainService.onDidDestroyWindow(window => this.protocolProvider.unregisterWebviewWindow(window.id)));
	}

	public async registerWebviewDocument(document: WebviewDocumentRegistration): Promise<void> {
		const window = this.windowsMainService.getWindowById(document.windowId);
		const mainFrame = window?.win?.webContents.mainFrame;
		const frame = mainFrame?.framesInSubtree.find(frame => {
			return frame.parent === mainFrame && frame.name === document.frameName;
		});
		if (!frame) {
			throw new Error(`Unknown direct webview frame: ${document.frameName}`);
		}
		this.protocolProvider.registerWebviewDocument({
			...document,
			frameTreeNodeId: frame.frameTreeNodeId,
		});
	}

	public async unregisterWebviewDocument(extensionId: string, webviewId: string): Promise<void> {
		this.protocolProvider.unregisterWebviewDocument(extensionId, webviewId);
	}

	public async startWebviewResourceResponse(response: WebviewResourceResponse): Promise<void> {
		this.protocolProvider.startResourceResponse(response);
	}

	public async streamWebviewResourceResponse(requestId: number, data: import('../../../base/common/buffer.js').VSBuffer): Promise<void> {
		this.protocolProvider.streamResourceResponse(requestId, data);
	}

	public async endWebviewResourceResponse(requestId: number, error?: boolean): Promise<void> {
		this.protocolProvider.endResourceResponse(requestId, error);
	}

	public async resolveWebviewPortMapping(requestId: number, redirect: string | undefined): Promise<void> {
		this.protocolProvider.resolvePortMapping(requestId, redirect);
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

	public async findInFrame(windowId: WebviewWindowId, frameName: string, text: string, options: { findNext?: boolean; forward?: boolean }): Promise<void> {
		const initialFrame = this.getFrameByName(windowId, frameName);

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

	public async stopFindInFrame(windowId: WebviewWindowId, frameName: string, options: { keepSelection?: boolean }): Promise<void> {
		const initialFrame = this.getFrameByName(windowId, frameName);

		type WebFrameMainWithFindSupport = WebFrameMain & {
			stopFindInFrame?(stopOption: 'keepSelection' | 'clearSelection'): void;
		};

		const frame = initialFrame as unknown as WebFrameMainWithFindSupport;
		if (typeof frame.stopFindInFrame === 'function') {
			frame.stopFindInFrame(options.keepSelection ? 'keepSelection' : 'clearSelection');
		}
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
}
