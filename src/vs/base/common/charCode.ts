/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * An inlined enum containing useful character codes (to be used with String.charCodeAt).
 * Please leave the const keyword such that it gets inlined when compiled to JavaScript!
 */
export const enum CharCode {

	Tab = 9,
	LineFeed = 10,
	CarriageReturn = 13,
	Space = 32,

	/**
	 * The `$` character.
	 */
	Dollar = 36,

	/**
	 * The `/` character.
	 */
	Slash = 47,

	Digit0 = 48,
	Digit1 = 49,
	Digit9 = 57,

	/**
	 * The `:` character.
	 */
	Colon = 58,

	A = 65,
	Z = 90,

	/**
	 * The `\` character.
	 */
	Backslash = 92,

	/**
	 * The ``(`)`` character.
	 */
	BackTick = 96,

	a = 97,
	n = 110,
	t = 116,
	z = 122,


}