/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as browser from 'vs/base/browser/browser';
import {StyleMutator} from 'vs/base/browser/styleMutator';
import {IOverviewRulerPosition, OverviewRulerLane} from 'vs/editor/common/editorCommon';
import {OverviewRulerZone, ColorZone} from 'vs/editor/browser/editorBrowser';

class ZoneManager {

	private _getVerticalOffsetForLine:(lineNumber:number)=>number;
	private _zones: OverviewRulerZone[];
	private _colorZonesInvalid: boolean;
	private _lineHeight: number;
	private _width: number;
	private _height: number;
	private _outerHeight: number;
	private _maximumHeight: number;
	private _minimumHeight: number;
	private _useDarkColor: boolean;

	private _lastAssignedId;
	private _color2Id: { [color:string]: number; };
	private _id2Color: string[];

	constructor(getVerticalOffsetForLine:(lineNumber:number)=>number) {
		this._getVerticalOffsetForLine = getVerticalOffsetForLine;
		this._zones = [];
		this._colorZonesInvalid = false;
		this._lineHeight = 0;
		this._width = 0;
		this._height = 0;
		this._outerHeight = 0;
		this._maximumHeight = 0;
		this._minimumHeight = 0;
		this._useDarkColor = false;

		this._lastAssignedId = 0;
		this._color2Id = Object.create(null);
		this._id2Color = [];
	}

	public getId2Color(): string[] {
		return this._id2Color;
	}

	public setZones(newZones: OverviewRulerZone[]): void {
		newZones.sort((a, b) => a.compareTo(b));

		let oldZones = this._zones;
		let oldIndex = 0;
		let oldLength = this._zones.length;
		let newIndex = 0;
		let newLength = newZones.length;

		let result: OverviewRulerZone[] = [];
		while (newIndex < newLength) {
			let newZone = newZones[newIndex];

			if (oldIndex >= oldLength) {
				result.push(newZone);
				newIndex++;
			} else {
				let oldZone = oldZones[oldIndex];
				let cmp = oldZone.compareTo(newZone);
				if (cmp < 0) {
					oldIndex++;
				} else if (cmp > 0) {
					result.push(newZone);
					newIndex++;
				} else {
					// cmp === 0
					result.push(oldZone);
					oldIndex++;
					newIndex++;
				}
			}
		}

		this._zones = result;
	}

	public setLineHeight(lineHeight:number): boolean {
		if (this._lineHeight === lineHeight) {
			return false;
		}
		this._lineHeight = lineHeight;
		this._colorZonesInvalid = true;
		return true;
	}

	public getWidth(): number {
		return this._width;
	}

	public setWidth(width:number): boolean {
		if (this._width === width) {
			return false;
		}
		this._width = width;
		this._colorZonesInvalid = true;
		return true;
	}

	public getHeight(): number {
		return this._height;
	}

	public setHeight(height:number): boolean {
		if (this._height === height) {
			return false;
		}
		this._height = height;
		this._colorZonesInvalid = true;
		return true;
	}

	public getOuterHeight(): number {
		return this._outerHeight;
	}

	public setOuterHeight(outerHeight:number): boolean {
		if (this._outerHeight === outerHeight) {
			return false;
		}
		this._outerHeight = outerHeight;
		this._colorZonesInvalid = true;
		return true;
	}

	public setMaximumHeight(maximumHeight:number): boolean {
		if (this._maximumHeight === maximumHeight) {
			return false;
		}
		this._maximumHeight = maximumHeight;
		this._colorZonesInvalid = true;
		return true;
	}

	public setMinimumHeight(minimumHeight:number): boolean {
		if (this._minimumHeight === minimumHeight) {
			return false;
		}
		this._minimumHeight = minimumHeight;
		this._colorZonesInvalid = true;
		return true;
	}

	public setUseDarkColor(useDarkColor:boolean): boolean {
		if (this._useDarkColor === useDarkColor) {
			return false;
		}
		this._useDarkColor = useDarkColor;
		this._colorZonesInvalid = true;
		return true;
	}

	public resolveColorZones(): ColorZone[] {
		const colorZonesInvalid = this._colorZonesInvalid;
		const lineHeight = Math.floor(this._lineHeight); // @perf
		const totalHeight = Math.floor(this._height); // @perf
		const maximumHeight = Math.floor(this._maximumHeight); // @perf
		const minimumHeight = Math.floor(this._minimumHeight); // @perf
		const useDarkColor = this._useDarkColor; // @perf
		const outerHeight = Math.floor(this._outerHeight); // @perf
		const heightRatio = totalHeight / outerHeight;

		let allColorZones: ColorZone[] = [];
		for (let i = 0, len = this._zones.length; i < len; i++) {
			let zone = this._zones[i];

			if (!colorZonesInvalid) {
				let colorZones = zone.getColorZones();
				if (colorZones) {
					for (let j = 0, lenJ = colorZones.length; j < lenJ; j++) {
						allColorZones.push(colorZones[j]);
					}
					continue;
				}
			}

			let y1 = Math.floor(this._getVerticalOffsetForLine(zone.startLineNumber));
			let y2 = Math.floor(this._getVerticalOffsetForLine(zone.endLineNumber)) + lineHeight;

			y1 = Math.floor(y1 * heightRatio);
			y2 = Math.floor(y2 * heightRatio);

			let colorZones: ColorZone[] = [];
			if (zone.forceHeight) {
				y2 = y1 + zone.forceHeight;
				colorZones.push(this.createZone(totalHeight, y1, y2, zone.forceHeight, zone.forceHeight, zone.getColor(useDarkColor), zone.position));
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

						colorZones.push(this.createZone(totalHeight, y1, y2, minimumHeight, maximumHeight, zone.getColor(useDarkColor), zone.position));
					}
				} else {
					colorZones.push(this.createZone(totalHeight, y1, y2, minimumHeight, zoneMaximumHeight, zone.getColor(useDarkColor), zone.position));
				}
			}

			zone.setColorZones(colorZones);
			for (let j = 0, lenJ = colorZones.length; j < lenJ; j++) {
				allColorZones.push(colorZones[j]);
			}
		}

		this._colorZonesInvalid = false;

		let sortFunc = (a:ColorZone, b:ColorZone) => {
			if (a.colorId === b.colorId) {
				if (a.from === b.from) {
					return a.to - b.to;
				}
				return a.from - b.from;
			}
			return a.colorId - b.colorId;
		};

		allColorZones.sort(sortFunc);
		return allColorZones;
	}

	public createZone(totalHeight:number, y1:number, y2:number, minimumHeight:number, maximumHeight:number, color:string, position:OverviewRulerLane): ColorZone {
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

		let colorId = this._color2Id[color];
		if (!colorId) {
			colorId = (++this._lastAssignedId);
			this._color2Id[color] = colorId;
			this._id2Color[colorId] = color;
		}
		return new ColorZone(ycenter - halfHeight, ycenter + halfHeight, colorId, position);
	}
}

export class OverviewRulerImpl {

	public static hasCanvas = (window.navigator.userAgent.indexOf('MSIE 8') === -1);

	private _canvasLeftOffset: number;
	private _domNode: HTMLCanvasElement;
	private _lanesCount:number;
	private _zoneManager: ZoneManager;

	constructor(canvasLeftOffset:number, cssClassName:string, scrollHeight:number, lineHeight:number, minimumHeight:number, maximumHeight:number, getVerticalOffsetForLine:(lineNumber:number)=>number) {
		this._canvasLeftOffset = canvasLeftOffset;

		this._domNode = <HTMLCanvasElement>document.createElement('canvas');
		this._domNode.className = cssClassName;
		this._domNode.style.position = 'absolute';

		this._lanesCount = 3;

		this._zoneManager = new ZoneManager(getVerticalOffsetForLine);
		this._zoneManager.setMinimumHeight(minimumHeight);
		this._zoneManager.setMaximumHeight(maximumHeight);
		this._zoneManager.setUseDarkColor(false);
		this._zoneManager.setWidth(0);
		this._zoneManager.setHeight(0);
		this._zoneManager.setOuterHeight(scrollHeight);
		this._zoneManager.setLineHeight(lineHeight);
	}

	public dispose(): void {
		this._zoneManager = null;
	}

	public setLayout(position:IOverviewRulerPosition, render:boolean): void {
		StyleMutator.setTop(this._domNode, position.top);
		StyleMutator.setRight(this._domNode, position.right);

		let hasChanged = false;
		hasChanged = this._zoneManager.setWidth(position.width) || hasChanged;
		hasChanged = this._zoneManager.setHeight(position.height) || hasChanged;

		if (hasChanged) {
			this._domNode.width = this._zoneManager.getWidth();
			this._domNode.height = this._zoneManager.getHeight();

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
		this._zoneManager.setUseDarkColor(useDarkColor);

		if (render) {
			this.render(true);
		}
	}

	public getDomNode(): HTMLCanvasElement {
		return this._domNode;
	}

	public getWidth(): number {
		return this._zoneManager.getWidth();
	}

	public getHeight(): number {
		return this._zoneManager.getHeight();
	}

	public setScrollHeight(scrollHeight:number, render:boolean): void {
		this._zoneManager.setOuterHeight(scrollHeight);
		if (render) {
			this.render(true);
		}
	}

	public setLineHeight(lineHeight:number, render:boolean): void {
		this._zoneManager.setLineHeight(lineHeight);
		if (render) {
			this.render(true);
		}
	}

	public setZones(zones:OverviewRulerZone[], render:boolean): void {
		this._zoneManager.setZones(zones);
		if (render) {
			this.render(false);
		}
	}

	public render(forceRender:boolean): boolean {
		if (!OverviewRulerImpl.hasCanvas) {
			return false;
		}
		if (this._zoneManager.getOuterHeight() === 0) {
			return false;
		}
		if (browser.canUseTranslate3d) {
			StyleMutator.setTransform(this._domNode, 'translate3d(0px, 0px, 0px)');
		} else {
			StyleMutator.setTransform(this._domNode, '');
		}

		const width = this._zoneManager.getWidth();
		const height = this._zoneManager.getHeight();

		let colorZones = this._zoneManager.resolveColorZones();
		let id2Color = this._zoneManager.getId2Color();

		let ctx = this._domNode.getContext('2d');
		ctx.clearRect (0, 0, width, height);

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

	private _renderOneLane(ctx:CanvasRenderingContext2D, colorZones:ColorZone[], id2Color:string[], w:number): void {

		this._renderVerticalPatch(ctx, colorZones, id2Color, OverviewRulerLane.Left | OverviewRulerLane.Center | OverviewRulerLane.Right, this._canvasLeftOffset, w);

	}

	private _renderTwoLanes(ctx:CanvasRenderingContext2D, colorZones:ColorZone[], id2Color:string[], w:number): void {

		let leftWidth = Math.floor(w / 2);
		let rightWidth = w - leftWidth;
		let leftOffset = this._canvasLeftOffset;
		let rightOffset = this._canvasLeftOffset + leftWidth;

		this._renderVerticalPatch(ctx, colorZones, id2Color, OverviewRulerLane.Left | OverviewRulerLane.Center, leftOffset, leftWidth);
		this._renderVerticalPatch(ctx, colorZones, id2Color, OverviewRulerLane.Right, rightOffset, rightWidth);
	}

	private _renderThreeLanes(ctx:CanvasRenderingContext2D, colorZones:ColorZone[], id2Color:string[], w:number): void {

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

	private _renderVerticalPatch(ctx:CanvasRenderingContext2D, colorZones:ColorZone[], id2Color:string[], laneMask:number, xpos:number, width:number): void {

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
				ctx.fillRect (xpos, currentFrom, width, currentTo - currentFrom);

				currentColorId = zoneColorId;
				ctx.fillStyle = id2Color[currentColorId];
				currentFrom = zoneFrom;
				currentTo = zoneTo;
			} else {
				if (currentTo >= zoneFrom) {
					currentTo = Math.max(currentTo, zoneTo);
				} else {
					ctx.fillRect (xpos, currentFrom, width, currentTo - currentFrom);
					currentFrom = zoneFrom;
					currentTo = zoneTo;
				}
			}
		}

		ctx.fillRect (xpos, currentFrom, width, currentTo - currentFrom);

	}
}
