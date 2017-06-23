/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as platform from 'vs/base/common/platform';
import { EditorZoom } from 'vs/editor/common/config/editorZoom';
import { EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';

/**
 * Determined from empirical observations.
 * @internal
 */
const GOLDEN_LINE_HEIGHT_RATIO = platform.isMacintosh ? 1.5 : 1.35;

function safeParseFloat(n: number | string, defaultValue: number): number {
	if (typeof n === 'number') {
		return n;
	}
	let r = parseFloat(n);
	if (isNaN(r)) {
		return defaultValue;
	}
	return r;
}

function safeParseInt(n: number | string, defaultValue: number): number {
	if (typeof n === 'number') {
		return Math.round(n);
	}
	let r = parseInt(n);
	if (isNaN(r)) {
		return defaultValue;
	}
	return r;
}

function clamp(n: number, min: number, max: number): number {
	if (n < min) {
		return min;
	}
	if (n > max) {
		return max;
	}
	return n;
}

function _string(value: any, defaultValue: string): string {
	if (typeof value !== 'string') {
		return defaultValue;
	}
	return value;
}

export class BareFontInfo {
	readonly _bareFontInfoBrand: void;

	/**
	 * @internal
	 */
	public static createFromRawSettings(opts: {
		fontFamily?: string;
		fontWeight?: string;
		fontSize?: number | string;
		lineHeight?: number | string;
		letterSpacing?: number | string;
	}, zoomLevel: number): BareFontInfo {

		let fontFamily = _string(opts.fontFamily, EDITOR_FONT_DEFAULTS.fontFamily);
		let fontWeight = _string(opts.fontWeight, EDITOR_FONT_DEFAULTS.fontWeight);

		let fontSize = safeParseFloat(opts.fontSize, EDITOR_FONT_DEFAULTS.fontSize);
		fontSize = clamp(fontSize, 0, 100);
		if (fontSize === 0) {
			fontSize = EDITOR_FONT_DEFAULTS.fontSize;
		} else if (fontSize < 8) {
			fontSize = 8;
		}

		let lineHeight = safeParseInt(opts.lineHeight, 0);
		lineHeight = clamp(lineHeight, 0, 150);
		if (lineHeight === 0) {
			lineHeight = Math.round(GOLDEN_LINE_HEIGHT_RATIO * fontSize);
		} else if (lineHeight < 8) {
			lineHeight = 8;
		}

		let letterSpacing = safeParseFloat(opts.letterSpacing, 0);
		letterSpacing = clamp(letterSpacing, -20, 20);

		let editorZoomLevelMultiplier = 1 + (EditorZoom.getZoomLevel() * 0.1);
		fontSize *= editorZoomLevelMultiplier;
		lineHeight *= editorZoomLevelMultiplier;

		return new BareFontInfo({
			zoomLevel: zoomLevel,
			fontFamily: fontFamily,
			fontWeight: fontWeight,
			fontSize: fontSize,
			lineHeight: lineHeight,
			letterSpacing: letterSpacing
		});
	}

	readonly zoomLevel: number;
	readonly fontFamily: string;
	readonly fontWeight: string;
	readonly fontSize: number;
	readonly lineHeight: number;
	readonly letterSpacing: number;

	/**
	 * @internal
	 */
	protected constructor(opts: {
		zoomLevel: number;
		fontFamily: string;
		fontWeight: string;
		fontSize: number;
		lineHeight: number;
		letterSpacing: number;
	}) {
		this.zoomLevel = opts.zoomLevel;
		this.fontFamily = String(opts.fontFamily);
		this.fontWeight = String(opts.fontWeight);
		this.fontSize = opts.fontSize;
		this.lineHeight = opts.lineHeight | 0;
		this.letterSpacing = opts.letterSpacing;
	}

	/**
	 * @internal
	 */
	public getId(): string {
		return this.zoomLevel + '-' + this.fontFamily + '-' + this.fontWeight + '-' + this.fontSize + '-' + this.lineHeight + '-' + this.letterSpacing;
	}
}

export class FontInfo extends BareFontInfo {
	readonly _editorStylingBrand: void;

	readonly isTrusted: boolean;
	readonly isMonospace: boolean;
	readonly typicalHalfwidthCharacterWidth: number;
	readonly typicalFullwidthCharacterWidth: number;
	readonly spaceWidth: number;
	readonly maxDigitWidth: number;

	/**
	 * @internal
	 */
	constructor(opts: {
		zoomLevel: number;
		fontFamily: string;
		fontWeight: string;
		fontSize: number;
		lineHeight: number;
		letterSpacing: number;
		isMonospace: boolean;
		typicalHalfwidthCharacterWidth: number;
		typicalFullwidthCharacterWidth: number;
		spaceWidth: number;
		maxDigitWidth: number;
	}, isTrusted: boolean) {
		super(opts);
		this.isTrusted = isTrusted;
		this.isMonospace = opts.isMonospace;
		this.typicalHalfwidthCharacterWidth = opts.typicalHalfwidthCharacterWidth;
		this.typicalFullwidthCharacterWidth = opts.typicalFullwidthCharacterWidth;
		this.spaceWidth = opts.spaceWidth;
		this.maxDigitWidth = opts.maxDigitWidth;
	}

	/**
	 * @internal
	 */
	public equals(other: FontInfo): boolean {
		return (
			this.fontFamily === other.fontFamily
			&& this.fontWeight === other.fontWeight
			&& this.fontSize === other.fontSize
			&& this.lineHeight === other.lineHeight
			&& this.letterSpacing === other.letterSpacing
			&& this.typicalHalfwidthCharacterWidth === other.typicalHalfwidthCharacterWidth
			&& this.typicalFullwidthCharacterWidth === other.typicalFullwidthCharacterWidth
			&& this.spaceWidth === other.spaceWidth
			&& this.maxDigitWidth === other.maxDigitWidth
		);
	}
}
