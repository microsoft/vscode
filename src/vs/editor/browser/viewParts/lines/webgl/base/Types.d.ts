/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

export interface IColor {
	css: string;
	rgba: number; // 32-bit int with rgba in each byte
}
export type IColorRGB = [number, number, number];

export interface IColorSet {
	foreground: IColor;
	background: IColor;
	cursor: IColor;
	cursorAccent: IColor;
	selectionForeground: IColor | undefined;
	selectionBackgroundTransparent: IColor;
	/** The selection blended on top of background. */
	selectionBackgroundOpaque: IColor;
	selectionInactiveBackgroundTransparent: IColor;
	selectionInactiveBackgroundOpaque: IColor;
	ansi: IColor[];
	//contrastCache: IColorContrastCache;
}

export interface IRenderDimensions {
	scaledCharWidth: number;
	scaledCharHeight: number;
	scaledCellWidth: number;
	scaledCellHeight: number;
	scaledCharLeft: number;
	scaledCharTop: number;
	scaledCanvasWidth: number;
	scaledCanvasHeight: number;
	canvasWidth: number;
	canvasHeight: number;
	actualCellWidth: number;
	actualCellHeight: number;
}

/** Attribute data */
export interface IAttributeData {
	fg: number;
	bg: number;
	extended: IExtendedAttrs;

	clone(): IAttributeData;

	// flags
	isInverse(): number;
	isBold(): number;
	isUnderline(): number;
	isBlink(): number;
	isInvisible(): number;
	isItalic(): number;
	isDim(): number;
	isStrikethrough(): number;
	isProtected(): number;

	// color modes
	getFgColorMode(): number;
	getBgColorMode(): number;
	isFgRGB(): boolean;
	isBgRGB(): boolean;
	isFgPalette(): boolean;
	isBgPalette(): boolean;
	isFgDefault(): boolean;
	isBgDefault(): boolean;
	isAttributeDefault(): boolean;

	// colors
	getFgColor(): number;
	getBgColor(): number;

	// extended attrs
	hasExtendedAttrs(): number;
	updateExtended(): void;
	getUnderlineColor(): number;
	getUnderlineColorMode(): number;
	isUnderlineColorRGB(): boolean;
	isUnderlineColorPalette(): boolean;
	isUnderlineColorDefault(): boolean;
	getUnderlineStyle(): number;
}

export interface IExtendedAttrs {
	ext: number;
	underlineStyle: UnderlineStyle;
	underlineColor: number;
	urlId: number;
	clone(): IExtendedAttrs;
	isEmpty(): boolean;
}

export const enum UnderlineStyle {
	NONE = 0,
	SINGLE = 1,
	DOUBLE = 2,
	CURLY = 3,
	DOTTED = 4,
	DASHED = 5
}

export interface IRequestRedrawEvent {
	start: number;
	end: number;
}
