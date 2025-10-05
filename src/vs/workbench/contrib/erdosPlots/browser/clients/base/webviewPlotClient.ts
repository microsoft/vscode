/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IOverlayWebview } from '../../../../webview/browser/webview.js';
import { IErdosPlotMetadata } from '../../../../../services/languageRuntime/common/languageRuntimePlotClient.js';
import { InteractivePlotEngine } from '../../ui/components/unifiedPlotRenderer.js';

export abstract class WebviewPlotClient extends InteractivePlotEngine {

	constructor(metadata: IErdosPlotMetadata) {
		super(metadata);
	}

	protected abstract override initializeView(): Promise<IOverlayWebview>;

	protected abstract override teardownView(): void;

	public setHtmlContent(html: string): void {
		this.injectHtmlContent(html);
	}

	public get htmlContent(): string | undefined {
		return this.htmlMarkup;
	}

	public activate() {
		return this.startEngine();
	}

	public deactivate() {
		this.stopEngine();
	}

	public isActive(): boolean {
		return this.isRunning();
	}

	public get thumbnailUri(): string | undefined {
		return this.snapshotDataUrl;
	}

	public claim(claimant: any) {
		this.assignOwner(claimant);
	}

	public layoutWebviewOverElement(ele: HTMLElement) {
		this.positionViewOverTarget(ele);
	}

	public release(claimant: any) {
		this.releaseOwner(claimant);
	}

	protected createWebview(): Promise<IOverlayWebview> {
		return this.initializeView();
	}

	protected disposeWebview(): void {
		this.teardownView();
	}

	protected nudgeRenderThumbnail() {
		this._scheduleSnapshotCapture();
	}
}

