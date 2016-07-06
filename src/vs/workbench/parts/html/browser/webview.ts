/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {addDisposableListener, addClass} from 'vs/base/browser/dom';
import {isLightTheme, isDarkTheme} from 'vs/platform/theme/common/themes';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';

declare interface WebviewElement extends HTMLElement {
	src: string;
	autoSize: 'on';
	nodeintegration: 'on';
	disablewebsecurity: 'on';

	getURL(): string;
	getTitle(): string;
	executeJavaScript(code: string, userGesture?: boolean, callback?: (result: any) => any);
	send(channel: string, ...args: any[]);
	openDevTools(): any;
	closeDevTools(): any;
}

KeybindingsRegistry.registerCommandDesc({
	id: '_webview.openDevTools',
	when: null,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(0),
	primary: null,
	handler() {
		const elements = document.querySelectorAll('webview.ready');
		for (let i = 0; i < elements.length; i++) {
			try {
				(<WebviewElement>elements.item(i)).openDevTools();
			} catch (e) {
				console.error(e);
			}
		}
	}
});

type ApiThemeClassName = 'vscode-light' | 'vscode-dark' | 'vscode-high-contrast';

export default class Webview {

	private _webview: WebviewElement;
	private _ready: TPromise<this>;
	private _disposables: IDisposable[];

	constructor(private _parent: HTMLElement, private _styleElement: Element, onDidClickLink:(uri:URI)=>any) {
		this._webview = <any>document.createElement('webview');

		this._webview.style.width = '100%';
		this._webview.style.height = '100%';
		this._webview.style.outline = '0';
		this._webview.style.opacity = '0';
		this._webview.autoSize = 'on';
		this._webview.nodeintegration = 'on';
		this._webview.src = require.toUrl('./webview.html');

		this._ready = new TPromise<this>(resolve => {
			const subscription = addDisposableListener(this._webview, 'ipc-message', (event) => {
				if (event.channel === 'webview-ready') {

					// console.info('[PID Webview] ' + event.args[0]);
					addClass(this._webview, 'ready'); // can be found by debug command

					subscription.dispose();
					resolve(this);
				}
			});
		});

		this._disposables = [
			addDisposableListener(this._webview, 'console-message', function (e: { level: number; message: string; line: number; sourceId: string; }) {
				console.log(`[Embedded Page] ${e.message}`);
			}),
			addDisposableListener(this._webview, 'crashed', function () {
				console.error('embedded page crashed');
			}),
			addDisposableListener(this._webview, 'ipc-message', (event) => {
				if (event.channel === 'did-click-link') {
					let [uri] = event.args;
					onDidClickLink(URI.parse(uri));
					return;
				}

				if (event.channel === 'did-set-content') {
					this._webview.style.opacity = '';
					return;
				}
			})
		];

		this._parent.appendChild(this._webview);
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
		this._webview.parentElement.removeChild(this._webview);
	}

	private _send(channel: string, ...args: any[]): void {
		this._ready
			.then(() => this._webview.send(channel, ...args))
			.done(void 0, console.error);
	}

	set contents(value: string[]) {
		this._send('content', value);
	}

	set baseUrl(value: string) {
		this._send('baseUrl', value);
	}

	focus(): void {
		this._webview.focus();
		this._send('focus');
	}

	style(themeId: string): void {
		const {color, backgroundColor, fontFamily, fontSize} = window.getComputedStyle(this._styleElement);

		let value = `
		:root {
			--background-color: ${backgroundColor};
			--color: ${color};
			--font-family: ${fontFamily};
			--font-size: ${fontSize};
		}
		body {
			background-color: var(--background-color);
			color: var(--color);
			font-family: var(--font-family);
			font-size: var(--font-size);
			margin: 0;
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
			width: 14px;
			height: 10px;
		}`;


		let activeTheme: ApiThemeClassName;

		if (isLightTheme(themeId)) {
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

		} else if (isDarkTheme(themeId)){
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
	}
}
