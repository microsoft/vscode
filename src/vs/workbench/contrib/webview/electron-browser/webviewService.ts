/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { DynamicWebviewEditorOverlay } from 'vs/workbench/contrib/webview/browser/dynamicWebviewEditorOverlay';
import { IWebviewService, WebviewContentOptions, WebviewOverlay, WebviewElement, WebviewIcons, WebviewOptions } from 'vs/workbench/contrib/webview/browser/webview';
import { IFrameWebview } from 'vs/workbench/contrib/webview/browser/webviewElement';
import { WebviewIconManager } from 'vs/workbench/contrib/webview/browser/webviewIconManager';
import { WebviewThemeDataProvider } from 'vs/workbench/contrib/webview/common/themeing';
import { ElectronWebviewBasedWebview } from 'vs/workbench/contrib/webview/electron-browser/webviewElement';

export class ElectronWebviewService implements IWebviewService {
	_serviceBrand: undefined;

	private readonly _webviewThemeDataProvider: WebviewThemeDataProvider;
	private readonly _iconManager: WebviewIconManager;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configService: IConfigurationService,
	) {
		this._webviewThemeDataProvider = this._instantiationService.createInstance(WebviewThemeDataProvider);
		this._iconManager = this._instantiationService.createInstance(WebviewIconManager);
	}

	createWebviewElement(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions
	): WebviewElement {
		const useExternalEndpoint = this._configService.getValue<string>('webview.experimental.useExternalEndpoint');
		if (useExternalEndpoint) {
			return this._instantiationService.createInstance(IFrameWebview, id, options, contentOptions, this._webviewThemeDataProvider);
		} else {
			return this._instantiationService.createInstance(ElectronWebviewBasedWebview, id, options, contentOptions, this._webviewThemeDataProvider);
		}
	}

	createWebviewOverlay(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
	): WebviewOverlay {
		return this._instantiationService.createInstance(DynamicWebviewEditorOverlay, id, options, contentOptions);
	}

	setIcons(id: string, iconPath: WebviewIcons | undefined): void {
		this._iconManager.setIcons(id, iconPath);
	}
}
