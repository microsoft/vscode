/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from 'vs/base/browser/dom';
import { Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { isWeb } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { ITunnelService } from 'vs/platform/remote/common/tunnel';
import { Webview, WebviewContentOptions, WebviewOptions } from 'vs/workbench/contrib/webview/browser/webview';
import { areWebviewInputOptionsEqual } from 'vs/workbench/contrib/webview/browser/webviewWorkbenchService';
import { WebviewPortMappingManager } from 'vs/workbench/contrib/webview/common/portMapping';
import { loadLocalResource } from 'vs/workbench/contrib/webview/common/resourceLoader';
import { WebviewThemeDataProvider } from 'vs/workbench/contrib/webview/common/themeing';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { BaseWebview, WebviewMessageChannels } from 'vs/workbench/contrib/webview/browser/baseWebviewElement';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

interface WebviewContent {
	readonly html: string;
	readonly options: WebviewContentOptions;
	readonly state: string | undefined;
}

export class IFrameWebview extends BaseWebview<HTMLIFrameElement> implements Webview {
	private content: WebviewContent;
	private _focused = false;

	private readonly _portMappingManager: WebviewPortMappingManager;

	constructor(
		private readonly id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		private readonly webviewThemeDataProvider: WebviewThemeDataProvider,
		@ITunnelService tunnelService: ITunnelService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IEnvironmentService environementService: IEnvironmentService,
	) {
		super(options, telemetryService, environementService);
		if (!this.useExternalEndpoint && (!environmentService.options || typeof environmentService.webviewExternalEndpoint !== 'string')) {
			throw new Error('To use iframe based webviews, you must configure `environmentService.webviewExternalEndpoint`');
		}

		this._portMappingManager = this._register(new WebviewPortMappingManager(
			() => this.extension ? this.extension.location : undefined,
			() => this.content.options.portMapping || [],
			tunnelService
		));

		this.content = {
			html: '',
			options: contentOptions,
			state: undefined
		};

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

		this._register(this.on(WebviewMessageChannels.didBlur, () => {
			this.handleFocusChange(false);
		}));

		this._register(this.on(WebviewMessageChannels.loadResource, (entry: any) => {
			const rawPath = entry.path;
			const normalizedPath = decodeURIComponent(rawPath);
			const uri = URI.parse(normalizedPath.replace(/^\/(\w+)\/(.+)$/, (_, scheme, path) => scheme + ':/' + path));
			this.loadResource(rawPath, uri);
		}));

		this._register(this.on(WebviewMessageChannels.loadLocalhost, (entry: any) => {
			this.localLocalhost(entry.origin);
		}));

		this.style();
		this._register(webviewThemeDataProvider.onThemeDataChanged(this.style, this));
	}

	protected createElement(options: WebviewOptions) {
		const element = document.createElement('iframe');
		element.className = `webview ${options.customClasses}`;
		element.sandbox.add('allow-scripts', 'allow-same-origin');
		element.setAttribute('src', `${this.externalEndpoint}/index.html?id=${this.id}`);
		element.style.border = 'none';
		element.style.width = '100%';
		element.style.height = '100%';
		return element;
	}

	private get externalEndpoint(): string {
		const endpoint = this.environmentService.webviewExternalEndpoint!.replace('{{uuid}}', this.id);
		if (endpoint[endpoint.length - 1] === '/') {
			return endpoint.slice(0, endpoint.length - 1);
		}
		return endpoint;
	}

	private get useExternalEndpoint(): boolean {
		return isWeb || this._configurationService.getValue<boolean>('webview.experimental.useExternalEndpoint');
	}

	public mountTo(parent: HTMLElement) {
		if (this.element) {
			parent.appendChild(this.element);
		}
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
			html: this.preprocessHtml(value),
			options: this.content.options,
			state: this.content.state,
		};
		this.doUpdateContent();
	}

	private preprocessHtml(value: string): string {
		return value.replace(/(["'])vscode-resource:(\/\/([^\s'"]+?)(?=\/))?([^\s'"]+?)(["'])/gi, (_, startQuote, _1, scheme, path, endQuote) => {
			return `${startQuote}${this.externalEndpoint}/vscode-resource/${scheme || ''}${path}${endQuote}`;
		});
	}

	private doUpdateContent() {
		this._send('content', {
			contents: this.content.html,
			options: this.content.options,
			state: this.content.state,
			endpoint: this.externalEndpoint,
		});
	}

	private handleFocusChange(isFocused: boolean): void {
		this._focused = isFocused;
		if (this._focused) {
			this._onDidFocus.fire();
		}
	}

	initialScrollProgress: number = 0;

	private readonly _onDidFocus = this._register(new Emitter<void>());
	public readonly onDidFocus = this._onDidFocus.event;

	private readonly _onDidUpdateState = this._register(new Emitter<string | undefined>());
	public readonly onDidUpdateState = this._onDidUpdateState.event;

	sendMessage(data: any): void {
		this._send('message', data);
	}

	focus(): void {
		if (this.element) {
			this.element.focus();
		}
	}

	reload(): void {
		this.doUpdateContent();
	}

	showFind(): void {
		throw new Error('Method not implemented.');
	}

	hideFind(): void {
		throw new Error('Method not implemented.');
	}

	runFindAction(previous: boolean): void {
		throw new Error('Method not implemented.');
	}

	public set state(state: string | undefined) {
		this.content = {
			html: this.content.html,
			options: this.content.options,
			state,
		};
	}

	private style(): void {
		const { styles, activeTheme } = this.webviewThemeDataProvider.getWebviewThemeData();
		this._send('styles', { styles, activeTheme });
	}

	private async loadResource(requestPath: string, uri: URI) {
		try {
			const result = await loadLocalResource(uri, this.fileService, this.extension ? this.extension.location : undefined,
				() => (this.content.options.localResourceRoots || []));

			if (result.type === 'success') {
				return this._send('did-load-resource', {
					status: 200,
					path: requestPath,
					mime: result.mimeType,
					data: result.data.buffer
				});
			}
		} catch  {
			// noop
		}

		return this._send('did-load-resource', {
			status: 404,
			path: requestPath
		});
	}

	private async localLocalhost(origin: string) {
		const redirect = await this._portMappingManager.getRedirect(origin);
		return this._send('did-load-localhost', {
			origin,
			location: redirect
		});
	}

	protected postMessage(channel: string, data?: any): void {
		if (this.element) {
			this.element.contentWindow!.postMessage({ channel, args: data }, '*');
		}
	}

	protected on<T = unknown>(channel: WebviewMessageChannels, handler: (data: T) => void): IDisposable {
		return addDisposableListener(window, 'message', e => {
			if (!e || !e.data || e.data.target !== this.id) {
				return;
			}
			if (e.data.channel === channel) {
				handler(e.data.data);
			}
		});
	}
}
