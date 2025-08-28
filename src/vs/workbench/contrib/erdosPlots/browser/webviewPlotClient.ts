/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { VSBuffer, encodeBase64 } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IOverlayWebview } from '../../webview/browser/webview.js';
import { IErdosPlotClient, IExtendedErdosPlotMetadata } from '../../../services/erdosPlots/common/erdosPlots.js';

export abstract class WebviewPlotClient extends Disposable implements IErdosPlotClient {

	protected readonly _webview = this._register(new MutableDisposable<IOverlayWebview>());

	private _thumbnail: VSBuffer | undefined;

	private _onDidActivate: Emitter<void>;

	private _onDidRenderThumbnail: Emitter<string>;

	private _claimed: boolean = false;

	private _renderTimer: any | undefined;

	private _element: HTMLElement | undefined;

	private _pendingActivation?: Promise<void>;

	constructor(public readonly metadata: IExtendedErdosPlotMetadata) {
		super();

		this._onDidActivate = this._register(new Emitter<void>());
		this.onDidActivate = this._onDidActivate.event;

		this._onDidRenderThumbnail = this._register(new Emitter<string>());
		this.onDidRenderThumbnail = this._onDidRenderThumbnail.event;
	}

	get id(): string {
		return this.metadata.id;
	}

	get thumbnailUri(): string | undefined {
		if (this._thumbnail) {
			return this.asDataUri(this._thumbnail);
		}
		return undefined;
	}

	isActive(): boolean {
		return Boolean(this._webview.value);
	}

	protected abstract createWebview(): Promise<IOverlayWebview>;

	protected abstract disposeWebview(): void;

	/**
	 * Sets HTML content for the webview plot
	 */
	public setHtmlContent(html: string): void {
		if (this._webview.value) {
			this._webview.value.setHtml(html);
			this.nudgeRenderThumbnail();
		}
	}

	/**
	 * Gets the HTML content if available
	 */
	public get htmlContent(): string | undefined {
		// This would be implemented by subclasses that store HTML content
		return undefined;
	}

	public activate() {
		if (this._webview.value) {
			return Promise.resolve();
		}

		if (this._pendingActivation) {
			return this._pendingActivation;
		}

		this._pendingActivation = this.createWebview().then((webview) => {
			this._webview.value = webview;
			this._onDidActivate.fire();
		}).finally(() => {
			this._pendingActivation = undefined;
		});
		return this._pendingActivation;
	}

	public deactivate() {
		if (!this._webview.value) {
			return;
		}
		this.disposeWebview();
		this._webview.clear();
	}

	public claim(claimant: any) {
		if (!this._webview.value) {
			throw new Error('No webview to claim');
		}
		this._webview.value.claim(claimant, DOM.getWindow(this._element), undefined);
		this._claimed = true;
	}

	public layoutWebviewOverElement(ele: HTMLElement) {
		if (!this._webview.value) {
			throw new Error('No webview to layout');
		}
		this._element = ele;
		this._webview.value.layoutWebviewOverElement(ele);
	}

	public release(claimant: any) {
		if (!this._webview.value) {
			return;
		}
		this._webview.value.release(claimant);
		this._claimed = false;

		this.cancelPendingRender();
	}

	private renderThumbnail() {
		if (!this._webview.value) {
			throw new Error('No webview to render thumbnail');
		}
		this._webview.value.captureContentsAsPng().then(data => {
			if (data) {
				this._thumbnail = data;
				this._onDidRenderThumbnail.fire(this.asDataUri(data));
			}
		});
	}

	protected nudgeRenderThumbnail() {
		this.cancelPendingRender();

		this._renderTimer = setTimeout(() => {
			if (this._claimed) {
				this.renderThumbnail();
			}
		}, 1000);
	}

	private cancelPendingRender() {
		if (this._renderTimer) {
			clearTimeout(this._renderTimer);
			this._renderTimer = undefined;
		}
	}

	private asDataUri(buffer: VSBuffer) {
		return `data:image/png;base64,${encodeBase64(buffer)}`;
	}

	public readonly onDidActivate: Event<void>;

	public readonly onDidRenderThumbnail: Event<string>;

	override dispose(): void {
		super.dispose();
		this.cancelPendingRender();
	}
}