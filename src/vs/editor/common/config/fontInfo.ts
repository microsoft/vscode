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

/**
 * Font settings maximum and minimum limits
 */
const MINIMUM_FONT_SIZE = 8;
const MAXIMUM_FONT_SIZE = 100;
const MINIMUM_LINE_HEIGHT = 8;
const MAXIMUM_LINE_HEIGHT = 150;
const MINIMUM_LETTER_SPACING = -5;
const MAXIMUM_LETTER_SPACING = 20;

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
		fontSize = clamp(fontSize, 0, MAXIMUM_FONT_SIZE);
		if (fontSize === 0) {
			fontSize = EDITOR_FONT_DEFAULTS.fontSize;
		} else if (fontSize < MINIMUM_FONT_SIZE) {
			fontSize = MINIMUM_FONT_SIZE;
		}

		let lineHeight = safeParseInt(opts.lineHeight, 0);
		lineHeight = clamp(lineHeight, 0, MAXIMUM_LINE_HEIGHT);
		if (lineHeight === 0) {
			lineHeight = Math.round(GOLDEN_LINE_HEIGHT_RATIO * fontSize);
		} else if (lineHeight < MINIMUM_LINE_HEIGHT) {
			lineHeight = MINIMUM_LINE_HEIGHT;
		}

		let letterSpacing = safeParseFloat(opts.letterSpacing, 0);
		letterSpacing = clamp(letterSpacing, MINIMUM_LETTER_SPACING, MAXIMUM_LETTER_SPACING);

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
