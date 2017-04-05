/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { DefaultConfig, GOLDEN_LINE_HEIGHT_RATIO } from 'vs/editor/common/config/defaultConfig';
import { EditorZoom } from 'vs/editor/common/config/editorZoom';

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
	}, zoomLevel: number): BareFontInfo {

		let fontFamily = String(opts.fontFamily) || DefaultConfig.editor.fontFamily;
		let fontWeight = String(opts.fontWeight) || DefaultConfig.editor.fontWeight;

		let fontSize = safeParseFloat(opts.fontSize, DefaultConfig.editor.fontSize);
		fontSize = clamp(fontSize, 0, 100);
		if (fontSize === 0) {
			fontSize = DefaultConfig.editor.fontSize;
		}

		let lineHeight = safeParseInt(opts.lineHeight, 0);
		lineHeight = clamp(lineHeight, 0, 150);
		if (lineHeight === 0) {
			lineHeight = Math.round(GOLDEN_LINE_HEIGHT_RATIO * fontSize);
		}

		let editorZoomLevelMultiplier = 1 + (EditorZoom.getZoomLevel() * 0.1);
		fontSize *= editorZoomLevelMultiplier;
		lineHeight *= editorZoomLevelMultiplier;

		return new BareFontInfo({
			zoomLevel: zoomLevel,
			fontFamily: fontFamily,
			fontWeight: fontWeight,
			fontSize: fontSize,
			lineHeight: lineHeight
		});
	}

	readonly zoomLevel: number;
	readonly fontFamily: string;
	readonly fontWeight: string;
	readonly fontSize: number;
	readonly lineHeight: number;

	/**
	 * @internal
	 */
	protected constructor(opts: {
		zoomLevel: number;
		fontFamily: string;
		fontWeight: string;
		fontSize: number;
		lineHeight: number;
	}) {
		this.zoomLevel = opts.zoomLevel;
		this.fontFamily = String(opts.fontFamily);
		this.fontWeight = String(opts.fontWeight);
		this.fontSize = opts.fontSize;
		this.lineHeight = opts.lineHeight | 0;
	}

	/**
	 * @internal
	 */
	public getId(): string {
		return this.zoomLevel + '-' + this.fontFamily + '-' + this.fontWeight + '-' + this.fontSize + '-' + this.lineHeight;
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
			&& this.typicalHalfwidthCharacterWidth === other.typicalHalfwidthCharacterWidth
			&& this.typicalFullwidthCharacterWidth === other.typicalFullwidthCharacterWidth
			&& this.spaceWidth === other.spaceWidth
			&& this.maxDigitWidth === other.maxDigitWidth
		);
	}

	/**
	 * @internal
	 */
	public clone(): FontInfo {
		return new FontInfo(this, this.isTrusted);
	}
}