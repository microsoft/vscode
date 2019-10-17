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
import { WebviewExtensionDescription, WebviewOptions } from 'vs/workbench/contrib/webview/browser/webview';

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

export abstract class BaseWebview<T extends HTMLElement> extends Disposable {

	private _element: T | undefined;
	protected get element(): T | undefined { return this._element; }

	private readonly _ready: Promise<void>;

	public extension: WebviewExtensionDescription | undefined;

	constructor(
		options: WebviewOptions,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IEnvironmentService private readonly _environementService: IEnvironmentService,
	) {
		super();

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

	protected _send(channel: string, data?: any): void {
		this._ready
			.then(() => this.postMessage(channel, data))
			.catch(err => console.error(err));
	}

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
}
