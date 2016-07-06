/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {isLinux, isWindows} from 'vs/base/common/platform';

/**
 * The forward slash path separator.
 */
export var sep = '/';

/**
 * The native path separator depending on the OS.
 */
export var nativeSep = isWindows ? '\\' : '/';

export function relative(from: string, to: string): string {

	from = normalize(from);
	to = normalize(to);

	var fromParts = from.split(sep),
		toParts = to.split(sep);

	while (fromParts.length > 0 && toParts.length > 0) {
		if (fromParts[0] === toParts[0]) {
			fromParts.shift();
			toParts.shift();
		} else {
			break;
		}
	}

	for (var i = 0, len = fromParts.length; i < len; i++) {
		toParts.unshift('..');
	}

	return toParts.join(sep);
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
		if (end === len || path.charCodeAt(end) === _slash || path.charCodeAt(end) === _backslash) {

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
	return start + other.length === end &&  value.indexOf(other, start) === start;
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
	if (code === _slash || code === _backslash) {

		code = path.charCodeAt(1);
		if (code === _slash || code === _backslash) {
			// UNC candidate \\localhost\shares\ddd
			//               ^^^^^^^^^^^^^^^^^^^
			code = path.charCodeAt(2);
			if (code !== _slash && code !== _backslash) {
				let pos = 3;
				let start = pos;
				for (; pos < len; pos++) {
					code = path.charCodeAt(pos);
					if (code === _slash || code === _backslash) {
						break;
					}
				}
				code = path.charCodeAt(pos + 1);
				if (start !== pos && code !== _slash && code !== _backslash) {
					pos += 1;
					for (; pos < len; pos++) {
						code = path.charCodeAt(pos);
						if (code === _slash || code === _backslash) {
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

	} else if ((code >= _A && code <= _Z) || (code >= _a && code <= _z)) {
		// check for windows drive letter c:\ or c:

		if (path.charCodeAt(1) === _colon) {
			code = path.charCodeAt(2);
			if (code === _slash || code === _backslash) {
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
			if (code === _slash || code === _backslash) {
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
			if (last !== _slash && last !== _backslash) {
				let next = part.charCodeAt(0);
				if (next !== _slash && next !== _backslash) {

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
	if (code !== _backslash) {
		return false;
	}
	code = path.charCodeAt(1);
	if (code !== _backslash) {
		return false;
	}
	let pos = 2;
	let start = pos;
	for (; pos < path.length; pos++) {
		code = path.charCodeAt(pos);
		if (code === _backslash) {
			break;
		}
	}
	if (start === pos) {
		return false;
	}
	code = path.charCodeAt(pos + 1);
	if (isNaN(code) || code === _backslash) {
		return false;
	}
	return true;
}

function isPosixAbsolute(path: string): boolean {
	return path && path[0] === '/';
}

export function makePosixAbsolute(path: string): string {
	return isPosixAbsolute(normalize(path)) ? path : sep + path;
}


const _slash = '/'.charCodeAt(0);
const _backslash = '\\'.charCodeAt(0);
const _colon = ':'.charCodeAt(0);
const _a = 'a'.charCodeAt(0);
const _A = 'A'.charCodeAt(0);
const _z = 'z'.charCodeAt(0);
const _Z = 'Z'.charCodeAt(0);

export function isEqualOrParent(path: string, candidate: string): boolean {

	if (path === candidate) {
		return true;
	}

	path = normalize(path);
	candidate = normalize(candidate);

	let candidateLen = candidate.length;
	let lastCandidateChar = candidate.charCodeAt(candidateLen - 1);
	if (lastCandidateChar === _slash) {
		candidate = candidate.substring(0, candidateLen - 1);
		candidateLen -= 1;
	}

	if (path === candidate) {
		return true;
	}

	if (!isLinux) {
		// case insensitive
		path = path.toLowerCase();
		candidate = candidate.toLowerCase();
	}

	if (path === candidate) {
		return true;
	}

	if (path.indexOf(candidate) !== 0) {
		return false;
	}

	let char = path.charCodeAt(candidateLen);
	return char === _slash;
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

export const isAbsoluteRegex = /^((\/|[a-zA-Z]:\\)[^\(\)<>\\'\"\[\]]+)/;

/**
 * If you have access to node, it is recommended to use node's path.isAbsolute().
 * This is a simple regex based approach.
 */
export function isAbsolute(path: string): boolean {
	return isAbsoluteRegex.test(path);
}
