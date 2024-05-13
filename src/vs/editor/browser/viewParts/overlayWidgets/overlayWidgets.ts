/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./overlayWidgets';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { IOverlayWidget, IOverlayWidgetPositionCoordinates, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { PartFingerprint, PartFingerprints, ViewPart } from 'vs/editor/browser/view/viewPart';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import * as dom from 'vs/base/browser/dom';


interface IWidgetData {
	widget: IOverlayWidget;
	preference: OverlayWidgetPositionPreference | IOverlayWidgetPositionCoordinates | null;
	domNode: FastDomNode<HTMLElement>;
}

interface IWidgetMap {
	[key: string]: IWidgetData;
}

export class ViewOverlayWidgets extends ViewPart {

	private readonly _viewDomNode: FastDomNode<HTMLElement>;
	private _widgets: IWidgetMap;
	private _viewDomNodeRect: dom.IDomNodePagePosition;
	private readonly _domNode: FastDomNode<HTMLElement>;
	public readonly overflowingOverlayWidgetsDomNode: FastDomNode<HTMLElement>;
	private _verticalScrollbarWidth: number;
	private _minimapWidth: number;
	private _horizontalScrollbarHeight: number;
	private _editorHeight: number;
	private _editorWidth: number;

	constructor(context: ViewContext, viewDomNode: FastDomNode<HTMLElement>) {
		super(context);
		this._viewDomNode = viewDomNode;

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this._widgets = {};
		this._verticalScrollbarWidth = layoutInfo.verticalScrollbarWidth;
		this._minimapWidth = layoutInfo.minimap.minimapWidth;
		this._horizontalScrollbarHeight = layoutInfo.horizontalScrollbarHeight;
		this._editorHeight = layoutInfo.height;
		this._editorWidth = layoutInfo.width;
		this._viewDomNodeRect = { top: 0, left: 0, width: 0, height: 0 };

		this._domNode = createFastDomNode(document.createElement('div'));
		PartFingerprints.write(this._domNode, PartFingerprint.OverlayWidgets);
		this._domNode.setClassName('overlayWidgets');

		this.overflowingOverlayWidgetsDomNode = createFastDomNode(document.createElement('div'));
		PartFingerprints.write(this.overflowingOverlayWidgetsDomNode, PartFingerprint.OverflowingOverlayWidgets);
		this.overflowingOverlayWidgetsDomNode.setClassName('overflowingOverlayWidgets');
	}

	public override dispose(): void {
		super.dispose();
		this._widgets = {};
	}

	public getDomNode(): FastDomNode<HTMLElement> {
		return this._domNode;
	}

	// ---- begin view event handlers

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this._verticalScrollbarWidth = layoutInfo.verticalScrollbarWidth;
		this._minimapWidth = layoutInfo.minimap.minimapWidth;
		this._horizontalScrollbarHeight = layoutInfo.horizontalScrollbarHeight;
		this._editorHeight = layoutInfo.height;
		this._editorWidth = layoutInfo.width;
		return true;
	}

	// ---- end view event handlers

	public addWidget(widget: IOverlayWidget): void {
		const domNode = createFastDomNode(widget.getDomNode());

		this._widgets[widget.getId()] = {
			widget: widget,
			preference: null,
			domNode: domNode
		};

		// This is sync because a widget wants to be in the dom
		domNode.setPosition('absolute');
		domNode.setAttribute('widgetId', widget.getId());

		if (widget.allowEditorOverflow) {
			this.overflowingOverlayWidgetsDomNode.appendChild(domNode);
		} else {
			this._domNode.appendChild(domNode);
		}

		this.setShouldRender();
		this._updateMaxMinWidth();
	}

	public setWidgetPosition(widget: IOverlayWidget, preference: OverlayWidgetPositionPreference | IOverlayWidgetPositionCoordinates | null): boolean {
		const widgetData = this._widgets[widget.getId()];
		if (widgetData.preference === preference) {
			this._updateMaxMinWidth();
			return false;
		}

		widgetData.preference = preference;
		this.setShouldRender();
		this._updateMaxMinWidth();

		return true;
	}

	public removeWidget(widget: IOverlayWidget): void {
		const widgetId = widget.getId();
		if (this._widgets.hasOwnProperty(widgetId)) {
			const widgetData = this._widgets[widgetId];
			const domNode = widgetData.domNode.domNode;
			delete this._widgets[widgetId];

			domNode.remove();
			this.setShouldRender();
			this._updateMaxMinWidth();
		}
	}

	private _updateMaxMinWidth(): void {
		let maxMinWidth = 0;
		const keys = Object.keys(this._widgets);
		for (let i = 0, len = keys.length; i < len; i++) {
			const widgetId = keys[i];
			const widget = this._widgets[widgetId];
			const widgetMinWidthInPx = widget.widget.getMinContentWidthInPx?.();
			if (typeof widgetMinWidthInPx !== 'undefined') {
				maxMinWidth = Math.max(maxMinWidth, widgetMinWidthInPx);
			}
		}
		this._context.viewLayout.setOverlayWidgetsMinWidth(maxMinWidth);
	}

	private _renderWidget(widgetData: IWidgetData): void {
		const domNode = widgetData.domNode;

		if (widgetData.preference === null) {
			domNode.setTop('');
			return;
		}

		if (widgetData.preference === OverlayWidgetPositionPreference.TOP_RIGHT_CORNER) {
			domNode.setTop(0);
			domNode.setRight((2 * this._verticalScrollbarWidth) + this._minimapWidth);
		} else if (widgetData.preference === OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER) {
			const widgetHeight = domNode.domNode.clientHeight;
			domNode.setTop((this._editorHeight - widgetHeight - 2 * this._horizontalScrollbarHeight));
			domNode.setRight((2 * this._verticalScrollbarWidth) + this._minimapWidth);
		} else if (widgetData.preference === OverlayWidgetPositionPreference.TOP_CENTER) {
			domNode.setTop(0);
			domNode.domNode.style.right = '50%';
		} else {
			const { top, left } = widgetData.preference;
			const fixedOverflowWidgets = this._context.configuration.options.get(EditorOption.fixedOverflowWidgets);
			if (fixedOverflowWidgets && widgetData.widget.allowEditorOverflow) {
				// top, left are computed relative to the editor and we need them relative to the page
				const editorBoundingBox = this._viewDomNodeRect;
				domNode.setTop(top + editorBoundingBox.top);
				domNode.setLeft(left + editorBoundingBox.left);
				domNode.setPosition('fixed');

			} else {
				domNode.setTop(top);
				domNode.setLeft(left);
				domNode.setPosition('absolute');
			}
		}
	}

	public prepareRender(ctx: RenderingContext): void {
		this._viewDomNodeRect = dom.getDomNodePagePosition(this._viewDomNode.domNode);
	}

	public render(ctx: RestrictedRenderingContext): void {
		this._domNode.setWidth(this._editorWidth);

		const keys = Object.keys(this._widgets);
		for (let i = 0, len = keys.length; i < len; i++) {
			const widgetId = keys[i];
			this._renderWidget(this._widgets[widgetId]);
		}
	}
}
