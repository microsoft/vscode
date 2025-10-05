/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IOverlayWebview } from '../../../../webview/browser/webview.js';
import { IErdosPlotMetadata } from '../../../../../services/languageRuntime/common/languageRuntimePlotClient.js';
import { InteractivePlotEngine } from '../../ui/components/unifiedPlotRenderer.js';

/**
 * Base class for plot clients that render content in webviews.
 */
export abstract class AbstractWebviewClient extends InteractivePlotEngine {

	constructor(metadata: IErdosPlotMetadata) {
		super(metadata);
	}

	protected abstract override initializeView(): Promise<IOverlayWebview>;

	protected abstract override teardownView(): void;

	applyHtmlContent(htmlMarkup: string): void {
		this.injectHtmlContent(htmlMarkup);
	}

	retrieveHtmlContent(): string | undefined {
		return this.htmlMarkup;
	}

	beginRendering() {
		return this.startEngine();
	}

	haltRendering() {
		this.stopEngine();
	}

	checkIfRendering(): boolean {
		return this.isRunning();
	}

	get snapshotImageUri(): string | undefined {
		return this.snapshotDataUrl;
	}

	assignOwnership(owner: any) {
		this.assignOwner(owner);
	}

	positionOverElement(targetElement: HTMLElement) {
		this.positionViewOverTarget(targetElement);
	}

	relinquishOwnership(owner: any) {
		this.releaseOwner(owner);
	}

	protected constructWebview(): Promise<IOverlayWebview> {
		return this.initializeView();
	}

	protected destroyWebview(): void {
		this.teardownView();
	}

	protected triggerThumbnailCapture() {
		this._scheduleSnapshotCapture();
	}
}

