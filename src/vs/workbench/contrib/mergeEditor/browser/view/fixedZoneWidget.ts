/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor, IOverlayWidget, IViewZoneChangeAccessor } from '../../../../../editor/browser/editorBrowser.js';
import { Event } from '../../../../../base/common/event.js';

export abstract class FixedZoneWidget extends Disposable {
	private static counter = 0;
	private readonly overlayWidgetId = `fixedZoneWidget-${FixedZoneWidget.counter++}`;
	private readonly viewZoneId: string;

	protected readonly widgetDomNode = h('div.fixed-zone-widget').root;
	private readonly overlayWidget: IOverlayWidget = {
		getId: () => this.overlayWidgetId,
		getDomNode: () => this.widgetDomNode,
		getPosition: () => null
	};

	constructor(
		private readonly editor: ICodeEditor,
		viewZoneAccessor: IViewZoneChangeAccessor,
		afterLineNumber: number,
		height: number,
		viewZoneIdsToCleanUp: string[],
	) {
		super();

		this.viewZoneId = viewZoneAccessor.addZone({
			domNode: document.createElement('div'),
			afterLineNumber: afterLineNumber,
			heightInPx: height,
			ordinal: 50000 + 1,
			onComputedHeight: (height) => {
				this.widgetDomNode.style.height = `${height}px`;
			},
			onDomNodeTop: (top) => {
				this.widgetDomNode.style.top = `${top}px`;
			}
		});
		viewZoneIdsToCleanUp.push(this.viewZoneId);

		this._register(Event.runAndSubscribe(this.editor.onDidLayoutChange, () => {
			this.widgetDomNode.style.left = this.editor.getLayoutInfo().contentLeft + 'px';
		}));

		this.editor.addOverlayWidget(this.overlayWidget);

		this._register({
			dispose: () => {
				this.editor.removeOverlayWidget(this.overlayWidget);
			},
		});
	}
}
