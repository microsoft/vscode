/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../base/browser/dom.js';
import { isAuxiliaryWindow } from '../../../../base/browser/window.js';
import { Delayer } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename, isEqual, isEqualAuthority, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { ITunnelService } from '../../../../platform/tunnel/common/tunnel.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { FindInFrameOptions, IWebviewManagerService, WebviewResourceDownload, WebviewWebContentsId, WebviewWindowId } from '../../../../platform/webview/common/webviewManagerService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { WebviewThemeDataProvider } from '../browser/themeing.js';
import { getResourceToLoad } from '../browser/resourceLoading.js';
import { WebviewInitInfo } from '../browser/webview.js';
import { WebviewElement } from '../browser/webviewElement.js';
import { decodeAuthority, webviewRootResourceAuthority } from '../common/webview.js';
import { WindowIgnoreMenuShortcutsManager } from './windowIgnoreMenuShortcutsManager.js';

/**
 * Webview backed by an iframe but that uses Electron APIs to power the webview.
 */
export class ElectronWebviewElement extends WebviewElement {

	private readonly _webviewKeyboardHandler: WindowIgnoreMenuShortcutsManager;

	private _findStarted: boolean = false;
	private _findSelectionRetained: boolean = false;
	private _cachedHtmlContent: string | undefined;

	private readonly _webviewMainService: IWebviewManagerService;
	private readonly _iframeDelayer = this._register(new Delayer<void>(200));

	protected override get platform() { return 'electron'; }

	constructor(
		initInfo: WebviewInitInfo,
		webviewThemeDataProvider: WebviewThemeDataProvider,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITunnelService tunnelService: ITunnelService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ILogService logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IMainProcessService mainProcessService: IMainProcessService,
		@INotificationService notificationService: INotificationService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IFileService private readonly fileService: IFileService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
		super(initInfo, webviewThemeDataProvider,
			configurationService, contextMenuService, notificationService, environmentService,
			logService, remoteAuthorityResolverService, tunnelService, accessibilityService, instantiationService, remoteAgentService);

		this._webviewKeyboardHandler = new WindowIgnoreMenuShortcutsManager(configurationService, mainProcessService, _nativeHostService);

		this._webviewMainService = ProxyChannel.toService<IWebviewManagerService>(mainProcessService.getChannel('webview'));

		this._register(this._webviewMainService.onDynamicDidDownloadResource(this.id)(download => {
			this.downloadResource(download).catch(error => notificationService.error(error));
		}));

		if (initInfo.options.enableFindWidget) {
			this._register(this.onDidHtmlChange((newContent) => {
				if ((this._findStarted || this._findSelectionRetained) && this._cachedHtmlContent !== newContent) {
					this.stopFind(false);
					this._cachedHtmlContent = newContent;
				}
			}));

			this._register(this._webviewMainService.onFoundInFrame((result) => {
				this._hasFindResult.fire(result.matches > 0);
			}));
		}
	}

	private async downloadResource(download: WebviewResourceDownload): Promise<void> {
		const expectedOrigin = this.element?.src ? URI.parse(this.element.src).with({ path: '', query: '', fragment: '' }) : undefined;
		if (!expectedOrigin || !isEqual(URI.parse(download.origin), expectedOrigin)) {
			throw new Error(localize('invalidDownloadOrigin', "Unable to download a resource from another webview."));
		}

		const uri = URI.parse(download.url);
		const suffix = `.${webviewRootResourceAuthority}`;
		const authority = uri.authority.slice(0, -suffix.length);
		const separator = authority.indexOf('+');
		if (uri.scheme !== Schemas.https || !uri.authority.endsWith(suffix) || separator <= 0) {
			throw new Error(localize('invalidDownloadResource', "Unable to download this webview resource."));
		}

		const resource = URI.from({
			scheme: authority.slice(0, separator),
			authority: decodeAuthority(authority.slice(separator + 1)),
			path: uri.path,
			query: uri.query,
		});
		const remoteOS = resource.scheme === Schemas.vscodeRemote && isEqualAuthority(this.remoteAgentService.getConnection()?.remoteAuthority, resource.authority)
			? (await this.remoteAgentService.getEnvironment())?.os
			: undefined;
		const resolveResource = () => {
			const resourceToLoad = getResourceToLoad(resource, this.localResourceRoots, this.uriIdentityService, remoteOS);
			if (!resourceToLoad) {
				throw new Error(localize('downloadResourceAccessDenied', "Unable to download a resource outside the webview's local resource roots."));
			}
			return resourceToLoad;
		};
		resolveResource();

		const target = await this.fileDialogService.showSaveDialog({
			defaultUri: joinPath(await this.fileDialogService.defaultFilePath(Schemas.file), basename(resource)),
			availableFileSystems: [Schemas.file],
			saveLabel: localize('downloadResourceLabel', "Download"),
			title: localize('downloadResourceTitle', "Download"),
		});
		if (!target || this._store.isDisposed) {
			return;
		}

		const source = resolveResource();
		const sourceForComparison = source.scheme === Schemas.file ? source.with({ query: '' }) : source;
		if (this.uriIdentityService.extUri.isEqual(sourceForComparison, target)) {
			return;
		}

		const content = await this.fileService.readFileStream(source);
		try {
			await this.fileService.writeFile(target, content.value);
		} finally {
			content.value.destroy();
		}
	}

	override dispose(): void {
		this.stopFind(false);

		// Make sure keyboard handler knows it closed (#71800)
		this._webviewKeyboardHandler.didBlur();

		super.dispose();
	}

	protected override webviewContentEndpoint(iframeId: string): string {
		return `${Schemas.vscodeWebview}://${iframeId}`;
	}

	private get findTarget(): WebviewWebContentsId | WebviewWindowId {
		const targetWindow = getWindow(this.element);
		return isAuxiliaryWindow(targetWindow)
			? { webContentsId: targetWindow.vscodeWindowId }
			: { windowId: this._nativeHostService.windowId };
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
			this._webviewMainService.findInFrame(this.findTarget, this.id, value, options).catch(onUnexpectedError);
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
			return this._webviewMainService.findInFrame(this.findTarget, this.id, value, options);
		}).catch(onUnexpectedError);
	}

	public override stopFind(keepSelection?: boolean): void {
		if (!this.element) {
			return;
		}
		this._iframeDelayer.cancel();
		if (this._findStarted || (this._findSelectionRetained && !keepSelection)) {
			this._webviewMainService.stopFindInFrame(this.findTarget, this.id, {
				keepSelection
			}).catch(onUnexpectedError);
			this._findSelectionRetained = !!keepSelection;
		}
		this._findStarted = false;
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
