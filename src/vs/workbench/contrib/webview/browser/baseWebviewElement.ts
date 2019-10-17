/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addClass } from 'vs/base/browser/dom';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';

export const enum WebviewMessageChannels {
	onmessage = 'onmessage',
	didClickLink = 'did-click-link',
	didScroll = 'did-scroll',
	didFocus = 'did-focus',
	didBlur = 'did-blur',
	doUpdateState = 'do-update-state',
	doReload = 'do-reload',
	loadResource = 'load-resource',
	loadLocalhost = 'load-localhost',
	webviewReady = 'webview-ready',
}

export abstract class BaseWebview<T extends HTMLElement> extends Disposable {

	private _element: T | undefined;
	protected get element(): T | undefined { return this._element; }

	protected readonly _ready: Promise<void>;

	constructor(options: WebviewOptions) {
		super();

		this._element = this.createElement(options);

		this._ready = new Promise(resolve => {
			const subscription = this._register(this.on(WebviewMessageChannels.webviewReady, () => {
				if (this.element) {
					addClass(this.element, 'ready');
				}
				subscription.dispose();
				resolve();
			}));
		});
	}

	protected abstract createElement(options: WebviewOptions): T;

	protected abstract on<T = unknown>(channel: WebviewMessageChannels, handler: (data: T) => void): IDisposable;

	dispose(): void {
		if (this.element) {
			this.element.remove();
		}

		this._element = undefined;
		super.dispose();
	}
}
