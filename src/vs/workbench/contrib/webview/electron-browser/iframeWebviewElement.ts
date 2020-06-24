/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { ITunnelService } from 'vs/platform/remote/common/tunnel';
import { IRequestService } from 'vs/platform/request/common/request';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { WebviewThemeDataProvider } from 'vs/workbench/contrib/webview/browser/themeing';
import { WebviewContentOptions, WebviewExtensionDescription, WebviewOptions } from 'vs/workbench/contrib/webview/browser/webview';
import { IFrameWebview } from 'vs/workbench/contrib/webview/browser/webviewElement';
import { rewriteVsCodeResourceUrls, WebviewResourceRequestManager } from 'vs/workbench/contrib/webview/electron-browser/resourceLoading';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

/**
 * Webview backed by an iframe but that uses Electron APIs to power the webview.
 */
export class ElectronIframeWebview extends IFrameWebview {

	private readonly _resourceRequestManager: WebviewResourceRequestManager;
	private _messagePromise = Promise.resolve();

	constructor(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescription | undefined,
		webviewThemeDataProvider: WebviewThemeDataProvider,
		@ITunnelService tunnelService: ITunnelService,
		@IFileService fileService: IFileService,
		@IRequestService requestService: IRequestService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWorkbenchEnvironmentService _workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@IRemoteAuthorityResolverService _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(id, options, contentOptions, extension, webviewThemeDataProvider,
			tunnelService, fileService, requestService, telemetryService, environmentService, _workbenchEnvironmentService, _remoteAuthorityResolverService, logService);

		this._resourceRequestManager = this._register(instantiationService.createInstance(WebviewResourceRequestManager, id, extension, this.content.options, Promise.resolve(undefined)));
	}

	protected initElement(extension: WebviewExtensionDescription | undefined, options: WebviewOptions) {
		// The extensionId and purpose in the URL are used for filtering in js-debug:
		this.element!.setAttribute('src', `${Schemas.vscodeWebview}://${this.id}/index.html?id=${this.id}&platform=electron&extensionId=${extension?.id.value ?? ''}&purpose=${options.purpose}`);
	}

	public set contentOptions(options: WebviewContentOptions) {
		this._resourceRequestManager.update(options);
		super.contentOptions = options;
	}

	public set localResourcesRoot(resources: URI[]) {
		this._resourceRequestManager.update({
			...this.contentOptions,
			localResourceRoots: resources,
		});
		super.localResourcesRoot = resources;
	}

	protected get extraContentOptions() {
		return {};
	}

	protected async doPostMessage(channel: string, data?: any): Promise<void> {
		this._messagePromise = this._messagePromise
			.then(() => this._resourceRequestManager.ensureReady())
			.then(() => {
				this.element?.contentWindow!.postMessage({ channel, args: data }, '*');
			});
	}

	protected preprocessHtml(value: string): string {
		return rewriteVsCodeResourceUrls(this.id, value);
	}
}
