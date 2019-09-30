/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FindInPageOptions, OnBeforeRequestDetails, OnHeadersReceivedDetails, Response, WebContents, WebviewTag } from 'electron';
import { addClass, addDisposableListener } from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import { once } from 'vs/base/common/functional';
import { Disposable } from 'vs/base/common/lifecycle';
import { isMacintosh } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITunnelService } from 'vs/platform/remote/common/tunnel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ITheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { Webview, WebviewContentOptions, WebviewOptions } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewPortMappingManager } from 'vs/workbench/contrib/webview/common/portMapping';
import { WebviewResourceScheme } from 'vs/workbench/contrib/webview/common/resourceLoader';
import { getWebviewThemeData } from 'vs/workbench/contrib/webview/common/themeing';
import { registerFileProtocol } from 'vs/workbench/contrib/webview/electron-browser/webviewProtocols';
import { areWebviewInputOptionsEqual } from '../browser/webviewEditorService';
import { WebviewFindDelegate, WebviewFindWidget } from '../browser/webviewFindWidget';

interface IKeydownEvent {
	key: string;
	keyCode: number;
	code: string;
	shiftKey: boolean;
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	repeat: boolean;
}

type OnBeforeRequestDelegate = (details: OnBeforeRequestDetails) => Promise<Response | undefined>;
type OnHeadersReceivedDelegate = (details: OnHeadersReceivedDetails) => { cancel: boolean } | undefined;

class WebviewSession extends Disposable {

	private readonly _onBeforeRequestDelegates: Array<OnBeforeRequestDelegate> = [];
	private readonly _onHeadersReceivedDelegates: Array<OnHeadersReceivedDelegate> = [];

	public constructor(
		webview: WebviewTag,
	) {
		super();

		this._register(addDisposableListener(webview, 'did-start-loading', once(() => {
			const contents = webview.getWebContents();
			if (!contents) {
				return;
			}

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
		})));
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
		webview: WebviewTag,
		private readonly _getExtensionLocation: () => URI | undefined,
		private readonly _getLocalResourceRoots: () => ReadonlyArray<URI>,
		private readonly _fileService: IFileService,
	) {
		super();

		this._register(addDisposableListener(webview, 'did-start-loading', once(() => {
			const contents = webview.getWebContents();
			if (contents) {
				this.registerProtocols(contents);
			}
		})));
	}

	private registerProtocols(contents: WebContents) {
		if (contents.isDestroyed()) {
			return;
		}

		registerFileProtocol(contents, WebviewResourceScheme, this._fileService, this._getExtensionLocation(), () =>
			this._getLocalResourceRoots()
		);
	}
}

class WebviewPortMappingProvider extends Disposable {

	private readonly _manager: WebviewPortMappingManager;

	constructor(
		session: WebviewSession,
		getExtensionLocation: () => URI | undefined,
		mappings: () => ReadonlyArray<modes.IWebviewPortMapping>,
		tunnelService: ITunnelService,
	) {
		super();
		this._manager = this._register(new WebviewPortMappingManager(getExtensionLocation, mappings, tunnelService));

		session.onBeforeRequest(async details => {
			const redirect = await this._manager.getRedirect(details.url);
			return redirect ? { redirectURL: redirect } : undefined;
		});
	}
}

class WebviewKeyboardHandler extends Disposable {

	private _ignoreMenuShortcut = false;

	constructor(
		private readonly _webview: WebviewTag
	) {
		super();

		if (this.shouldToggleMenuShortcutsEnablement) {
			this._register(addDisposableListener(this._webview, 'did-start-loading', () => {
				const contents = this.getWebContents();
				if (contents) {
					contents.on('before-input-event', (_event, input) => {
						if (input.type === 'keyDown' && document.activeElement === this._webview) {
							this._ignoreMenuShortcut = input.control || input.meta;
							this.setIgnoreMenuShortcuts(this._ignoreMenuShortcut);
						}
					});
				}
			}));
		}

		this._register(addDisposableListener(this._webview, 'ipc-message', (event) => {
			switch (event.channel) {
				case 'did-keydown':
					// Electron: workaround for https://github.com/electron/electron/issues/14258
					// We have to detect keyboard events in the <webview> and dispatch them to our
					// keybinding service because these events do not bubble to the parent window anymore.
					this.handleKeydown(event.args[0]);
					return;

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
		const contents = this.getWebContents();
		if (contents) {
			contents.setIgnoreMenuShortcuts(value);
		}
	}

	private getWebContents(): WebContents | undefined {
		const contents = this._webview.getWebContents();
		if (contents && !contents.isDestroyed()) {
			return contents;
		}
		return undefined;
	}

	private handleKeydown(event: IKeydownEvent): void {
		// Create a fake KeyboardEvent from the data provided
		const emulatedKeyboardEvent = new KeyboardEvent('keydown', event);
		// Force override the target
		Object.defineProperty(emulatedKeyboardEvent, 'target', {
			get: () => this._webview
		});
		// And re-dispatch
		window.dispatchEvent(emulatedKeyboardEvent);
	}
}

interface WebviewContent {
	readonly html: string;
	readonly options: WebviewContentOptions;
	readonly state: string | undefined;
}

export class ElectronWebviewBasedWebview extends Disposable implements Webview, WebviewFindDelegate {
	private _webview: WebviewTag | undefined;
	private _ready: Promise<void>;

	private _webviewFindWidget: WebviewFindWidget | undefined;
	private _findStarted: boolean = false;
	private content: WebviewContent;

	private _focused = false;

	private readonly _onDidFocus = this._register(new Emitter<void>());
	public readonly onDidFocus: Event<void> = this._onDidFocus.event;

	public extension: {
		readonly location: URI;
		readonly id?: ExtensionIdentifier;
	} | undefined;

	constructor(
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IFileService fileService: IFileService,
		@ITunnelService tunnelService: ITunnelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IEnvironmentService private readonly _environementService: IEnvironmentService,
	) {
		super();
		this.content = {
			html: '',
			options: contentOptions,
			state: undefined
		};

		this._webview = document.createElement('webview');
		this._webview.setAttribute('partition', `webview${Date.now()}`);
		this._webview.setAttribute('webpreferences', 'contextIsolation=yes');
		this._webview.className = `webview ${options.customClasses}`;

		this._webview.style.flex = '0 1';
		this._webview.style.width = '0';
		this._webview.style.height = '0';
		this._webview.style.outline = '0';

		this._webview.preload = require.toUrl('./pre/electron-index.js');
		this._webview.src = 'data:text/html;charset=utf-8,%3C%21DOCTYPE%20html%3E%0D%0A%3Chtml%20lang%3D%22en%22%20style%3D%22width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3Chead%3E%0D%0A%09%3Ctitle%3EVirtual%20Document%3C%2Ftitle%3E%0D%0A%3C%2Fhead%3E%0D%0A%3Cbody%20style%3D%22margin%3A%200%3B%20overflow%3A%20hidden%3B%20width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3C%2Fbody%3E%0D%0A%3C%2Fhtml%3E';

		this._ready = new Promise(resolve => {
			const subscription = this._register(addDisposableListener(this._webview!, 'ipc-message', (event) => {
				if (this._webview && event.channel === 'webview-ready') {
					// console.info('[PID Webview] ' event.args[0]);
					addClass(this._webview, 'ready'); // can be found by debug command

					subscription.dispose();
					resolve();
				}
			}));
		});

		const session = this._register(new WebviewSession(this._webview));

		this._register(new WebviewProtocolProvider(
			this._webview,
			() => this.extension ? this.extension.location : undefined,
			() => (this.content.options.localResourceRoots || []),
			fileService));

		this._register(new WebviewPortMappingProvider(
			session,
			() => this.extension ? this.extension.location : undefined,
			() => (this.content.options.portMapping || []),
			tunnelService,
		));

		this._register(new WebviewKeyboardHandler(this._webview));

		this._register(addDisposableListener(this._webview, 'console-message', function (e: { level: number; message: string; line: number; sourceId: string; }) {
			console.log(`[Embedded Page] ${e.message}`);
		}));
		this._register(addDisposableListener(this._webview, 'dom-ready', () => {
			this.layout();

			// Workaround for https://github.com/electron/electron/issues/14474
			if (this._webview && (this._focused || document.activeElement === this._webview)) {
				this._webview.blur();
				this._webview.focus();
			}
		}));
		this._register(addDisposableListener(this._webview, 'crashed', () => {
			console.error('embedded page crashed');
		}));
		this._register(addDisposableListener(this._webview, 'ipc-message', (event) => {
			if (!this._webview) {
				return;
			}

			switch (event.channel) {
				case 'onmessage':
					if (event.args && event.args.length) {
						this._onMessage.fire(event.args[0]);
					}
					return;

				case 'did-click-link':
					const [uri] = event.args;
					this._onDidClickLink.fire(URI.parse(uri));
					return;

				case 'synthetic-mouse-event':
					{
						const rawEvent = event.args[0];
						const bounds = this._webview.getBoundingClientRect();
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
					}

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
					const state = event.args[0];
					this.state = state;
					this._onDidUpdateState.fire(state);
					return;

				case 'did-focus':
					this.handleFocusChange(true);
					return;

				case 'did-blur':
					this.handleFocusChange(false);
					return;

				case 'no-csp-found':
					this.handleNoCspFound();
					return;
			}
		}));

		this._register(addDisposableListener(this._webview, 'devtools-opened', () => {
			this._send('devtools-opened');
		}));

		if (options.enableFindWidget) {
			this._webviewFindWidget = this._register(instantiationService.createInstance(WebviewFindWidget, this));

			this._register(addDisposableListener(this._webview, 'found-in-page', e => {
				this._hasFindResult.fire(e.result.matches > 0);
			}));
		}

		this.style(themeService.getTheme());
		this._register(themeService.onThemeChange(this.style, this));
	}

	public mountTo(parent: HTMLElement) {
		if (!this._webview) {
			return;
		}

		if (this._webviewFindWidget) {
			parent.appendChild(this._webviewFindWidget.getDomNode()!);
		}
		parent.appendChild(this._webview);
	}

	dispose(): void {
		if (this._webview) {
			if (this._webview.parentElement) {
				this._webview.parentElement.removeChild(this._webview);
			}
			this._webview = undefined;
		}

		if (this._webviewFindWidget) {
			this._webviewFindWidget.dispose();
			this._webviewFindWidget = undefined;
		}
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

	private readonly _onMissingCsp = this._register(new Emitter<ExtensionIdentifier>());
	public readonly onMissingCsp = this._onMissingCsp.event;

	private _send(channel: string, data?: any): void {
		this._ready
			.then(() => {
				if (this._webview) {
					this._webview.send(channel, data);
				}
			})
			.catch(err => console.error(err));
	}

	public set initialScrollProgress(value: number) {
		this._send('initial-scroll-position', value);
	}

	public set state(state: string | undefined) {
		this.content = {
			html: this.content.html,
			options: this.content.options,
			state,
		};
	}

	public set contentOptions(options: WebviewContentOptions) {
		if (areWebviewInputOptionsEqual(options, this.content.options)) {
			return;
		}

		this.content = {
			html: this.content.html,
			options: options,
			state: this.content.state,
		};
		this.doUpdateContent();
	}

	public set html(value: string) {
		this.content = {
			html: value,
			options: this.content.options,
			state: this.content.state,
		};
		this.doUpdateContent();
	}

	public update(html: string, options: WebviewContentOptions, retainContextWhenHidden: boolean) {
		if (retainContextWhenHidden && html === this.content.html && areWebviewInputOptionsEqual(options, this.content.options)) {
			return;
		}
		this.content = {
			html: html,
			options: options,
			state: this.content.state,
		};
		this.doUpdateContent();
	}

	private doUpdateContent() {
		this._send('content', {
			contents: this.content.html,
			options: this.content.options,
			state: this.content.state
		});
	}

	public focus(): void {
		if (!this._webview) {
			return;
		}
		try {
			this._webview.focus();
		} catch {
			// noop
		}
		this._send('focus');

		// Handle focus change programmatically (do not rely on event from <webview>)
		this.handleFocusChange(true);
	}

	private handleFocusChange(isFocused: boolean): void {
		this._focused = isFocused;
		if (isFocused) {
			this._onDidFocus.fire();
		}
	}

	private _hasAlertedAboutMissingCsp = false;

	private handleNoCspFound(): void {
		if (this._hasAlertedAboutMissingCsp) {
			return;
		}
		this._hasAlertedAboutMissingCsp = true;

		if (this.extension && this.extension.id) {
			if (this._environementService.isExtensionDevelopment) {
				this._onMissingCsp.fire(this.extension.id);
			}

			type TelemetryClassification = {
				extension?: { classification: 'SystemMetaData', purpose: 'FeatureInsight' }
			};
			type TelemetryData = {
				extension?: string,
			};

			this._telemetryService.publicLog2<TelemetryData, TelemetryClassification>('webviewMissingCsp', {
				extension: this.extension.id.value
			});
		}
	}

	public sendMessage(data: any): void {
		this._send('message', data);
	}

	private style(theme: ITheme): void {
		const { styles, activeTheme } = getWebviewThemeData(theme, this._configurationService);
		this._send('styles', { styles, activeTheme });

		if (this._webviewFindWidget) {
			this._webviewFindWidget.updateTheme(theme);
		}
	}

	public layout(): void {
		if (!this._webview || this._webview.style.width === '0px') {
			return;
		}
		const contents = this._webview.getWebContents();
		if (!contents || contents.isDestroyed()) {
			return;
		}
		const window = (contents as any).getOwnerBrowserWindow();
		if (!window || !window.webContents || window.webContents.isDestroyed()) {
			return;
		}
		window.webContents.getZoomFactor((factor: number) => {
			if (contents.isDestroyed()) {
				return;
			}

			contents.setZoomFactor(factor);
		});
	}

	private readonly _hasFindResult = this._register(new Emitter<boolean>());
	public readonly hasFindResult: Event<boolean> = this._hasFindResult.event;

	public startFind(value: string, options?: FindInPageOptions) {
		if (!value || !this._webview) {
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
		this._webview.findInPage(value, findOptions);
	}

	/**
	 * Webviews expose a stateful find API.
	 * Successive calls to find will move forward or backward through onFindResults
	 * depending on the supplied options.
	 *
	 * @param value The string to search for. Empty strings are ignored.
	 */
	public find(value: string, previous: boolean): void {
		if (!this._webview) {
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

		this._webview.findInPage(value, options);
	}

	public stopFind(keepSelection?: boolean): void {
		this._hasFindResult.fire(false);
		if (!this._webview) {
			return;
		}
		this._findStarted = false;
		this._webview.stopFindInPage(keepSelection ? 'keepSelection' : 'clearSelection');
	}

	public showFind() {
		if (this._webviewFindWidget) {
			this._webviewFindWidget.reveal();
		}
	}

	public hideFind() {
		if (this._webviewFindWidget) {
			this._webviewFindWidget.hide();
		}
	}

	public runFindAction(previous: boolean) {
		if (this._webviewFindWidget) {
			this._webviewFindWidget.find(previous);
		}
	}

	public reload() {
		this.doUpdateContent();
	}

	public selectAll() {
		if (this._webview) {
			this._webview.selectAll();
		}
	}

	public copy() {
		if (this._webview) {
			this._webview.copy();
		}
	}

	public paste() {
		if (this._webview) {
			this._webview.paste();
		}
	}

	public cut() {
		if (this._webview) {
			this._webview.cut();
		}
	}

	public undo() {
		if (this._webview) {
			this._webview.undo();
		}
	}

	public redo() {
		if (this._webview) {
			this._webview.redo();
		}
	}
}
