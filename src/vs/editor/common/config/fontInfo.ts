/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


export class BareFontInfo {
	readonly _bareFontInfoBrand: void;

	// /**
	//  * @internal
	//  */
	// public static createFromRawSettings(editor: {
	// 	fontFamily: string;
	// 	fontWeight: string;
	// 	fontSize: number;
	// 	lineHeight: number;
	// }): BareFontInfo {

	// }

	readonly fontFamily: string;
	readonly fontWeight: string;
	readonly fontSize: number;
	readonly lineHeight: number;

	/**
	 * @internal
	 */
	constructor(opts: {
		fontFamily: string;
		fontWeight: string;
		fontSize: number;
		lineHeight: number;
	}) {
		this.fontFamily = String(opts.fontFamily);
		this.fontWeight = String(opts.fontWeight);
		this.fontSize = opts.fontSize;
		this.lineHeight = opts.lineHeight | 0;
	}

	/**
	 * @internal
	 */
	public getId(): string {
		return this.fontFamily + '-' + this.fontWeight + '-' + this.fontSize + '-' + this.lineHeight + '-';
	}
}

export class FontInfo extends BareFontInfo {
	readonly _editorStylingBrand: void;

	readonly typicalHalfwidthCharacterWidth: number;
	readonly typicalFullwidthCharacterWidth: number;
	readonly spaceWidth: number;
	readonly maxDigitWidth: number;

	/**
	 * @internal
	 */
	constructor(opts: {
		fontFamily: string;
		fontWeight: string;
		fontSize: number;
		lineHeight: number;
		typicalHalfwidthCharacterWidth: number;
		typicalFullwidthCharacterWidth: number;
		spaceWidth: number;
		maxDigitWidth: number;
	}) {
		super(opts);
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
		return new FontInfo(this);
	}
}