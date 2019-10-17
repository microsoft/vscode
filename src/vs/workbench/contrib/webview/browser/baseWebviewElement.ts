/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addClass } from 'vs/base/browser/dom';
import { Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { WebviewExtensionDescription, WebviewOptions, WebviewContentOptions } from 'vs/workbench/contrib/webview/browser/webview';
import { URI } from 'vs/base/common/uri';
import { areWebviewInputOptionsEqual } from 'vs/workbench/contrib/webview/browser/webviewWorkbenchService';

export const enum WebviewMessageChannels {
	onmessage = 'onmessage',
	didClickLink = 'did-click-link',
	didScroll = 'did-scroll',
	didFocus = 'did-focus',
	didBlur = 'did-blur',
	doUpdateState = 'do-update-state',
	doReload = 'do-reload',
	loadResource = 'load-resource',
	loadLocalhost = 'load-localhost',
	webviewReady = 'webview-ready',
}

interface WebviewContent {
	readonly html: string;
	readonly options: WebviewContentOptions;
	readonly state: string | undefined;
}

export abstract class BaseWebview<T extends HTMLElement> extends Disposable {

	private _element: T | undefined;
	protected get element(): T | undefined { return this._element; }

	private readonly _ready: Promise<void>;

	protected content: WebviewContent;

	public extension: WebviewExtensionDescription | undefined;

	constructor(
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IEnvironmentService private readonly _environementService: IEnvironmentService,
	) {
		super();

		this.content = {
			html: '',
			options: contentOptions,
			state: undefined
		};

		this._element = this.createElement(options);

		this._ready = new Promise(resolve => {
			const subscription = this._register(this.on(WebviewMessageChannels.webviewReady, () => {
				if (this.element) {
					addClass(this.element, 'ready');
				}
				subscription.dispose();
				resolve();
			}));
		});

		this._register(this.on('no-csp-found', () => {
			this.handleNoCspFound();
		}));

		this._register(this.on(WebviewMessageChannels.didClickLink, (uri: string) => {
			this._onDidClickLink.fire(URI.parse(uri));
		}));

		this._register(this.on(WebviewMessageChannels.onmessage, (data: any) => {
			this._onMessage.fire(data);
		}));

		this._register(this.on(WebviewMessageChannels.didScroll, (scrollYPercentage: number) => {
			this._onDidScroll.fire({ scrollYPercentage: scrollYPercentage });
		}));

		this._register(this.on(WebviewMessageChannels.doReload, () => {
			this.reload();
		}));
	}

	dispose(): void {
		if (this.element) {
			this.element.remove();
		}

		this._element = undefined;
		super.dispose();
	}

	private readonly _onMissingCsp = this._register(new Emitter<ExtensionIdentifier>());
	public readonly onMissingCsp = this._onMissingCsp.event;

	private readonly _onDidClickLink = this._register(new Emitter<URI>());
	public readonly onDidClickLink = this._onDidClickLink.event;

	private readonly _onMessage = this._register(new Emitter<any>());
	public readonly onMessage = this._onMessage.event;

	private readonly _onDidScroll = this._register(new Emitter<{ readonly scrollYPercentage: number; }>());
	public readonly onDidScroll = this._onDidScroll.event;

	protected _send(channel: string, data?: any): void {
		this._ready
			.then(() => this.postMessage(channel, data))
			.catch(err => console.error(err));
	}

	protected abstract readonly extraContentOptions: { readonly [key: string]: string };

	protected abstract createElement(options: WebviewOptions): T;

	protected abstract on<T = unknown>(channel: string, handler: (data: T) => void): IDisposable;

	protected abstract postMessage(channel: string, data?: any): void;

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
				extension?: { classification: 'SystemMetaData', purpose: 'FeatureInsight'; };
			};
			type TelemetryData = {
				extension?: string,
			};

			this._telemetryService.publicLog2<TelemetryData, TelemetryClassification>('webviewMissingCsp', {
				extension: this.extension.id.value
			});
		}
	}

	public reload(): void {
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

	private doUpdateContent() {
		this._send('content', {
			contents: this.content.html,
			options: this.content.options,
			state: this.content.state,
			...this.extraContentOptions
		});
	}
}
