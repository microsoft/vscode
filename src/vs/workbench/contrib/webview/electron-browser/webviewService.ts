/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { DynamicWebviewEditorOverlay } from 'vs/workbench/contrib/webview/browser/dynamicWebviewEditorOverlay';
import { IFrameWebview } from 'vs/workbench/contrib/webview/browser/webviewElement';
import { IWebviewService, WebviewContentOptions, WebviewEditorOverlay, WebviewElement, WebviewOptions } from 'vs/workbench/contrib/webview/common/webview';
import { ElectronWebviewBasedWebview } from 'vs/workbench/contrib/webview/electron-browser/webviewElement';

export class ElectronWebviewService implements IWebviewService {
	_serviceBrand: any;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configService: IConfigurationService,
	) { }

	createWebview(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions
	): WebviewElement {
		const useExternalEndpoint = this._configService.getValue<string>('webview.experimental.useExternalEndpoint');
		if (useExternalEndpoint) {
			return this._instantiationService.createInstance(IFrameWebview, id, options, contentOptions);
		} else {
			return this._instantiationService.createInstance(ElectronWebviewBasedWebview, options, contentOptions);
		}
	}

	createWebviewEditorOverlay(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
	): WebviewEditorOverlay {
		return this._instantiationService.createInstance(DynamicWebviewEditorOverlay, id, options, contentOptions);
	}
}