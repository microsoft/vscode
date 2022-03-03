/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWebviewElement, WebviewContentOptions, WebviewExtensionDescription, WebviewOptions } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewService } from 'vs/workbench/contrib/webview/browser/webviewService';
import { ElectronWebviewElement } from 'vs/workbench/contrib/webview/electron-sandbox/webviewElement';

export class ElectronWebviewService extends WebviewService {

	override createWebviewElement(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescription | undefined,
	): IWebviewElement {
		const webview = this._instantiationService.createInstance(ElectronWebviewElement, id, options, contentOptions, extension, this._webviewThemeDataProvider);
		this.registerNewWebview(webview);
		return webview;
	}
}
