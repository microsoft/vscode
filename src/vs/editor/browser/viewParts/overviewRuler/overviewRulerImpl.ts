/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as browser from 'vs/base/browser/browser';
import {StyleMutator} from 'vs/base/browser/styleMutator';
import {IOverviewRulerPosition, OverviewRulerLane} from 'vs/editor/common/editorCommon';
import {OverviewRulerZone} from 'vs/editor/browser/editorBrowser';

class ColorZone {
	_colorZoneTrait: void;

	from: number;
	to: number;
	color: string;
	colorId: number;

	constructor(from:number, to:number, color:string) {
		this.from = from;
		this.to = to;
		this.color = color;
		this.colorId = 0;
	}
}

function zonesEqual(a:OverviewRulerZone[], b:OverviewRulerZone[]): boolean {
	if (a === b) {
		return true;
	}
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0, len = a.length; i < len; i++) {
		if (!a[i].equals(b[i])) {
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
	private _zones:OverviewRulerZone[];
	private _renderedZones:OverviewRulerZone[];
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

	public setZones(zones:OverviewRulerZone[], render:boolean): void {
		this._zones = zones;
		if (render) {
			this.render(false);
		}
	}

	private static _createZone(totalHeight:number, y1:number, y2:number, minimumHeight:number, maximumHeight:number, color:string): ColorZone {
		totalHeight = Math.floor(totalHeight); // @perf
		y1 = Math.floor(y1); // @perf
		y2 = Math.floor(y2); // @perf
		minimumHeight = Math.floor(minimumHeight); // @perf
		maximumHeight = Math.floor(maximumHeight); // @perf

		let ycenter = Math.floor((y1 + y2) / 2);
		let halfHeight = (y2 - ycenter);


		if (halfHeight > maximumHeight / 2) {
			halfHeight = maximumHeight / 2;
		}
		if (halfHeight < minimumHeight / 2) {
			halfHeight = minimumHeight / 2;
		}

		if (ycenter - halfHeight < 0) {
			ycenter = halfHeight;
		}
		if (ycenter + halfHeight > totalHeight) {
			ycenter = totalHeight - halfHeight;
		}

		return new ColorZone(ycenter - halfHeight, ycenter + halfHeight, color);
	}

	private _renderVerticalPatchPrep(heightRatio:number, laneMask:number): ColorZone[] {
		const lineHeight = Math.floor(this._lineHeight); // @perf
		const totalHeight = Math.floor(this._height); // @perf
		const maximumHeight = Math.floor(this._maximumHeight); // @perf
		const minimumHeight = Math.floor(this._minimumHeight); // @perf
		const useDarkColor = this._useDarkColor; // @perf

		let result: ColorZone[] = [];

		for (let i = 0, len = this._zones.length; i < len; i++) {
			let zone = this._zones[i];

			if (!(zone.position & laneMask)) {
				continue;
			}

			let y1 = Math.floor(this._getVerticalOffsetForLine(zone.startLineNumber));
			let y2 = Math.floor(this._getVerticalOffsetForLine(zone.endLineNumber)) + lineHeight;

			y1 = Math.floor(y1 * heightRatio);
			y2 = Math.floor(y2 * heightRatio);

			if (zone.forceHeight) {
				y2 = y1 + zone.forceHeight;
				result.push(OverviewRulerImpl._createZone(totalHeight, y1, y2, zone.forceHeight, zone.forceHeight, zone.getColor(useDarkColor)));
			} else {
				// Figure out if we can render this in one continuous zone
				let zoneLineNumbers = zone.endLineNumber - zone.startLineNumber + 1;
				let zoneMaximumHeight = zoneLineNumbers * maximumHeight;

				if (y2 - y1 > zoneMaximumHeight) {
					// We need to draw one zone per line
					for (let lineNumber = zone.startLineNumber; lineNumber <= zone.endLineNumber; lineNumber++) {
						y1 = Math.floor(this._getVerticalOffsetForLine(lineNumber));
						y2 = y1 + lineHeight;

						y1 = Math.floor(y1 * heightRatio);
						y2 = Math.floor(y2 * heightRatio);

						result.push(OverviewRulerImpl._createZone(totalHeight, y1, y2, minimumHeight, maximumHeight, zone.getColor(useDarkColor)));
					}
				} else {
					result.push(OverviewRulerImpl._createZone(totalHeight, y1, y2, minimumHeight, zoneMaximumHeight, zone.getColor(useDarkColor)));
				}
			}
		}

		return result;
	}

	private _renderVerticalPatch(ctx:CanvasRenderingContext2D, heightRatio:number, laneMask:number, xpos:number, width:number): void {

		let colorsZones = this._renderVerticalPatchPrep(heightRatio, laneMask);

		if (colorsZones.length === 0) {
			return;
		}

		let lastAssignedId = 0;
		let color2Id: { [color:string]: number; } = Object.create(null);
		let id2Color: string[] = [];
		for (let i = 0, len = colorsZones.length; i < len; i++) {
			let colorZone = colorsZones[i];

			let id = color2Id[colorZone.color];
			if (!id) {
				id = (++lastAssignedId);
				color2Id[colorZone.color] = id;
				id2Color[id] = colorZone.color;
			}

			colorZone.colorId = id;
		}

		let groupedColorZones: ColorZone[][] = [];
		for (let id = 1; id <= lastAssignedId; id++) {
			groupedColorZones[id] = [];
		}

		for (let i = 0, len = colorsZones.length; i < len; i++) {
			let colorZone = colorsZones[i];
			groupedColorZones[colorZone.colorId].push(colorZone);
		}

		OverviewRulerImpl._renderVerticalPatchFinish(ctx, xpos, width, id2Color, groupedColorZones);
	}

	private static _renderVerticalPatchFinish(ctx:CanvasRenderingContext2D, xpos:number, width:number, id2Color: string[], groupedColorZones:ColorZone[][]): void {
		let sorter = (a:ColorZone, b:ColorZone) => {
			return a.from - b.from;
		};

		for (let id = 1, len = groupedColorZones.length; id < len; id++) {
			let colorZones = groupedColorZones[id];
			colorZones.sort(sorter);

			let currentFrom = colorZones[0].from;
			let currentTo = colorZones[0].to;
			ctx.fillStyle = id2Color[id];
			for (let i = 1, len = colorZones.length; i < len; i++) {
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

	public render(forceRender:boolean): boolean {
		if (this._outerHeight === 0) {
			return false;
		}
		if (!OverviewRulerImpl.hasCanvas) {
			return false;
		}
		let shouldRender = forceRender || !zonesEqual(this._renderedZones, this._zones);
		if (shouldRender) {
			let heightRatio = this._height / this._outerHeight;

			let ctx = this._domNode.getContext('2d');
			ctx.clearRect (0, 0, this._width, this._height);

			let remainingWidth = this._width - this._canvasLeftOffset;

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

		let leftWidth = Math.floor(w / 2);
		let rightWidth = w - leftWidth;
		let leftOffset = this._canvasLeftOffset;
		let rightOffset = this._canvasLeftOffset + leftWidth;

		this._renderVerticalPatch(ctx, heightRatio, OverviewRulerLane.Left | OverviewRulerLane.Center, leftOffset, leftWidth);
		this._renderVerticalPatch(ctx, heightRatio, OverviewRulerLane.Right, rightOffset, rightWidth);
	}

	private _renderThreeLanes(ctx:CanvasRenderingContext2D, heightRatio:number, w:number): void {

		let leftWidth = Math.floor(w / 3);
		let rightWidth = Math.floor(w / 3);
		let centerWidth = w - leftWidth - rightWidth;
		let leftOffset = this._canvasLeftOffset;
		let centerOffset = this._canvasLeftOffset + leftWidth;
		let rightOffset = this._canvasLeftOffset + leftWidth + centerWidth;

		this._renderVerticalPatch(ctx, heightRatio, OverviewRulerLane.Left, leftOffset, leftWidth);
		this._renderVerticalPatch(ctx, heightRatio, OverviewRulerLane.Center, centerOffset, centerWidth);
		this._renderVerticalPatch(ctx, heightRatio, OverviewRulerLane.Right, rightOffset, rightWidth);
	}
}
