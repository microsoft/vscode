/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { IOverviewRuler } from 'vs/editor/browser/editorBrowser';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { OverviewRulerPosition } from 'vs/editor/common/config/editorOptions';
import { OverviewRulerZone, OverviewZoneManager, ColorZone } from 'vs/editor/common/view/overviewZoneManager';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { Color } from 'vs/base/common/color';
import { LIGHT } from 'vs/platform/theme/common/themeService';
import { OverviewRulerLane } from 'vs/editor/common/editorCommon';

export class OverviewRuler extends ViewEventHandler implements IOverviewRuler {

	private _context: ViewContext;
	private _canvasLeftOffset: number;
	private _domNode: FastDomNode<HTMLCanvasElement>;
	private _lanesCount: number;
	private _zoneManager: OverviewZoneManager;
	private _background: Color;

	constructor(context: ViewContext, cssClassName: string, minimumHeight: number, maximumHeight: number) {
		super();
		this._context = context;

		this._canvasLeftOffset = 0;

		this._domNode = createFastDomNode(document.createElement('canvas'));
		this._domNode.setClassName(cssClassName);
		this._domNode.setPosition('absolute');
		this._domNode.setLayerHinting(true);

		this._lanesCount = 3;

		this._background = null;

		this._zoneManager = new OverviewZoneManager((lineNumber: number) => this._context.viewLayout.getVerticalOffsetForLineNumber(lineNumber));
		this._zoneManager.setMinimumHeight(minimumHeight);
		this._zoneManager.setMaximumHeight(maximumHeight);
		this._zoneManager.setThemeType(LIGHT);
		this._zoneManager.setDOMWidth(0);
		this._zoneManager.setDOMHeight(0);
		this._zoneManager.setOuterHeight(this._context.viewLayout.getScrollHeight());
		this._zoneManager.setLineHeight(this._context.configuration.editor.lineHeight);

		this._zoneManager.setPixelRatio(this._context.configuration.editor.pixelRatio);

		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this._zoneManager = null;
		super.dispose();
	}

	// ---- begin view event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._zoneManager.setLineHeight(this._context.configuration.editor.lineHeight);
			this.render(true);
		}

		if (e.pixelRatio) {
			this._zoneManager.setPixelRatio(this._context.configuration.editor.pixelRatio);
			this._domNode.setWidth(this._zoneManager.getDOMWidth());
			this._domNode.setHeight(this._zoneManager.getDOMHeight());
			this._domNode.domNode.width = this._zoneManager.getCanvasWidth();
			this._domNode.domNode.height = this._zoneManager.getCanvasHeight();
			this.render(true);
		}

		return true;
	}

	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return true;
	}

	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this._zoneManager.setOuterHeight(e.scrollHeight);
		this.render(true);
		return super.onScrollChanged(e) || e.scrollHeightChanged;
	}

	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
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

			this.render(true);
		}
	}

	public setZones(zones: OverviewRulerZone[]): void {
		this._zoneManager.setZones(zones);
		this.render(false);
	}

	public render(forceRender: boolean): boolean {
		if (this._zoneManager.getOuterHeight() === 0) {
			return false;
		}

		const width = this._zoneManager.getCanvasWidth();
		const height = this._zoneManager.getCanvasHeight();

		let colorZones = this._zoneManager.resolveColorZones();
		let id2Color = this._zoneManager.getId2Color();

		let ctx = this._domNode.domNode.getContext('2d');
		if (this._background === null) {
			ctx.clearRect(0, 0, width, height);
		} else {
			ctx.fillStyle = Color.Format.CSS.formatHex(this._background);
			ctx.fillRect(0, 0, width, height);
		}

		if (colorZones.length > 0) {
			let remainingWidth = width - this._canvasLeftOffset;

			if (this._lanesCount >= 3) {
				this._renderThreeLanes(ctx, colorZones, id2Color, remainingWidth);
			} else if (this._lanesCount === 2) {
				this._renderTwoLanes(ctx, colorZones, id2Color, remainingWidth);
			} else if (this._lanesCount === 1) {
				this._renderOneLane(ctx, colorZones, id2Color, remainingWidth);
			}
		}

		return true;
	}


	private _renderOneLane(ctx: CanvasRenderingContext2D, colorZones: ColorZone[], id2Color: string[], w: number): void {

		this._renderVerticalPatch(ctx, colorZones, id2Color, OverviewRulerLane.Left | OverviewRulerLane.Center | OverviewRulerLane.Right, this._canvasLeftOffset, w);

	}

	private _renderTwoLanes(ctx: CanvasRenderingContext2D, colorZones: ColorZone[], id2Color: string[], w: number): void {

		let leftWidth = Math.floor(w / 2);
		let rightWidth = w - leftWidth;
		let leftOffset = this._canvasLeftOffset;
		let rightOffset = this._canvasLeftOffset + leftWidth;

		this._renderVerticalPatch(ctx, colorZones, id2Color, OverviewRulerLane.Left | OverviewRulerLane.Center, leftOffset, leftWidth);
		this._renderVerticalPatch(ctx, colorZones, id2Color, OverviewRulerLane.Right, rightOffset, rightWidth);
	}

	private _renderThreeLanes(ctx: CanvasRenderingContext2D, colorZones: ColorZone[], id2Color: string[], w: number): void {

		let leftWidth = Math.floor(w / 3);
		let rightWidth = Math.floor(w / 3);
		let centerWidth = w - leftWidth - rightWidth;
		let leftOffset = this._canvasLeftOffset;
		let centerOffset = this._canvasLeftOffset + leftWidth;
		let rightOffset = this._canvasLeftOffset + leftWidth + centerWidth;

		this._renderVerticalPatch(ctx, colorZones, id2Color, OverviewRulerLane.Left, leftOffset, leftWidth);
		this._renderVerticalPatch(ctx, colorZones, id2Color, OverviewRulerLane.Center, centerOffset, centerWidth);
		this._renderVerticalPatch(ctx, colorZones, id2Color, OverviewRulerLane.Right, rightOffset, rightWidth);
	}

	private _renderVerticalPatch(ctx: CanvasRenderingContext2D, colorZones: ColorZone[], id2Color: string[], laneMask: number, xpos: number, width: number): void {

		let currentColorId = 0;
		let currentFrom = 0;
		let currentTo = 0;

		for (let i = 0, len = colorZones.length; i < len; i++) {
			let zone = colorZones[i];

			if (!(zone.position & laneMask)) {
				continue;
			}

			let zoneColorId = zone.colorId;
			let zoneFrom = zone.from;
			let zoneTo = zone.to;

			if (zoneColorId !== currentColorId) {
				ctx.fillRect(xpos, currentFrom, width, currentTo - currentFrom);

				currentColorId = zoneColorId;
				ctx.fillStyle = id2Color[currentColorId];
				currentFrom = zoneFrom;
				currentTo = zoneTo;
			} else {
				if (currentTo >= zoneFrom) {
					currentTo = Math.max(currentTo, zoneTo);
				} else {
					ctx.fillRect(xpos, currentFrom, width, currentTo - currentFrom);
					currentFrom = zoneFrom;
					currentTo = zoneTo;
				}
			}
		}

		ctx.fillRect(xpos, currentFrom, width, currentTo - currentFrom);

	}
}
