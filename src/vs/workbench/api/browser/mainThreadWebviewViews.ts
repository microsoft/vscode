/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import type { MainThreadWebviews } from 'vs/workbench/api/browser/mainThreadWebview';
import * as extHostProtocol from 'vs/workbench/api/common/extHost.protocol';
import { IWebviewViewService, WebviewView } from 'vs/workbench/contrib/webviewView/browser/webviewViewService';


export class MainThreadWebviewsViews extends Disposable {

	private readonly _proxyViews: extHostProtocol.ExtHostWebviewViewsShape;

	private readonly _webviewViews = new Map<string, WebviewView>();
	private readonly _webviewViewProviders = new Map<string, IDisposable>();

	constructor(
		private readonly mainThreadWebviews: MainThreadWebviews,
		context: extHostProtocol.IExtHostContext,
		@IWebviewViewService private readonly _webviewViewService: IWebviewViewService,
	) {
		super();

		this._proxyViews = context.getProxy(extHostProtocol.ExtHostContext.ExtHostWebviewViews);
	}

	public $setWebviewViewTitle(handle: extHostProtocol.WebviewPanelHandle, value: string | undefined): void {
		const webviewView = this._webviewViews.get(handle);
		if (!webviewView) {
			throw new Error('unknown webview view');
		}
		webviewView.title = value;
	}

	public $registerWebviewViewProvider(viewType: string, options?: { retainContextWhenHidden?: boolean }): void {
		if (this._webviewViewProviders.has(viewType)) {
			throw new Error(`View provider for ${viewType} already registered`);
		}

		this._webviewViewService.register(viewType, {
			resolve: async (webviewView: WebviewView, cancellation: CancellationToken) => {
				this._webviewViews.set(viewType, webviewView);

				const handle = webviewView.webview.id;
				this.mainThreadWebviews.addWebview(handle, webviewView.webview);

				let state = undefined;
				if (webviewView.webview.state) {
					try {
						state = JSON.parse(webviewView.webview.state);
					} catch (e) {
						console.error('Could not load webview state', e, webviewView.webview.state);
					}
				}

				if (options) {
					webviewView.webview.options = options;
				}

				webviewView.onDidChangeVisibility(visible => {
					this._proxyViews.$onDidChangeWebviewViewVisibility(handle, visible);
				});

				webviewView.onDispose(() => {
					this._proxyViews.$disposeWebviewView(handle);
				});

				try {
					await this._proxyViews.$resolveWebviewView(handle, viewType, state, cancellation);
				} catch (error) {
					onUnexpectedError(error);
					webviewView.webview.html = this.mainThreadWebviews.getWebviewResolvedFailedContent(viewType);
				}
			}
		});
	}

	public $unregisterWebviewViewProvider(viewType: string): void {
		const provider = this._webviewViewProviders.get(viewType);
		if (!provider) {
			throw new Error(`No view provider for ${viewType} registered`);
		}

		provider.dispose();
		this._webviewViewProviders.delete(viewType);
	}
}

