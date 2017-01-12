/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { StyleMutator } from 'vs/base/browser/styleMutator';
import { OverviewRulerPosition, OverviewRulerLane, OverviewRulerZone, ColorZone } from 'vs/editor/common/editorCommon';
import { IDisposable } from 'vs/base/common/lifecycle';
import * as browser from 'vs/base/browser/browser';
import { OverviewZoneManager } from 'vs/editor/common/view/overviewZoneManager';

export class OverviewRulerImpl {

	private _canvasLeftOffset: number;
	private _domNode: HTMLCanvasElement;
	private _lanesCount: number;
	private _zoneManager: OverviewZoneManager;
	private _canUseTranslate3d: boolean;

	private _zoomListener: IDisposable;

	constructor(canvasLeftOffset: number, cssClassName: string, scrollHeight: number, lineHeight: number, canUseTranslate3d: boolean, minimumHeight: number, maximumHeight: number, getVerticalOffsetForLine: (lineNumber: number) => number) {
		this._canvasLeftOffset = canvasLeftOffset;

		this._domNode = <HTMLCanvasElement>document.createElement('canvas');

		this._domNode.className = cssClassName;
		this._domNode.style.position = 'absolute';

		this._lanesCount = 3;

		this._canUseTranslate3d = canUseTranslate3d;

		this._zoneManager = new OverviewZoneManager(getVerticalOffsetForLine);
		this._zoneManager.setMinimumHeight(minimumHeight);
		this._zoneManager.setMaximumHeight(maximumHeight);
		this._zoneManager.setUseDarkColor(false);
		this._zoneManager.setDOMWidth(0);
		this._zoneManager.setDOMHeight(0);
		this._zoneManager.setOuterHeight(scrollHeight);
		this._zoneManager.setLineHeight(lineHeight);

		this._zoomListener = browser.onDidChangeZoomLevel(() => {
			this._zoneManager.setPixelRatio(browser.getPixelRatio());
			this._domNode.style.width = this._zoneManager.getDOMWidth() + 'px';
			this._domNode.style.height = this._zoneManager.getDOMHeight() + 'px';
			this._domNode.width = this._zoneManager.getCanvasWidth();
			this._domNode.height = this._zoneManager.getCanvasHeight();
			this.render(true);
		});
		this._zoneManager.setPixelRatio(browser.getPixelRatio());
	}

	public dispose(): void {
		this._zoomListener.dispose();
		this._zoneManager = null;
	}

	public setLayout(position: OverviewRulerPosition, render: boolean): void {
		StyleMutator.setTop(this._domNode, position.top);
		StyleMutator.setRight(this._domNode, position.right);

		let hasChanged = false;
		hasChanged = this._zoneManager.setDOMWidth(position.width) || hasChanged;
		hasChanged = this._zoneManager.setDOMHeight(position.height) || hasChanged;

		if (hasChanged) {
			this._domNode.style.width = this._zoneManager.getDOMWidth() + 'px';
			this._domNode.style.height = this._zoneManager.getDOMHeight() + 'px';
			this._domNode.width = this._zoneManager.getCanvasWidth();
			this._domNode.height = this._zoneManager.getCanvasHeight();

			if (render) {
				this.render(true);
			}
		}
	}

	public getLanesCount(): number {
		return this._lanesCount;
	}

	public setLanesCount(newLanesCount: number, render: boolean): void {
		this._lanesCount = newLanesCount;

		if (render) {
			this.render(true);
		}
	}

	public setUseDarkColor(useDarkColor: boolean, render: boolean): void {
		this._zoneManager.setUseDarkColor(useDarkColor);

		if (render) {
			this.render(true);
		}
	}

	public getDomNode(): HTMLCanvasElement {
		return this._domNode;
	}

	public getPixelWidth(): number {
		return this._zoneManager.getCanvasWidth();
	}

	public getPixelHeight(): number {
		return this._zoneManager.getCanvasHeight();
	}

	public setScrollHeight(scrollHeight: number, render: boolean): void {
		this._zoneManager.setOuterHeight(scrollHeight);
		if (render) {
			this.render(true);
		}
	}

	public setLineHeight(lineHeight: number, render: boolean): void {
		this._zoneManager.setLineHeight(lineHeight);
		if (render) {
			this.render(true);
		}
	}

	public setCanUseTranslate3d(canUseTranslate3d: boolean, render: boolean): void {
		this._canUseTranslate3d = canUseTranslate3d;
		if (render) {
			this.render(true);
		}
	}

	public setZones(zones: OverviewRulerZone[], render: boolean): void {
		this._zoneManager.setZones(zones);
		if (render) {
			this.render(false);
		}
	}

	public render(forceRender: boolean): boolean {
		if (this._zoneManager.getOuterHeight() === 0) {
			return false;
		}
		if (this._canUseTranslate3d) {
			StyleMutator.setTransform(this._domNode, 'translate3d(0px, 0px, 0px)');
		} else {
			StyleMutator.setTransform(this._domNode, '');
		}

		const width = this._zoneManager.getCanvasWidth();
		const height = this._zoneManager.getCanvasHeight();

		let colorZones = this._zoneManager.resolveColorZones();
		let id2Color = this._zoneManager.getId2Color();

		let ctx = this._domNode.getContext('2d');
		ctx.clearRect(0, 0, width, height);

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
