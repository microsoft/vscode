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

	}

	public remove(decorationId: string, fontDecoration: FontDecoration): void {
		const newSegments: FontSegment[] = [];
		let lastFontSegment: FontSegment | undefined = undefined;
		for (let i = 0; i < this._segments.length; i++) {
			const segment = this._segments[i];
			// TODO: optimize this further
			const sources = segment.sources;
			const indexOfDecorationId = sources.indexOf(decorationId);
			if (indexOfDecorationId > -1) {
				// Need to recompute the segment
				sources.splice(indexOfDecorationId, 1);
				if (sources.length > 0) {
					const mergedSegmentFontInfo = this._getMergedFontInfo(sources);
					if (lastFontSegment && lastFontSegment.fontInfo.equals(mergedSegmentFontInfo) && segment.startColumn === lastFontSegment.endColumn + 1) {
						// Merge with the last segment
						lastFontSegment.endColumn = segment.endColumn;
						lastFontSegment.sources = sources;
					} else {
						lastFontSegment = new FontSegment(segment.startColumn, segment.endColumn, mergedSegmentFontInfo, sources);
						newSegments.push(lastFontSegment);
					}
				}
			} else {
				newSegments.push(segment);
			}
		}
		this._segments = newSegments;
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
