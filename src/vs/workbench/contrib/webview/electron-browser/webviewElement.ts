/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { listenStream } from '../../../../base/common/stream.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { createTrustedTypesPolicy } from '../../../../base/browser/trustedTypes.js';
import { Schemas } from '../../../../base/common/network.js';
import { escape } from '../../../../base/common/strings.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { ITunnelService } from '../../../../platform/tunnel/common/tunnel.js';
import { FindInFrameOptions, IWebviewManagerService, WebviewResourceRequest } from '../../../../platform/webview/common/webviewManagerService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { WebviewThemeDataProvider } from '../browser/themeing.js';
import { WebviewInitInfo } from '../browser/webview.js';
import { WebviewElement } from '../browser/webviewElement.js';
import { defaultWebviewStyles } from '../browser/pre/defaultStyles.js';
import { WebviewResourceResponse } from '../browser/resourceLoading.js';
import { WindowIgnoreMenuShortcutsManager } from './windowIgnoreMenuShortcutsManager.js';

const singleIframeBootstrap = String.raw`(() => {
	const bootstrapElement = document.querySelector('meta[name="vscode-webview-bootstrap"]');
	const bootstrap = bootstrapElement?.content ? JSON.parse(decodeURIComponent(bootstrapElement.content)) : {};
	bootstrapElement?.remove();
	const channel = new MessageChannel();
	let acquired = false;
	const stateElement = document.querySelector('meta[name="vscode-webview-state"]');
	let state = stateElement?.content ? JSON.parse(decodeURIComponent(stateElement.content)) : undefined;
	stateElement?.remove();
	const post = (channelName, data, transfer = []) => channel.port1.postMessage({ channel: channelName, data }, transfer);

	globalThis.acquireVsCodeApi = () => {
		if (acquired && !bootstrap.allowMultipleAPIAcquire) { throw new Error('An instance of the VS Code API has already been acquired'); }
		acquired = true;
		return Object.freeze({
			postMessage(message, transfer) { post('onmessage', { message, transfer }, transfer); },
			setState(newState) { state = newState; post('do-update-state', JSON.stringify(newState)); return newState; },
			getState() { return state; }
		});
	};

	let lastStyleData;
	const applyStyles = data => {
		lastStyleData = data;
		for (const [key, value] of Object.entries(data.styles || {})) {
			document.documentElement.style.setProperty('--' + key, String(value));
		}
		if (!document.body) { return; }
		document.body?.classList.remove('vscode-light', 'vscode-dark', 'vscode-high-contrast', 'vscode-high-contrast-light', 'vscode-reduce-motion', 'vscode-using-screen-reader');
		if (data.activeTheme) { document.body?.classList.add(data.activeTheme); }
		if (data.reduceMotion) { document.body?.classList.add('vscode-reduce-motion'); }
		if (data.screenReader) { document.body?.classList.add('vscode-using-screen-reader'); }
		document.body?.setAttribute('data-vscode-theme-kind', data.activeTheme || '');
		document.body?.setAttribute('data-vscode-theme-name', data.themeLabel || '');
		document.body?.setAttribute('data-vscode-theme-id', data.themeId || '');
	};

	channel.port1.onmessage = event => {
		const { channel: name, args } = event.data;
		switch (name) {
			case 'content': state = args.state; document.title = args.title || ''; break;
			case 'styles': applyStyles(args); break;
			case 'message': window.dispatchEvent(new MessageEvent('message', { data: args.message, origin: window.location.origin, source: window, ports: event.ports })); break;
			case 'focus': window.focus(); break;
			case 'execCommand': document.execCommand(args); break;
			case 'initial-scroll-position': window.scrollTo(0, document.body.scrollHeight * args); break;
			case 'set-title': document.title = args; break;
		}
	};

	window.addEventListener('focus', () => post('did-focus'));
	window.addEventListener('blur', () => post('did-blur'));
	window.addEventListener('DOMContentLoaded', () => { if (lastStyleData) { applyStyles(lastStyleData); } });
	window.addEventListener('scroll', () => post('did-scroll', { scrollYPercentage: document.body.scrollHeight ? scrollY / document.body.scrollHeight : 0 }), { passive: true });
	window.addEventListener('wheel', event => post('did-scroll-wheel', { deltaMode: event.deltaMode, deltaX: event.deltaX, deltaY: event.deltaY, deltaZ: event.deltaZ }), { passive: true });
	const keyData = event => ({ key: event.key, keyCode: event.keyCode, code: event.code, shiftKey: event.shiftKey, altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, repeat: event.repeat, isTrusted: event.isTrusted });
	window.addEventListener('keydown', event => post('did-keydown', keyData(event)));
	window.addEventListener('keyup', event => post('did-keyup', keyData(event)));
	const hasOnlyFiles = event => event.dataTransfer?.items.length && Array.from(event.dataTransfer.items).every(item => item.kind === 'file');
	window.addEventListener('dragenter', event => { if (!event.defaultPrevented && !event.shiftKey && hasOnlyFiles(event)) { post('drag-start'); } });
	window.addEventListener('dragover', event => { event.preventDefault(); if (hasOnlyFiles(event)) { post('drag', { shiftKey: event.shiftKey }); } });
	window.addEventListener('drop', event => event.preventDefault());
	window.addEventListener('contextmenu', event => {
		if (event.defaultPrevented) { return; }
		event.preventDefault();
		let context = {};
		let element = event.target instanceof Element ? event.target : null;
		while (element) {
			element = element.closest('[data-vscode-context]');
			if (!element) { break; }
			try { context = { ...JSON.parse(element.getAttribute('data-vscode-context')), ...context }; }
			catch (error) { console.error("Error parsing 'data-vscode-context' as json", element, error); }
			element = element.parentElement;
		}
		post('did-context-menu', { clientX: event.clientX, clientY: event.clientY, context });
	});
	document.addEventListener('click', event => {
		if (!event.isTrusted) { return; }
		const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
		if (!anchor) { return; }
		const href = anchor.getAttribute('href');
		const base = document.querySelector('base');
		if (href === '#') {
			window.scrollTo(0, 0);
		} else if (anchor.hash && (href === anchor.hash || (base && anchor.href === base.href + anchor.hash))) {
			const fragment = anchor.hash.slice(1);
			const decodedFragment = decodeURIComponent(fragment);
			const scrollTarget = document.getElementById(fragment) ?? document.getElementById(decodedFragment);
			if (scrollTarget) {
				scrollTarget.scrollIntoView();
			} else if (decodedFragment.toLowerCase() === 'top') {
				window.scrollTo(0, 0);
			}
		} else {
			post('did-click-link', { uri: anchor.href });
		}
		event.preventDefault();
	});

	parent.postMessage({ target: bootstrap.target, channel: 'webview-ready', data: { generation: bootstrap.generation } }, '*', [channel.port2]);
})();`;

const singleIframeHtmlPolicy = createTrustedTypesPolicy('singleIframeWebview', {
	createHTML: value => value,
	createScript: value => value,
});

/**
 * Webview backed by an iframe but that uses Electron APIs to power the webview.
 */
export class ElectronWebviewElement extends WebviewElement {

	private readonly _webviewKeyboardHandler: WindowIgnoreMenuShortcutsManager;

	private _findStarted: boolean = false;
	private _cachedHtmlContent: string | undefined;

	private readonly _webviewMainService: IWebviewManagerService;
	private readonly _iframeDelayer = this._register(new Delayer<void>(200));
	private _directTargetWindow: CodeWindow | undefined;
	private _directGeneration = 0;
	private _directHandshakeId: string | undefined;
	private _directContentKey: string | undefined;
	private _directUpdate: Promise<void> = Promise.resolve();
	private _directDisposed = false;
	private _directRegisteredDocument: { readonly extensionId: string; readonly webviewId: string; readonly windowId: number } | undefined;
	private readonly _directResourceRequests = new Map<number, CancellationTokenSource>();

	protected override get platform() { return 'electron'; }

	constructor(
		initInfo: WebviewInitInfo,
		webviewThemeDataProvider: WebviewThemeDataProvider,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITunnelService tunnelService: ITunnelService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ILogService private readonly _directLogService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IMainProcessService mainProcessService: IMainProcessService,
		@INotificationService notificationService: INotificationService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super(initInfo, webviewThemeDataProvider,
			configurationService, contextMenuService, notificationService, environmentService,
			_directLogService, remoteAuthorityResolverService, tunnelService, accessibilityService, instantiationService);

		this._webviewKeyboardHandler = new WindowIgnoreMenuShortcutsManager(configurationService, mainProcessService, _nativeHostService);

		this._webviewMainService = ProxyChannel.toService<IWebviewManagerService>(mainProcessService.getChannel('webview'));
		this._register(this._webviewMainService.onDidRequestWebviewResource(request => this.handleDirectResourceRequest(request)));
		this._register(this._webviewMainService.onDidCancelWebviewResource(requestId => {
			const request = this._directResourceRequests.get(requestId);
			if (request) {
				this._directResourceRequests.delete(requestId);
				request.dispose(true);
			}
		}));
		this._register(this._webviewMainService.onDidRequestWebviewPortMapping(async request => {
			if (this.useSingleIframe
				&& request.extensionId.toLowerCase() === this.extension?.id.value.toLowerCase()
				&& request.webviewId === this.resourceId) {
				const redirect = await this.getDirectLocalhostRedirect(request.origin);
				await this._webviewMainService.resolveWebviewPortMapping(request.requestId, redirect);
			}
		}));

		if (initInfo.options.enableFindWidget) {
			this._register(this.onDidHtmlChange((newContent) => {
				if (this._findStarted && this._cachedHtmlContent !== newContent) {
					this.stopFind(false);
					this._cachedHtmlContent = newContent;
				}
			}));

			this._register(this._webviewMainService.onFoundInFrame((result) => {
				this._hasFindResult.fire(result.matches > 0);
			}));
		}
	}

	override dispose(): void {
		// Make sure keyboard handler knows it closed (#71800)
		this._webviewKeyboardHandler.didBlur();
		this._directDisposed = true;
		this._directGeneration++;

		void this.unregisterDirectDocument();
		for (const request of this._directResourceRequests.values()) {
			request.dispose(true);
		}
		this._directResourceRequests.clear();
		super.dispose();
	}

	private async handleDirectResourceRequest(request: WebviewResourceRequest): Promise<void> {
		if (!this.useSingleIframe
			|| request.extensionId.toLowerCase() !== this.extension?.id.value.toLowerCase()
			|| request.webviewId !== this.resourceId) {
			return;
		}
		const cts = new CancellationTokenSource();
		this._directResourceRequests.set(request.requestId, cts);
		let streaming = false;
		const finish = () => {
			if (this._directResourceRequests.delete(request.requestId)) {
				cts.dispose();
			}
		};
		try {
			const result = await this.loadDirectResource(URI.revive(request.uri), {
				ifNoneMatch: request.ifNoneMatch,
				range: request.range,
			}, cts.token);
			if (cts.token.isCancellationRequested) {
				return;
			}
			switch (result.type) {
				case WebviewResourceResponse.Type.Success: {
					const requestedEnd = request.range?.end ?? result.size - 1;
					const rangeEnd = Math.min(requestedEnd, result.size - 1);
					await this._webviewMainService.startWebviewResourceResponse({
						requestId: request.requestId,
						status: request.range ? 206 : 200,
						mime: result.mimeType,
						etag: result.etag,
						mtime: result.mtime,
						size: result.size,
						range: request.range ? `bytes ${request.range.start}-${rangeEnd}/${result.size}` : undefined,
					});
					if (request.method === 'HEAD') {
						return;
					}
					streaming = true;
					listenStream(result.stream, {
						onData: data => void this._webviewMainService.streamWebviewResourceResponse(request.requestId, data),
						onError: () => { void this._webviewMainService.endWebviewResourceResponse(request.requestId, true); finish(); },
						onEnd: () => { void this._webviewMainService.endWebviewResourceResponse(request.requestId); finish(); },
					}, cts.token);
					return;
				}
				case WebviewResourceResponse.Type.NotModified:
					await this._webviewMainService.startWebviewResourceResponse({ requestId: request.requestId, status: 304, mime: result.mimeType, etag: undefined, mtime: result.mtime, size: undefined, range: undefined });
					return;
				case WebviewResourceResponse.Type.AccessDenied:
					await this._webviewMainService.startWebviewResourceResponse({ requestId: request.requestId, status: 401, mime: undefined, etag: undefined, mtime: undefined, size: undefined, range: undefined });
					return;
				default:
					await this._webviewMainService.startWebviewResourceResponse({ requestId: request.requestId, status: 404, mime: undefined, etag: undefined, mtime: undefined, size: undefined, range: undefined });
			}
		} catch {
			await this._webviewMainService.startWebviewResourceResponse({ requestId: request.requestId, status: 404, mime: undefined, etag: undefined, mtime: undefined, size: undefined, range: undefined });
		} finally {
			if (!streaming || cts.token.isCancellationRequested) {
				finish();
			}
		}
	}

	public override reload(): void {
		if (!this.useSingleIframe) {
			super.reload();
			return;
		}
		this._directContentKey = undefined;
		void this.updateDirectDocument(true);
	}

	protected override _initElement(encodedWebviewOrigin: string, extension: WebviewInitInfo['extension'], options: WebviewInitInfo['options'], targetWindow: CodeWindow): void {
		if (!this.useSingleIframe) {
			super._initElement(encodedWebviewOrigin, extension, options, targetWindow);
			return;
		}
		this._directTargetWindow = targetWindow;
		void this.updateDirectDocument(false);
	}

	protected override onWebviewRouteChanged(): void {
		if (this.useSingleIframe && this._directTargetWindow) {
			void this.updateDirectDocument(true);
		}
	}

	protected override onContentDidChange(): void {
		if (this.useSingleIframe && this._directTargetWindow) {
			void this.updateDirectDocument(true);
		}
	}

	protected override isValidWebviewReady(data: unknown): boolean {
		return !this.useSingleIframe
			|| (typeof data === 'object'
				&& data !== null
				&& (data as { generation?: string }).generation === this._directHandshakeId);
	}

	private async updateDirectDocument(prepareForNavigation: boolean): Promise<void> {
		const extensionId = this.extension?.id.value.toLowerCase();
		const webviewId = this.resourceId;
		const targetWindow = this._directTargetWindow;
		const windowId = this.windowId;
		if (this._directDisposed || !extensionId || !webviewId || !targetWindow || typeof windowId !== 'number' || !this.element) {
			return;
		}

		const content = this.content;
		const contentKey = JSON.stringify({
			extensionId,
			webviewId,
			windowId,
			html: content.html,
			allowMultipleAPIAcquire: content.options.allowMultipleAPIAcquire,
			allowScripts: content.options.allowScripts,
			allowForms: content.options.allowForms,
			roots: content.options.localResourceRoots?.map(root => root.toString()),
		});
		if (contentKey === this._directContentKey) {
			return;
		}
		this._directContentKey = contentKey;

		const generation = ++this._directGeneration;
		const handshakeId = generateUuid();
		this._directHandshakeId = handshakeId;
		if (prepareForNavigation) {
			this.prepareForDirectNavigation(targetWindow);
			this.style();
		}

		const update = this._directUpdate.then(async () => {
			const transformed = await this.transformDirectHtml(content.html, !!content.options.allowScripts, {
				target: this.id,
				generation: handshakeId,
				allowMultipleAPIAcquire: !!content.options.allowMultipleAPIAcquire,
			}, content.state, content.title);
			if (this._directDisposed || generation !== this._directGeneration) {
				return;
			}
			const registeredDocument = this._directRegisteredDocument;
			if (registeredDocument
				&& (registeredDocument.extensionId !== extensionId
					|| registeredDocument.webviewId !== webviewId
					|| registeredDocument.windowId !== windowId)) {
				await this.unregisterDirectDocument();
				if (this._directDisposed || generation !== this._directGeneration) {
					return;
				}
			}
			await this._webviewMainService.registerWebviewDocument({
				extensionId,
				webviewId,
				windowId,
				frameName: this.id,
				html: transformed.html,
				csp: transformed.csp,
				roots: content.options.localResourceRoots || [],
			});
			if (this._directDisposed || generation !== this._directGeneration || !this.element) {
				await this._webviewMainService.unregisterWebviewDocument(extensionId, webviewId);
				this._directRegisteredDocument = undefined;
				return;
			}
			this._directRegisteredDocument = { extensionId, webviewId, windowId };

			this.element.sandbox.remove('allow-same-origin', 'allow-forms', 'allow-downloads');
			this.element.sandbox.add('allow-scripts', 'allow-pointer-lock');
			if (content.options.allowForms ?? content.options.allowScripts) {
				this.element.sandbox.add('allow-forms');
			}
			if (content.options.allowScripts) {
				this.element.sandbox.add('allow-downloads');
			}
			this.element.title = content.title || '';
			this.element.src = `${Schemas.vscodeWebview}://${extensionId}/${encodeURIComponent(webviewId)}/index.html`;
		});
		this._directUpdate = update.then(undefined, error => {
			if (generation === this._directGeneration) {
				this._directContentKey = undefined;
			}
			this._directLogService.error(`Webview(${this.id}): failed to update direct webview`, error);
		});
		await this._directUpdate;
	}

	private async unregisterDirectDocument(): Promise<void> {
		const registeredDocument = this._directRegisteredDocument;
		if (!registeredDocument) {
			return;
		}
		this._directRegisteredDocument = undefined;
		await this._webviewMainService.unregisterWebviewDocument(registeredDocument.extensionId, registeredDocument.webviewId);
	}

	private async transformDirectHtml(html: string, allowScripts: boolean, bootstrapData: { readonly target: string; readonly generation: string; readonly allowMultipleAPIAcquire: boolean }, persistedState: string | undefined, title: string | undefined): Promise<{ html: string; csp: string }> {
		const source = html || '<!DOCTYPE html><html><head></head><body></body></html>';
		const trustedSource = singleIframeHtmlPolicy?.createHTML(source) ?? source;
		const parsedDocument = new DOMParser().parseFromString(trustedSource as string, 'text/html');
		const policies = Array.from(parsedDocument.head.children)
			.filter(element => element.tagName === 'META' && element.getAttribute('http-equiv')?.toLowerCase() === 'content-security-policy');
		if (policies.length !== 1 || !policies[0].getAttribute('content')?.trim()) {
			this.handleNoCspFound();
			return {
				html: `<!DOCTYPE html><html><body>${escape(localize('webviewBlockedMissingCsp', "Webview blocked: the experimental loader requires exactly one Content-Security-Policy meta tag."))}</body></html>`,
				csp: `default-src 'none'; style-src 'unsafe-inline'`,
			};
		}
		let csp = policies[0].getAttribute('content')!.trim();
		policies[0].remove();
		const hash = await this.contentHash(singleIframeBootstrap);
		const styleHash = await this.contentHash(defaultWebviewStyles);
		csp = this.addHash(csp, 'script-src', hash);
		if (this.hasDirective(csp, 'script-src-elem')) {
			csp = this.addHash(csp, 'script-src-elem', hash);
		}
		csp = this.addHash(csp, 'style-src', styleHash);
		if (this.hasDirective(csp, 'style-src-elem')) {
			csp = this.addHash(csp, 'style-src-elem', styleHash);
		}
		if (!allowScripts) {
			csp += `, script-src ${hash}; script-src-attr 'none'`;
		}
		const script = parsedDocument.createElement('script');
		script.text = (singleIframeHtmlPolicy?.createScript?.(singleIframeBootstrap) ?? singleIframeBootstrap) as string;
		parsedDocument.head.prepend(script);
		const bootstrap = parsedDocument.createElement('meta');
		bootstrap.name = 'vscode-webview-bootstrap';
		bootstrap.content = encodeURIComponent(JSON.stringify(bootstrapData));
		parsedDocument.head.prepend(bootstrap);
		const defaultStyles = parsedDocument.createElement('style');
		defaultStyles.id = '_defaultStyles';
		defaultStyles.textContent = defaultWebviewStyles;
		parsedDocument.head.prepend(defaultStyles);
		const stateElement = parsedDocument.createElement('meta');
		stateElement.name = 'vscode-webview-state';
		stateElement.content = persistedState ? encodeURIComponent(persistedState) : '';
		parsedDocument.head.prepend(stateElement);
		parsedDocument.title = title || '';
		return { html: `<!DOCTYPE html>\n${parsedDocument.documentElement.outerHTML}`, csp };
	}

	private async contentHash(value: string): Promise<string> {
		const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
		let binary = '';
		for (const value of digest) { binary += String.fromCharCode(value); }
		return `'sha256-${btoa(binary)}'`;
	}

	private addHash(csp: string, directive: string, hash: string): string {
		const directives = csp.split(';').map(value => value.trim()).filter(Boolean);
		const index = directives.findIndex(value => value.split(/\s/, 1)[0].toLowerCase() === directive);
		if (index >= 0) {
			directives[index] += ` ${hash}`;
		} else {
			directives.push(`${directive} ${hash}`);
		}
		return directives.join('; ');
	}

	private hasDirective(csp: string, directive: string): boolean {
		return csp.split(';').some(value => value.trim().split(/\s/, 1)[0].toLowerCase() === directive);
	}

	public override setTitle(title: string): void {
		super.setTitle(title);
		if (this.useSingleIframe && this.element) {
			this.element.title = title;
		}
	}

	protected override webviewContentEndpoint(iframeId: string): string {
		return `${Schemas.vscodeWebview}://${iframeId}`;
	}

	/**
	 * Webviews expose a stateful find API.
	 * Successive calls to find will move forward or backward through onFindResults
	 * depending on the supplied options.
	 *
	 * @param value The string to search for. Empty strings are ignored.
	 */
	public override find(value: string, previous: boolean): void {
		if (!this.element) {
			return;
		}

		if (!this._findStarted) {
			this.updateFind(value);
		} else {
			// continuing the find, so set findNext to false
			const options: FindInFrameOptions = { forward: !previous, findNext: false, matchCase: false };
			this._webviewMainService.findInFrame({ windowId: this._nativeHostService.windowId }, this.id, value, options);
		}
	}

	public override updateFind(value: string) {
		if (!value || !this.element) {
			return;
		}

		// FindNext must be true for a first request
		const options: FindInFrameOptions = {
			forward: true,
			findNext: true,
			matchCase: false
		};

		this._iframeDelayer.trigger(() => {
			this._findStarted = true;
			this._webviewMainService.findInFrame({ windowId: this._nativeHostService.windowId }, this.id, value, options);
		});
	}

	public override stopFind(keepSelection?: boolean): void {
		if (!this.element) {
			return;
		}
		this._iframeDelayer.cancel();
		this._findStarted = false;
		this._webviewMainService.stopFindInFrame({ windowId: this._nativeHostService.windowId }, this.id, {
			keepSelection
		});
		this._onDidStopFind.fire();
	}

	protected override handleFocusChange(isFocused: boolean): void {
		super.handleFocusChange(isFocused);
		if (isFocused) {
			this._webviewKeyboardHandler.didFocus();
		} else {
			this._webviewKeyboardHandler.didBlur();
		}
	}
}
