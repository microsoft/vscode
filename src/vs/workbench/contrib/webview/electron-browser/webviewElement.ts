/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FindInPageOptions, OnBeforeRequestListenerDetails, OnHeadersReceivedListenerDetails, Response, WebContents, WebviewTag } from 'electron';
import { addDisposableListener } from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import { once } from 'vs/base/common/functional';
import { Disposable, toDisposable, IDisposable } from 'vs/base/common/lifecycle';
import { isMacintosh } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITunnelService } from 'vs/platform/remote/common/tunnel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Webview, WebviewContentOptions, WebviewExtensionDescription, WebviewOptions } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewPortMappingManager } from 'vs/workbench/contrib/webview/common/portMapping';
import { WebviewResourceScheme } from 'vs/workbench/contrib/webview/common/resourceLoader';
import { WebviewThemeDataProvider } from 'vs/workbench/contrib/webview/common/themeing';
import { registerFileProtocol } from 'vs/workbench/contrib/webview/electron-browser/webviewProtocols';
import { WebviewFindDelegate, WebviewFindWidget } from '../browser/webviewFindWidget';
import { BaseWebview, WebviewMessageChannels } from 'vs/workbench/contrib/webview/browser/baseWebviewElement';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';


class WebviewTagHandle extends Disposable {

	private _webContents: undefined | WebContents | 'destroyed';

	public constructor(
		public readonly webview: WebviewTag,
	) {
		super();

		this._register(addDisposableListener(this.webview, 'destroyed', () => {
			this._webContents = 'destroyed';
		}));

		this._register(addDisposableListener(this.webview, 'did-start-loading', once(() => {
			const contents = this.webContents;
			if (contents) {
				this._onFirstLoad.fire(contents);
				this._register(toDisposable(() => {
					contents.removeAllListeners();
				}));
			}
		})));
	}

	private readonly _onFirstLoad = this._register(new Emitter<WebContents>());
	public readonly onFirstLoad = this._onFirstLoad.event;

	public get webContents(): WebContents | undefined {
		if (this._webContents === 'destroyed') {
			return undefined;
		}
		if (this._webContents) {
			return this._webContents;
		}
		this._webContents = this.webview.getWebContents();
		return this._webContents;
	}
}

type OnBeforeRequestDelegate = (details: OnBeforeRequestListenerDetails) => Promise<Response | undefined>;
type OnHeadersReceivedDelegate = (details: OnHeadersReceivedListenerDetails) => { cancel: boolean; } | undefined;

class WebviewSession extends Disposable {

	private readonly _onBeforeRequestDelegates: Array<OnBeforeRequestDelegate> = [];
	private readonly _onHeadersReceivedDelegates: Array<OnHeadersReceivedDelegate> = [];

	public constructor(
		webviewHandle: WebviewTagHandle,
	) {
		super();

		this._register(webviewHandle.onFirstLoad(contents => {
			contents.session.webRequest.onBeforeRequest(async (details, callback) => {
				for (const delegate of this._onBeforeRequestDelegates) {
					const result = await delegate(details);
					if (typeof result !== 'undefined') {
						callback(result);
						return;
					}
				}
				callback({});
			});

			contents.session.webRequest.onHeadersReceived((details, callback) => {
				for (const delegate of this._onHeadersReceivedDelegates) {
					const result = delegate(details);
					if (typeof result !== 'undefined') {
						callback(result);
						return;
					}
				}
				callback({ cancel: false, responseHeaders: details.responseHeaders });
			});
		}));
	}

	public onBeforeRequest(delegate: OnBeforeRequestDelegate) {
		this._onBeforeRequestDelegates.push(delegate);
	}

	public onHeadersReceived(delegate: OnHeadersReceivedDelegate) {
		this._onHeadersReceivedDelegates.push(delegate);
	}
}

class WebviewProtocolProvider extends Disposable {
	constructor(
		handle: WebviewTagHandle,
		private readonly _getExtensionLocation: () => URI | undefined,
		private readonly _getLocalResourceRoots: () => ReadonlyArray<URI>,
		private readonly _fileService: IFileService,
	) {
		super();

		this._register(handle.onFirstLoad(contents => {
			this.registerProtocols(contents);
		}));
	}

	private registerProtocols(contents: WebContents) {
		registerFileProtocol(contents, WebviewResourceScheme, this._fileService, this._getExtensionLocation(), () =>
			this._getLocalResourceRoots()
		);
	}
}

class WebviewPortMappingProvider extends Disposable {

	constructor(
		session: WebviewSession,
		getExtensionLocation: () => URI | undefined,
		mappings: () => ReadonlyArray<modes.IWebviewPortMapping>,
		tunnelService: ITunnelService,
	) {
		super();
		const manager = this._register(new WebviewPortMappingManager(getExtensionLocation, mappings, tunnelService));

		session.onBeforeRequest(async details => {
			const redirect = await manager.getRedirect(details.url);
			return redirect ? { redirectURL: redirect } : undefined;
		});
	}
}

class WebviewKeyboardHandler extends Disposable {

	private _ignoreMenuShortcut = false;

	constructor(
		private readonly _webviewHandle: WebviewTagHandle
	) {
		super();

		if (this.shouldToggleMenuShortcutsEnablement) {
			this._register(_webviewHandle.onFirstLoad(contents => {
				contents.on('before-input-event', (_event, input) => {
					if (input.type === 'keyDown' && document.activeElement === this._webviewHandle.webview) {
						this._ignoreMenuShortcut = input.control || input.meta;
						this.setIgnoreMenuShortcuts(this._ignoreMenuShortcut);
					}
				});
			}));
		}

		this._register(addDisposableListener(this._webviewHandle.webview, 'ipc-message', (event) => {
			switch (event.channel) {
				case 'did-focus':
					this.setIgnoreMenuShortcuts(this._ignoreMenuShortcut);
					break;

				case 'did-blur':
					this.setIgnoreMenuShortcuts(false);
					return;
			}
		}));
	}

	private get shouldToggleMenuShortcutsEnablement() {
		return isMacintosh;
	}

	private setIgnoreMenuShortcuts(value: boolean) {
		if (!this.shouldToggleMenuShortcutsEnablement) {
			return;
		}
		const contents = this._webviewHandle.webContents;
		if (contents) {
			contents.setIgnoreMenuShortcuts(value);
		}
	}
}

export class ElectronWebviewBasedWebview extends BaseWebview<WebviewTag> implements Webview, WebviewFindDelegate {
	private _webviewFindWidget: WebviewFindWidget | undefined;
	private _findStarted: boolean = false;

	public extension: WebviewExtensionDescription | undefined;

	constructor(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		private readonly _webviewThemeDataProvider: WebviewThemeDataProvider,
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileService fileService: IFileService,
		@ITunnelService tunnelService: ITunnelService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IEnvironmentService environementService: IEnvironmentService,
		@IWorkbenchEnvironmentService workbenchEnvironmentService: IWorkbenchEnvironmentService,
	) {
		super(id, options, contentOptions, _webviewThemeDataProvider, telemetryService, environementService, workbenchEnvironmentService);

		const webviewAndContents = this._register(new WebviewTagHandle(this.element!));
		const session = this._register(new WebviewSession(webviewAndContents));

		this._register(new WebviewProtocolProvider(
			webviewAndContents,
			() => this.extension ? this.extension.location : undefined,
			() => (this.content.options.localResourceRoots || []),
			fileService));

		this._register(new WebviewPortMappingProvider(
			session,
			() => this.extension ? this.extension.location : undefined,
			() => (this.content.options.portMapping || []),
			tunnelService,
		));

		this._register(new WebviewKeyboardHandler(webviewAndContents));

		this._register(addDisposableListener(this.element!, 'console-message', function (e: { level: number; message: string; line: number; sourceId: string; }) {
			console.log(`[Embedded Page] ${e.message}`);
		}));
		this._register(addDisposableListener(this.element!, 'dom-ready', () => {
			// Workaround for https://github.com/electron/electron/issues/14474
			if (this.element && (this.focused || document.activeElement === this.element)) {
				this.element.blur();
				this.element.focus();
			}
		}));
		this._register(addDisposableListener(this.element!, 'crashed', () => {
			console.error('embedded page crashed');
		}));

		this._register(this.on('synthetic-mouse-event', (rawEvent: any) => {
			if (!this.element) {
				return;
			}
			const bounds = this.element.getBoundingClientRect();
			try {
				window.dispatchEvent(new MouseEvent(rawEvent.type, {
					...rawEvent,
					clientX: rawEvent.clientX + bounds.left,
					clientY: rawEvent.clientY + bounds.top,
				}));
				return;
			} catch {
				// CustomEvent was treated as MouseEvent so don't do anything - https://github.com/microsoft/vscode/issues/78915
				return;
			}
		}));

		this._register(this.on('did-set-content', () => {
			if (this.element) {
				this.element.style.flex = '';
				this.element.style.width = '100%';
				this.element.style.height = '100%';
			}
		}));

		this._register(addDisposableListener(this.element!, 'devtools-opened', () => {
			this._send('devtools-opened');
		}));

		if (options.enableFindWidget) {
			this._webviewFindWidget = this._register(instantiationService.createInstance(WebviewFindWidget, this));

			this._register(addDisposableListener(this.element!, 'found-in-page', e => {
				this._hasFindResult.fire(e.result.matches > 0);
			}));

			this.styledFindWidget();
		}
	}

	protected createElement(options: WebviewOptions) {
		const element = document.createElement('webview');
		element.setAttribute('partition', `webview${Date.now()}`);
		element.setAttribute('webpreferences', 'contextIsolation=yes');
		element.className = `webview ${options.customClasses || ''}`;

		element.style.flex = '0 1';
		element.style.width = '0';
		element.style.height = '0';
		element.style.outline = '0';

		element.preload = require.toUrl('./pre/electron-index.js');
		element.src = 'data:text/html;charset=utf-8,%3C%21DOCTYPE%20html%3E%0D%0A%3Chtml%20lang%3D%22en%22%20style%3D%22width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3Chead%3E%0D%0A%09%3Ctitle%3EVirtual%20Document%3C%2Ftitle%3E%0D%0A%3C%2Fhead%3E%0D%0A%3Cbody%20style%3D%22margin%3A%200%3B%20overflow%3A%20hidden%3B%20width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3C%2Fbody%3E%0D%0A%3C%2Fhtml%3E';

		return element;
	}

	protected readonly extraContentOptions = {};

	public mountTo(parent: HTMLElement) {
		if (!this.element) {
			return;
		}

		if (this._webviewFindWidget) {
			parent.appendChild(this._webviewFindWidget.getDomNode()!);
		}
		parent.appendChild(this.element);
	}

	protected postMessage(channel: string, data?: any): void {
		this.element?.send(channel, data);
	}

	public focus(): void {
		if (!this.element) {
			return;
		}
		try {
			this.element.focus();
		} catch {
			// noop
		}
		this._send('focus');

		// Handle focus change programmatically (do not rely on event from <webview>)
		this.handleFocusChange(true);
	}

	protected style(): void {
		super.style();
		this.styledFindWidget();
	}

	private styledFindWidget() {
		this._webviewFindWidget?.updateTheme(this._webviewThemeDataProvider.getTheme());
	}

	private readonly _hasFindResult = this._register(new Emitter<boolean>());
	public readonly hasFindResult: Event<boolean> = this._hasFindResult.event;

	public startFind(value: string, options?: FindInPageOptions) {
		if (!value || !this.element) {
			return;
		}

		// ensure options is defined without modifying the original
		options = options || {};

		// FindNext must be false for a first request
		const findOptions: FindInPageOptions = {
			forward: options.forward,
			findNext: false,
			matchCase: options.matchCase,
			medialCapitalAsWordStart: options.medialCapitalAsWordStart
		};

		this._findStarted = true;
		this.element.findInPage(value, findOptions);
	}

	/**
	 * Webviews expose a stateful find API.
	 * Successive calls to find will move forward or backward through onFindResults
	 * depending on the supplied options.
	 *
	 * @param value The string to search for. Empty strings are ignored.
	 */
	public find(value: string, previous: boolean): void {
		if (!this.element) {
			return;
		}

		// Searching with an empty value will throw an exception
		if (!value) {
			return;
		}

		const options = { findNext: true, forward: !previous };
		if (!this._findStarted) {
			this.startFind(value, options);
			return;
		}

		this.element.findInPage(value, options);
	}

	public stopFind(keepSelection?: boolean): void {
		this._hasFindResult.fire(false);
		if (!this.element) {
			return;
		}
		this._findStarted = false;
		this.element.stopFindInPage(keepSelection ? 'keepSelection' : 'clearSelection');
	}

	public showFind() {
		this._webviewFindWidget?.reveal();
	}

	public hideFind() {
		this._webviewFindWidget?.hide();
	}

	public runFindAction(previous: boolean) {
		this._webviewFindWidget?.find(previous);
	}

	public selectAll() {
		this.element?.selectAll();
	}

	public copy() {
		this.element?.copy();
	}

	public paste() {
		this.element?.paste();
	}

	public cut() {
		this.element?.cut();
	}

	public undo() {
		this.element?.undo();
	}

	public redo() {
		this.element?.redo();
	}

	protected on<T = unknown>(channel: WebviewMessageChannels | string, handler: (data: T) => void): IDisposable {
		if (!this.element) {
			return Disposable.None;
		}
		return addDisposableListener(this.element, 'ipc-message', (event) => {
			if (!this.element) {
				return;
			}
			if (event.channel === channel && event.args && event.args.length) {
				handler(event.args[0]);
			}
		});
	}
}
