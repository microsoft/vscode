/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { IOverviewRuler } from 'vs/editor/browser/editorBrowser';
import { OverviewRulerPosition } from 'vs/editor/common/config/editorOptions';
import { ColorZone, OverviewRulerZone, OverviewZoneManager } from 'vs/editor/common/view/overviewZoneManager';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';

export class OverviewRuler extends ViewEventHandler implements IOverviewRuler {

	private _context: ViewContext;
	private _domNode: FastDomNode<HTMLCanvasElement>;
	private _zoneManager: OverviewZoneManager;

	constructor(context: ViewContext, cssClassName: string) {
		super();
		this._context = context;

		this._domNode = createFastDomNode(document.createElement('canvas'));
		this._domNode.setClassName(cssClassName);
		this._domNode.setPosition('absolute');
		this._domNode.setLayerHinting(true);

		this._zoneManager = new OverviewZoneManager((lineNumber: number) => this._context.viewLayout.getVerticalOffsetForLineNumber(lineNumber));
		this._zoneManager.setDOMWidth(0);
		this._zoneManager.setDOMHeight(0);
		this._zoneManager.setOuterHeight(this._context.viewLayout.getScrollHeight());
		this._zoneManager.setLineHeight(this._context.configuration.editor.lineHeight);

		this._zoneManager.setPixelRatio(this._context.configuration.editor.pixelRatio);

		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		super.dispose();
	}

	// ---- begin view event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._zoneManager.setLineHeight(this._context.configuration.editor.lineHeight);
			this._render();
		}

		if (e.pixelRatio) {
			this._zoneManager.setPixelRatio(this._context.configuration.editor.pixelRatio);
			this._domNode.setWidth(this._zoneManager.getDOMWidth());
			this._domNode.setHeight(this._zoneManager.getDOMHeight());
			this._domNode.domNode.width = this._zoneManager.getCanvasWidth();
			this._domNode.domNode.height = this._zoneManager.getCanvasHeight();
			this._render();
		}

		return true;
	}
	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		this._render();
		return true;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		if (e.scrollHeightChanged) {
			this._zoneManager.setOuterHeight(e.scrollHeight);
			this._render();
		}
		return true;
	}
	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		this._render();
		return true;
	}

	// ---- end view event handlers

	public getDomNode(): HTMLElement {
		return this._domNode.domNode;
	}

	public setLayout(position: OverviewRulerPosition): void {
		this._domNode.setTop(position.top);
		this._domNode.setRight(position.right);

		let hasChanged = false;
		hasChanged = this._zoneManager.setDOMWidth(position.width) || hasChanged;
		hasChanged = this._zoneManager.setDOMHeight(position.height) || hasChanged;

		if (hasChanged) {
			this._domNode.setWidth(this._zoneManager.getDOMWidth());
			this._domNode.setHeight(this._zoneManager.getDOMHeight());
			this._domNode.domNode.width = this._zoneManager.getCanvasWidth();
			this._domNode.domNode.height = this._zoneManager.getCanvasHeight();

			this._render();
		}
	}

	public setZones(zones: OverviewRulerZone[]): void {
		this._zoneManager.setZones(zones);
		this._render();
	}

	private _render(): boolean {
		if (this._zoneManager.getOuterHeight() === 0) {
			return false;
		}

		const width = this._zoneManager.getCanvasWidth();
		const height = this._zoneManager.getCanvasHeight();

		let colorZones = this._zoneManager.resolveColorZones();
		let id2Color = this._zoneManager.getId2Color();

		let ctx = this._domNode.domNode.getContext('2d')!;
		ctx.clearRect(0, 0, width, height);
		if (colorZones.length > 0) {
			this._renderOneLane(ctx, colorZones, id2Color, width);
		}

		return true;
	}

	private _renderOneLane(ctx: CanvasRenderingContext2D, colorZones: ColorZone[], id2Color: string[], width: number): void {

		let currentColorId = 0;
		let currentFrom = 0;
		let currentTo = 0;

		for (let i = 0, len = colorZones.length; i < len; i++) {
			const zone = colorZones[i];

			const zoneColorId = zone.colorId;
			const zoneFrom = zone.from;
			const zoneTo = zone.to;

			if (zoneColorId !== currentColorId) {
				ctx.fillRect(0, currentFrom, width, currentTo - currentFrom);

				currentColorId = zoneColorId;
				ctx.fillStyle = id2Color[currentColorId];
				currentFrom = zoneFrom;
				currentTo = zoneTo;
			} else {
				if (currentTo >= zoneFrom) {
					currentTo = Math.max(currentTo, zoneTo);
				} else {
					ctx.fillRect(0, currentFrom, width, currentTo - currentFrom);
					currentFrom = zoneFrom;
					currentTo = zoneTo;
				}
			}
		}

		ctx.fillRect(0, currentFrom, width, currentTo - currentFrom);

	}
}
