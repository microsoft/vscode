/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./overlayWidgets';

import {ViewPart} from 'vs/editor/browser/view/viewPart';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import {StyleMutator} from 'vs/base/browser/styleMutator';

interface IWidgetData {
	widget: EditorBrowser.IOverlayWidget;
	preference: EditorBrowser.OverlayWidgetPositionPreference;
}

interface IWidgetMap {
	[key:string]: IWidgetData;
}

export class ViewOverlayWidgets extends ViewPart {

	private _widgets: IWidgetMap;
	public domNode: HTMLElement;

	private _verticalScrollbarWidth: number;
	private _horizontalScrollbarHeight:number;
	private _editorHeight:number;

	constructor(context:EditorBrowser.IViewContext) {
		super(context);

		this._widgets = {};
		this._verticalScrollbarWidth = 0;
		this._horizontalScrollbarHeight = 0;
		this._editorHeight = 0;

		this.domNode = document.createElement('div');
		this.domNode.className = EditorBrowser.ClassNames.OVERLAY_WIDGETS;
	}

	public dispose(): void {
		super.dispose();
		this._widgets = null;
	}

	// ---- begin view event handlers

	public onLayoutChanged(layoutInfo:EditorCommon.IEditorLayoutInfo): boolean {
		this._verticalScrollbarWidth = layoutInfo.verticalScrollbarWidth;
		this._horizontalScrollbarHeight = layoutInfo.horizontalScrollbarHeight;
		this._editorHeight = layoutInfo.height;

		this._requestModificationFrame(() => {
			StyleMutator.setWidth(this.domNode, layoutInfo.width);
		});
		return true;
	}

	// ---- end view event handlers

	public addWidget(widget: EditorBrowser.IOverlayWidget): void {
		this._widgets[widget.getId()] = {
			widget: widget,
			preference: null
		};

		// This is sync because a widget wants to be in the dom
		var domNode = widget.getDomNode();
		domNode.style.position = 'absolute';
		domNode.setAttribute('widgetId', widget.getId());
		this.domNode.appendChild(domNode);
	}

	public setWidgetPosition(widget: EditorBrowser.IOverlayWidget, preference:EditorBrowser.OverlayWidgetPositionPreference): void {
		var widgetData = this._widgets[widget.getId()];
		widgetData.preference = preference;

		this._requestModificationFrame(() => {
			if(this._widgets.hasOwnProperty(widget.getId())) {
				this._renderWidget(widgetData);
			}
		});
	}

	public removeWidget(widget: EditorBrowser.IOverlayWidget): void {
		var widgetId = widget.getId();
		if (this._widgets.hasOwnProperty(widgetId)) {
			var widgetData = this._widgets[widgetId];
			var domNode = widgetData.widget.getDomNode();
			delete this._widgets[widgetId];

			domNode.parentNode.removeChild(domNode);
		}
	}

	private _renderWidget(widgetData: IWidgetData): void {
		var _RESTORE_STYLE_TOP = 'data-editor-restoreStyleTop',
			domNode = widgetData.widget.getDomNode();

		if (widgetData.preference === null) {
			if (domNode.hasAttribute(_RESTORE_STYLE_TOP)) {
				var previousTop = domNode.getAttribute(_RESTORE_STYLE_TOP);
				domNode.removeAttribute(_RESTORE_STYLE_TOP);
				domNode.style.top = previousTop;
			}
			return;
		}

		if (widgetData.preference === EditorBrowser.OverlayWidgetPositionPreference.TOP_RIGHT_CORNER) {
			if (!domNode.hasAttribute(_RESTORE_STYLE_TOP)) {
				domNode.setAttribute(_RESTORE_STYLE_TOP, domNode.style.top);
			}
			StyleMutator.setTop(domNode, 0);
			StyleMutator.setRight(domNode, (2 * this._verticalScrollbarWidth));
		} else if (widgetData.preference === EditorBrowser.OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER) {
			if (!domNode.hasAttribute(_RESTORE_STYLE_TOP)) {
				domNode.setAttribute(_RESTORE_STYLE_TOP, domNode.style.top);
			}
			var widgetHeight = domNode.clientHeight;
			StyleMutator.setTop(domNode, (this._editorHeight - widgetHeight - 2 * this._horizontalScrollbarHeight));
			StyleMutator.setRight(domNode, (2 * this._verticalScrollbarWidth));
		} else if (widgetData.preference === EditorBrowser.OverlayWidgetPositionPreference.TOP_CENTER) {
			if (!domNode.hasAttribute(_RESTORE_STYLE_TOP)) {
				domNode.setAttribute(_RESTORE_STYLE_TOP, domNode.style.top);
			}
			StyleMutator.setTop(domNode, 0);
			domNode.style.right = '50%';
		}
	}

	_render(ctx:EditorBrowser.IRenderingContext): void {
		var widgetId:string;

		this._requestModificationFrame(() => {
			for (widgetId in this._widgets) {
				if (this._widgets.hasOwnProperty(widgetId)) {
					this._renderWidget(this._widgets[widgetId]);
				}
			}
		});
	}

	public onReadAfterForcedLayout(ctx:EditorBrowser.IRenderingContext): void {
		// Overwriting to bypass `shouldRender` flag
		this._render(ctx);
		return null;
	}

	public onWriteAfterForcedLayout(): void {
		// Overwriting to bypass `shouldRender` flag
		this._executeModificationRunners();
	}
}
