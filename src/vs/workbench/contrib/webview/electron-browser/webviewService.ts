/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WebviewElement } from 'vs/workbench/contrib/webview/electron-browser/webviewElement';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { IWebviewService, WebviewOptions, WebviewContentOptions, Webview } from 'vs/workbench/contrib/webview/common/webview';

export class WebviewService implements IWebviewService {
	_serviceBrand: any;

	constructor(
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	createWebview(
		options: WebviewOptions,
		contentOptions: WebviewContentOptions
	): Webview {
		const element = this._instantiationService.createInstance(WebviewElement,
			this._layoutService.getContainer(Parts.EDITOR_PART),
			options,
			contentOptions);

		return element;
	}
}