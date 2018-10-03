/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addClass, addDisposableListener } from 'vs/base/browser/dom';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';
import { DARK, ITheme, IThemeService, LIGHT } from 'vs/platform/theme/common/themeService';
import { registerFileProtocol, WebviewProtocol } from 'vs/workbench/parts/webview/electron-browser/webviewProtocols';
import { areWebviewInputOptionsEqual } from './webviewEditorService';
import { WebviewFindWidget } from './webviewFindWidget';

export interface WebviewOptions {
	readonly allowScripts?: boolean;
	readonly allowSvgs?: boolean;
	readonly svgWhiteList?: string[];
	readonly enableWrappedPostMessage?: boolean;
	readonly useSameOriginForRoot?: boolean;
	readonly localResourceRoots?: ReadonlyArray<URI>;
}

export class WebviewElement extends Disposable {
	private _webview: Electron.WebviewTag;
	private _ready: Promise<this>;

	private _webviewFindWidget: WebviewFindWidget;
	private _findStarted: boolean = false;
	private _contents: string = '';
	private _state: string | undefined = undefined;

	constructor(
		private readonly _styleElement: Element,
		private _options: WebviewOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService private readonly _themeService: IThemeService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
		this._webview = document.createElement('webview');
		this._webview.setAttribute('partition', this._options.allowSvgs ? 'webview' : `webview${Date.now()}`);

		this._webview.setAttribute('disableguestresize', '');
		this._webview.setAttribute('webpreferences', 'contextIsolation=yes');

		this._webview.style.flex = '0 1';
		this._webview.style.width = '0';
		this._webview.style.height = '0';
		this._webview.style.outline = '0';

		this._webview.preload = require.toUrl('./webview-pre.js');
		this._webview.src = this._options.useSameOriginForRoot ? require.toUrl('./webview.html') : 'data:text/html;charset=utf-8,%3C%21DOCTYPE%20html%3E%0D%0A%3Chtml%20lang%3D%22en%22%20style%3D%22width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3Chead%3E%0D%0A%09%3Ctitle%3EVirtual%20Document%3C%2Ftitle%3E%0D%0A%3C%2Fhead%3E%0D%0A%3Cbody%20style%3D%22margin%3A%200%3B%20overflow%3A%20hidden%3B%20width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3C%2Fbody%3E%0D%0A%3C%2Fhtml%3E';

		this._ready = new Promise<this>(resolve => {
			const subscription = this._register(addDisposableListener(this._webview, 'ipc-message', (event) => {
				if (event.channel === 'webview-ready') {
					// console.info('[PID Webview] ' event.args[0]);
					addClass(this._webview, 'ready'); // can be found by debug command

					subscription.dispose();
					resolve(this);
				}
			}));
		});

		if (!this._options.useSameOriginForRoot) {
			let loaded = false;
			this._register(addDisposableListener(this._webview, 'did-start-loading', () => {
				if (loaded) {
					return;
				}
				loaded = true;

				const contents = this._webview.getWebContents();
				this.registerFileProtocols(contents);
			}));
		}

		if (!this._options.allowSvgs) {
			let loaded = false;
			this._register(addDisposableListener(this._webview, 'did-start-loading', () => {
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

		this._register(addDisposableListener(this._webview, 'console-message', function (e: { level: number; message: string; line: number; sourceId: string; }) {
			console.log(`[Embedded Page] ${e.message}`);
		}));
		this._register(addDisposableListener(this._webview, 'dom-ready', () => {
			this.layout();
		}));
		this._register(addDisposableListener(this._webview, 'crashed', () => {
			console.error('embedded page crashed');
		}));
		this._register(addDisposableListener(this._webview, 'ipc-message', (event) => {
			switch (event.channel) {
				case 'onmessage':
					if (this._options.enableWrappedPostMessage && event.args && event.args.length) {
						this._onMessage.fire(event.args[0]);
					}
					return;

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

				case 'do-reload':
					this.reload();
					return;

				case 'do-update-state':
					this._state = event.args[0];
					this._onDidUpdateState.fire(this._state);
					return;
			}
		}));
		this._register(addDisposableListener(this._webview, 'devtools-opened', () => {
			this._send('devtools-opened');
		}));

		this._webviewFindWidget = this._register(instantiationService.createInstance(WebviewFindWidget, this));

		this.style(this._themeService.getTheme());
		this._register(this._themeService.onThemeChange(this.style, this));
	}

	public mountTo(parent: HTMLElement) {
		parent.appendChild(this._webviewFindWidget.getDomNode());
		parent.appendChild(this._webview);
	}

	dispose(): void {
		if (this._webview) {
			this._webview.guestinstance = 'none';

			if (this._webview.parentElement) {
				this._webview.parentElement.removeChild(this._webview);
			}
		}

		this._webview = undefined;
		this._webviewFindWidget = undefined;
		super.dispose();
	}

	private readonly _onDidClickLink = this._register(new Emitter<URI>());
	public readonly onDidClickLink = this._onDidClickLink.event;

	private readonly _onDidScroll = this._register(new Emitter<{ scrollYPercentage: number }>());
	public readonly onDidScroll = this._onDidScroll.event;

	private readonly _onDidUpdateState = this._register(new Emitter<string | undefined>());
	public readonly onDidUpdateState = this._onDidUpdateState.event;

	private readonly _onMessage = this._register(new Emitter<any>());
	public readonly onMessage = this._onMessage.event;

	private _send(channel: string, ...args: any[]): void {
		this._ready
			.then(() => this._webview.send(channel, ...args))
			.catch(err => console.error(err));
	}

	public set initialScrollProgress(value: number) {
		this._send('initial-scroll-position', value);
	}

	public set state(value: string | undefined) {
		this._state = value;
	}

	public set options(value: WebviewOptions) {
		if (this._options && areWebviewInputOptionsEqual(value, this._options)) {
			return;
		}

		this._options = value;
		this._send('content', {
			contents: this._contents,
			options: this._options,
			state: this._state
		});
	}

	public set contents(value: string) {
		this._contents = value;
		this._send('content', {
			contents: value,
			options: this._options,
			state: this._state
		});
	}

	public update(value: string, options: WebviewOptions, retainContextWhenHidden: boolean) {
		if (retainContextWhenHidden && value === this._contents && this._options && areWebviewInputOptionsEqual(options, this._options)) {
			return;
		}
		this._contents = value;
		this._options = options;
		this._send('content', {
			contents: this._contents,
			options: this._options,
			state: this._state
		});
	}

	public set baseUrl(value: string) {
		this._send('baseUrl', value);
	}

	public focus(): void {
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

	private style(theme: ITheme): void {
		const { fontFamily, fontWeight, fontSize } = window.getComputedStyle(this._styleElement); // TODO@theme avoid styleElement

		const exportedColors = colorRegistry.getColorRegistry().getColors().reduce((colors, entry) => {
			const color = theme.getColor(entry.id);
			if (color) {
				colors['vscode-' + entry.id.replace('.', '-')] = color.toString();
			}
			return colors;
		}, {});


		const styles = {
			// Old vars
			'font-family': fontFamily,
			'font-weight': fontWeight,
			'font-size': fontSize,
			'background-color': theme.getColor(colorRegistry.editorBackground).toString(),
			'color': theme.getColor(colorRegistry.editorForeground).toString(),
			'link-color': theme.getColor(colorRegistry.textLinkForeground).toString(),
			'link-active-color': theme.getColor(colorRegistry.textLinkActiveForeground).toString(),

			// Offical API
			'vscode-editor-font-family': fontFamily,
			'vscode-editor-font-weight': fontWeight,
			'vscode-editor-font-size': fontSize,
			...exportedColors
		};

		const activeTheme = ApiThemeClassName.fromTheme(theme);
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
			if (!this._webview || !this._webview.parentElement) {
				return;
			}

			const width = this._webview.parentElement.clientWidth;
			const height = this._webview.parentElement.clientHeight;
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

	private registerFileProtocols(contents: Electron.WebContents) {
		if (!contents || contents.isDestroyed()) {
			return;
		}

		const appRootUri = URI.file(this._environmentService.appRoot);

		registerFileProtocol(contents, WebviewProtocol.CoreResource, this._fileService, () => [
			appRootUri
		]);

		registerFileProtocol(contents, WebviewProtocol.VsCodeResource, this._fileService, () =>
			(this._options.localResourceRoots || [])
		);
	}

	public startFind(value: string, options?: Electron.FindInPageOptions) {
		if (!value) {
			return;
		}

		// ensure options is defined without modifying the original
		options = options || {};

		// FindNext must be false for a first request
		const findOptions: Electron.FindInPageOptions = {
			forward: options.forward,
			findNext: false,
			matchCase: options.matchCase,
			medialCapitalAsWordStart: options.medialCapitalAsWordStart
		};

		this._findStarted = true;
		this._webview.findInPage(value, findOptions);
	}

	/**
	 * Webviews expose a stateful find API.
	 * Successive calls to find will move forward or backward through onFindResults
	 * depending on the supplied options.
	 *
	 * @param value The string to search for. Empty strings are ignored.
	 * @param options
	 */
	public find(value: string, options?: Electron.FindInPageOptions): void {
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

	public reload() {
		this.contents = this._contents;
	}

	public selectAll() {
		this._webview.selectAll();
	}
}


enum ApiThemeClassName {
	light = 'vscode-light',
	dark = 'vscode-dark',
	highContrast = 'vscode-high-contrast'
}

namespace ApiThemeClassName {
	export function fromTheme(theme: ITheme): ApiThemeClassName {
		if (theme.type === LIGHT) {
			return ApiThemeClassName.light;
		} else if (theme.type === DARK) {
			return ApiThemeClassName.dark;
		} else {
			return ApiThemeClassName.highContrast;
		}
	}
}
