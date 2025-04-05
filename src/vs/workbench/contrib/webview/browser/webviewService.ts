/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WebviewThemeDataProvider } from './themeing.js';
import { IOverlayWebview, IWebview, IWebviewElement, IWebviewService, WebviewInitInfo } from './webview.js';
import { WebviewElement } from './webviewElement.js';
import { OverlayWebview } from './overlayWebview.js';

export class WebviewService extends Disposable implements IWebviewService {
	declare readonly _serviceBrand: undefined;

	protected readonly _webviewThemeDataProvider: WebviewThemeDataProvider;

	constructor(
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._webviewThemeDataProvider = this._instantiationService.createInstance(WebviewThemeDataProvider);
	}

	private _activeWebview?: IWebview;

	public get activeWebview() { return this._activeWebview; }

	private _updateActiveWebview(value: IWebview | undefined) {
		if (value !== this._activeWebview) {
			this._activeWebview = value;
			this._onDidChangeActiveWebview.fire(value);
		}
	}

	private _webviews = new Set<IWebview>();

	public get webviews(): Iterable<IWebview> {
		return this._webviews.values();
	}

	private readonly _onDidChangeActiveWebview = this._register(new Emitter<IWebview | undefined>());
	public readonly onDidChangeActiveWebview = this._onDidChangeActiveWebview.event;

	createWebviewElement(initInfo: WebviewInitInfo): IWebviewElement {
		const webview = this._instantiationService.createInstance(WebviewElement, initInfo, this._webviewThemeDataProvider);
		this.registerNewWebview(webview);
		return webview;
	}

	createWebviewOverlay(initInfo: WebviewInitInfo): IOverlayWebview {
		const webview = this._instantiationService.createInstance(OverlayWebview, initInfo);
		this.registerNewWebview(webview);
		return webview;
	}

	protected registerNewWebview(webview: IWebview) {
		this._webviews.add(webview);

		const store = new DisposableStore();

		store.add(webview.onDidFocus(() => {
			this._updateActiveWebview(webview);
		}));

		const onBlur = () => {
			if (this._activeWebview === webview) {
				this._updateActiveWebview(undefined);
			}
		};

		store.add(webview.onDidBlur(onBlur));
		store.add(webview.onDidDispose(() => {
			onBlur();
			store.dispose();
			this._webviews.delete(webview);
		}));
	}
}
