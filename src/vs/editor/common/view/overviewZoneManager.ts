/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { OverviewRulerLane } from 'vs/editor/common/editorCommon';
import { ThemeType } from 'vs/platform/theme/common/themeService';

const enum Constants {
	MINIMUM_HEIGHT = 4
}

export class ColorZone {
	_colorZoneBrand: void;

	from: number;
	to: number;
	colorId: number;
	position: OverviewRulerLane;

	constructor(from: number, to: number, colorId: number) {
		this.from = from | 0;
		this.to = to | 0;
		this.colorId = colorId | 0;
		this.position = OverviewRulerLane.Full;
	}
}

/**
 * A zone in the overview ruler
 */
export class OverviewRulerZone {
	_overviewRulerZoneBrand: void;

	public readonly startLineNumber: number;
	public readonly endLineNumber: number;
	public readonly color: string;

	private _colorZone: ColorZone;

	constructor(
		startLineNumber: number,
		endLineNumber: number,
		color: string
	) {
		this.startLineNumber = startLineNumber;
		this.endLineNumber = endLineNumber;
		this.color = color;
		this._colorZone = null;
	}

	public getColor(themeType: ThemeType): string {
		return this.color;
	}

	public compareTo(other: OverviewRulerZone): number {
		if (this.startLineNumber === other.startLineNumber) {
			if (this.endLineNumber === other.endLineNumber) {
				if (this.color === other.color) {
					return 0;
				}
				return this.color < other.color ? -1 : 1;
			}
			return this.endLineNumber - other.endLineNumber;
		}
		return this.startLineNumber - other.startLineNumber;
	}

	public setColorZone(colorZone: ColorZone): void {
		this._colorZone = colorZone;
	}

	public getColorZones(): ColorZone {
		return this._colorZone;
	}
}

export class OverviewZoneManager {

	private _getVerticalOffsetForLine: (lineNumber: number) => number;
	private _zones: OverviewRulerZone[];
	private _colorZonesInvalid: boolean;
	private _lineHeight: number;
	private _domWidth: number;
	private _domHeight: number;
	private _outerHeight: number;
	private _pixelRatio: number;

	private _lastAssignedId: number;
	private _color2Id: { [color: string]: number; };
	private _id2Color: string[];

	constructor(getVerticalOffsetForLine: (lineNumber: number) => number) {
		this._getVerticalOffsetForLine = getVerticalOffsetForLine;
		this._zones = [];
		this._colorZonesInvalid = false;
		this._lineHeight = 0;
		this._domWidth = 0;
		this._domHeight = 0;
		this._outerHeight = 0;
		this._pixelRatio = 1;

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

	public setLineHeight(lineHeight: number): boolean {
		if (this._lineHeight === lineHeight) {
			return false;
		}
		this._lineHeight = lineHeight;
		this._colorZonesInvalid = true;
		return true;
	}

	public setPixelRatio(pixelRatio: number): void {
		this._pixelRatio = pixelRatio;
		this._colorZonesInvalid = true;
	}

	public getDOMWidth(): number {
		return this._domWidth;
	}

	public getCanvasWidth(): number {
		return this._domWidth * this._pixelRatio;
	}

	public setDOMWidth(width: number): boolean {
		if (this._domWidth === width) {
			return false;
		}
		this._domWidth = width;
		this._colorZonesInvalid = true;
		return true;
	}

	public getDOMHeight(): number {
		return this._domHeight;
	}

	public getCanvasHeight(): number {
		return this._domHeight * this._pixelRatio;
	}

	public setDOMHeight(height: number): boolean {
		if (this._domHeight === height) {
			return false;
		}
		this._domHeight = height;
		this._colorZonesInvalid = true;
		return true;
	}

	public getOuterHeight(): number {
		return this._outerHeight;
	}

	public setOuterHeight(outerHeight: number): boolean {
		if (this._outerHeight === outerHeight) {
			return false;
		}
		this._outerHeight = outerHeight;
		this._colorZonesInvalid = true;
		return true;
	}

	public resolveColorZones(): ColorZone[] {
		const colorZonesInvalid = this._colorZonesInvalid;
		const lineHeight = Math.floor(this._lineHeight); // @perf
		const totalHeight = Math.floor(this.getCanvasHeight()); // @perf
		const outerHeight = Math.floor(this._outerHeight); // @perf
		const heightRatio = totalHeight / outerHeight;

		let allColorZones: ColorZone[] = [];
		for (let i = 0, len = this._zones.length; i < len; i++) {
			const zone = this._zones[i];

			if (!colorZonesInvalid) {
				const colorZone = zone.getColorZones();
				if (colorZone) {
					allColorZones.push(colorZone);
					continue;
				}
			}

			const y1 = Math.floor(heightRatio * (this._getVerticalOffsetForLine(zone.startLineNumber)));
			const y2 = Math.floor(heightRatio * (this._getVerticalOffsetForLine(zone.endLineNumber) + lineHeight));

			let ycenter = Math.floor((y1 + y2) / 2);
			let halfHeight = (y2 - ycenter);

			if (halfHeight < Constants.MINIMUM_HEIGHT / 2) {
				halfHeight = Constants.MINIMUM_HEIGHT / 2;
			}

			if (ycenter - halfHeight < 0) {
				ycenter = halfHeight;
			}
			if (ycenter + halfHeight > totalHeight) {
				ycenter = totalHeight - halfHeight;
			}

			const color = zone.color;
			let colorId = this._color2Id[color];
			if (!colorId) {
				colorId = (++this._lastAssignedId);
				this._color2Id[color] = colorId;
				this._id2Color[colorId] = color;
			}
			const colorZone = new ColorZone(ycenter - halfHeight, ycenter + halfHeight, colorId);

			zone.setColorZone(colorZone);
			allColorZones.push(colorZone);
		}

		this._colorZonesInvalid = false;

		let sortFunc = (a: ColorZone, b: ColorZone) => {
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
}
