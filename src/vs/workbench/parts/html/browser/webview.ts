/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { addDisposableListener, addClass } from 'vs/base/browser/dom';
import { editorBackground, editorForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { ITheme, LIGHT, DARK } from 'vs/platform/theme/common/themeService';
import { WebviewFindWidget } from './webviewFindWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { normalize, join, nativeSep } from 'vs/base/common/paths';
import { startsWith } from 'vs/base/common/strings';

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
	private readonly _webview: Electron.WebviewTag;
	private _ready: Promise<this>;
	private _disposables: IDisposable[] = [];
	private _onDidClickLink = new Emitter<URI>();

	private _onDidScroll = new Emitter<{ scrollYPercentage: number }>();
	private _onFoundInPageResults = new Emitter<FoundInPageResults>();

	private _webviewFindWidget: WebviewFindWidget;
	private _findStarted: boolean = false;

	constructor(
		private readonly parent: HTMLElement,
		private readonly _styleElement: Element,
		private readonly _environmentService: IEnvironmentService,
		private readonly _contextViewService: IContextViewService,
		private readonly _contextKey: IContextKey<boolean>,
		private readonly _findInputContextKey: IContextKey<boolean>,
		private _options: WebviewOptions,
		useSameOriginForRoot: boolean
	) {
		this._webview = document.createElement('webview');
		this._webview.setAttribute('partition', this._options.allowSvgs ? 'webview' : `webview${Date.now()}`);

		// disable auxclick events (see https://developers.google.com/web/updates/2016/10/auxclick)
		this._webview.setAttribute('disableblinkfeatures', 'Auxclick');

		this._webview.setAttribute('disableguestresize', '');
		this._webview.setAttribute('webpreferences', 'contextIsolation=yes');

		this._webview.style.flex = '0 1';
		this._webview.style.width = '0';
		this._webview.style.height = '0';
		this._webview.style.outline = '0';

		this._webview.preload = require.toUrl('./webview-pre.js');
		this._webview.src = useSameOriginForRoot ? require.toUrl('./webview.html') : 'data:text/html;charset=utf-8,%3C%21DOCTYPE%20html%3E%0D%0A%3Chtml%20lang%3D%22en%22%20style%3D%22width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3Chead%3E%0D%0A%09%3Ctitle%3EVirtual%20Document%3C%2Ftitle%3E%0D%0A%3C%2Fhead%3E%0D%0A%3Cbody%20style%3D%22margin%3A%200%3B%20overflow%3A%20hidden%3B%20width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3C%2Fbody%3E%0D%0A%3C%2Fhtml%3E';

		this._ready = new Promise<this>(resolve => {
			const subscription = addDisposableListener(this._webview, 'ipc-message', (event) => {
				if (event.channel === 'webview-ready') {
					// console.info('[PID Webview] ' event.args[0]);
					addClass(this._webview, 'ready'); // can be found by debug command

					subscription.dispose();
					resolve(this);
				}
			});
		});

		if (!useSameOriginForRoot) {
			let loaded = false;
			this._disposables.push(addDisposableListener(this._webview, 'did-start-loading', () => {
				if (loaded) {
					return;
				}
				loaded = true;

				const contents = this._webview.getWebContents();
				if (contents && !contents.isDestroyed()) {
					registerFileProtocol(contents, 'vscode-core-resource', this._environmentService.appRoot + nativeSep);
				}
			}));
		}

		if (!this._options.allowSvgs) {
			let loaded = false;
			this._disposables.push(addDisposableListener(this._webview, 'did-start-loading', () => {
				if (loaded) {
					return;
				}
				loaded = true;

				const contents = this._webview.getWebContents();
				if (!contents) {
					return;
				}

				(contents.session.webRequest as any).onBeforeRequest((details, callback) => {
					if (details.url.indexOf('.svg') > 0) {
						const uri = URI.parse(details.url);
						if (uri && !uri.scheme.match(/file/i) && (uri.path as any).endsWith('.svg') && !this.isAllowedSvg(uri)) {
							this.onDidBlockSvg();
							return callback({ cancel: true });
						}
					}
					return callback({});
				});

				(contents.session.webRequest as any).onHeadersReceived((details, callback) => {
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
			}));
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
				switch (event.channel) {
					case 'did-click-link':
						let [uri] = event.args;
						this._onDidClickLink.fire(URI.parse(uri));
						return;

					case 'did-set-content':
						this._webview.style.flex = '';
						this._webview.style.width = '100%';
						this._webview.style.height = '100%';
						this.layout();
						return;

					case 'did-scroll':
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

		if (this._contextKey) {
			this._contextKey.reset();
		}

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
			.catch(err => console.error(err));
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

		const styles = {
			'background-color': theme.getColor(editorBackground).toString(),
			'color': theme.getColor(editorForeground).toString(),
			'font-family': fontFamily,
			'font-weight': fontWeight,
			'font-size': fontSize,
			'link-color': theme.getColor(textLinkForeground).toString()
		};

		let activeTheme: ApiThemeClassName;
		if (theme.type === LIGHT) {
			styles['scrollbar-thumb'] = 'rgba(100, 100, 100, 0.4)';
			styles['scrollbar-thumb-hover'] = 'rgba(100, 100, 100, 0.7)';
			styles['scrollbar-thumb-active'] = 'rgba(0, 0, 0, 0.6)';
			activeTheme = 'vscode-light';
		} else if (theme.type === DARK) {
			styles['scrollbar-thumb'] = 'rgba(121, 121, 121, 0.4)';
			styles['scrollbar-thumb-hover'] = 'rgba(100, 100, 100, 0.7)';
			styles['scrollbar-thumb-active'] = 'rgba(85, 85, 85, 0.8)';
			activeTheme = 'vscode-dark';
		} else {
			styles['scrollbar-thumb'] = 'rgba(111, 195, 223, 0.3)';
			styles['scrollbar-thumb-hover'] = 'rgba(111, 195, 223, 0.8)';
			styles['scrollbar-thumb-active'] = 'rgba(111, 195, 223, 0.8)';
			activeTheme = 'vscode-high-contrast';
		}

		this._send('styles', styles, activeTheme);

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
		this._webview.stopFindInPage(keepSelection ? 'keepSelection' : 'clearSelection');
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

function registerFileProtocol(
	contents: Electron.WebContents,
	protocol: string,
	root: string
) {
	contents.session.protocol.registerFileProtocol(protocol, (request, callback: any) => {
		const requestPath = URI.parse(request.url).path;
		const normalizedPath = normalize(join(root, requestPath), true);
		console.log(root, requestPath, normalizedPath);
		if (startsWith(normalizedPath, root)) {
			callback({ path: normalizedPath });
		} else {
			callback({ error: 'Cannot load resource outside of protocol root' });
		}
	}, (error) => {
		if (error) {
			console.error('Failed to register protocol ' + protocol);
		}
	});
}

