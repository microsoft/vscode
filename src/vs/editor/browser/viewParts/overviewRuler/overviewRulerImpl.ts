/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as browser from 'vs/base/browser/browser';
import {StyleMutator} from 'vs/base/browser/styleMutator';
import {IOverviewRulerPosition, OverviewRulerLane} from 'vs/editor/common/editorCommon';
import {IOverviewRulerZone} from 'vs/editor/browser/editorBrowser';

interface IColorZone {
	from: number;
	to: number;
}

interface IColorZoneMap {
	[color:string]:IColorZone[];
}

function zoneEquals(a:IOverviewRulerZone, b:IOverviewRulerZone): boolean {
	return (
		a.startLineNumber === b.startLineNumber
		&& a.endLineNumber === b.endLineNumber
		&& a.forceHeight === b.forceHeight
		&& a.color === b.color
		&& a.position === b.position
	);
}

function zonesEqual(a:IOverviewRulerZone[], b:IOverviewRulerZone[]): boolean {
	if (a === b) {
		return true;
	}
	if (a.length !== b.length) {
		return false;
	}
	for (var i = 0, len = a.length; i < len; i++) {
		if (!zoneEquals(a[i], b[i])) {
			return false;
		}
	}
	return true;
}

export class OverviewRulerImpl {

	public static hasCanvas = (window.navigator.userAgent.indexOf('MSIE 8') === -1);

	// Protected
	private _minimumHeight: number;
	private _maximumHeight: number;
	private _getVerticalOffsetForLine:(lineNumber:number)=>number;
	private _zones:IOverviewRulerZone[];
	private _renderedZones:IOverviewRulerZone[];
	private _canvasLeftOffset: number;

	private _domNode: HTMLCanvasElement;
	private _width:number;
	private _height:number;
	private _outerHeight:number;
	private _lineHeight:number;
	private _lanesCount:number;
	private _useDarkColor:boolean;

	constructor(canvasLeftOffset:number, cssClassName:string, scrollHeight:number, lineHeight:number, minimumHeight:number, maximumHeight:number, getVerticalOffsetForLine:(lineNumber:number)=>number) {
		this._canvasLeftOffset = canvasLeftOffset;
		this._minimumHeight = minimumHeight;
		this._maximumHeight = maximumHeight;
		this._getVerticalOffsetForLine = getVerticalOffsetForLine;
		this._zones = [];
		this._renderedZones = [];
		this._useDarkColor = false;


		this._domNode = <HTMLCanvasElement>document.createElement('canvas');
		this._domNode.className = cssClassName;
		this._domNode.style.position = 'absolute';
		if (browser.canUseTranslate3d) {
			this._domNode.style.transform = 'translate3d(0px, 0px, 0px)';
		}

		this._width = 0;
		this._height = 0;
		this._outerHeight = scrollHeight;
		this._lineHeight = lineHeight;
		this._lanesCount = 3;
	}

	public dispose(): void {
		this._zones = [];
	}

	public setLayout(position:IOverviewRulerPosition, render:boolean): void {
		StyleMutator.setTop(this._domNode, position.top);
		StyleMutator.setRight(this._domNode, position.right);

		if (this._width !== position.width || this._height !== position.height) {
			this._width = position.width;
			this._height = position.height;
			this._domNode.width = this._width;
			this._domNode.height = this._height;

			if (render) {
				this.render(true);
			}
		}
	}

	public getLanesCount(): number {
		return this._lanesCount;
	}

	public setLanesCount(newLanesCount:number, render:boolean): void {
		this._lanesCount = newLanesCount;

		if (render) {
			this.render(true);
		}
	}

	public setUseDarkColor(useDarkColor:boolean, render:boolean): void {
		this._useDarkColor = useDarkColor;

		if (render) {
			this.render(true);
		}
	}

	public getDomNode(): HTMLCanvasElement {
		return this._domNode;
	}

	public getWidth(): number {
		return this._width;
	}

	public getHeight(): number {
		return this._height;
	}

	public setScrollHeight(scrollHeight:number, render:boolean): void {
		this._outerHeight = scrollHeight;
		if (render) {
			this.render(true);
		}
	}

	public setLineHeight(lineHeight:number, render:boolean): void {
		this._lineHeight = lineHeight;
		if (render) {
			this.render(true);
		}
	}

	public setZones(zones:IOverviewRulerZone[], render:boolean): void {
		this._zones = zones;
		if (render) {
			this.render(false);
		}
	}

	private _insertZone(colorsZones:IColorZoneMap, y1:number, y2:number, minimumHeight:number, maximumHeight:number, color:string): void {
		var ycenter = Math.floor((y1 + y2) / 2);
		var halfHeight = (y2 - ycenter);


		if (halfHeight > maximumHeight / 2) {
			halfHeight = maximumHeight / 2;
		}
		if (halfHeight < minimumHeight / 2) {
			halfHeight = minimumHeight / 2;
		}

		if (ycenter - halfHeight < 0) {
			ycenter = halfHeight;
		}
		if (ycenter + halfHeight > this._height) {
			ycenter = this._height - halfHeight;
		}

		colorsZones[color] = colorsZones[color] || [];
		colorsZones[color].push({
			from: ycenter - halfHeight,
			to: ycenter + halfHeight
		});
	}

	private _getColorForZone(zone:IOverviewRulerZone): string {
		if (this._useDarkColor) {
			return zone.darkColor;
		}
		return zone.color;
	}

	private _renderVerticalPatch(ctx:CanvasRenderingContext2D, heightRatio:number, laneMask:number, xpos:number, width:number): void {
		var colorsZones:IColorZoneMap = {};
		var i:number, len:number, zone:IOverviewRulerZone, y1:number, y2:number, zoneLineNumbers:number, zoneMaximumHeight:number;
		for (i = 0, len = this._zones.length; i < len; i++) {
			zone = this._zones[i];

			if (!(zone.position & laneMask)) {
				continue;
			}

			y1 = this._getVerticalOffsetForLine(zone.startLineNumber);
			y2 = this._getVerticalOffsetForLine(zone.endLineNumber) + this._lineHeight;

			y1 *= heightRatio;
			y2 *= heightRatio;

			if (zone.forceHeight) {
				y2 = y1 + zone.forceHeight;
				this._insertZone(colorsZones, y1, y2, zone.forceHeight, zone.forceHeight, this._getColorForZone(zone));
			} else {
				// Figure out if we can render this in one continuous zone
				zoneLineNumbers = zone.endLineNumber - zone.startLineNumber + 1;
				zoneMaximumHeight = zoneLineNumbers * this._maximumHeight;

				if (y2 - y1 > zoneMaximumHeight) {
					// We need to draw one zone per line
					for (var lineNumber = zone.startLineNumber; lineNumber <= zone.endLineNumber; lineNumber++) {
						y1 = this._getVerticalOffsetForLine(lineNumber);
						y2 = y1 + this._lineHeight;

						y1 *= heightRatio;
						y2 *= heightRatio;

						this._insertZone(colorsZones, y1, y2, this._minimumHeight, this._maximumHeight, this._getColorForZone(zone));
					}
				} else {
					this._insertZone(colorsZones, y1, y2, this._minimumHeight, zoneMaximumHeight, this._getColorForZone(zone));
				}
			}

		}

		var sorter = (a:IColorZone, b:IColorZone) => {
			return a.from - b.from;
		};

		// Merge color zones
		var colorName:string, colorZones:IColorZone[], currentFrom:number, currentTo:number;
		for (colorName in colorsZones) {
			if (colorsZones.hasOwnProperty(colorName)) {
				colorZones = colorsZones[colorName];

				// Merge & Render zones
				colorZones.sort(sorter);
				currentFrom = colorZones[0].from;
				currentTo = colorZones[0].to;
				ctx.fillStyle = colorName;
				for (i = 1, len = colorZones.length; i < len; i++) {
					if (currentTo >= colorZones[i].from) {
						currentTo = Math.max(currentTo, colorZones[i].to);
					} else {
						ctx.fillRect (xpos, currentFrom, width, currentTo - currentFrom);
						currentFrom = colorZones[i].from;
						currentTo = colorZones[i].to;
					}
				}
				ctx.fillRect (xpos, currentFrom, width, currentTo - currentFrom);
			}
		}
	}

	public render(forceRender:boolean): boolean {
		if (this._outerHeight === 0) {
			return false;
		}
		if (!OverviewRulerImpl.hasCanvas) {
			return false;
		}
		var shouldRender = forceRender || !zonesEqual(this._renderedZones, this._zones);
		if (shouldRender) {
			var heightRatio = this._height / this._outerHeight;

			var ctx = this._domNode.getContext('2d');
			ctx.clearRect (0, 0, this._width, this._height);

			var remainingWidth = this._width - this._canvasLeftOffset;

			if (this._lanesCount >= 3) {
				this._renderThreeLanes(ctx, heightRatio, remainingWidth);
			} else if (this._lanesCount === 2) {
				this._renderTwoLanes(ctx, heightRatio, remainingWidth);
			} else if (this._lanesCount === 1) {
				this._renderOneLane(ctx, heightRatio, remainingWidth);
			}
		}
		this._renderedZones = this._zones;
		return shouldRender;
	}

	private _renderOneLane(ctx:CanvasRenderingContext2D, heightRatio:number, w:number): void {

		this._renderVerticalPatch(ctx, heightRatio, OverviewRulerLane.Left | OverviewRulerLane.Center | OverviewRulerLane.Right, this._canvasLeftOffset, w);

	}

	private _renderTwoLanes(ctx:CanvasRenderingContext2D, heightRatio:number, w:number): void {

		var leftWidth = Math.floor(w / 2),
			rightWidth = w - leftWidth,
			leftOffset = this._canvasLeftOffset,
			rightOffset = this._canvasLeftOffset + leftWidth;

		this._renderVerticalPatch(ctx, heightRatio, OverviewRulerLane.Left | OverviewRulerLane.Center, leftOffset, leftWidth);
		this._renderVerticalPatch(ctx, heightRatio, OverviewRulerLane.Right, rightOffset, rightWidth);
	}

	private _renderThreeLanes(ctx:CanvasRenderingContext2D, heightRatio:number, w:number): void {

		var leftWidth = Math.floor(w / 3),
			rightWidth = Math.floor(w / 3),
			centerWidth = w - leftWidth - rightWidth,
			leftOffset = this._canvasLeftOffset,
			centerOffset = this._canvasLeftOffset + leftWidth,
			rightOffset = this._canvasLeftOffset + leftWidth + centerWidth;

		this._renderVerticalPatch(ctx, heightRatio, OverviewRulerLane.Left, leftOffset, leftWidth);
		this._renderVerticalPatch(ctx, heightRatio, OverviewRulerLane.Center, centerOffset, centerWidth);
		this._renderVerticalPatch(ctx, heightRatio, OverviewRulerLane.Right, rightOffset, rightWidth);
	}
}
