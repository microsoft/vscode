/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from '../../../../base/common/async.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { createTrustedTypesPolicy } from '../../../../base/browser/trustedTypes.js';
import { Schemas } from '../../../../base/common/network.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
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
import { FindInFrameOptions, IWebviewManagerService } from '../../../../platform/webview/common/webviewManagerService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { WebviewThemeDataProvider } from '../browser/themeing.js';
import { WebviewInitInfo } from '../browser/webview.js';
import { WebviewElement } from '../browser/webviewElement.js';
import { WindowIgnoreMenuShortcutsManager } from './windowIgnoreMenuShortcutsManager.js';

const singleIframeBootstrap = String.raw`(() => {
	const params = new URL(location.href).searchParams;
	const target = params.get('target');
	const parentOrigin = params.get('parentOrigin');
	const channel = new MessageChannel();
	let acquired = false;
	const stateElement = document.querySelector('meta[name="vscode-webview-state"]');
	let state = stateElement?.content ? JSON.parse(decodeURIComponent(stateElement.content)) : undefined;
	stateElement?.remove();
	const pending = [];
	const post = (channelName, data, transfer = []) => channel.port1.postMessage({ channel: channelName, data }, transfer);

	globalThis.acquireVsCodeApi = () => {
		if (acquired) { throw new Error('An instance of the VS Code API has already been acquired'); }
		acquired = true;
		return Object.freeze({
			postMessage(message, transfer) { post('onmessage', { message, transfer }, transfer); },
			setState(newState) { state = newState; post('do-update-state', JSON.stringify(newState)); return newState; },
			getState() { return state; }
		});
	};

	const applyStyles = data => {
		for (const [key, value] of Object.entries(data.styles || {})) {
			document.documentElement.style.setProperty('--' + key, String(value));
		}
		document.body?.classList.remove('vscode-light', 'vscode-dark', 'vscode-high-contrast', 'vscode-high-contrast-light');
		if (data.activeTheme) { document.body?.classList.add(data.activeTheme); }
		document.body?.setAttribute('data-vscode-theme-kind', data.activeTheme || '');
		document.body?.setAttribute('data-vscode-theme-name', data.themeLabel || '');
		document.body?.setAttribute('data-vscode-theme-id', data.themeId || '');
	};

	channel.port1.onmessage = event => {
		const { channel: name, args } = event.data;
		switch (name) {
			case 'content': state = args.state; document.title = args.title || ''; break;
			case 'styles': applyStyles(args); break;
			case 'message': window.dispatchEvent(new MessageEvent('message', { data: args.message })); break;
			case 'focus': window.focus(); break;
			case 'execCommand': document.execCommand(args); break;
			case 'initial-scroll-position': window.scrollTo(0, document.body.scrollHeight * args); break;
			case 'set-title': document.title = args; break;
		}
	};

	window.addEventListener('focus', () => post('did-focus'));
	window.addEventListener('blur', () => post('did-blur'));
	window.addEventListener('scroll', () => post('did-scroll', { scrollYPercentage: document.body.scrollHeight ? scrollY / document.body.scrollHeight : 0 }), { passive: true });
	window.addEventListener('wheel', event => post('did-scroll-wheel', { deltaMode: event.deltaMode, deltaX: event.deltaX, deltaY: event.deltaY, deltaZ: event.deltaZ }), { passive: true });
	document.addEventListener('click', event => {
		const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
		if (anchor) { event.preventDefault(); post('did-click-link', { uri: anchor.href }); }
	});

	parent.postMessage({ target, channel: 'webview-ready' }, parentOrigin, [channel.port2]);
})();`;

const singleIframeHtmlPolicy = createTrustedTypesPolicy('singleIframeWebview', { createHTML: value => value });

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
	private _directRevision = 0;
	private _directContentKey: string | undefined;
	private _directUpdate: Promise<void> = Promise.resolve();

	protected override get platform() { return 'electron'; }

	constructor(
		initInfo: WebviewInitInfo,
		webviewThemeDataProvider: WebviewThemeDataProvider,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITunnelService tunnelService: ITunnelService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ILogService logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IMainProcessService mainProcessService: IMainProcessService,
		@INotificationService notificationService: INotificationService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super(initInfo, webviewThemeDataProvider,
			configurationService, contextMenuService, notificationService, environmentService,
			logService, remoteAuthorityResolverService, tunnelService, accessibilityService, instantiationService);

		this._webviewKeyboardHandler = new WindowIgnoreMenuShortcutsManager(configurationService, mainProcessService, _nativeHostService);

		this._webviewMainService = ProxyChannel.toService<IWebviewManagerService>(mainProcessService.getChannel('webview'));

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

		if (this.extension?.useSingleIframe && this.resourceId) {
			void this._webviewMainService.unregisterWebviewDocument(this.extension.id.value, this.resourceId);
		}
		super.dispose();
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

	private async updateDirectDocument(prepareForNavigation: boolean): Promise<void> {
		const extensionId = this.extension?.id.value.toLowerCase();
		const webviewId = this.resourceId;
		const targetWindow = this._directTargetWindow;
		if (!extensionId || !webviewId || !targetWindow || typeof this.windowId !== 'number' || !this.element) {
			return;
		}

		const contentKey = JSON.stringify({
			html: this.content.html,
			allowScripts: this.content.options.allowScripts,
			allowForms: this.content.options.allowForms,
			roots: this.content.options.localResourceRoots?.map(root => root.toString()),
		});
		if (contentKey === this._directContentKey) {
			return;
		}
		this._directContentKey = contentKey;

		this._directUpdate = this._directUpdate.then(async () => {
			const revision = ++this._directRevision;
			const transformed = await this.transformDirectHtml(this.content.html, !!this.content.options.allowScripts);
			if (revision !== this._directRevision) {
				return;
			}
			await this._webviewMainService.registerWebviewDocument({
				extensionId,
				webviewId,
				windowId: this.windowId!,
				revision,
				html: transformed.html,
				csp: transformed.csp,
				roots: this.content.options.localResourceRoots || [],
			});
			if (revision !== this._directRevision || !this.element) {
				return;
			}

			this.element.sandbox.remove('allow-same-origin', 'allow-forms', 'allow-downloads');
			this.element.sandbox.add('allow-scripts', 'allow-pointer-lock');
			if (this.content.options.allowForms ?? this.content.options.allowScripts) {
				this.element.sandbox.add('allow-forms');
			}
			if (this.content.options.allowScripts) {
				this.element.sandbox.add('allow-downloads');
			}
			if (prepareForNavigation) {
				this.prepareForDirectNavigation(targetWindow);
				this.style();
			}
			const query = new URLSearchParams({
				revision: String(revision),
				target: this.id,
				parentOrigin: targetWindow.origin,
			});
			this.element.src = `${Schemas.vscodeWebview}://${extensionId}/${encodeURIComponent(webviewId)}/index.html?${query}`;
		});
		await this._directUpdate;
	}

	private async transformDirectHtml(html: string, allowScripts: boolean): Promise<{ html: string; csp: string }> {
		const source = html || '<!DOCTYPE html><html><head></head><body></body></html>';
		const trustedSource = singleIframeHtmlPolicy?.createHTML(source) ?? source;
		const document = new DOMParser().parseFromString(trustedSource as string, 'text/html');
		const policies = document.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]');
		if (policies.length !== 1 || !policies[0].getAttribute('content')?.trim()) {
			return {
				html: '<!DOCTYPE html><html><body>Webview blocked: the experimental loader requires exactly one Content-Security-Policy meta tag.</body></html>',
				csp: "default-src 'none'; style-src 'unsafe-inline'",
			};
		}
		let csp = policies[0].getAttribute('content')!.trim();
		policies[0].remove();
		const hash = await this.bootstrapHash();
		csp = this.addBootstrapHash(csp, hash);
		if (!allowScripts) {
			csp += `, script-src ${hash}; script-src-attr 'none'`;
		}
		const script = document.createElement('script');
		script.textContent = singleIframeBootstrap;
		document.head.prepend(script);
		const state = document.createElement('meta');
		state.name = 'vscode-webview-state';
		state.content = this.content.state ? encodeURIComponent(this.content.state) : '';
		document.head.prepend(state);
		document.title = this.content.title || '';
		return { html: `<!DOCTYPE html>\n${document.documentElement.outerHTML}`, csp };
	}

	private async bootstrapHash(): Promise<string> {
		const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(singleIframeBootstrap)));
		let binary = '';
		for (const value of digest) { binary += String.fromCharCode(value); }
		return `'sha256-${btoa(binary)}'`;
	}

	private addBootstrapHash(csp: string, hash: string): string {
		const directives = csp.split(';').map(value => value.trim()).filter(Boolean);
		const scriptIndex = directives.findIndex(value => value.toLowerCase().startsWith('script-src '));
		if (scriptIndex >= 0) {
			directives[scriptIndex] += ` ${hash}`;
		} else {
			directives.push(`script-src ${hash}`);
		}
		return directives.join('; ');
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
