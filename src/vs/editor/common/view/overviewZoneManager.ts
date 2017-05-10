/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { OverviewRulerLane } from 'vs/editor/common/editorCommon';
import { ThemeType, DARK, HIGH_CONTRAST, LIGHT } from 'vs/platform/theme/common/themeService';

export class ColorZone {
	_colorZoneBrand: void;

	from: number;
	to: number;
	colorId: number;
	position: OverviewRulerLane;

	constructor(from: number, to: number, colorId: number, position: OverviewRulerLane) {
		this.from = from | 0;
		this.to = to | 0;
		this.colorId = colorId | 0;
		this.position = position | 0;
	}
}

/**
 * A zone in the overview ruler
 */
export class OverviewRulerZone {
	_overviewRulerZoneBrand: void;

	startLineNumber: number;
	endLineNumber: number;
	position: OverviewRulerLane;
	forceHeight: number;

	private _color: string;
	private _darkColor: string;
	private _hcColor: string;

	private _colorZones: ColorZone[];

	constructor(
		startLineNumber: number, endLineNumber: number,
		position: OverviewRulerLane,
		forceHeight: number,
		color: string, darkColor: string, hcColor: string
	) {
		this.startLineNumber = startLineNumber;
		this.endLineNumber = endLineNumber;
		this.position = position;
		this.forceHeight = forceHeight;
		this._color = color;
		this._darkColor = darkColor;
		this._hcColor = hcColor;
		this._colorZones = null;
	}

	public getColor(themeType: ThemeType): string {
		switch (themeType) {
			case HIGH_CONTRAST:
				return this._hcColor;
			case DARK:
				return this._darkColor;
		}
		return this._color;
	}

	public equals(other: OverviewRulerZone): boolean {
		return (
			this.startLineNumber === other.startLineNumber
			&& this.endLineNumber === other.endLineNumber
			&& this.position === other.position
			&& this.forceHeight === other.forceHeight
			&& this._color === other._color
			&& this._darkColor === other._darkColor
			&& this._hcColor === other._hcColor
		);
	}

	public compareTo(other: OverviewRulerZone): number {
		if (this.startLineNumber === other.startLineNumber) {
			if (this.endLineNumber === other.endLineNumber) {
				if (this.forceHeight === other.forceHeight) {
					if (this.position === other.position) {
						if (this._darkColor === other._darkColor) {
							if (this._color === other._color) {
								if (this._hcColor === other._hcColor) {
									return 0;
								}
								return this._hcColor < other._hcColor ? -1 : 1;
							}
							return this._color < other._color ? -1 : 1;
						}
						return this._darkColor < other._darkColor ? -1 : 1;
					}
					return this.position - other.position;
				}
				return this.forceHeight - other.forceHeight;
			}
			return this.endLineNumber - other.endLineNumber;
		}
		return this.startLineNumber - other.startLineNumber;
	}

	public setColorZones(colorZones: ColorZone[]): void {
		this._colorZones = colorZones;
	}

	public getColorZones(): ColorZone[] {
		return this._colorZones;
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
	private _maximumHeight: number;
	private _minimumHeight: number;
	private _themeType: ThemeType;
	private _pixelRatio: number;

	private _lastAssignedId;
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
		this._maximumHeight = 0;
		this._minimumHeight = 0;
		this._themeType = LIGHT;
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

	public setMaximumHeight(maximumHeight: number): boolean {
		if (this._maximumHeight === maximumHeight) {
			return false;
		}
		this._maximumHeight = maximumHeight;
		this._colorZonesInvalid = true;
		return true;
	}

	public setMinimumHeight(minimumHeight: number): boolean {
		if (this._minimumHeight === minimumHeight) {
			return false;
		}
		this._minimumHeight = minimumHeight;
		this._colorZonesInvalid = true;
		return true;
	}

	public setThemeType(themeType: ThemeType): boolean {
		if (this._themeType === themeType) {
			return false;
		}
		this._themeType = themeType;
		this._colorZonesInvalid = true;
		return true;
	}

	public resolveColorZones(): ColorZone[] {
		const colorZonesInvalid = this._colorZonesInvalid;
		const lineHeight = Math.floor(this._lineHeight); // @perf
		const totalHeight = Math.floor(this.getCanvasHeight()); // @perf
		const maximumHeight = Math.floor(this._maximumHeight * this._pixelRatio); // @perf
		const minimumHeight = Math.floor(this._minimumHeight * this._pixelRatio); // @perf
		const themeType = this._themeType; // @perf
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

			let colorZones: ColorZone[] = [];
			if (zone.forceHeight) {
				let forcedHeight = Math.floor(zone.forceHeight * this._pixelRatio);

				let y1 = Math.floor(this._getVerticalOffsetForLine(zone.startLineNumber));
				y1 = Math.floor(y1 * heightRatio);

				let y2 = y1 + forcedHeight;
				colorZones.push(this.createZone(totalHeight, y1, y2, forcedHeight, forcedHeight, zone.getColor(themeType), zone.position));
			} else {
				let y1 = Math.floor(this._getVerticalOffsetForLine(zone.startLineNumber));
				let y2 = Math.floor(this._getVerticalOffsetForLine(zone.endLineNumber)) + lineHeight;

				y1 = Math.floor(y1 * heightRatio);
				y2 = Math.floor(y2 * heightRatio);

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

						colorZones.push(this.createZone(totalHeight, y1, y2, minimumHeight, maximumHeight, zone.getColor(themeType), zone.position));
					}
				} else {
					colorZones.push(this.createZone(totalHeight, y1, y2, minimumHeight, zoneMaximumHeight, zone.getColor(themeType), zone.position));
				}
			}

			zone.setColorZones(colorZones);
			for (let j = 0, lenJ = colorZones.length; j < lenJ; j++) {
				allColorZones.push(colorZones[j]);
			}
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

	public createZone(totalHeight: number, y1: number, y2: number, minimumHeight: number, maximumHeight: number, color: string, position: OverviewRulerLane): ColorZone {
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
