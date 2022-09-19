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
