/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./overlayWidgets';
import { StyleMutator } from 'vs/base/browser/styleMutator';
import { EditorLayoutInfo } from 'vs/editor/common/editorCommon';
import { ClassNames, IOverlayWidget, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { ViewPart, PartFingerprint, PartFingerprints } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { IRenderingContext, IRestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';

interface IWidgetData {
	widget: IOverlayWidget;
	preference: OverlayWidgetPositionPreference;
}

interface IWidgetMap {
	[key: string]: IWidgetData;
}

export class ViewOverlayWidgets extends ViewPart {

	private _widgets: IWidgetMap;
	public domNode: HTMLElement;

	private _verticalScrollbarWidth: number;
	private _horizontalScrollbarHeight: number;
	private _editorHeight: number;
	private _editorWidth: number;

	constructor(context: ViewContext) {
		super(context);

		this._widgets = {};
		this._verticalScrollbarWidth = 0;
		this._horizontalScrollbarHeight = 0;
		this._editorHeight = 0;
		this._editorWidth = 0;

		this.domNode = document.createElement('div');
		PartFingerprints.write(this.domNode, PartFingerprint.OverlayWidgets);
		this.domNode.className = ClassNames.OVERLAY_WIDGETS;
	}

	public dispose(): void {
		super.dispose();
		this._widgets = null;
	}

	// ---- begin view event handlers

	public onLayoutChanged(layoutInfo: EditorLayoutInfo): boolean {
		this._verticalScrollbarWidth = layoutInfo.verticalScrollbarWidth;
		this._horizontalScrollbarHeight = layoutInfo.horizontalScrollbarHeight;
		this._editorHeight = layoutInfo.height;
		this._editorWidth = layoutInfo.width;
		return true;
	}

	// ---- end view event handlers

	public addWidget(widget: IOverlayWidget): void {
		this._widgets[widget.getId()] = {
			widget: widget,
			preference: null
		};

		// This is sync because a widget wants to be in the dom
		let domNode = widget.getDomNode();
		domNode.style.position = 'absolute';
		domNode.setAttribute('widgetId', widget.getId());
		this.domNode.appendChild(domNode);

		this.setShouldRender();
	}

	public setWidgetPosition(widget: IOverlayWidget, preference: OverlayWidgetPositionPreference): boolean {
		let widgetData = this._widgets[widget.getId()];
		if (widgetData.preference === preference) {
			return false;
		}

		widgetData.preference = preference;
		this.setShouldRender();

		return true;
	}

	public removeWidget(widget: IOverlayWidget): void {
		let widgetId = widget.getId();
		if (this._widgets.hasOwnProperty(widgetId)) {
			let widgetData = this._widgets[widgetId];
			let domNode = widgetData.widget.getDomNode();
			delete this._widgets[widgetId];

			domNode.parentNode.removeChild(domNode);
			this.setShouldRender();
		}
	}

	private _renderWidget(widgetData: IWidgetData): void {
		let _RESTORE_STYLE_TOP = 'data-editor-restoreStyleTop';
		let domNode = widgetData.widget.getDomNode();

		if (widgetData.preference === null) {
			if (domNode.hasAttribute(_RESTORE_STYLE_TOP)) {
				let previousTop = domNode.getAttribute(_RESTORE_STYLE_TOP);
				domNode.removeAttribute(_RESTORE_STYLE_TOP);
				domNode.style.top = previousTop;
			}
			return;
		}

		if (widgetData.preference === OverlayWidgetPositionPreference.TOP_RIGHT_CORNER) {
			if (!domNode.hasAttribute(_RESTORE_STYLE_TOP)) {
				domNode.setAttribute(_RESTORE_STYLE_TOP, domNode.style.top);
			}
			StyleMutator.setTop(domNode, 0);
			StyleMutator.setRight(domNode, (2 * this._verticalScrollbarWidth));
		} else if (widgetData.preference === OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER) {
			if (!domNode.hasAttribute(_RESTORE_STYLE_TOP)) {
				domNode.setAttribute(_RESTORE_STYLE_TOP, domNode.style.top);
			}
			let widgetHeight = domNode.clientHeight;
			StyleMutator.setTop(domNode, (this._editorHeight - widgetHeight - 2 * this._horizontalScrollbarHeight));
			StyleMutator.setRight(domNode, (2 * this._verticalScrollbarWidth));
		} else if (widgetData.preference === OverlayWidgetPositionPreference.TOP_CENTER) {
			if (!domNode.hasAttribute(_RESTORE_STYLE_TOP)) {
				domNode.setAttribute(_RESTORE_STYLE_TOP, domNode.style.top);
			}
			StyleMutator.setTop(domNode, 0);
			domNode.style.right = '50%';
		}
	}

	public prepareRender(ctx: IRenderingContext): void {
		// Nothing to read
		if (!this.shouldRender()) {
			throw new Error('I did not ask to render!');
		}
	}

	public render(ctx: IRestrictedRenderingContext): void {
		StyleMutator.setWidth(this.domNode, this._editorWidth);

		let keys = Object.keys(this._widgets);
		for (let i = 0, len = keys.length; i < len; i++) {
			let widgetId = keys[i];
			this._renderWidget(this._widgets[widgetId]);
		}
	}
}
