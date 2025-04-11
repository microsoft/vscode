/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../base/browser/dom.js';
import { PixelRatio } from '../../../base/browser/pixelRatio.js';
import { FontMeasurements } from '../../browser/config/fontMeasurements.js';
import { BareFontInfo, FontInfo } from '../config/fontInfo.js';
import { FontDecoration, LineFontSegment } from '../textModelEvents.js';

class FontSegmentInfo {
	constructor(
		public readonly fontFamily: string | undefined,
		public readonly fontWeight: string | undefined,
		public readonly fontSize: number | undefined,
		public readonly lineHeight: number | undefined
	) { }

	equals(other: FontSegmentInfo): boolean {
		return this.fontFamily === other.fontFamily
			&& this.fontWeight === other.fontWeight
			&& this.fontSize === other.fontSize
			&& this.lineHeight === other.lineHeight;
	}

	public static fromFontDecoration(fontDecoration: FontDecoration): FontSegmentInfo {
		return new FontSegmentInfo(fontDecoration.fontFamily, fontDecoration.fontWeight, fontDecoration.fontSize, fontDecoration.lineHeight);
	}
}

class FontSegment {

	constructor(
		public startColumn: number,
		public endColumn: number,
		public fontInfo: FontSegmentInfo,
		public sources: string[],
	) { }

	public getFontInfo(defaultFontInfo: FontInfo): FontInfo {
		const bareFontInfo = BareFontInfo.createFromRawSettings({
			fontFamily: this.fontInfo.fontFamily ?? defaultFontInfo.fontFamily,
			fontWeight: this.fontInfo.fontWeight ?? defaultFontInfo.fontWeight,
			fontSize: this.fontInfo.fontSize ?? defaultFontInfo.fontSize,
			lineHeight: this.fontInfo.lineHeight ?? defaultFontInfo.lineHeight,
			fontLigatures: defaultFontInfo.fontFeatureSettings,
			fontVariations: defaultFontInfo.fontVariationSettings,
			letterSpacing: defaultFontInfo.letterSpacing
		}, PixelRatio.getInstance(getActiveWindow()).value);
		return FontMeasurements.readFontInfo(getActiveWindow(), bareFontInfo);
	}

	public fontAttributesEqual(other: FontSegment): boolean {
		const fontInfosEqual = this.fontInfo.equals(other.fontInfo);
		if (!fontInfosEqual) {
			return false;
		}
		if (this.sources.length !== other.sources.length) {
			return false;
		}
		for (let i = 0; i < this.sources.length; i++) {
			if (this.sources[i] !== other.sources[i]) {
				return false;
			}
		}
		return true;
	}
}

export interface IFontSegmentTreeContext {
	fontDecorationForId(decorationId: string): FontDecoration | undefined;
}

export class FontSegmentTree {

	private _segments: FontSegment[] = [];

	constructor(
		private readonly _context: IFontSegmentTreeContext,
		private readonly _defaultFontInfo: FontInfo
	) { }

	public insert(decorationId: string, fontDecoration: FontDecoration): void {

		const newSegments: FontSegment[] = [];
		let lastFontSegment: FontSegment | undefined;
		const insertIntoNewSegments = (fontSegment: FontSegment) => {
			if (lastFontSegment && fontSegment.startColumn === lastFontSegment.endColumn + 1 && lastFontSegment.fontAttributesEqual(fontSegment)) {
				lastFontSegment.endColumn = fontSegment.endColumn;
				lastFontSegment.sources = fontSegment.sources;
			} else {
				newSegments.push(fontSegment);
				lastFontSegment = fontSegment;
			}
		};

		const startColumn = fontDecoration.startColumn;
		const endColumn = fontDecoration.endColumn;

		if (this._segments.length === 0) {
			newSegments.push(new FontSegment(startColumn, endColumn, FontSegmentInfo.fromFontDecoration(fontDecoration), [decorationId]));
		} else {
			const firstIndex = this._findFirstSegmentOverlapIndex(startColumn);
			const lastIndex = this._findLastSegmentOverlapIndex(endColumn);

			for (let i = 0; i < firstIndex; i++) {
				insertIntoNewSegments(this._segments[i]);
			}
			if (startColumn < this._segments[firstIndex].startColumn) {
				insertIntoNewSegments(new FontSegment(startColumn, this._segments[firstIndex].startColumn - 1, FontSegmentInfo.fromFontDecoration(fontDecoration), [decorationId]));
			}
			for (let i = firstIndex; i <= lastIndex; i++) {
				const segment = this._segments[i];
				if (segment.endColumn < startColumn) {
					insertIntoNewSegments(segment);
				} else if (segment.startColumn > endColumn) {
					insertIntoNewSegments(segment);
				} else {
					if (segment.startColumn < startColumn) {
						insertIntoNewSegments(new FontSegment(segment.startColumn, startColumn - 1, segment.fontInfo, segment.sources));
					}
					if (endColumn < segment.endColumn) {
						insertIntoNewSegments(new FontSegment(endColumn + 1, segment.endColumn, segment.fontInfo, segment.sources));
					}
					const sources = segment.sources;
					sources.push(decorationId);
					const mergedSegmentFontInfo = this._getMergedFontInfo(sources);
					insertIntoNewSegments(new FontSegment(Math.max(segment.startColumn, startColumn), Math.min(segment.endColumn, endColumn), mergedSegmentFontInfo, sources));
				}
			}
			if (this._segments[this._segments.length - 1].endColumn < endColumn) {
				insertIntoNewSegments(new FontSegment(this._segments[this._segments.length - 1].endColumn + 1, endColumn, FontSegmentInfo.fromFontDecoration(fontDecoration), [decorationId]));
			}
			for (let i = lastIndex + 1; i < this._segments.length; i++) {
				insertIntoNewSegments(this._segments[i]);
			}
		}
		this._segments = newSegments;
		console.log('insert ', decorationId, fontDecoration);
		console.log('this._segments ', this._segments);
	}

	private _findFirstSegmentOverlapIndex(column: number): number {
		let low = 0, high = this._segments.length - 1;
		while (low <= high) {
			const mid = (low + high) >>> 1;
			if (this._segments[mid].endColumn < column) {
				low = mid + 1;
			} else {
				high = mid - 1;
			}
		}
		return low;
	}

	private _findLastSegmentOverlapIndex(column: number): number {
		let low = 0, high = this._segments.length - 1;
		while (low <= high) {
			const mid = (low + high) >>> 1;
			if (this._segments[mid].startColumn > column) {
				high = mid - 1;
			} else {
				low = mid + 1;
			}
		}
		return high;
	}

	public remove(decorationId: string, fontDecoration: FontDecoration): void {
		const newSegments: FontSegment[] = [];
		let lastFontSegment: FontSegment | undefined = undefined;
		for (let i = 0; i < this._segments.length; i++) {
			const segment = this._segments[i];
			const sources = segment.sources;
			const indexOfDecorationId = sources.indexOf(decorationId);
			if (indexOfDecorationId > -1) {
				sources.splice(indexOfDecorationId, 1);
				if (sources.length > 0) {
					const currentFontSegment = new FontSegment(segment.startColumn, segment.endColumn, this._getMergedFontInfo(sources), sources);
					if (lastFontSegment && segment.startColumn === lastFontSegment.endColumn + 1 && lastFontSegment.fontAttributesEqual(currentFontSegment)) {
						lastFontSegment.endColumn = segment.endColumn;
						lastFontSegment.sources = sources;
					} else {
						newSegments.push(currentFontSegment);
						lastFontSegment = currentFontSegment;
					}
				}
			} else {
				newSegments.push(segment);
			}
		}
		this._segments = newSegments;
		console.log('remove ', decorationId);
		console.log('this._segments ', this._segments);
	}

	public getFontAtColumn(column: number): FontInfo {
		let low = 0;
		let high = this._segments.length - 1;
		while (low <= high) {
			const mid = (low + high) >>> 1;
			const seg = this._segments[mid];

			if (column < seg.startColumn) {
				high = mid - 1;
			} else if (column > seg.endColumn) {
				low = mid + 1;
			} else {
				return seg.getFontInfo(this._defaultFontInfo);
			}
		}
		return this._defaultFontInfo;
	}

	public getSegments(): LineFontSegment[] {
		return this._segments.map(seg => new LineFontSegment(seg.startColumn, seg.endColumn, seg.getFontInfo(this._defaultFontInfo)));
	}

	private _getMergedFontInfo(decorationIds: string[]): FontSegmentInfo {
		let fontFamily: string | undefined;
		let fontWeight: string | undefined;
		let fontSize: number | undefined;
		let lineHeight: number | undefined;
		for (const decorationId of decorationIds) {
			const fontDecoration = this._context.fontDecorationForId(decorationId);
			if (fontDecoration) {
				if (fontDecoration.fontFamily && !fontFamily) {
					fontFamily = fontDecoration.fontFamily;
				}
				if (fontDecoration.fontWeight && !fontWeight) {
					fontWeight = fontDecoration.fontWeight;
				}
				if (fontDecoration.fontSize && !fontSize) {
					fontSize = fontDecoration.fontSize;
				}
				if (fontDecoration.lineHeight && !lineHeight) {
					lineHeight = fontDecoration.lineHeight;
				}
			}
			if (fontFamily && fontWeight && fontSize && lineHeight) {
				break;
			}
		}
		return new FontSegmentInfo(fontFamily, fontWeight, fontSize, lineHeight);
	}
}
