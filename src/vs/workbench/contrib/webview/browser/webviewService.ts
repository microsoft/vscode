/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IFrameWebview as WebviewElement } from 'vs/workbench/contrib/webview/browser/webviewElement';
import { IWebviewService, WebviewOptions, WebviewContentOptions, Webview } from 'vs/workbench/contrib/webview/common/webview';

export class WebviewService implements IWebviewService {
	_serviceBrand: any;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	createWebview(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions
	): Webview {
		return this._instantiationService.createInstance(WebviewElement,
			id,
			options,
			contentOptions);
	}
}