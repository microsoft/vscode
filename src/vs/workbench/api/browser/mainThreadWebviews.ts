/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { isWeb } from '../../../base/common/platform.js';
import { escape } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { IWebview, WebviewContentOptions, WebviewExtensionDescription } from '../../contrib/webview/browser/webview.js';
import { IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import * as extHostProtocol from '../common/extHost.protocol.js';
import { deserializeWebviewMessage, serializeWebviewMessage } from '../common/extHostWebviewMessaging.js';

export class MainThreadWebviews extends Disposable implements extHostProtocol.MainThreadWebviewsShape {

	private static readonly standardSupportedLinkSchemes = new Set([
		Schemas.http,
		Schemas.https,
		Schemas.mailto,
		Schemas.vscode,
		'vscode-insider',
	]);

	private readonly _proxy: extHostProtocol.ExtHostWebviewsShape;

	private readonly _webviews = new Map<string, IWebview>();

	constructor(
		context: IExtHostContext,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IProductService private readonly _productService: IProductService,
	) {
		super();

		this._proxy = context.getProxy(extHostProtocol.ExtHostContext.ExtHostWebviews);
	}

	public addWebview(handle: extHostProtocol.WebviewHandle, webview: IWebview, options: { serializeBuffersForPostMessage: boolean }): void {
		if (this._webviews.has(handle)) {
			throw new Error('Webview already registered');
		}

		this._webviews.set(handle, webview);
		this.hookupWebviewEventDelegate(handle, webview, options);
	}

	public $setHtml(handle: extHostProtocol.WebviewHandle, value: string): void {
		this.tryGetWebview(handle)?.setHtml(value);
	}

	public $setOptions(handle: extHostProtocol.WebviewHandle, options: extHostProtocol.IWebviewContentOptions): void {
		const webview = this.tryGetWebview(handle);
		if (webview) {
			webview.contentOptions = reviveWebviewContentOptions(options);
		}
	}

	public async $postMessage(handle: extHostProtocol.WebviewHandle, jsonMessage: string, ...buffers: VSBuffer[]): Promise<boolean> {
		const webview = this.tryGetWebview(handle);
		if (!webview) {
			return false;
		}
		const { message, arrayBuffers } = deserializeWebviewMessage(jsonMessage, buffers);
		return webview.postMessage(message, arrayBuffers);
	}

	private hookupWebviewEventDelegate(handle: extHostProtocol.WebviewHandle, webview: IWebview, options: { serializeBuffersForPostMessage: boolean }) {
		const disposables = new DisposableStore();

		disposables.add(webview.onDidClickLink((uri) => this.onDidClickLink(handle, uri)));

		disposables.add(webview.onMessage((message) => {
			const serialized = serializeWebviewMessage(message.message, options);
			this._proxy.$onMessage(handle, serialized.message, new SerializableObjectWithBuffers(serialized.buffers));
		}));

		disposables.add(webview.onMissingCsp((extension: ExtensionIdentifier) => this._proxy.$onMissingCsp(handle, extension.value)));

		disposables.add(webview.onDidDispose(() => {
			disposables.dispose();
			this._webviews.delete(handle);
		}));
	}

	private onDidClickLink(handle: extHostProtocol.WebviewHandle, link: string): void {
		const webview = this.getWebview(handle);
		if (this.isSupportedLink(webview, URI.parse(link))) {
			this._openerService.open(link, { fromUserGesture: true, allowContributedOpeners: true, allowCommands: Array.isArray(webview.contentOptions.enableCommandUris) || webview.contentOptions.enableCommandUris === true, fromWorkspace: true });
		}
	}

	private isSupportedLink(webview: IWebview, link: URI): boolean {
		if (MainThreadWebviews.standardSupportedLinkSchemes.has(link.scheme)) {
			return true;
		}

		if (!isWeb && this._productService.urlProtocol === link.scheme) {
			return true;
		}

		if (link.scheme === Schemas.command) {
			if (Array.isArray(webview.contentOptions.enableCommandUris)) {
				return webview.contentOptions.enableCommandUris.includes(link.path);
			}

			return webview.contentOptions.enableCommandUris === true;
		}

		return false;
	}

	private tryGetWebview(handle: extHostProtocol.WebviewHandle): IWebview | undefined {
		return this._webviews.get(handle);
	}

	private getWebview(handle: extHostProtocol.WebviewHandle): IWebview {
		const webview = this.tryGetWebview(handle);
		if (!webview) {
			throw new Error(`Unknown webview handle:${handle}`);
		}
		return webview;
	}

	public getWebviewResolvedFailedContent(viewType: string) {
		return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none';">
			</head>
			<body>${localize('errorMessage', "An error occurred while loading view: {0}", escape(viewType))}</body>
		</html>`;
	}
}

export function reviveWebviewExtension(extensionData: extHostProtocol.WebviewExtensionDescription): WebviewExtensionDescription {
	return {
		id: extensionData.id,
		location: URI.revive(extensionData.location),
	};
}

export function reviveWebviewContentOptions(webviewOptions: extHostProtocol.IWebviewContentOptions): WebviewContentOptions {
	return {
		allowScripts: webviewOptions.enableScripts,
		allowForms: webviewOptions.enableForms,
		enableCommandUris: webviewOptions.enableCommandUris,
		localResourceRoots: Array.isArray(webviewOptions.localResourceRoots) ? webviewOptions.localResourceRoots.map(r => URI.revive(r)) : undefined,
		portMapping: webviewOptions.portMapping,
	};
}
