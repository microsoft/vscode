/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { addDisposableListener, addClass } from 'vs/base/browser/dom';
import { editorBackground, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { ITheme, LIGHT, DARK } from 'vs/platform/theme/common/themeService';
import { WebviewFindWidget } from './webviewFindWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';

export declare interface WebviewElement extends HTMLElement {
	src: string;
	preload: string;
	send(channel: string, ...args: any[]);
	openDevTools(): any;
	getWebContents(): any;
	findInPage(value: string, options?: WebviewElementFindInPageOptions);
	stopFindInPage(action: string);
}

export class StopFindInPageActions {
	static clearSelection = 'clearSelection';
	static keepSelection = 'keepSelection';
	static activateSelection = 'activateSelection';
}

export interface WebviewElementFindInPageOptions {
	forward?: boolean;
	findNext?: boolean;
	matchCase?: boolean;
	wordStart?: boolean;
	medialCapitalAsWordStart?: boolean;
}

export interface FoundInPageResults {
	requestId: number;
	activeMatchOrdinal: number;
	matches: number;
	selectionArea: any;
}

type ApiThemeClassName = 'vscode-light' | 'vscode-dark' | 'vscode-high-contrast';

export interface WebviewOptions {
	allowScripts?: boolean;
	allowSvgs?: boolean;
	svgWhiteList?: string[];
}

export default class Webview {
	private static index: number = 0;

	private _webview: WebviewElement;
	private _ready: TPromise<this>;
	private _disposables: IDisposable[] = [];
	private _onDidClickLink = new Emitter<URI>();

	private _onDidScroll = new Emitter<{ scrollYPercentage: number }>();
	private _onFoundInPageResults = new Emitter<FoundInPageResults>();

	private _webviewFindWidget: WebviewFindWidget;
	private _findStarted: boolean = false;

	constructor(
		private parent: HTMLElement,
		private _styleElement: Element,
		@IContextViewService private _contextViewService: IContextViewService,
		private _contextKey: IContextKey<boolean>,
		private _findInputContextKey: IContextKey<boolean>,
		private _options: WebviewOptions = {},
	) {
		this._webview = <any>document.createElement('webview');
		this._webview.setAttribute('partition', this._options.allowSvgs ? 'webview' : `webview${Webview.index++}`);

		// disable auxclick events (see https://developers.google.com/web/updates/2016/10/auxclick)
		this._webview.setAttribute('disableblinkfeatures', 'Auxclick');

		this._webview.setAttribute('disableguestresize', '');
		this._webview.setAttribute('webpreferences', 'contextIsolation=yes');

		this._webview.style.flex = '0 1';
		this._webview.style.width = '0';
		this._webview.style.height = '0';
		this._webview.style.outline = '0';

		this._webview.preload = require.toUrl('./webview-pre.js');
		this._webview.src = require.toUrl('./webview.html');

		this._ready = new TPromise<this>(resolve => {
			const subscription = addDisposableListener(this._webview, 'ipc-message', (event) => {
				if (event.channel === 'webview-ready') {
					// console.info('[PID Webview] ' event.args[0]);
					addClass(this._webview, 'ready'); // can be found by debug command

					subscription.dispose();
					resolve(this);
				}
			});
		});

		if (!this._options.allowSvgs) {
			let loaded = false;
			const subscription = addDisposableListener(this._webview, 'did-start-loading', () => {
				if (loaded) {
					return;
				}
				loaded = true;

				const contents = this._webview.getWebContents();
				if (!contents) {
					return;
				}

				contents.session.webRequest.onBeforeRequest((details, callback) => {
					if (details.url.indexOf('.svg') > 0) {
						const uri = URI.parse(details.url);
						if (uri && !uri.scheme.match(/file/i) && (uri.path as any).endsWith('.svg') && !this.isAllowedSvg(uri)) {
							this.onDidBlockSvg();
							return callback({ cancel: true });
						}
					}
					return callback({});
				});

				contents.session.webRequest.onHeadersReceived((details, callback) => {
					const contentType: string[] = (details.responseHeaders['content-type'] || details.responseHeaders['Content-Type']) as any;
					if (contentType && Array.isArray(contentType) && contentType.some(x => x.toLowerCase().indexOf('image/svg') >= 0)) {
						const uri = URI.parse(details.url);
						if (uri && !this.isAllowedSvg(uri)) {
							this.onDidBlockSvg();
							return callback({ cancel: true });
						}
					}
					return callback({ cancel: false, responseHeaders: details.responseHeaders });
				});
			});

			this._disposables.push(subscription);
		}

		this._disposables.push(
			addDisposableListener(this._webview, 'console-message', function (e: { level: number; message: string; line: number; sourceId: string; }) {
				console.log(`[Embedded Page] ${e.message}`);
			}),
			addDisposableListener(this._webview, 'dom-ready', () => {
				this.layout();
			}),
			addDisposableListener(this._webview, 'crashed', () => {
				console.error('embedded page crashed');
			}),
			addDisposableListener(this._webview, 'ipc-message', (event) => {
				if (event.channel === 'did-click-link') {
					let [uri] = event.args;
					this._onDidClickLink.fire(URI.parse(uri));
					return;
				}

				if (event.channel === 'did-set-content') {
					this._webview.style.flex = '';
					this._webview.style.width = '100%';
					this._webview.style.height = '100%';
					this.layout();
					return;
				}

				if (event.channel === 'did-scroll') {
					if (event.args && typeof event.args[0] === 'number') {
						this._onDidScroll.fire({ scrollYPercentage: event.args[0] });
					}
					return;
				}
			}),
			addDisposableListener(this._webview, 'focus', () => {
				if (this._contextKey) {
					this._contextKey.set(true);
				}
			}),
			addDisposableListener(this._webview, 'blur', () => {
				if (this._contextKey) {
					this._contextKey.reset();
				}
			}),
			addDisposableListener(this._webview, 'found-in-page', (event) => {
				this._onFoundInPageResults.fire(event.result);
			})
		);

		this._webviewFindWidget = new WebviewFindWidget(this._contextViewService, this);
		this._disposables.push(this._webviewFindWidget);

		if (parent) {
			parent.appendChild(this._webviewFindWidget.getDomNode());
			parent.appendChild(this._webview);
		}
	}

	public notifyFindWidgetFocusChanged(isFocused: boolean) {
		this._contextKey.set(isFocused || document.activeElement === this._webview);
	}

	public notifyFindWidgetInputFocusChanged(isFocused: boolean) {
		this._findInputContextKey.set(isFocused);
	}

	dispose(): void {
		this._onDidClickLink.dispose();
		this._disposables = dispose(this._disposables);

		if (this._webview.parentElement) {
			this._webview.parentElement.removeChild(this._webview);
			const findWidgetDomNode = this._webviewFindWidget.getDomNode();
			findWidgetDomNode.parentElement.removeChild(findWidgetDomNode);
		}
	}

	get onDidClickLink(): Event<URI> {
		return this._onDidClickLink.event;
	}

	get onDidScroll(): Event<{ scrollYPercentage: number }> {
		return this._onDidScroll.event;
	}

	get onFindResults(): Event<FoundInPageResults> {
		return this._onFoundInPageResults.event;
	}

	private _send(channel: string, ...args: any[]): void {
		this._ready
			.then(() => this._webview.send(channel, ...args))
			.done(void 0, console.error);
	}

	set initialScrollProgress(value: number) {
		this._send('initial-scroll-position', value);
	}

	set options(value: WebviewOptions) {
		this._options = value;
	}

	set contents(value: string[]) {
		this._send('content', {
			contents: value,
			options: this._options
		});
	}

	set baseUrl(value: string) {
		this._send('baseUrl', value);
	}

	focus(): void {
		this._webview.focus();
		this._send('focus');
	}

	public sendMessage(data: any): void {
		this._send('message', data);
	}

	private onDidBlockSvg() {
		this.sendMessage({
			name: 'vscode-did-block-svg'
		});
	}

	style(theme: ITheme): void {
		const { fontFamily, fontWeight, fontSize } = window.getComputedStyle(this._styleElement); // TODO@theme avoid styleElement

		let value = `
		:root {
			--background-color: ${theme.getColor(editorBackground)};
			--color: ${theme.getColor(editorForeground)};
			--font-family: ${fontFamily};
			--font-weight: ${fontWeight};
			--font-size: ${fontSize};
		}
		body {
			background-color: var(--background-color);
			color: var(--color);
			font-family: var(--font-family);
			font-weight: var(--font-weight);
			font-size: var(--font-size);
			margin: 0;
			padding: 0 20px;
		}

		img {
			max-width: 100%;
			max-height: 100%;
		}
		a:focus,
		input:focus,
		select:focus,
		textarea:focus {
			outline: 1px solid -webkit-focus-ring-color;
			outline-offset: -1px;
		}
		::-webkit-scrollbar {
			width: 10px;
			height: 10px;
		}`;


		let activeTheme: ApiThemeClassName;

		if (theme.type === LIGHT) {
			value += `
			::-webkit-scrollbar-thumb {
				background-color: rgba(100, 100, 100, 0.4);
			}
			::-webkit-scrollbar-thumb:hover {
				background-color: rgba(100, 100, 100, 0.7);
			}
			::-webkit-scrollbar-thumb:active {
				background-color: rgba(0, 0, 0, 0.6);
			}`;

			activeTheme = 'vscode-light';

		} else if (theme.type === DARK) {
			value += `
			::-webkit-scrollbar-thumb {
				background-color: rgba(121, 121, 121, 0.4);
			}
			::-webkit-scrollbar-thumb:hover {
				background-color: rgba(100, 100, 100, 0.7);
			}
			::-webkit-scrollbar-thumb:active {
				background-color: rgba(85, 85, 85, 0.8);
			}`;

			activeTheme = 'vscode-dark';

		} else {
			value += `
			::-webkit-scrollbar-thumb {
				background-color: rgba(111, 195, 223, 0.3);
			}
			::-webkit-scrollbar-thumb:hover {
				background-color: rgba(111, 195, 223, 0.8);
			}
			::-webkit-scrollbar-thumb:active {
				background-color: rgba(111, 195, 223, 0.8);
			}`;

			activeTheme = 'vscode-high-contrast';
		}

		this._send('styles', value, activeTheme);

		this._webviewFindWidget.updateTheme(theme);
	}

	public layout(): void {
		const contents = (this._webview as any).getWebContents();
		if (!contents || contents.isDestroyed()) {
			return;
		}
		const window = contents.getOwnerBrowserWindow();
		if (!window || !window.webContents || window.webContents.isDestroyed()) {
			return;
		}
		window.webContents.getZoomFactor(factor => {
			if (contents.isDestroyed()) {
				return;
			}

			contents.setZoomFactor(factor);

			const width = this.parent.clientWidth;
			const height = this.parent.clientHeight;
			contents.setSize({
				normal: {
					width: Math.floor(width * factor),
					height: Math.floor(height * factor)
				}
			});
		});
	}

	private isAllowedSvg(uri: URI): boolean {
		if (this._options.allowSvgs) {
			return true;
		}
		if (this._options.svgWhiteList) {
			return this._options.svgWhiteList.indexOf(uri.authority.toLowerCase()) >= 0;
		}
		return false;
	}

	public startFind(value: string, options?: WebviewElementFindInPageOptions) {
		if (!value) {
			return;
		}

		// ensure options is defined without modifying the original
		options = options || {};

		// FindNext must be false for a first request
		const findOptions: WebviewElementFindInPageOptions = {
			forward: options.forward,
			findNext: false,
			matchCase: options.matchCase,
			medialCapitalAsWordStart: options.medialCapitalAsWordStart
		};

		this._findStarted = true;
		this._webview.findInPage(value, findOptions);
		return;
	}

	/**
	 * Webviews expose a stateful find API.
	 * Successive calls to find will move forward or backward through onFindResults
	 * depending on the supplied options.
	 *
	 * @param {string} value The string to search for. Empty strings are ignored.
	 * @param {WebviewElementFindInPageOptions} [options]
	 *
	 * @memberOf Webview
	 */
	public find(value: string, options?: WebviewElementFindInPageOptions): void {
		// Searching with an empty value will throw an exception
		if (!value) {
			return;
		}

		if (!this._findStarted) {
			this.startFind(value, options);
			return;
		}

		this._webview.findInPage(value, options);
	}

	public stopFind(keepSelection?: boolean): void {
		this._findStarted = false;
		this._webview.stopFindInPage(keepSelection ? StopFindInPageActions.keepSelection : StopFindInPageActions.clearSelection);
	}

	public showFind() {
		this._webviewFindWidget.reveal();
	}

	public hideFind() {
		this._webviewFindWidget.hide();
	}

	public showNextFindTerm() {
		this._webviewFindWidget.showNextFindTerm();
	}

	public showPreviousFindTerm() {
		this._webviewFindWidget.showPreviousFindTerm();
	}
}
