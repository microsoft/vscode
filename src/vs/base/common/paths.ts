/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { isLinux, isWindows } from 'vs/base/common/platform';
import { fill } from 'vs/base/common/arrays';
import { rtrim } from 'vs/base/common/strings';
import { CharCode } from 'vs/base/common/charCode';

/**
 * The forward slash path separator.
 */
export const sep = '/';

/**
 * The native path separator depending on the OS.
 */
export const nativeSep = isWindows ? '\\' : '/';

export function relative(from: string, to: string): string {
	// ignore trailing slashes
	const originalNormalizedFrom = rtrim(normalize(from), sep);
	const originalNormalizedTo = rtrim(normalize(to), sep);

	// we're assuming here that any non=linux OS is case insensitive
	// so we must compare each part in its lowercase form
	const normalizedFrom = isLinux ? originalNormalizedFrom : originalNormalizedFrom.toLowerCase();
	const normalizedTo = isLinux ? originalNormalizedTo : originalNormalizedTo.toLowerCase();

	const fromParts = normalizedFrom.split(sep);
	const toParts = normalizedTo.split(sep);

	let i = 0, max = Math.min(fromParts.length, toParts.length);

	for (; i < max; i++) {
		if (fromParts[i] !== toParts[i]) {
			break;
		}
	}

	const result = [
		...fill(fromParts.length - i, () => '..'),
		...originalNormalizedTo.split(sep).slice(i)
	];

	return result.join(sep);
}

/**
 * @returns the directory name of a path.
 */
export function dirname(path: string): string {
	const idx = ~path.lastIndexOf('/') || ~path.lastIndexOf('\\');
	if (idx === 0) {
		return '.';
	} else if (~idx === 0) {
		return path[0];
	} else {
		let res = path.substring(0, ~idx);
		if (isWindows && res[res.length - 1] === ':') {
			res += nativeSep; // make sure drive letters end with backslash
		}
		return res;
	}
}

/**
 * @returns the base name of a path.
 */
export function basename(path: string): string {
	const idx = ~path.lastIndexOf('/') || ~path.lastIndexOf('\\');
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
	const idx = ~path.lastIndexOf('.');
	return idx ? path.substring(~idx) : '';
}

const _posixBadPath = /(\/\.\.?\/)|(\/\.\.?)$|^(\.\.?\/)|(\/\/+)|(\\)/;
const _winBadPath = /(\\\.\.?\\)|(\\\.\.?)$|^(\.\.?\\)|(\\\\+)|(\/)/;

function _isNormal(path: string, win: boolean): boolean {
	return win
		? !_winBadPath.test(path)
		: !_posixBadPath.test(path);
}

export function normalize(path: string, toOSPath?: boolean): string {

	if (path === null || path === void 0) {
		return path;
	}

	const len = path.length;
	if (len === 0) {
		return '.';
	}

	const wantsBackslash = isWindows && toOSPath;
	if (_isNormal(path, wantsBackslash)) {
		return path;
	}

	const sep = wantsBackslash ? '\\' : '/';
	const root = getRoot(path, sep);

	// skip the root-portion of the path
	let start = root.length;
	let skip = false;
	let res = '';

	for (let end = root.length; end <= len; end++) {

		// either at the end or at a path-separator character
		if (end === len || path.charCodeAt(end) === CharCode.Slash || path.charCodeAt(end) === CharCode.Backslash) {

			if (streql(path, start, end, '..')) {
				// skip current and remove parent (if there is already something)
				let prev_start = res.lastIndexOf(sep);
				let prev_part = res.slice(prev_start + 1);
				if ((root || prev_part.length > 0) && prev_part !== '..') {
					res = prev_start === -1 ? '' : res.slice(0, prev_start);
					skip = true;
				}
			} else if (streql(path, start, end, '.') && (root || res || end < len - 1)) {
				// skip current (if there is already something or if there is more to come)
				skip = true;
			}

			if (!skip) {
				let part = path.slice(start, end);
				if (res !== '' && res[res.length - 1] !== sep) {
					res += sep;
				}
				res += part;
			}
			start = end + 1;
			skip = false;
		}
	}

	return root + res;
}

function streql(value: string, start: number, end: number, other: string): boolean {
	return start + other.length === end && value.indexOf(other, start) === start;
}

/**
 * Computes the _root_ this path, like `getRoot('c:\files') === c:\`,
 * `getRoot('files:///files/path') === files:///`,
 * or `getRoot('\\server\shares\path') === \\server\shares\`
 */
export function getRoot(path: string, sep: string = '/'): string {

	if (!path) {
		return '';
	}

	let len = path.length;
	let code = path.charCodeAt(0);
	if (code === CharCode.Slash || code === CharCode.Backslash) {

		code = path.charCodeAt(1);
		if (code === CharCode.Slash || code === CharCode.Backslash) {
			// UNC candidate \\localhost\shares\ddd
			//               ^^^^^^^^^^^^^^^^^^^
			code = path.charCodeAt(2);
			if (code !== CharCode.Slash && code !== CharCode.Backslash) {
				let pos = 3;
				let start = pos;
				for (; pos < len; pos++) {
					code = path.charCodeAt(pos);
					if (code === CharCode.Slash || code === CharCode.Backslash) {
						break;
					}
				}
				code = path.charCodeAt(pos + 1);
				if (start !== pos && code !== CharCode.Slash && code !== CharCode.Backslash) {
					pos += 1;
					for (; pos < len; pos++) {
						code = path.charCodeAt(pos);
						if (code === CharCode.Slash || code === CharCode.Backslash) {
							return path.slice(0, pos + 1) // consume this separator
								.replace(/[\\/]/g, sep);
						}
					}
				}
			}
		}

		// /user/far
		// ^
		return sep;

	} else if ((code >= CharCode.A && code <= CharCode.Z) || (code >= CharCode.a && code <= CharCode.z)) {
		// check for windows drive letter c:\ or c:

		if (path.charCodeAt(1) === CharCode.Colon) {
			code = path.charCodeAt(2);
			if (code === CharCode.Slash || code === CharCode.Backslash) {
				// C:\fff
				// ^^^
				return path.slice(0, 2) + sep;
			} else {
				// C:
				// ^^
				return path.slice(0, 2);
			}
		}
	}

	// check for URI
	// scheme://authority/path
	// ^^^^^^^^^^^^^^^^^^^
	let pos = path.indexOf('://');
	if (pos !== -1) {
		pos += 3; // 3 -> "://".length
		for (; pos < len; pos++) {
			code = path.charCodeAt(pos);
			if (code === CharCode.Slash || code === CharCode.Backslash) {
				return path.slice(0, pos + 1); // consume this separator
			}
		}
	}

	return '';
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

					value += sep;
				}
			}
		}
		value += part;
	}

	return normalize(value);
};


/**
 * Check if the path follows this pattern: `\\hostname\sharename`.
 *
 * @see https://msdn.microsoft.com/en-us/library/gg465305.aspx
 * @return A boolean indication if the path is a UNC path, on none-windows
 * always false.
 */
export function isUNC(path: string): boolean {
	if (!isWindows) {
		// UNC is a windows concept
		return false;
	}

	if (!path || path.length < 5) {
		// at least \\a\b
		return false;
	}

	let code = path.charCodeAt(0);
	if (code !== CharCode.Backslash) {
		return false;
	}
	code = path.charCodeAt(1);
	if (code !== CharCode.Backslash) {
		return false;
	}
	let pos = 2;
	let start = pos;
	for (; pos < path.length; pos++) {
		code = path.charCodeAt(pos);
		if (code === CharCode.Backslash) {
			break;
		}
	}
	if (start === pos) {
		return false;
	}
	code = path.charCodeAt(pos + 1);
	if (isNaN(code) || code === CharCode.Backslash) {
		return false;
	}
	return true;
}

// Reference: https://en.wikipedia.org/wiki/Filename
const INVALID_FILE_CHARS = isWindows ? /[\\/:\*\?"<>\|]/g : /[\\/]/g;
const WINDOWS_FORBIDDEN_NAMES = /^(con|prn|aux|clock\$|nul|lpt[0-9]|com[0-9])$/i;
export function isValidBasename(name: string): boolean {
	if (!name || name.length === 0 || /^\s+$/.test(name)) {
		return false; // require a name that is not just whitespace
	}

	INVALID_FILE_CHARS.lastIndex = 0; // the holy grail of software development
	if (INVALID_FILE_CHARS.test(name)) {
		return false; // check for certain invalid file characters
	}

	if (isWindows && WINDOWS_FORBIDDEN_NAMES.test(name)) {
		return false; // check for certain invalid file names
	}

	if (name === '.' || name === '..') {
		return false; // check for reserved values
	}

	if (isWindows && name[name.length - 1] === '.') {
		return false; // Windows: file cannot end with a "."
	}

	if (isWindows && name.length !== name.trim().length) {
		return false; // Windows: file cannot end with a whitespace
	}

	return true;
}