/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WebviewThemeDataProvider } from 'vs/workbench/contrib/webview/browser/themeing';
import { IWebviewService, Webview, WebviewContentOptions, WebviewElement, WebviewExtensionDescription, WebviewIcons, WebviewOptions, WebviewOverlay } from 'vs/workbench/contrib/webview/browser/webview';
import { IFrameWebview } from 'vs/workbench/contrib/webview/browser/webviewElement';
import { DynamicWebviewEditorOverlay } from './dynamicWebviewEditorOverlay';
import { WebviewIconManager } from './webviewIconManager';

export class WebviewService implements IWebviewService {
	declare readonly _serviceBrand: undefined;

	protected readonly _webviewThemeDataProvider: WebviewThemeDataProvider;

	private readonly _iconManager: WebviewIconManager;

	constructor(
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
	) {
		this._webviewThemeDataProvider = this._instantiationService.createInstance(WebviewThemeDataProvider);
		this._iconManager = this._instantiationService.createInstance(WebviewIconManager);
	}

	private _activeWebview?: Webview;
	public get activeWebview() { return this._activeWebview; }

	createWebviewElement(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescription | undefined,
	): WebviewElement {
		const webview = this._instantiationService.createInstance(IFrameWebview, id, options, contentOptions, extension, this._webviewThemeDataProvider);
		this.addWebviewListeners(webview);
		return webview;
	}

	createWebviewOverlay(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescription | undefined,
	): WebviewOverlay {
		const webview = this._instantiationService.createInstance(DynamicWebviewEditorOverlay, id, options, contentOptions, extension);
		this.addWebviewListeners(webview);
		return webview;
	}

	setIcons(id: string, iconPath: WebviewIcons | undefined): void {
		this._iconManager.setIcons(id, iconPath);
	}

	protected addWebviewListeners(webview: Webview) {
		webview.onDidFocus(() => {
			this._activeWebview = webview;
		});

		const onBlur = () => {
			if (this._activeWebview === webview) {
				this._activeWebview = undefined;
			}
		};

		webview.onDidBlur(onBlur);
		webview.onDidDispose(onBlur);
	}
}
