/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomFactor } from '../../../../../base/browser/browser.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserEditor, BrowserEditorContribution, BrowserWidgetLocation, IBrowserEditorWidget, IContainerLayout, IContainerLayoutOverride } from '../browserEditor.js';
import { WebContentsViewHost } from '../webContentsViewHost.js';

class WebContentsViewRendererFeature extends BrowserEditorContribution {

	private readonly host: WebContentsViewHost;

	constructor(
		editor: BrowserEditor,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(editor);
		this.host = this._register(instantiationService.createInstance(WebContentsViewHost, editor.window, () => editor.ensureBrowserFocus()));
	}

	override get widgets(): readonly IBrowserEditorWidget[] {
		return [
			{ location: BrowserWidgetLocation.ContentArea, element: this.host.screenshotElement, order: 100 },
			{ location: BrowserWidgetLocation.ContentArea, element: this.host.pauseElement, order: 200 },
		];
	}

	override beforeContainerLayout(): IContainerLayoutOverride {
		return {
			padding: { top: 3, right: 3, bottom: 3, left: 3 },
			compute: (current, pane): IContainerLayout => {
				const zoomFactor = getZoomFactor(this.editor.window);
				const snap = (value: number) => Math.floor(value * zoomFactor) / zoomFactor;
				const absoluteLeft = pane.originX + (current.left ?? 0);
				const absoluteTop = pane.originY + (current.top ?? 0);
				return {
					...current,
					width: snap(current.width),
					height: snap(current.height),
					left: snap(absoluteLeft) - pane.originX,
					top: snap(absoluteTop) - pane.originY,
				};
			},
			priority: 1000,
		};
	}

	override onContainerCreated(container: HTMLElement): void { this.host.onContainerCreated(container); }
	override onPaneVisibilityChanged(visible: boolean): void { this.host.setVisible(visible); }
	override afterContainerLayout(): void { this.host.layout(); }
	override tryFocus(): boolean { return this.host.tryFocus(); }
	protected override onModelAttached(model: IBrowserViewModel): void { this.host.setModel(model); }
	override onModelDetached(): void { this.host.setModel(undefined); }
}

BrowserEditor.registerContribution(WebContentsViewRendererFeature);
