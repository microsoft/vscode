/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows } from 'vs/base/common/platform';
import { startsWithIgnoreCase, equalsIgnoreCase } from 'vs/base/common/strings';
import { CharCode } from 'vs/base/common/charCode';

/**
 * The forward slash path separator.
 */
export const sep = '/';

/**
 * The native path separator depending on the OS.
 */
export const nativeSep = isWindows ? '\\' : '/';


function isPathSeparator(code: number) {
	return code === CharCode.Slash || code === CharCode.Backslash;
}

/**
 * @param path the path to get the dirname from
 * @param separator the separator to use
 * @returns the directory name of a path.
 * '.' is returned for empty paths or single segment relative paths (as done by NodeJS)
 * For paths consisting only of a root, the inout path is returned
 */
export function dirname(path: string, separator = nativeSep): string {
	const len = path.length;
	if (len === 0) {
		return '.';
	} else if (len === 1) {
		return isPathSeparator(path.charCodeAt(0)) ? path : '.';
	}
	const root = getRoot(path, separator);
	let rootLength = root.length;
	if (rootLength >= len) {
		return path; // matched the root
	}
	if (rootLength === 0 && isPathSeparator(path.charCodeAt(0))) {
		rootLength = 1; // absolute paths stay absolute paths.
	}

	let i = len - 1;
	if (i > rootLength) {
		i--; // no need to look at the last character. If it's a trailing slash, we ignore it.
		while (i > rootLength && !isPathSeparator(path.charCodeAt(i))) {
			i--;
		}
	}
	if (i === 0) {
		return '.'; // it was a relative path with a single segment, no root. Nodejs returns '.' here.
	}
	return path.substr(0, i);
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
 * @returns `.far` from `boo.far` or the empty string.
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

export function normalize(path: undefined, toOSPath?: boolean): undefined;
export function normalize(path: null, toOSPath?: boolean): null;
export function normalize(path: string, toOSPath?: boolean): string;
export function normalize(path: string | null | undefined, toOSPath?: boolean): string | null | undefined {

	if (path === null || path === undefined) {
		return path;
	}

	const len = path.length;
	if (len === 0) {
		return '.';
	}

	const wantsBackslash = !!(isWindows && toOSPath);
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
		if (end === len || isPathSeparator(path.charCodeAt(end))) {

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
	const firstLetter = path.charCodeAt(0);
	if (isPathSeparator(firstLetter)) {
		if (isPathSeparator(path.charCodeAt(1))) {
			// UNC candidate \\localhost\shares\ddd
			//               ^^^^^^^^^^^^^^^^^^^
			if (!isPathSeparator(path.charCodeAt(2))) {
				let pos = 3;
				let start = pos;
				for (; pos < len; pos++) {
					if (isPathSeparator(path.charCodeAt(pos))) {
						break;
					}
				}
				if (start !== pos && !isPathSeparator(path.charCodeAt(pos + 1))) {
					pos += 1;
					for (; pos < len; pos++) {
						if (isPathSeparator(path.charCodeAt(pos))) {
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

	} else if (isWindowsDriveLetter(firstLetter)) {
		// check for windows drive letter c:\ or c:

		if (path.charCodeAt(1) === CharCode.Colon) {
			if (isPathSeparator(path.charCodeAt(2))) {
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
			if (isPathSeparator(path.charCodeAt(pos))) {
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
			if (!isPathSeparator(last)) {
				let next = part.charCodeAt(0);
				if (!isPathSeparator(next)) {

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
export function isValidBasename(name: string | null | undefined): boolean {
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

export function isEqual(pathA: string, pathB: string, ignoreCase?: boolean): boolean {
	const identityEquals = (pathA === pathB);
	if (!ignoreCase || identityEquals) {
		return identityEquals;
	}

	if (!pathA || !pathB) {
		return false;
	}

	return equalsIgnoreCase(pathA, pathB);
}

export function isEqualOrParent(path: string, candidate: string, ignoreCase?: boolean, separator = nativeSep): boolean {
	if (path === candidate) {
		return true;
	}

	if (!path || !candidate) {
		return false;
	}

	if (candidate.length > path.length) {
		return false;
	}

	if (ignoreCase) {
		const beginsWith = startsWithIgnoreCase(path, candidate);
		if (!beginsWith) {
			return false;
		}

		if (candidate.length === path.length) {
			return true; // same path, different casing
		}

		let sepOffset = candidate.length;
		if (candidate.charAt(candidate.length - 1) === separator) {
			sepOffset--; // adjust the expected sep offset in case our candidate already ends in separator character
		}

		return path.charAt(sepOffset) === separator;
	}

	if (candidate.charAt(candidate.length - 1) !== separator) {
		candidate += separator;
	}

	return path.indexOf(candidate) === 0;
}

/**
 * Adapted from Node's path.isAbsolute functions
 */
export function isAbsolute(path: string): boolean {
	return isWindows ?
		isAbsolute_win32(path) :
		isAbsolute_posix(path);
}

export function isAbsolute_win32(path: string): boolean {
	if (!path) {
		return false;
	}

	const char0 = path.charCodeAt(0);
	if (isPathSeparator(char0)) {
		return true;
	} else if (isWindowsDriveLetter(char0)) {
		if (path.length > 2 && path.charCodeAt(1) === CharCode.Colon) {
			const char2 = path.charCodeAt(2);
			if (isPathSeparator(char2)) {
				return true;
			}
		}
	}

	return false;
}

export function isAbsolute_posix(path: string): boolean {
	return !!(path && path.charCodeAt(0) === CharCode.Slash);
}

export function isWindowsDriveLetter(char0: number): boolean {
	return char0 >= CharCode.A && char0 <= CharCode.Z || char0 >= CharCode.a && char0 <= CharCode.z;
}
