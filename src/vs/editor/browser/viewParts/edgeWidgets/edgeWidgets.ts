/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./edgeWidgets';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { IEdgeWidget, EdgeWidgetPositionEdge } from 'vs/editor/browser/editorBrowser';
import { ViewPart, PartFingerprint, PartFingerprints } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';

interface IWidgetData {
	widget: IEdgeWidget;
	edge: EdgeWidgetPositionEdge;
	size: number;
	domNode: FastDomNode<HTMLElement>;
}

interface IWidgetMap {
	[key: string]: IWidgetData;
}

export class ViewEdgeWidgets extends ViewPart {

	private _widgets: IWidgetMap;
	private _domNode: FastDomNode<HTMLElement>;

	constructor(context: ViewContext) {
		super(context);

		this._widgets = {};

		this._domNode = createFastDomNode(document.createElement('div'));
		PartFingerprints.write(this._domNode, PartFingerprint.EdgeWidgets);
		this._domNode.setClassName('edgeWidgets');
	}

	public dispose(): void {
		super.dispose();
		this._widgets = null;
	}

	public getDomNode(): FastDomNode<HTMLElement> {
		return this._domNode;
	}

	// ---- begin view event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.layoutInfo) {
			//this._editorWidth = this._context.configuration.editor.layoutInfo.width;
			return true;
		}
		return false;
	}

	// ---- end view event handlers

	public addWidget(widget: IEdgeWidget): void {
		const domNode = createFastDomNode(widget.getDomNode());

		this._widgets[widget.getId()] = {
			widget: widget,
			edge: null,
			size: null,
			domNode: domNode
		};

		// This is sync because a widget wants to be in the dom
		domNode.setPosition('absolute');
		domNode.setAttribute('widgetId', widget.getId());
		this._domNode.appendChild(domNode);

		this.setShouldRender();
	}

	public setWidgetPosition(widget: IEdgeWidget, edge: EdgeWidgetPositionEdge, size: number): boolean {
		let widgetData = this._widgets[widget.getId()];
		if (widgetData.edge === edge && widgetData.size === size) {
			return false;
		}

		widgetData.edge = edge;
		widgetData.size = size;
		this.setShouldRender();

		return true;
	}

	public removeWidget(widget: IEdgeWidget): void {
		let widgetId = widget.getId();
		if (this._widgets.hasOwnProperty(widgetId)) {
			const widgetData = this._widgets[widgetId];
			const domNode = widgetData.domNode.domNode;
			delete this._widgets[widgetId];

			domNode.parentNode.removeChild(domNode);
			this.setShouldRender();
		}
	}

	private _renderWidget(widgetData: IWidgetData): void {
		const domNode = widgetData.domNode;

		if (widgetData.edge === null) {
			domNode.unsetTop();
			return;
		}

		if (widgetData.edge === EdgeWidgetPositionEdge.TOP) {
			domNode.setTop(0);
			domNode.setLeft(0);
			//domNode.setWidth
		} else if (widgetData.edge === EdgeWidgetPositionEdge.BOTTOM) {
			domNode.setBottom(0);
			domNode.setLeft(0);
		}
	}

	public prepareRender(ctx: RenderingContext): void {
		// Nothing to read
	}

	public render(ctx: RestrictedRenderingContext): void {
		//this._domNode.setWidth(this._editorWidth);

		let keys = Object.keys(this._widgets);
		for (let i = 0, len = keys.length; i < len; i++) {
			let widgetId = keys[i];
			this._renderWidget(this._widgets[widgetId]);
		}
	}
}
