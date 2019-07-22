/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WebviewService as BrowserWebviewService } from 'vs/workbench/contrib/webview/browser/webviewService';
import { IWebviewService, WebviewContentOptions, WebviewElement, WebviewOptions } from 'vs/workbench/contrib/webview/common/webview';
import { ElectronWebviewBasedWebview } from 'vs/workbench/contrib/webview/electron-browser/webviewElement';

export class ElectronWebviewService extends BrowserWebviewService implements IWebviewService {
	_serviceBrand: any;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(instantiationService);
	}

	createWebview(
		_id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions
	): WebviewElement {
		return this.instantiationService.createInstance(ElectronWebviewBasedWebview, options, contentOptions);
	}
}