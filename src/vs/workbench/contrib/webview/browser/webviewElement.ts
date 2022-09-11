/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isFirefox } from 'vs/base/browser/browser';
import { addDisposableListener, EventType } from 'vs/base/browser/dom';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { IAction } from 'vs/base/common/actions';
import { ThrottledDelayer } from 'vs/base/common/async';
import { streamToBuffer, VSBufferReadableStream } from 'vs/base/common/buffer';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { COI, Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ITunnelService } from 'vs/platform/tunnel/common/tunnel';
import { WebviewPortMappingManager } from 'vs/platform/webview/common/webviewPortMapping';
import { parentOriginHash } from 'vs/workbench/browser/webview';
import { asWebviewUri, decodeAuthority, webviewGenericCspSource, webviewRootResourceAuthority } from 'vs/workbench/common/webview';
import { loadLocalResource, WebviewResourceResponse } from 'vs/workbench/contrib/webview/browser/resourceLoading';
import { WebviewThemeDataProvider } from 'vs/workbench/contrib/webview/browser/themeing';
import { areWebviewContentOptionsEqual, IWebview, WebviewContentOptions, WebviewExtensionDescription, WebviewMessageReceivedEvent, WebviewOptions } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewFindDelegate, WebviewFindWidget } from 'vs/workbench/contrib/webview/browser/webviewFindWidget';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

export const enum WebviewMessageChannels {
	onmessage = 'onmessage',
	didClickLink = 'did-click-link',
	didScroll = 'did-scroll',
	didFocus = 'did-focus',
	didBlur = 'did-blur',
	didLoad = 'did-load',
	didFind = 'did-find',
	doUpdateState = 'do-update-state',
	doReload = 'do-reload',
	setConfirmBeforeClose = 'set-confirm-before-close',
	loadResource = 'load-resource',
	loadLocalhost = 'load-localhost',
	webviewReady = 'webview-ready',
	wheel = 'did-scroll-wheel',
	fatalError = 'fatal-error',
	noCspFound = 'no-csp-found',
	didKeydown = 'did-keydown',
	didKeyup = 'did-keyup',
	didContextMenu = 'did-context-menu',
	dragStart = 'drag-start',
}

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

interface WebviewContent {
	readonly html: string;
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

export interface WebviewInitInfo {
	readonly id: string;
	readonly providedViewType?: string;
	readonly origin?: string;

	readonly options: WebviewOptions;
	readonly contentOptions: WebviewContentOptions;

	readonly extension: WebviewExtensionDescription | undefined;
}

interface WebviewActionContext {
	webview?: string;
	[key: string]: unknown;
}

const webviewIdContext = 'webviewId';

export class WebviewElement extends Disposable implements IWebview, WebviewFindDelegate {

	/**
	 * External identifier of this webview.
	 */
	public readonly id: string;

	/**
	 * The provided identifier of this webview.
	 */
	public readonly providedViewType?: string;

	/**
	 * The origin this webview itself is loaded from. May not be unique
	 */
	public readonly origin: string;

	/**
	 * Unique internal identifier of this webview's iframe element.
	 */
	private readonly iframeId: string;

	private readonly encodedWebviewOriginPromise: Promise<string>;
	private encodedWebviewOrigin: string | undefined;

	protected get platform(): string { return 'browser'; }

	private readonly _expectedServiceWorkerVersion = 4; // Keep this in sync with the version in service-worker.js

	private _element: HTMLIFrameElement | undefined;
	protected get element(): HTMLIFrameElement | undefined { return this._element; }

	private _focused: boolean | undefined;
	public get isFocused(): boolean {
		if (!this._focused) {
			return false;
		}
		if (document.activeElement && document.activeElement !== this.element) {
			// looks like https://github.com/microsoft/vscode/issues/132641
			// where the focus is actually not in the `<iframe>`
			return false;
		}
		return true;
	}

	private _state: WebviewState.State = new WebviewState.Initializing([]);

	private content: WebviewContent;

	private readonly _portMappingManager: WebviewPortMappingManager;

	private readonly _resourceLoadingCts = this._register(new CancellationTokenSource());

	private _contextKeyService: IContextKeyService | undefined;

	private _confirmBeforeClose: string;

	private readonly _focusDelayer = this._register(new ThrottledDelayer(50));

	private readonly _onDidHtmlChange: Emitter<string> = this._register(new Emitter<string>());
	protected readonly onDidHtmlChange = this._onDidHtmlChange.event;

	private messagePort?: MessagePort;
	private readonly _messageHandlers = new Map<string, Set<(data: any, e: MessageEvent) => void>>();

	protected readonly _webviewFindWidget: WebviewFindWidget | undefined;
	public readonly checkImeCompletionState = true;

	private _disposed = false;


	public extension: WebviewExtensionDescription | undefined;
	private readonly options: WebviewOptions;

	constructor(
		initInfo: WebviewInitInfo,
		protected readonly webviewThemeDataProvider: WebviewThemeDataProvider,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IMenuService menuService: IMenuService,
		@INotificationService notificationService: INotificationService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IRemoteAuthorityResolverService private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ITunnelService private readonly _tunnelService: ITunnelService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		super();

		this.id = initInfo.id;
		this.providedViewType = initInfo.providedViewType;
		this.iframeId = generateUuid();
		this.origin = initInfo.origin ?? this.iframeId;

		this.encodedWebviewOriginPromise = parentOriginHash(window.origin, this.origin).then(id => this.encodedWebviewOrigin = id);

		this.options = initInfo.options;
		this.extension = initInfo.extension;

		this.content = {
			html: '',
			options: initInfo.contentOptions,
			state: undefined
		};

		this._portMappingManager = this._register(new WebviewPortMappingManager(
			() => this.extension?.location,
			() => this.content.options.portMapping || [],
			this._tunnelService
		));

		this._element = this.createElement(initInfo.options, initInfo.contentOptions);


		const subscription = this._register(addDisposableListener(window, 'message', (e: MessageEvent) => {
			if (!this.encodedWebviewOrigin || e?.data?.target !== this.iframeId) {
				return;
			}

			if (e.origin !== this.webviewContentOrigin(this.encodedWebviewOrigin)) {
				console.log(`Skipped renderer receiving message due to mismatched origins: ${e.origin} ${this.webviewContentOrigin}`);
				return;
			}

			if (e.data.channel === WebviewMessageChannels.webviewReady) {
				if (this.messagePort) {
					return;
				}

				this._logService.debug(`Webview(${this.id}): webview ready`);

				this.messagePort = e.ports[0];
				this.messagePort.onmessage = (e) => {
					const handlers = this._messageHandlers.get(e.data.channel);
					if (!handlers) {
						console.log(`No handlers found for '${e.data.channel}'`);
						return;
					}
					handlers?.forEach(handler => handler(e.data.data, e));
				};

				this.element?.classList.add('ready');

				if (this._state.type === WebviewState.Type.Initializing) {
					this._state.pendingMessages.forEach(({ channel, data }) => this.doPostMessage(channel, data));
				}
				this._state = WebviewState.Ready;

				subscription.dispose();
			}
		}));

		this._register(this.on(WebviewMessageChannels.noCspFound, () => {
			this.handleNoCspFound();
		}));

		this._register(this.on(WebviewMessageChannels.didClickLink, (uri: string) => {
			this._onDidClickLink.fire(uri);
		}));

		this._register(this.on(WebviewMessageChannels.onmessage, (data: { message: any; transfer?: ArrayBuffer[] }) => {
			this._onMessage.fire({
				message: data.message,
				transfer: data.transfer,
			});
		}));

		this._register(this.on(WebviewMessageChannels.didScroll, (scrollYPercentage: number) => {
			this._onDidScroll.fire({ scrollYPercentage: scrollYPercentage });
		}));

		this._register(this.on(WebviewMessageChannels.doReload, () => {
			this.reload();
		}));

		this._register(this.on(WebviewMessageChannels.doUpdateState, (state: any) => {
			this.state = state;
			this._onDidUpdateState.fire(state);
		}));

		this._register(this.on(WebviewMessageChannels.didFocus, () => {
			this.handleFocusChange(true);
		}));

		this._register(this.on(WebviewMessageChannels.wheel, (event: IMouseWheelEvent) => {
			this._onDidWheel.fire(event);
		}));

		this._register(this.on(WebviewMessageChannels.didBlur, () => {
			this.handleFocusChange(false);
		}));

		this._register(this.on(WebviewMessageChannels.didFind, (didFind: boolean) => {
			this._hasFindResult.fire(didFind);
		}));

		this._register(this.on<{ message: string }>(WebviewMessageChannels.fatalError, (e) => {
			notificationService.error(localize('fatalErrorMessage', "Error loading webview: {0}", e.message));
		}));

		this._register(this.on(WebviewMessageChannels.didKeydown, (data: KeyboardEvent) => {
			// Electron: workaround for https://github.com/electron/electron/issues/14258
			// We have to detect keyboard events in the <webview> and dispatch them to our
			// keybinding service because these events do not bubble to the parent window anymore.
			this.handleKeyEvent('keydown', data);
		}));

		this._register(this.on(WebviewMessageChannels.didKeyup, (data: KeyboardEvent) => {
			this.handleKeyEvent('keyup', data);
		}));

		this._register(this.on(WebviewMessageChannels.didContextMenu, (data: { clientX: number; clientY: number; context: { [key: string]: unknown } }) => {
			if (!this.element) {
				return;
			}
			if (!this._contextKeyService) {
				return;
			}
			const elementBox = this.element.getBoundingClientRect();
			contextMenuService.showContextMenu({
				getActions: () => {
					const contextKeyService = this._contextKeyService!.createOverlay([
						...Object.entries(data.context),
						[webviewIdContext, this.providedViewType],
					]);

					const result: IAction[] = [];
					const menu = menuService.createMenu(MenuId.WebviewContext, contextKeyService);
					createAndFillInContextMenuActions(menu, { shouldForwardArgs: true }, result);
					menu.dispose();
					return result;
				},
				getActionsContext: (): WebviewActionContext => ({ ...data.context, webview: this.providedViewType }),
				getAnchor: () => ({
					x: elementBox.x + data.clientX,
					y: elementBox.y + data.clientY
				})
			});
		}));

		this._register(this.on(WebviewMessageChannels.loadResource, async (entry: { id: number; path: string; query: string; scheme: string; authority: string; ifNoneMatch?: string }) => {
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

		this._register(this.on(WebviewMessageChannels.loadLocalhost, (entry: any) => {
			this.localLocalhost(entry.id, entry.origin);
		}));

		this._register(Event.runAndSubscribe(webviewThemeDataProvider.onThemeDataChanged, () => this.style()));

		this._register(_accessibilityService.onDidChangeReducedMotion(() => this.style()));
		this._register(_accessibilityService.onDidChangeScreenReaderOptimized(() => this.style()));

		this._confirmBeforeClose = configurationService.getValue<string>('window.confirmBeforeClose');

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('window.confirmBeforeClose')) {
				this._confirmBeforeClose = configurationService.getValue('window.confirmBeforeClose');
				this._send(WebviewMessageChannels.setConfirmBeforeClose, this._confirmBeforeClose);
			}
		}));

		this._register(this.on(WebviewMessageChannels.dragStart, () => {
			this.startBlockingIframeDragEvents();
		}));

		if (initInfo.options.enableFindWidget) {
			this._webviewFindWidget = this._register(instantiationService.createInstance(WebviewFindWidget, this));
			this.styledFindWidget();
		}

		this.encodedWebviewOriginPromise.then(encodedWebviewOrigin => {
			if (!this._disposed) {
				this.initElement(encodedWebviewOrigin, this.extension, this.options);
			}
		});
	}

	override dispose(): void {
		this._disposed = true;

		this.element?.remove();
		this._element = undefined;

		this.messagePort = undefined;

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

	private readonly _onDidReload = this._register(new Emitter<void>());
	public readonly onDidReload = this._onDidReload.event;

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

	private readonly _onDidDispose = this._register(new Emitter<void>());
	public readonly onDidDispose = this._onDidDispose.event;

	public postMessage(message: any, transfer?: ArrayBuffer[]): Promise<boolean> {
		return this._send('message', { message, transfer });
	}

	protected async _send(channel: string, data?: any, transferable: Transferable[] = []): Promise<boolean> {
		if (this._state.type === WebviewState.Type.Initializing) {
			let resolve: (x: boolean) => void;
			const promise = new Promise<boolean>(r => resolve = r);
			this._state.pendingMessages.push({ channel, data, transferable, resolve: resolve! });
			return promise;
		} else {
			return this.doPostMessage(channel, data, transferable);
		}
	}

	private createElement(options: WebviewOptions, _contentOptions: WebviewContentOptions) {
		// Do not start loading the webview yet.
		// Wait the end of the ctor when all listeners have been hooked up.
		const element = document.createElement('iframe');
		element.name = this.id;
		element.className = `webview ${options.customClasses || ''}`;
		element.sandbox.add('allow-scripts', 'allow-same-origin', 'allow-forms', 'allow-pointer-lock', 'allow-downloads');

		const allowRules = ['cross-origin-isolated;'];
		if (!isFirefox) {
			allowRules.push('clipboard-read;', 'clipboard-write;');
			element.setAttribute('allow', 'clipboard-read; clipboard-write; cross-origin-isolated;');
		}
		element.setAttribute('allow', allowRules.join(' '));

		element.style.border = 'none';
		element.style.width = '100%';
		element.style.height = '100%';

		element.focus = () => {
			this.doFocus();
		};

		return element;
	}

	private initElement(encodedWebviewOrigin: string, extension: WebviewExtensionDescription | undefined, options: WebviewOptions) {
		// The extensionId and purpose in the URL are used for filtering in js-debug:
		const params: { [key: string]: string } = {
			id: this.iframeId,
			origin: this.origin,
			swVersion: String(this._expectedServiceWorkerVersion),
			extensionId: extension?.id.value ?? '',
			platform: this.platform,
			'vscode-resource-base-authority': webviewRootResourceAuthority,
			parentOrigin: window.origin,
		};

		if (this._environmentService.remoteAuthority) {
			params.remoteAuthority = this._environmentService.remoteAuthority;
		}

		if (options.purpose) {
			params.purpose = options.purpose;
		}


		COI.addSearchParam(params, true, true);

		const queryString = new URLSearchParams(params).toString();

		// Workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1754872
		const fileName = isFirefox ? 'index-no-csp.html' : 'index.html';

		this.element!.setAttribute('src', `${this.webviewContentEndpoint(encodedWebviewOrigin)}/${fileName}?${queryString}`);
	}

	public mountTo(parent: HTMLElement) {
		if (!this.element) {
			return;
		}

		if (this._webviewFindWidget) {
			parent.appendChild(this._webviewFindWidget.getDomNode());
		}

		[EventType.MOUSE_DOWN, EventType.MOUSE_MOVE, EventType.DROP].forEach(eventName => {
			this._register(addDisposableListener(parent, eventName, () => {
				this.stopBlockingIframeDragEvents();
			}));
		});

		[parent, window].forEach(node => this._register(addDisposableListener(node as HTMLElement, EventType.DRAG_END, () => {
			this.stopBlockingIframeDragEvents();
		})));

		parent.appendChild(this.element);
	}

	private startBlockingIframeDragEvents() {
		if (this.element) {
			this.element.style.pointerEvents = 'none';
		}
	}

	private stopBlockingIframeDragEvents() {
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

	private webviewContentOrigin(encodedWebviewOrigin: string): string {
		const uri = URI.parse(this.webviewContentEndpoint(encodedWebviewOrigin));
		return uri.scheme + '://' + uri.authority.toLowerCase();
	}

	private doPostMessage(channel: string, data?: any, transferable: Transferable[] = []): boolean {
		if (this.element && this.messagePort) {
			this.messagePort.postMessage({ channel, args: data }, transferable);
			return true;
		}
		return false;
	}

	protected on<T = unknown>(channel: WebviewMessageChannels, handler: (data: T, e: MessageEvent) => void): IDisposable {
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

			const payload = {
				extension: this.extension.id.value
			} as const;

			type Classification = {
				extension: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the extension that created the webview.' };
				owner: 'mjbz';
				comment: 'Helps find which extensions are contributing webviews with invalid CSPs';
			};

			this._telemetryService.publicLog2<typeof payload, Classification>('webviewMissingCsp', payload);
		}
	}

	public reload(): void {
		this.doUpdateContent(this.content);

		const subscription = this._register(this.on(WebviewMessageChannels.didLoad, () => {
			this._onDidReload.fire();
			subscription.dispose();
		}));
	}

	public set html(value: string) {
		const rewrittenHtml = this.rewriteVsCodeResourceUrls(value);
		this.doUpdateContent({
			html: rewrittenHtml,
			options: this.content.options,
			state: this.content.state,
		});
		this._onDidHtmlChange.fire(value);
	}

	private rewriteVsCodeResourceUrls(value: string): string {
		const isRemote = this.extension?.location?.scheme === Schemas.vscodeRemote;
		const remoteAuthority = this.extension?.location?.scheme === Schemas.vscodeRemote ? this.extension.location.authority : undefined;
		return value
			.replace(/(["'])(?:vscode-resource):(\/\/([^\s\/'"]+?)(?=\/))?([^\s'"]+?)(["'])/gi, (_match, startQuote, _1, scheme, path, endQuote) => {
				const uri = URI.from({
					scheme: scheme || 'file',
					path: decodeURIComponent(path),
				});
				const webviewUri = asWebviewUri(uri, { isRemote, authority: remoteAuthority }).toString();
				return `${startQuote}${webviewUri}${endQuote}`;
			})
			.replace(/(["'])(?:vscode-webview-resource):(\/\/[^\s\/'"]+\/([^\s\/'"]+?)(?=\/))?([^\s'"]+?)(["'])/gi, (_match, startQuote, _1, scheme, path, endQuote) => {
				const uri = URI.from({
					scheme: scheme || 'file',
					path: decodeURIComponent(path),
				});
				const webviewUri = asWebviewUri(uri, { isRemote, authority: remoteAuthority }).toString();
				return `${startQuote}${webviewUri}${endQuote}`;
			});
	}

	public set contentOptions(options: WebviewContentOptions) {
		this._logService.debug(`Webview(${this.id}): will update content options`);

		if (areWebviewContentOptionsEqual(options, this.content.options)) {
			this._logService.debug(`Webview(${this.id}): skipping content options update`);
			return;
		}

		this.doUpdateContent({
			html: this.content.html,
			options: options,
			state: this.content.state,
		});
	}

	public set localResourcesRoot(resources: readonly URI[]) {
		this.content = {
			...this.content,
			options: { ...this.content.options, localResourceRoots: resources }
		};
	}

	public set state(state: string | undefined) {
		this.content = {
			html: this.content.html,
			options: this.content.options,
			state,
		};
	}

	public set initialScrollProgress(value: number) {
		this._send('initial-scroll-position', value);
	}

	private doUpdateContent(newContent: WebviewContent) {
		this._logService.debug(`Webview(${this.id}): will update content`);

		this.content = newContent;

		const allowScripts = !!this.content.options.allowScripts;
		this._send('content', {
			contents: this.content.html,
			options: {
				allowMultipleAPIAcquire: !!this.content.options.allowMultipleAPIAcquire,
				allowScripts: allowScripts,
				allowForms: this.content.options.allowForms ?? allowScripts, // For back compat, we allow forms by default when scripts are enabled
			},
			state: this.content.state,
			cspSource: webviewGenericCspSource,
			confirmBeforeClose: this._confirmBeforeClose,
		});
	}

	protected style(): void {
		let { styles, activeTheme, themeLabel } = this.webviewThemeDataProvider.getWebviewThemeData();
		if (this.options.transformCssVariables) {
			styles = this.options.transformCssVariables(styles);
		}

		const reduceMotion = this._accessibilityService.isMotionReduced();
		const screenReader = this._accessibilityService.isScreenReaderOptimized();

		this._send('styles', { styles, activeTheme, themeName: themeLabel, reduceMotion, screenReader });

		this.styledFindWidget();
	}

	private styledFindWidget() {
		this._webviewFindWidget?.updateTheme(this.webviewThemeDataProvider.getTheme());
	}

	private handleFocusChange(isFocused: boolean): void {
		this._focused = isFocused;
		if (isFocused) {
			this._onDidFocus.fire();
		} else {
			this._onDidBlur.fire();
		}
	}

	private handleKeyEvent(type: 'keydown' | 'keyup', event: IKeydownEvent) {
		// Create a fake KeyboardEvent from the data provided
		const emulatedKeyboardEvent = new KeyboardEvent(type, event);
		// Force override the target
		Object.defineProperty(emulatedKeyboardEvent, 'target', {
			get: () => this.element,
		});
		// And re-dispatch
		window.dispatchEvent(emulatedKeyboardEvent);
	}

	windowDidDragStart(): void {
		// Webview break drag and dropping around the main window (no events are generated when you are over them)
		// Work around this by disabling pointer events during the drag.
		// https://github.com/electron/electron/issues/18226
		this.startBlockingIframeDragEvents();
	}

	windowDidDragEnd(): void {
		this.stopBlockingIframeDragEvents();
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
				roots: this.content.options.localResourceRoots || [],
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
		this.doFocus();

		// Handle focus change programmatically (do not rely on event from <webview>)
		this.handleFocusChange(true);
	}

	private doFocus() {
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

			if (document.activeElement && document.activeElement !== this.element && document.activeElement?.tagName !== 'BODY') {
				return;
			}

			this._send('focus');
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
		this._send('find-stop', { keepSelection });
		this._onDidStopFind.fire();
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
}
