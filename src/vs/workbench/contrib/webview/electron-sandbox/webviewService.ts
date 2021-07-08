/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebviewContentOptions, WebviewElement, WebviewExtensionDescription, WebviewOptions } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewService } from 'vs/workbench/contrib/webview/browser/webviewService';
import { ElectronIframeWebview } from 'vs/workbench/contrib/webview/electron-sandbox/iframeWebviewElement';

export class ElectronWebviewService extends WebviewService {

	override createWebviewElement(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescription | undefined,
	): WebviewElement {
		const webview = this._instantiationService.createInstance(ElectronIframeWebview, id, options, contentOptions, extension, this._webviewThemeDataProvider);
		this.registerNewWebview(webview);
		return webview;
	}
}
