/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isFirefox } from '../../../../base/browser/browser.js';
import { addDisposableListener, EventType, getWindow, getWindowById } from '../../../../base/browser/dom.js';
import { parentOriginHash } from '../../../../base/browser/iframe.js';
import { IMouseWheelEvent } from '../../../../base/browser/mouseEvent.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { promiseWithResolvers, ThrottledDelayer } from '../../../../base/common/async.js';
import { streamToBuffer, VSBufferReadableStream } from '../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { COI } from '../../../../base/common/network.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { ITunnelService } from '../../../../platform/tunnel/common/tunnel.js';
import { WebviewPortMappingManager } from '../../../../platform/webview/common/webviewPortMapping.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { decodeAuthority, webviewGenericCspSource, webviewRootResourceAuthority } from '../common/webview.js';
import { loadLocalResource, WebviewResourceResponse } from './resourceLoading.js';
import { WebviewThemeDataProvider } from './themeing.js';
import { areWebviewContentOptionsEqual, IWebviewElement, WebviewContentOptions, WebviewExtensionDescription, WebviewInitInfo, WebviewMessageReceivedEvent, WebviewOptions } from './webview.js';
import { WebviewFindDelegate, WebviewFindWidget } from './webviewFindWidget.js';
import { FromWebviewMessage, KeyEvent, ToWebviewMessage, WebViewDragEvent } from './webviewMessages.js';

interface WebviewContent {
	readonly html: string;
	readonly title: string | undefined;
	readonly options: WebviewContentOptions;
	readonly state: string | undefined;
}

namespace WebviewState {
	export const enum Type { Initializing, Ready }

	export class Initializing {
		readonly type = Type.Initializing;

		constructor(
			public pendingMessages: Array<{
				readonly channel: string;
				readonly data?: any;
				readonly transferable: Transferable[];
				readonly resolve: (posted: boolean) => void;
			}>
		) { }
	}

	export const Ready = { type: Type.Ready } as const;

	export type State = typeof Ready | Initializing;
}

interface WebviewActionContext {
	readonly webview?: string;
	readonly [key: string]: unknown;
}

const webviewIdContext = 'webviewId';

export class WebviewElement extends Disposable implements IWebviewElement, WebviewFindDelegate {

	protected readonly id = generateUuid();

	/**
	 * The provided identifier of this webview.
	 */
	public readonly providedViewType?: string;

	/**
	 * The origin this webview itself is loaded from. May not be unique
	 */
	public readonly origin: string;

	private _windowId: number | undefined = undefined;
	private get window() { return typeof this._windowId === 'number' ? getWindowById(this._windowId)?.window : undefined; }

	private _encodedWebviewOriginPromise?: Promise<string>;
	private _encodedWebviewOrigin: string | undefined;

	protected get platform(): string { return 'browser'; }

	private readonly _expectedServiceWorkerVersion = 4; // Keep this in sync with the version in service-worker.js

	private _element: HTMLIFrameElement | undefined;
	protected get element(): HTMLIFrameElement | undefined { return this._element; }

	private _focused: boolean | undefined;
	public get isFocused(): boolean {
		if (!this._focused) {
			return false;
		}
		// code window is only available after the webview is mounted.
		if (!this.window) {
			return false;
		}

		if (this.window.document.activeElement && this.window.document.activeElement !== this.element) {
			// looks like https://github.com/microsoft/vscode/issues/132641
			// where the focus is actually not in the `<iframe>`
			return false;
		}
		return true;
	}

	private _state: WebviewState.State = new WebviewState.Initializing([]);

	private _content: WebviewContent;

	private readonly _portMappingManager: WebviewPortMappingManager;

	private readonly _resourceLoadingCts = this._register(new CancellationTokenSource());

	private _contextKeyService: IContextKeyService | undefined;

	private _confirmBeforeClose: string;

	private readonly _focusDelayer = this._register(new ThrottledDelayer(50));

	private readonly _onDidHtmlChange: Emitter<string> = this._register(new Emitter<string>());
	protected readonly onDidHtmlChange = this._onDidHtmlChange.event;

	private _messagePort?: MessagePort;
	private readonly _messageHandlers = new Map<string, Set<(data: any, e: MessageEvent) => void>>();

	protected readonly _webviewFindWidget: WebviewFindWidget | undefined;
	public readonly checkImeCompletionState = true;

	public readonly intrinsicContentSize = observableValue<{ readonly width: number; readonly height: number } | undefined>('WebviewIntrinsicContentSize', undefined);

	private _disposed = false;


	public extension: WebviewExtensionDescription | undefined;
	private readonly _options: WebviewOptions;

	constructor(
		initInfo: WebviewInitInfo,
		protected readonly webviewThemeDataProvider: WebviewThemeDataProvider,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@INotificationService notificationService: INotificationService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IRemoteAuthorityResolverService private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ITunnelService private readonly _tunnelService: ITunnelService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		super();

		this.providedViewType = initInfo.providedViewType;
		this.origin = initInfo.origin ?? this.id;

		this._options = initInfo.options;
		this.extension = initInfo.extension;

		this._content = {
			html: '',
			title: initInfo.title,
			options: initInfo.contentOptions,
			state: undefined
		};

		this._portMappingManager = this._register(new WebviewPortMappingManager(
			() => this.extension?.location,
			() => this._content.options.portMapping || [],
			this._tunnelService
		));

		this._element = this._createElement(initInfo.options, initInfo.contentOptions);

		this._register(this.on('no-csp-found', () => {
			this.handleNoCspFound();
		}));

		this._register(this.on('did-click-link', ({ uri }) => {
			this._onDidClickLink.fire(uri);
		}));

		this._register(this.on('onmessage', ({ message, transfer }) => {
			this._onMessage.fire({ message, transfer });
		}));

		this._register(this.on('did-scroll', ({ scrollYPercentage }) => {
			this._onDidScroll.fire({ scrollYPercentage });
		}));

		this._register(this.on('do-reload', () => {
			this.reload();
		}));

		this._register(this.on('do-update-state', (state) => {
			this.state = state;
			this._onDidUpdateState.fire(state);
		}));

		this._register(this.on('did-focus', () => {
			this.handleFocusChange(true);
		}));

		this._register(this.on('did-blur', () => {
			this.handleFocusChange(false);
		}));

		this._register(this.on('did-scroll-wheel', (event) => {
			this._onDidWheel.fire(event);
		}));

		this._register(this.on('did-find', ({ didFind }) => {
			this._hasFindResult.fire(didFind);
		}));

		this._register(this.on('fatal-error', (e) => {
			notificationService.error(localize('fatalErrorMessage', "Error loading webview: {0}", e.message));
			this._onFatalError.fire({ message: e.message });
		}));

		this._register(this.on('did-keydown', (data) => {
			// Electron: workaround for https://github.com/electron/electron/issues/14258
			// We have to detect keyboard events in the <webview> and dispatch them to our
			// keybinding service because these events do not bubble to the parent window anymore.
			this.handleKeyEvent('keydown', data);
		}));

		this._register(this.on('did-keyup', (data) => {
			this.handleKeyEvent('keyup', data);
		}));

		this._register(this.on('did-context-menu', (data) => {
			if (!this.element) {
				return;
			}
			if (!this._contextKeyService) {
				return;
			}
			const elementBox = this.element.getBoundingClientRect();
			const contextKeyService = this._contextKeyService.createOverlay([
				...Object.entries(data.context),
				[webviewIdContext, this.providedViewType],
			]);
			contextMenuService.showContextMenu({
				menuId: MenuId.WebviewContext,
				menuActionOptions: { shouldForwardArgs: true },
				contextKeyService,
				getActionsContext: (): WebviewActionContext => ({ ...data.context, webview: this.providedViewType }),
				getAnchor: () => ({
					x: elementBox.x + data.clientX,
					y: elementBox.y + data.clientY
				})
			});
			this._send('set-context-menu-visible', { visible: true });
		}));

		this._register(this.on('load-resource', async (entry) => {
			try {
				// Restore the authority we previously encoded
				const authority = decodeAuthority(entry.authority);
				const uri = URI.from({
					scheme: entry.scheme,
					authority: authority,
					path: decodeURIComponent(entry.path), // This gets re-encoded
					query: entry.query ? decodeURIComponent(entry.query) : entry.query,
				});
				this.loadResource(entry.id, uri, entry.ifNoneMatch);
			} catch (e) {
				this._send('did-load-resource', {
					id: entry.id,
					status: 404,
					path: entry.path,
				});
			}
		}));

		this._register(this.on('load-localhost', (entry) => {
			this.localLocalhost(entry.id, entry.origin);
		}));

		this._register(Event.runAndSubscribe(webviewThemeDataProvider.onThemeDataChanged, () => this.style()));
		this._register(_accessibilityService.onDidChangeReducedMotion(() => this.style()));
		this._register(_accessibilityService.onDidChangeScreenReaderOptimized(() => this.style()));
		this._register(contextMenuService.onDidHideContextMenu(() => this._send('set-context-menu-visible', { visible: false })));

		this._confirmBeforeClose = configurationService.getValue<string>('window.confirmBeforeClose');

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('window.confirmBeforeClose')) {
				this._confirmBeforeClose = configurationService.getValue('window.confirmBeforeClose');
				this._send('set-confirm-before-close', this._confirmBeforeClose);
			}
		}));

		this._register(this.on('drag-start', () => {
			this._startBlockingIframeDragEvents();
		}));

		this._register(this.on('drag', (event) => {
			this.handleDragEvent('drag', event);
		}));

		this._register(this.on('updated-intrinsic-content-size', (event) => {
			this.intrinsicContentSize.set({ width: event.width, height: event.height }, undefined, undefined);
		}));

		if (initInfo.options.enableFindWidget) {
			this._webviewFindWidget = this._register(instantiationService.createInstance(WebviewFindWidget, this));
		}
	}

	override dispose(): void {
		this._disposed = true;

		this.element?.remove();
		this._element = undefined;

		this._messagePort = undefined;

		if (this._state.type === WebviewState.Type.Initializing) {
			for (const message of this._state.pendingMessages) {
				message.resolve(false);
			}
			this._state.pendingMessages = [];
		}

		this._onDidDispose.fire();

		this._resourceLoadingCts.dispose(true);

		super.dispose();
	}

	setContextKeyService(contextKeyService: IContextKeyService) {
		this._contextKeyService = contextKeyService;
	}

	private readonly _onMissingCsp = this._register(new Emitter<ExtensionIdentifier>());
	public readonly onMissingCsp = this._onMissingCsp.event;

	private readonly _onDidClickLink = this._register(new Emitter<string>());
	public readonly onDidClickLink = this._onDidClickLink.event;

	private readonly _onMessage = this._register(new Emitter<WebviewMessageReceivedEvent>());
	public readonly onMessage = this._onMessage.event;

	private readonly _onDidScroll = this._register(new Emitter<{ readonly scrollYPercentage: number }>());
	public readonly onDidScroll = this._onDidScroll.event;

	private readonly _onDidWheel = this._register(new Emitter<IMouseWheelEvent>());
	public readonly onDidWheel = this._onDidWheel.event;

	private readonly _onDidUpdateState = this._register(new Emitter<string | undefined>());
	public readonly onDidUpdateState = this._onDidUpdateState.event;

	private readonly _onDidFocus = this._register(new Emitter<void>());
	public readonly onDidFocus = this._onDidFocus.event;

	private readonly _onDidBlur = this._register(new Emitter<void>());
	public readonly onDidBlur = this._onDidBlur.event;

	private readonly _onFatalError = this._register(new Emitter<{ readonly message: string }>());
	public readonly onFatalError = this._onFatalError.event;

	private readonly _onDidDispose = this._register(new Emitter<void>());
	public readonly onDidDispose = this._onDidDispose.event;

	public postMessage(message: any, transfer?: ArrayBuffer[]): Promise<boolean> {
		return this._send('message', { message, transfer });
	}

	private async _send<K extends keyof ToWebviewMessage>(channel: K, data: ToWebviewMessage[K], _createElement: Transferable[] = []): Promise<boolean> {
		if (this._state.type === WebviewState.Type.Initializing) {
			const { promise, resolve } = promiseWithResolvers<boolean>();
			this._state.pendingMessages.push({ channel, data, transferable: _createElement, resolve });
			return promise;
		} else {
			return this.doPostMessage(channel, data, _createElement);
		}
	}

	private _createElement(options: WebviewOptions, _contentOptions: WebviewContentOptions) {
		// Do not start loading the webview yet.
		// Wait the end of the ctor when all listeners have been hooked up.
		const element = document.createElement('iframe');
		element.name = this.id;
		element.className = `webview ${options.customClasses || ''}`;
		element.sandbox.add('allow-scripts', 'allow-same-origin', 'allow-forms', 'allow-pointer-lock', 'allow-downloads');

		const allowRules = ['cross-origin-isolated', 'autoplay'];
		if (!isFirefox) {
			allowRules.push('clipboard-read', 'clipboard-write');
		}
		element.setAttribute('allow', allowRules.join('; '));

		element.style.border = 'none';
		element.style.width = '100%';
		element.style.height = '100%';

		element.focus = () => {
			this._doFocus();
		};

		return element;
	}

	private _initElement(encodedWebviewOrigin: string, extension: WebviewExtensionDescription | undefined, options: WebviewOptions, targetWindow: CodeWindow) {
		// The extensionId and purpose in the URL are used for filtering in js-debug:
		const params: { [key: string]: string } = {
			id: this.id,
			parentId: targetWindow.vscodeWindowId.toString(),
			origin: this.origin,
			swVersion: String(this._expectedServiceWorkerVersion),
			extensionId: extension?.id.value ?? '',
			platform: this.platform,
			'vscode-resource-base-authority': webviewRootResourceAuthority,
			parentOrigin: targetWindow.origin,
		};

		if (this._options.disableServiceWorker) {
			params.disableServiceWorker = 'true';
		}

		if (this._environmentService.remoteAuthority) {
			params.remoteAuthority = this._environmentService.remoteAuthority;
		}

		if (options.purpose) {
			params.purpose = options.purpose;
		}

		COI.addSearchParam(params, true, true);

		const queryString = new URLSearchParams(params).toString();

		this.perfMark('init/set-src');
		const fileName = 'index.html';
		this.element!.setAttribute('src', `${this.webviewContentEndpoint(encodedWebviewOrigin)}/${fileName}?${queryString}`);
	}

	public mountTo(element: HTMLElement, targetWindow: CodeWindow) {
		if (!this.element) {
			return;
		}

		this._windowId = targetWindow.vscodeWindowId;
		this._encodedWebviewOriginPromise = parentOriginHash(targetWindow.origin, this.origin).then(id => this._encodedWebviewOrigin = id);
		this._encodedWebviewOriginPromise.then(encodedWebviewOrigin => {
			if (!this._disposed) {
				this._initElement(encodedWebviewOrigin, this.extension, this._options, targetWindow);
			}
		});
		this._registerMessageHandler(targetWindow);

		if (this._webviewFindWidget) {
			element.appendChild(this._webviewFindWidget.getDomNode());
		}

		for (const eventName of [EventType.MOUSE_DOWN, EventType.MOUSE_MOVE, EventType.DROP]) {
			this._register(addDisposableListener(element, eventName, () => {
				this._stopBlockingIframeDragEvents();
			}));
		}

		for (const node of [element, targetWindow]) {
			this._register(addDisposableListener(node, EventType.DRAG_END, () => {
				this._stopBlockingIframeDragEvents();
			}));
		}

		element.id = this.id; // This is used by aria-flow for accessibility order

		this.perfMark('mounted');
		element.appendChild(this.element);
	}

	private _registerMessageHandler(targetWindow: CodeWindow) {
		const subscription = this._register(addDisposableListener(targetWindow, 'message', (e: MessageEvent) => {
			if (!this._encodedWebviewOrigin || e?.data?.target !== this.id) {
				return;
			}

			if (e.origin !== this._webviewContentOrigin(this._encodedWebviewOrigin)) {
				console.log(`Skipped renderer receiving message due to mismatched origins: ${e.origin} ${this._webviewContentOrigin}`);
				return;
			}

			if (e.data.channel === 'webview-ready') {
				if (this._messagePort) {
					return;
				}

				this.perfMark('webview-ready');
				this._logService.trace(`Webview(${this.id}): webview ready`);

				this._messagePort = e.ports[0];
				this._messagePort.onmessage = (e) => {
					const handlers = this._messageHandlers.get(e.data.channel);
					if (!handlers) {
						console.log(`No handlers found for '${e.data.channel}'`);
						return;
					}
					handlers?.forEach(handler => handler(e.data.data, e));
				};

				this.element?.classList.add('ready');

				if (this._state.type === WebviewState.Type.Initializing) {
					this._state.pendingMessages.forEach(({ channel, data, resolve }) => resolve(this.doPostMessage(channel, data)));
				}
				this._state = WebviewState.Ready;

				subscription.dispose();
			}
		}));
	}

	private perfMark(name: string) {
		performance.mark(`webview/webviewElement/${name}`, {
			detail: {
				id: this.id
			}
		});
	}

	private _startBlockingIframeDragEvents() {
		if (this.element) {
			this.element.style.pointerEvents = 'none';
		}
	}

	private _stopBlockingIframeDragEvents() {
		if (this.element) {
			this.element.style.pointerEvents = 'auto';
		}
	}

	protected webviewContentEndpoint(encodedWebviewOrigin: string): string {
		const webviewExternalEndpoint = this._environmentService.webviewExternalEndpoint;
		if (!webviewExternalEndpoint) {
			throw new Error(`'webviewExternalEndpoint' has not been configured. Webviews will not work!`);
		}

		const endpoint = webviewExternalEndpoint.replace('{{uuid}}', encodedWebviewOrigin);
		if (endpoint[endpoint.length - 1] === '/') {
			return endpoint.slice(0, endpoint.length - 1);
		}
		return endpoint;
	}

	private _webviewContentOrigin(encodedWebviewOrigin: string): string {
		const uri = URI.parse(this.webviewContentEndpoint(encodedWebviewOrigin));
		return uri.scheme + '://' + uri.authority.toLowerCase();
	}

	private doPostMessage(channel: string, data?: any, transferable: Transferable[] = []): boolean {
		if (this.element && this._messagePort) {
			this._messagePort.postMessage({ channel, args: data }, transferable);
			return true;
		}
		return false;
	}

	private on<K extends keyof FromWebviewMessage>(channel: K, handler: (data: FromWebviewMessage[K], e: MessageEvent) => void): IDisposable {
		let handlers = this._messageHandlers.get(channel);
		if (!handlers) {
			handlers = new Set();
			this._messageHandlers.set(channel, handlers);
		}

		handlers.add(handler);
		return toDisposable(() => {
			this._messageHandlers.get(channel)?.delete(handler);
		});
	}

	private _hasAlertedAboutMissingCsp = false;
	private handleNoCspFound(): void {
		if (this._hasAlertedAboutMissingCsp) {
			return;
		}
		this._hasAlertedAboutMissingCsp = true;

		if (this.extension?.id) {
			if (this._environmentService.isExtensionDevelopment) {
				this._onMissingCsp.fire(this.extension.id);
			}
		}
	}

	public reload(): void {
		this.doUpdateContent(this._content);
	}

	public reinitializeAfterDismount(): void {
		this._state = new WebviewState.Initializing([]);
		this._messagePort = undefined;

		this.mountTo(this.element!.parentElement!, getWindow(this.element));
		this.reload();
	}

	public setHtml(html: string) {
		this.doUpdateContent({ ...this._content, html });
		this._onDidHtmlChange.fire(html);
	}

	public setTitle(title: string) {
		this._content = { ...this._content, title };
		this._send('set-title', title);
	}

	public set contentOptions(options: WebviewContentOptions) {
		this._logService.debug(`Webview(${this.id}): will update content options`);

		if (areWebviewContentOptionsEqual(options, this._content.options)) {
			this._logService.debug(`Webview(${this.id}): skipping content options update`);
			return;
		}

		this.doUpdateContent({ ...this._content, options });
	}

	public set localResourcesRoot(resources: readonly URI[]) {
		this._content = {
			...this._content,
			options: { ...this._content.options, localResourceRoots: resources }
		};
	}

	public set state(state: string | undefined) {
		this._content = { ...this._content, state };
	}

	public set initialScrollProgress(value: number) {
		this._send('initial-scroll-position', value);
	}

	private doUpdateContent(newContent: WebviewContent) {
		this._logService.debug(`Webview(${this.id}): will update content`);

		this._content = newContent;

		const allowScripts = !!this._content.options.allowScripts;
		this.perfMark('set-content');
		this._send('content', {
			contents: this._content.html,
			title: this._content.title,
			options: {
				allowMultipleAPIAcquire: !!this._content.options.allowMultipleAPIAcquire,
				allowScripts: allowScripts,
				allowForms: this._content.options.allowForms ?? allowScripts, // For back compat, we allow forms by default when scripts are enabled
			},
			state: this._content.state,
			cspSource: webviewGenericCspSource,
			confirmBeforeClose: this._confirmBeforeClose,
		});
	}

	protected style(): void {
		let { styles, activeTheme, themeLabel, themeId } = this.webviewThemeDataProvider.getWebviewThemeData();
		if (this._options.transformCssVariables) {
			styles = this._options.transformCssVariables(styles);
		}

		const reduceMotion = this._accessibilityService.isMotionReduced();
		const screenReader = this._accessibilityService.isScreenReaderOptimized();

		this._send('styles', { styles, activeTheme, themeId, themeLabel, reduceMotion, screenReader });
	}


	protected handleFocusChange(isFocused: boolean): void {
		this._focused = isFocused;
		if (isFocused) {
			this._onDidFocus.fire();
		} else {
			this._onDidBlur.fire();
		}
	}

	private handleKeyEvent(type: 'keydown' | 'keyup', event: KeyEvent) {
		// Create a fake KeyboardEvent from the data provided
		const emulatedKeyboardEvent = new KeyboardEvent(type, event);
		// Force override the target
		Object.defineProperty(emulatedKeyboardEvent, 'target', {
			get: () => this.element,
		});
		// And re-dispatch
		this.window?.dispatchEvent(emulatedKeyboardEvent);
	}

	private handleDragEvent(type: 'drag', event: WebViewDragEvent) {
		// Create a fake DragEvent from the data provided
		const emulatedDragEvent = new DragEvent(type, event);
		// Force override the target
		Object.defineProperty(emulatedDragEvent, 'target', {
			get: () => this.element,
		});
		// And re-dispatch
		this.window?.dispatchEvent(emulatedDragEvent);
	}

	windowDidDragStart(): void {
		// Webview break drag and dropping around the main window (no events are generated when you are over them)
		// Work around this by disabling pointer events during the drag.
		// https://github.com/electron/electron/issues/18226
		this._startBlockingIframeDragEvents();
	}

	windowDidDragEnd(): void {
		this._stopBlockingIframeDragEvents();
	}

	public selectAll() {
		this.execCommand('selectAll');
	}

	public copy() {
		this.execCommand('copy');
	}

	public paste() {
		this.execCommand('paste');
	}

	public cut() {
		this.execCommand('cut');
	}

	public undo() {
		this.execCommand('undo');
	}

	public redo() {
		this.execCommand('redo');
	}

	private execCommand(command: string) {
		if (this.element) {
			this._send('execCommand', command);
		}
	}

	private async loadResource(id: number, uri: URI, ifNoneMatch: string | undefined) {
		try {
			const result = await loadLocalResource(uri, {
				ifNoneMatch,
				roots: this._content.options.localResourceRoots || [],
			}, this._fileService, this._logService, this._resourceLoadingCts.token);

			switch (result.type) {
				case WebviewResourceResponse.Type.Success: {
					const buffer = await this.streamToBuffer(result.stream);
					return this._send('did-load-resource', {
						id,
						status: 200,
						path: uri.path,
						mime: result.mimeType,
						data: buffer,
						etag: result.etag,
						mtime: result.mtime
					}, [buffer]);
				}
				case WebviewResourceResponse.Type.NotModified: {
					return this._send('did-load-resource', {
						id,
						status: 304, // not modified
						path: uri.path,
						mime: result.mimeType,
						mtime: result.mtime
					});
				}
				case WebviewResourceResponse.Type.AccessDenied: {
					return this._send('did-load-resource', {
						id,
						status: 401, // unauthorized
						path: uri.path,
					});
				}
			}
		} catch {
			// noop
		}

		return this._send('did-load-resource', {
			id,
			status: 404,
			path: uri.path,
		});
	}

	protected async streamToBuffer(stream: VSBufferReadableStream): Promise<ArrayBufferLike> {
		const vsBuffer = await streamToBuffer(stream);
		return vsBuffer.buffer.buffer;
	}

	private async localLocalhost(id: string, origin: string) {
		const authority = this._environmentService.remoteAuthority;
		const resolveAuthority = authority ? await this._remoteAuthorityResolverService.resolveAuthority(authority) : undefined;
		const redirect = resolveAuthority ? await this._portMappingManager.getRedirect(resolveAuthority.authority, origin) : undefined;
		return this._send('did-load-localhost', {
			id,
			origin,
			location: redirect
		});
	}

	public focus(): void {
		this._doFocus();

		// Handle focus change programmatically (do not rely on event from <webview>)
		this.handleFocusChange(true);
	}

	private _doFocus() {
		if (!this.element) {
			return;
		}

		try {
			this.element.contentWindow?.focus();
		} catch {
			// noop
		}

		// Workaround for https://github.com/microsoft/vscode/issues/75209
		// Focusing the inner webview is async so for a sequence of actions such as:
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
			if (!this.isFocused || !this.element) {
				return;
			}

			if (this.window?.document.activeElement && this.window.document.activeElement !== this.element && this.window.document.activeElement?.tagName !== 'BODY') {
				return;
			}

			// It is possible for the webview to be contained in another window
			// that does not have focus. As such, also focus the body of the
			// webview's window to ensure it is properly receiving keyboard focus.
			this.window?.document.body?.focus();

			this._send('focus', undefined);
		});
	}

	protected readonly _hasFindResult = this._register(new Emitter<boolean>());
	public readonly hasFindResult: Event<boolean> = this._hasFindResult.event;

	protected readonly _onDidStopFind = this._register(new Emitter<void>());
	public readonly onDidStopFind: Event<void> = this._onDidStopFind.event;

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

		this._send('find', { value, previous });
	}

	public updateFind(value: string) {
		if (!value || !this.element) {
			return;
		}
		this._send('find', { value });
	}

	public stopFind(keepSelection?: boolean): void {
		if (!this.element) {
			return;
		}
		this._send('find-stop', { clearSelection: !keepSelection });
		this._onDidStopFind.fire();
	}

	public showFind(animated = true) {
		this._webviewFindWidget?.reveal(undefined, animated);
	}

	public hideFind(animated = true) {
		this._webviewFindWidget?.hide(animated);
	}

	public runFindAction(previous: boolean) {
		this._webviewFindWidget?.find(previous);
	}
}
