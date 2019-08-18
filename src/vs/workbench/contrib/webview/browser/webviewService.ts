/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IFrameWebview } from 'vs/workbench/contrib/webview/browser/webviewElement';
import { IWebviewService, WebviewContentOptions, WebviewEditorOverlay, WebviewElement, WebviewOptions } from 'vs/workbench/contrib/webview/common/webview';
import { DynamicWebviewEditorOverlay } from './dynamicWebviewEditorOverlay';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class WebviewService implements IWebviewService {
	_serviceBrand: any;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	createWebview(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions
	): WebviewElement {
		return this._instantiationService.createInstance(IFrameWebview, id, options, contentOptions);
	}

	createWebviewEditorOverlay(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
	): WebviewEditorOverlay {
		return this._instantiationService.createInstance(DynamicWebviewEditorOverlay, id, options, contentOptions);
	}
}

registerSingleton(IWebviewService, WebviewService, true);
