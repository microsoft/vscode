/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export const enum CharCode {
	Slash = 47,
	Backslash = 92
}

/**
 * @returns the directory name of a path.
 */
export function dirname(path: string): string {
	var idx = ~path.lastIndexOf('/') || ~path.lastIndexOf('\\');
	if (idx === 0) {
		return '.';
	} else if (~idx === 0) {
		return path[0];
	} else {
		return path.substring(0, ~idx);
	}
}

/**
 * @returns the base name of a path.
 */
export function basename(path: string): string {
	var idx = ~path.lastIndexOf('/') || ~path.lastIndexOf('\\');
	if (idx === 0) {
		return path;
	} else if (~idx === path.length - 1) {
		return basename(path.substring(0, path.length - 1));
	} else {
		return path.substr(~idx + 1);
	}
}

/**
 * @returns {{.far}} from boo.far or the empty string.
 */
export function extname(path: string): string {
	path = basename(path);
	var idx = ~path.lastIndexOf('.');
	return idx ? path.substring(~idx) : '';
}

export const join: (...parts: string[]) => string = function () {
	// Not using a function with var-args because of how TS compiles
	// them to JS - it would result in 2*n runtime cost instead
	// of 1*n, where n is parts.length.

	let value = '';
	for (let i = 0; i < arguments.length; i++) {
		let part = arguments[i];
		if (i > 0) {
			// add the separater between two parts unless
			// there already is one
			let last = value.charCodeAt(value.length - 1);
			if (last !== CharCode.Slash && last !== CharCode.Backslash) {
				let next = part.charCodeAt(0);
				if (next !== CharCode.Slash && next !== CharCode.Backslash) {

					value += '/';
				}
			}
		}
		value += part;
	}

	return value;
};



