/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWebviewService, Webview, WebviewContentOptions, WebviewOptions } from 'vs/workbench/contrib/webview/common/webview';
import { WebviewElement } from 'vs/workbench/contrib/webview/electron-browser/webviewElement';

export class WebviewService implements IWebviewService {
	_serviceBrand: any;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	createWebview(
		_id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions
	): Webview {
		return this._instantiationService.createInstance(WebviewElement,
			options,
			contentOptions);
	}
}