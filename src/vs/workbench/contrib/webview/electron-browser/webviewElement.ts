/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FindInPageOptions, WebviewTag } from 'electron';
import { addDisposableListener } from 'vs/base/browser/dom';
import { equals } from 'vs/base/common/arrays';
import { ThrottledDelayer } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { once } from 'vs/base/common/functional';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isMacintosh } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { createChannelSender } from 'vs/base/parts/ipc/common/ipc';
import * as modes from 'vs/editor/common/modes';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';
import { ILogService } from 'vs/platform/log/common/log';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { webviewPartitionId } from 'vs/platform/webview/common/resourceLoader';
import { IWebviewManagerService } from 'vs/platform/webview/common/webviewManagerService';
import { BaseWebview, WebviewMessageChannels } from 'vs/workbench/contrib/webview/browser/baseWebviewElement';
import { WebviewThemeDataProvider } from 'vs/workbench/contrib/webview/browser/themeing';
import { Webview, WebviewContentOptions, WebviewExtensionDescription, WebviewOptions } from 'vs/workbench/contrib/webview/browser/webview';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { WebviewFindDelegate, WebviewFindWidget } from '../browser/webviewFindWidget';

class WebviewResourceRequestManager extends Disposable {

	private readonly _webviewManagerService: IWebviewManagerService;

	private _localResourceRoots: ReadonlyArray<URI>;
	private _portMappings: ReadonlyArray<modes.IWebviewPortMapping>;

	private _ready?: Promise<void>;

	constructor(
		private readonly id: string,
		private readonly extension: WebviewExtensionDescription | undefined,
		webview: WebviewTag,
		initialContentOptions: WebviewContentOptions,
		@ILogService private readonly _logService: ILogService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IMainProcessService mainProcessService: IMainProcessService,
	) {
		super();

		this._logService.debug(`WebviewResourceRequestManager(${this.id}): init`);

		this._webviewManagerService = createChannelSender<IWebviewManagerService>(mainProcessService.getChannel('webview'));

		this._localResourceRoots = initialContentOptions.localResourceRoots || [];
		this._portMappings = initialContentOptions.portMapping || [];

		const remoteAuthority = environmentService.configuration.remoteAuthority;
		const remoteConnectionData = remoteAuthority ? remoteAuthorityResolverService.getConnectionData(remoteAuthority) : null;

		this._ready = new Promise(resolve => {
			this._register(addDisposableListener(webview!, 'did-start-loading', once(() => {
				this._logService.debug(`WebviewResourceRequestManager(${this.id}): did-start-loading`);

				const webContentsId = webview.getWebContentsId();

				this._webviewManagerService.registerWebview(this.id, webContentsId, {
					extensionLocation: this.extension?.location.toJSON(),
					localResourceRoots: this._localResourceRoots.map(x => x.toJSON()),
					remoteConnectionData: remoteConnectionData,
					portMappings: this._portMappings,
				}).then(() => {
					this._logService.debug(`WebviewResourceRequestManager(${this.id}): did register`);
				}).finally(() => resolve());
			})));
		});

		if (remoteAuthority) {
			this._register(remoteAuthorityResolverService.onDidChangeConnectionData(() => {
				const update = this._webviewManagerService.updateWebviewMetadata(this.id, {
					remoteConnectionData: remoteAuthority ? remoteAuthorityResolverService.getConnectionData(remoteAuthority) : null,
				});
				this._ready = this._ready?.then(() => update);
			}));
		}

		this._register(toDisposable(() => this._webviewManagerService.unregisterWebview(this.id)));
	}

	public update(options: WebviewContentOptions) {
		const localResourceRoots = options.localResourceRoots || [];
		const portMappings = options.portMapping || [];

		if (
			equals(this._localResourceRoots, localResourceRoots, (a, b) => a.toString() === b.toString())
			&& equals(this._portMappings, portMappings, (a, b) => a.extensionHostPort === b.extensionHostPort && a.webviewPort === b.webviewPort)
		) {
			return;
		}

		this._localResourceRoots = localResourceRoots;
		this._portMappings = portMappings;

		this._logService.debug(`WebviewResourceRequestManager(${this.id}): will update`);

		const update = this._webviewManagerService.updateWebviewMetadata(this.id, {
			localResourceRoots: localResourceRoots.map(x => x.toJSON()),
			portMappings: portMappings,
		}).then(() => {
			this._logService.debug(`WebviewResourceRequestManager(${this.id}): did update`);
		});

		this._ready = this._ready?.then(() => update);
	}

	async synchronize(): Promise<void> {
		return this._ready;
	}
}

class WebviewKeyboardHandler {

	private readonly _webviews = new Set<WebviewTag>();
	private readonly _isUsingNativeTitleBars: boolean;

	private readonly webviewMainService: IWebviewManagerService;

	constructor(
		configurationService: IConfigurationService,
		mainProcessService: IMainProcessService,
	) {
		this._isUsingNativeTitleBars = configurationService.getValue<string>('window.titleBarStyle') === 'native';

		this.webviewMainService = createChannelSender<IWebviewManagerService>(mainProcessService.getChannel('webview'));
	}

	public add(webview: WebviewTag): IDisposable {
		this._webviews.add(webview);

		const disposables = new DisposableStore();

		if (this.shouldToggleMenuShortcutsEnablement) {
			this.setIgnoreMenuShortcutsForWebview(webview, true);
		}

		disposables.add(addDisposableListener(webview, 'ipc-message', (event) => {
			switch (event.channel) {
				case 'did-focus':
					this.setIgnoreMenuShortcuts(true);
					break;

				case 'did-blur':
					this.setIgnoreMenuShortcuts(false);
					return;
			}
		}));

		return toDisposable(() => {
			disposables.dispose();
			this._webviews.delete(webview);
		});
	}

	private get shouldToggleMenuShortcutsEnablement() {
		return isMacintosh || this._isUsingNativeTitleBars;
	}

	private setIgnoreMenuShortcuts(value: boolean) {
		for (const webview of this._webviews) {
			this.setIgnoreMenuShortcutsForWebview(webview, value);
		}
	}

	private setIgnoreMenuShortcutsForWebview(webview: WebviewTag, value: boolean) {
		if (this.shouldToggleMenuShortcutsEnablement) {
			this.webviewMainService.setIgnoreMenuShortcuts(webview.getWebContentsId(), value);
		}
	}
}

export class ElectronWebviewBasedWebview extends BaseWebview<WebviewTag> implements Webview, WebviewFindDelegate {

	private static _webviewKeyboardHandler: WebviewKeyboardHandler | undefined;

	private static getWebviewKeyboardHandler(
		configService: IConfigurationService,
		mainProcessService: IMainProcessService,
	) {
		if (!this._webviewKeyboardHandler) {
			this._webviewKeyboardHandler = new WebviewKeyboardHandler(configService, mainProcessService);
		}
		return this._webviewKeyboardHandler;
	}

	private _webviewFindWidget: WebviewFindWidget | undefined;
	private _findStarted: boolean = false;

	private readonly _resourceRequestManager: WebviewResourceRequestManager;
	private _messagePromise = Promise.resolve();

	private readonly _focusDelayer = this._register(new ThrottledDelayer(10));
	private _elementFocusImpl!: (options?: FocusOptions | undefined) => void;

	constructor(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescription | undefined,
		private readonly _webviewThemeDataProvider: WebviewThemeDataProvider,
		@ILogService private readonly _myLogService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWorkbenchEnvironmentService workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService,
		@IMainProcessService mainProcessService: IMainProcessService,
	) {
		super(id, options, contentOptions, extension, _webviewThemeDataProvider, _myLogService, telemetryService, environmentService, workbenchEnvironmentService);

		this._myLogService.debug(`Webview(${this.id}): init`);

		this._resourceRequestManager = this._register(instantiationService.createInstance(WebviewResourceRequestManager, id, extension, this.element!, this.content.options));

		this._register(addDisposableListener(this.element!, 'did-start-loading', once(() => {
			this._register(ElectronWebviewBasedWebview.getWebviewKeyboardHandler(configurationService, mainProcessService).add(this.element!));
		})));

		this._register(addDisposableListener(this.element!, 'console-message', function (e: { level: number; message: string; line: number; sourceId: string; }) {
			console.log(`[Embedded Page] ${e.message}`);
		}));

		this._register(addDisposableListener(this.element!, 'dom-ready', () => {
			this._myLogService.debug(`Webview(${this.id}): dom-ready`);

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
			this._myLogService.debug(`Webview(${this.id}): did-set-content`);

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

		this.element!.preload = require.toUrl('./pre/electron-index.js');
		this.element!.src = 'data:text/html;charset=utf-8,%3C%21DOCTYPE%20html%3E%0D%0A%3Chtml%20lang%3D%22en%22%20style%3D%22width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3Chead%3E%0D%0A%3Ctitle%3EVirtual%20Document%3C%2Ftitle%3E%0D%0A%3C%2Fhead%3E%0D%0A%3Cbody%20style%3D%22margin%3A%200%3B%20overflow%3A%20hidden%3B%20width%3A%20100%25%3B%20height%3A%20100%25%22%20role%3D%22document%22%3E%0D%0A%3C%2Fbody%3E%0D%0A%3C%2Fhtml%3E';
	}

	protected createElement(options: WebviewOptions) {
		// Do not start loading the webview yet.
		// Wait the end of the ctor when all listeners have been hooked up.
		const element = document.createElement('webview');

		this._elementFocusImpl = element.focus.bind(element);
		element.focus = () => {
			this.doFocus();
		};
		element.setAttribute('partition', webviewPartitionId);
		element.setAttribute('webpreferences', 'contextIsolation=yes');
		element.className = `webview ${options.customClasses || ''}`;

		element.style.flex = '0 1';
		element.style.width = '0';
		element.style.height = '0';
		element.style.outline = '0';

		return element;
	}

	public set contentOptions(options: WebviewContentOptions) {
		this._myLogService.debug(`Webview(${this.id}): will set content options`);
		this._resourceRequestManager.update(options);
		super.contentOptions = options;
	}

	public set localResourcesRoot(resources: URI[]) {
		this._resourceRequestManager.update({
			...this.contentOptions,
			localResourceRoots: resources,
		});
		super.localResourcesRoot = resources;
	}

	protected readonly extraContentOptions = {};

	public set html(value: string) {
		this._myLogService.debug(`Webview(${this.id}): will set html`);

		super.html = this.preprocessHtml(value);
	}

	private preprocessHtml(value: string): string {
		return value
			.replace(/(["'])vscode-resource:(\/\/([^\s\/'"]+?)(?=\/))?([^\s'"]+?)(["'])/gi, (match, startQuote, _1, scheme, path, endQuote) => {
				if (scheme) {
					return `${startQuote}${Schemas.vscodeWebviewResource}://${this.id}/${scheme}${path}${endQuote}`;
				}
				if (!path.startsWith('//')) {
					// Add an empty authority if we don't already have one
					path = '//' + path;
				}
				return `${startQuote}${Schemas.vscodeWebviewResource}://${this.id}/file${path}${endQuote}`;
			});
	}


	public mountTo(parent: HTMLElement) {
		if (!this.element) {
			return;
		}

		if (this._webviewFindWidget) {
			parent.appendChild(this._webviewFindWidget.getDomNode()!);
		}
		parent.appendChild(this.element);
	}

	protected async doPostMessage(channel: string, data?: any): Promise<void> {
		this._myLogService.debug(`Webview(${this.id}): will post message on '${channel}'`);

		this._messagePromise = this._messagePromise
			.then(() => this._resourceRequestManager.synchronize())
			.then(() => {
				this._myLogService.debug(`Webview(${this.id}): did post message on '${channel}'`);
				return this.element?.send(channel, data);
			});
	}

	public focus(): void {
		this.doFocus();

		// Handle focus change programmatically (do not rely on event from <webview>)
		this.handleFocusChange(true);
	}

	private doFocus() {
		if (!this.element) {
			return;
		}

		// Workaround for https://github.com/microsoft/vscode/issues/75209
		// Electron's webview.focus is async so for a sequence of actions such as:
		//
		// 1. Open webview
		// 1. Show quick pick from command palette
		//
		// We end up focusing the webview after showing the quick pick, which causes
		// the quick pick to instantly dismiss.
		//
		// Workaround this by debouncing the focus and making sure we are not focused on an input
		// when we try to re-focus.
		this._focusDelayer.trigger(async () => {
			if (!this.focused || !this.element) {
				return;
			}

			if (document.activeElement?.tagName === 'INPUT') {
				return;
			}
			try {
				this._elementFocusImpl();
			} catch {
				// noop
			}
			this._send('focus');
		});
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
			throw new Error('Cannot add event listener. No webview element found.');
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
