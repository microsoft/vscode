/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from '../../../../base/common/async.js';
import { VSBuffer, VSBufferReadableStream } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { consumeStream } from '../../../../base/common/stream.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { ITunnelService } from '../../../../platform/tunnel/common/tunnel.js';
import { FindInFrameOptions, IWebviewManagerService } from '../../../../platform/webview/common/webviewManagerService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { WebviewThemeDataProvider } from '../browser/themeing.js';
import { WebviewInitInfo } from '../browser/webview.js';
import { WebviewElement } from '../browser/webviewElement.js';
import { WindowIgnoreMenuShortcutsManager } from './windowIgnoreMenuShortcutsManager.js';

/**
 * Webview backed by an iframe but that uses Electron APIs to power the webview.
 */
export class ElectronWebviewElement extends WebviewElement {

	private readonly _webviewKeyboardHandler: WindowIgnoreMenuShortcutsManager;

	private _findStarted: boolean = false;
	private _cachedHtmlContent: string | undefined;

	private readonly _webviewMainService: IWebviewManagerService;
	private readonly _iframeDelayer = this._register(new Delayer<void>(200));

	protected override get platform() { return 'electron'; }

	constructor(
		initInfo: WebviewInitInfo,
		webviewThemeDataProvider: WebviewThemeDataProvider,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITunnelService tunnelService: ITunnelService,
		@IFileService fileService: IFileService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ILogService logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IMainProcessService mainProcessService: IMainProcessService,
		@INotificationService notificationService: INotificationService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super(initInfo, webviewThemeDataProvider,
			configurationService, contextMenuService, notificationService, environmentService,
			fileService, logService, remoteAuthorityResolverService, tunnelService, instantiationService, accessibilityService);

		this._webviewKeyboardHandler = new WindowIgnoreMenuShortcutsManager(configurationService, mainProcessService, _nativeHostService);

		this._webviewMainService = ProxyChannel.toService<IWebviewManagerService>(mainProcessService.getChannel('webview'));

		if (initInfo.options.enableFindWidget) {
			this._register(this.onDidHtmlChange((newContent) => {
				if (this._findStarted && this._cachedHtmlContent !== newContent) {
					this.stopFind(false);
					this._cachedHtmlContent = newContent;
				}
			}));

			this._register(this._webviewMainService.onFoundInFrame((result) => {
				this._hasFindResult.fire(result.matches > 0);
			}));
		}
	}

	override dispose(): void {
		// Make sure keyboard handler knows it closed (#71800)
		this._webviewKeyboardHandler.didBlur();

		super.dispose();
	}

	protected override webviewContentEndpoint(iframeId: string): string {
		return `${Schemas.vscodeWebview}://${iframeId}`;
	}

	protected override streamToBuffer(stream: VSBufferReadableStream): Promise<ArrayBufferLike> {
		// Join buffers from stream without using the Node.js backing pool.
		// This lets us transfer the resulting buffer to the webview.
		return consumeStream<VSBuffer, ArrayBufferLike>(stream, (buffers: readonly VSBuffer[]) => {
			const totalLength = buffers.reduce((prev, curr) => prev + curr.byteLength, 0);
			const ret = new ArrayBuffer(totalLength);
			const view = new Uint8Array(ret);
			let offset = 0;
			for (const element of buffers) {
				view.set(element.buffer, offset);
				offset += element.byteLength;
			}
			return ret;
		});
	}

	/**
	 * Webviews expose a stateful find API.
	 * Successive calls to find will move forward or backward through onFindResults
	 * depending on the supplied options.
	 *
	 * @param value The string to search for. Empty strings are ignored.
	 */
	public override find(value: string, previous: boolean): void {
		if (!this.element) {
			return;
		}

		if (!this._findStarted) {
			this.updateFind(value);
		} else {
			// continuing the find, so set findNext to false
			const options: FindInFrameOptions = { forward: !previous, findNext: false, matchCase: false };
			this._webviewMainService.findInFrame({ windowId: this._nativeHostService.windowId }, this.id, value, options);
		}
	}

	public override updateFind(value: string) {
		if (!value || !this.element) {
			return;
		}

		// FindNext must be true for a first request
		const options: FindInFrameOptions = {
			forward: true,
			findNext: true,
			matchCase: false
		};

		this._iframeDelayer.trigger(() => {
			this._findStarted = true;
			this._webviewMainService.findInFrame({ windowId: this._nativeHostService.windowId }, this.id, value, options);
		});
	}

	public override stopFind(keepSelection?: boolean): void {
		if (!this.element) {
			return;
		}
		this._iframeDelayer.cancel();
		this._findStarted = false;
		this._webviewMainService.stopFindInFrame({ windowId: this._nativeHostService.windowId }, this.id, {
			keepSelection
		});
		this._onDidStopFind.fire();
	}

	protected override handleFocusChange(isFocused: boolean): void {
		super.handleFocusChange(isFocused);
		if (isFocused) {
			this._webviewKeyboardHandler.didFocus();
		} else {
			this._webviewKeyboardHandler.didBlur();
		}
	}
}
