/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWebviewElement, WebviewInitInfo } from '../browser/webview';
import { WebviewService } from '../browser/webviewService';
import { ElectronWebviewElement } from './webviewElement';

export class ElectronWebviewService extends WebviewService {

	override createWebviewElement(initInfo: WebviewInitInfo): IWebviewElement {
		const webview = this._instantiationService.createInstance(ElectronWebviewElement, initInfo, this._webviewThemeDataProvider);
		this.registerNewWebview(webview);
		return webview;
	}
}
