/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WebviewThemeDataProvider } from 'vs/workbench/contrib/webview/browser/themeing';
import { IWebviewService, Webview, WebviewContentOptions, WebviewElement, WebviewExtensionDescription, WebviewOptions, WebviewOverlay } from 'vs/workbench/contrib/webview/browser/webview';
import { IFrameWebview } from 'vs/workbench/contrib/webview/browser/webviewElement';
import { DynamicWebviewEditorOverlay } from './dynamicWebviewEditorOverlay';

export class WebviewService extends Disposable implements IWebviewService {
	declare readonly _serviceBrand: undefined;

	protected readonly _webviewThemeDataProvider: WebviewThemeDataProvider;

	constructor(
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._webviewThemeDataProvider = this._instantiationService.createInstance(WebviewThemeDataProvider);
	}

	private _activeWebview?: Webview;

	public get activeWebview() { return this._activeWebview; }

	private updateActiveWebview(value: Webview | undefined) {
		if (value !== this._activeWebview) {
			this._activeWebview = value;
			this._onDidChangeActiveWebview.fire(value);
		}
	}

	private _webviews = new Set<Webview>();

	public get webviews(): Iterable<Webview> {
		return this._webviews.values();
	}

	private readonly _onDidChangeActiveWebview = this._register(new Emitter<Webview | undefined>());
	public readonly onDidChangeActiveWebview = this._onDidChangeActiveWebview.event;

	createWebviewElement(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescription | undefined,
	): WebviewElement {
		const webview = this._instantiationService.createInstance(IFrameWebview, id, options, contentOptions, extension, this._webviewThemeDataProvider);
		this.registerNewWebview(webview);
		return webview;
	}

	createWebviewOverlay(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescription | undefined,
	): WebviewOverlay {
		const webview = this._instantiationService.createInstance(DynamicWebviewEditorOverlay, id, options, contentOptions, extension);
		this.registerNewWebview(webview);
		return webview;
	}

	protected registerNewWebview(webview: Webview) {
		this._webviews.add(webview);

		webview.onDidFocus(() => {
			this.updateActiveWebview(webview);
		});

		const onBlur = () => {
			if (this._activeWebview === webview) {
				this.updateActiveWebview(undefined);
			}
		};

		webview.onDidBlur(onBlur);
		webview.onDidDispose(() => {
			onBlur();
			this._webviews.delete(webview);
		});
	}
}
