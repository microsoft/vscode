/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// Names from https://blog.codinghorror.com/ascii-pronunciation-rules-for-programmers/

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
	 * The `!` character.
	 */
	ExclamationMark = 33,
	/**
	 * The `"` character.
	 */
	DoubleQuote = 34,
	/**
	 * The `#` character.
	 */
	Hash = 35,
	/**
	 * The `$` character.
	 */
	DollarSign = 36,
	/**
	 * The `%` character.
	 */
	PercentSign = 37,
	/**
	 * The `&` character.
	 */
	Ampersand = 38,
	/**
	 * The `'` character.
	 */
	SingleQuote = 39,
	/**
	 * The `(` character.
	 */
	OpenParen = 40,
	/**
	 * The `)` character.
	 */
	CloseParen = 41,
	/**
	 * The `*` character.
	 */
	Asterisk = 42,
	/**
	 * The `+` character.
	 */
	Plus = 43,
	/**
	 * The `,` character.
	 */
	Comma = 44,
	/**
	 * The `-` character.
	 */
	Dash = 45,
	/**
	 * The `.` character.
	 */
	Period = 46,
	/**
	 * The `/` character.
	 */
	Slash = 47,

	Digit0 = 48,
	Digit1 = 49,
	Digit2 = 50,
	Digit3 = 51,
	Digit4 = 52,
	Digit5 = 53,
	Digit6 = 54,
	Digit7 = 55,
	Digit8 = 56,
	Digit9 = 57,

	/**
	 * The `:` character.
	 */
	Colon = 58,
	/**
	 * The `;` character.
	 */
	Semicolon = 59,
	/**
	 * The `<` character.
	 */
	LessThan = 60,
	/**
	 * The `=` character.
	 */
	Equals = 61,
	/**
	 * The `>` character.
	 */
	GreaterThan = 62,
	/**
	 * The `?` character.
	 */
	QuestionMark = 63,
	/**
	 * The `@` character.
	 */
	AtSign = 64,

	A = 65,
	B = 66,
	C = 67,
	D = 68,
	E = 69,
	F = 70,
	G = 71,
	H = 72,
	I = 73,
	J = 74,
	K = 75,
	L = 76,
	M = 77,
	N = 78,
	O = 79,
	P = 80,
	Q = 81,
	R = 82,
	S = 83,
	T = 84,
	U = 85,
	V = 86,
	W = 87,
	X = 88,
	Y = 89,
	Z = 90,

	/**
	 * The `[` character.
	 */
	OpenSquareBracket = 91,
	/**
	 * The `\` character.
	 */
	Backslash = 92,
	/**
	 * The `]` character.
	 */
	CloseSquareBracket = 93,
	/**
	 * The `^` character.
	 */
	Caret = 94,
	/**
	 * The `_` character.
	 */
	Underline = 95,
	/**
	 * The ``(`)`` character.
	 */
	BackTick = 96,

	a = 97,
	b = 98,
	c = 99,
	d = 100,
	e = 101,
	f = 102,
	g = 103,
	h = 104,
	i = 105,
	j = 106,
	k = 107,
	l = 108,
	m = 109,
	n = 110,
	o = 111,
	p = 112,
	q = 113,
	r = 114,
	s = 115,
	t = 116,
	u = 117,
	v = 118,
	w = 119,
	x = 120,
	y = 121,
	z = 122,

	/**
	 * The `{` character.
	 */
	OpenCurlyBrace = 123,
	/**
	 * The `|` character.
	 */
	Pipe = 124,
	/**
	 * The `}` character.
	 */
	CloseCurlyBrace = 125,
	/**
	 * The `~` character.
	 */
	Tilde = 126,
}