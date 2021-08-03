/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Schemas } from 'vs/base/common/network';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { ITunnelService } from 'vs/platform/remote/common/tunnel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { FindInFrameOptions, IWebviewManagerService } from 'vs/platform/webview/common/webviewManagerService';
import { WebviewThemeDataProvider } from 'vs/workbench/contrib/webview/browser/themeing';
import { WebviewContentOptions, WebviewExtensionDescription, WebviewOptions } from 'vs/workbench/contrib/webview/browser/webview';
import { IFrameWebview, WebviewMessageChannels } from 'vs/workbench/contrib/webview/browser/webviewElement';
import { WebviewFindDelegate, WebviewFindWidget } from 'vs/workbench/contrib/webview/browser/webviewFindWidget';
import { WindowIgnoreMenuShortcutsManager } from 'vs/workbench/contrib/webview/electron-sandbox/windowIgnoreMenuShortcutsManager';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

/**
 * Webview backed by an iframe but that uses Electron APIs to power the webview.
 */
export class ElectronIframeWebview extends IFrameWebview implements WebviewFindDelegate {

	private readonly _webviewKeyboardHandler: WindowIgnoreMenuShortcutsManager;

	private _webviewFindWidget: WebviewFindWidget | undefined;
	private _findStarted: boolean = false;
	private _cachedHtmlContent: string | undefined;

	private readonly _webviewMainService: IWebviewManagerService;
	private readonly _iframeDelayer = this._register(new Delayer<void>(200));

	public readonly checkImeCompletionState = true;

	protected override get platform() { return 'electron'; }

	constructor(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescription | undefined,
		webviewThemeDataProvider: WebviewThemeDataProvider,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITunnelService tunnelService: ITunnelService,
		@IFileService fileService: IFileService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IMenuService menuService: IMenuService,
		@ILogService logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IMainProcessService mainProcessService: IMainProcessService,
		@INotificationService notificationService: INotificationService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(id, options, contentOptions, extension, webviewThemeDataProvider,
			configurationService, contextMenuService, menuService, notificationService, environmentService,
			fileService, logService, remoteAuthorityResolverService, telemetryService, tunnelService);

		this._webviewKeyboardHandler = new WindowIgnoreMenuShortcutsManager(configurationService, mainProcessService, nativeHostService);

		this._webviewMainService = ProxyChannel.toService<IWebviewManagerService>(mainProcessService.getChannel('webview'));

		this._register(this.on(WebviewMessageChannels.didFocus, () => {
			this._webviewKeyboardHandler.didFocus();
		}));

		this._register(this.on(WebviewMessageChannels.didBlur, () => {
			this._webviewKeyboardHandler.didBlur();
		}));

		if (options.enableFindWidget) {
			this._webviewFindWidget = this._register(instantiationService.createInstance(WebviewFindWidget, this));

			this._register(this.onDidHtmlChange((newContent) => {
				if (this._findStarted && this._cachedHtmlContent !== newContent) {
					this.stopFind(false);
					this._cachedHtmlContent = newContent;
				}
			}));

			this._register(this._webviewMainService.onFoundInFrame((result) => {
				this._hasFindResult.fire(result.matches > 0);
			}));

			this.styledFindWidget();
		}
	}

	public override mountTo(parent: HTMLElement) {
		if (!this.element) {
			return;
		}

		if (this._webviewFindWidget) {
			parent.appendChild(this._webviewFindWidget.getDomNode()!);
		}
		parent.appendChild(this.element);
	}

	protected override get webviewContentEndpoint(): string {
		return `${Schemas.vscodeWebview}://${this.id}`;
	}

	protected override style(): void {
		super.style();
		this.styledFindWidget();
	}

	private styledFindWidget() {
		this._webviewFindWidget?.updateTheme(this.webviewThemeDataProvider.getTheme());
	}

	private readonly _hasFindResult = this._register(new Emitter<boolean>());
	public readonly hasFindResult: Event<boolean> = this._hasFindResult.event;

	private readonly _onDidStopFind = this._register(new Emitter<void>());
	public readonly onDidStopFind: Event<void> = this._onDidStopFind.event;

	public startFind(value: string) {
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
			this._webviewMainService.findInFrame({ windowId: this.nativeHostService.windowId }, this.id, value, options);
		});
	}

	/**
	 * Webviews expose a stateful find API.
	 * Successive calls to find will move forward or backward through onFindResults
	 * depending on the supplied options.
	 *
	 * @param value The string to search for. Empty strings are ignored.
	 */
	public find(value: string, previous: boolean): void {
		if (!this.element) {
			return;
		}

		if (!this._findStarted) {
			this.startFind(value);
		} else {
			// continuing the find, so set findNext to false
			const options: FindInFrameOptions = { forward: !previous, findNext: false, matchCase: false };
			this._webviewMainService.findInFrame({ windowId: this.nativeHostService.windowId }, this.id, value, options);
		}
	}

	public stopFind(keepSelection?: boolean): void {
		if (!this.element) {
			return;
		}
		this._iframeDelayer.cancel();
		this._findStarted = false;
		this._webviewMainService.stopFindInFrame({ windowId: this.nativeHostService.windowId }, this.id, {
			keepSelection
		});
		this._onDidStopFind.fire();
	}

	public override showFind() {
		this._webviewFindWidget?.reveal();
	}

	public override hideFind() {
		this._webviewFindWidget?.hide();
	}

	public override runFindAction(previous: boolean) {
		this._webviewFindWidget?.find(previous);
	}
}
