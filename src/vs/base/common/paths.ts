/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {isLinux, isWindows} from 'vs/base/common/platform';
import {endsWith} from 'vs/base/common/strings';

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

const _dotSegment = /[\\\/]\.\.?[\\\/]?|[\\\/]?\.\.?[\\\/]/;

export function normalize(path: string, toOSPath?: boolean): string {

	if (!path) {
		return path;
	}

	// a path is already normal if it contains no .. or . parts
	// and already uses the proper path separator
	if (!_dotSegment.test(path)) {

		// badSep is the path separator we don't want. Usually
		// the backslash, unless isWindows && toOSPath
		let badSep = toOSPath && isWindows ? '/' : '\\';
		if (path.indexOf(badSep) === -1) {
			return path;
		}
	}

	let parts = path.split(/[\\\/]/);
	for (let i = 0, len = parts.length; i < len; i++) {
		if (parts[i] === '.' && !!parts[i + 1]) {
			parts.splice(i, 1);
			i -= 1;
		} else if (parts[i] === '..' && !!parts[i - 1]) {
			parts.splice(i - 1, 2);
			i -= 2;
		}
	}

	return parts.join(toOSPath ? nativeSep : sep);
}

export function dirnames(path: string): { next: () => { done: boolean; value: string; } } {

	var value = path,
		done = false;

	function next() {
		if (value === '.' || value === '/' || value === '\\') {
			value = undefined;
			done = true;
		} else {
			value = dirname(value);
		}
		return {
			value,
			done
		};
	}
	return {
		next
	};
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


function getRootLength(path: string): number {

	if (!path) {
		return 0;
	}

	path = path.replace(/\/|\\/g, '/');

	if (path[0] === '/') {
		if (path[1] !== '/') {
			// /far/boo
			return 1;
		} else {
			// //server/far/boo
			return 2;
		}
	}

	if (path[1] === ':') {
		if (path[2] === '/') {
			// c:/boo/far.txt
			return 3;
		} else {
			// c:
			return 2;
		}
	}

	if (path.indexOf('file:///') === 0) {
		return 8; // 8 -> 'file:///'.length
	}

	var idx = path.indexOf('://');
	if (idx !== -1) {
		return idx + 3; // 3 -> "://".length
	}
	return 0;
}

export function join(...parts: string[]): string {

	var rootLen = getRootLength(parts[0]),
		root: string;

	// simply preserve things like c:/, //localhost/, file:///, http://, etc
	root = parts[0].substr(0, rootLen);
	parts[0] = parts[0].substr(rootLen);

	var allParts: string[] = [],
		endsWithSep = /[\\\/]$/.test(parts[parts.length - 1]);

	for (var i = 0; i < parts.length; i++) {
		allParts.push.apply(allParts, parts[i].split(/\/|\\/));
	}

	for (var i = 0; i < allParts.length; i++) {
		var part = allParts[i];
		if (part === '.' || part.length === 0) {
			allParts.splice(i, 1);
			i -= 1;
		} else if (part === '..' && !!allParts[i - 1] && allParts[i - 1] !== '..') {
			allParts.splice(i - 1, 2);
			i -= 2;
		}
	}

	if (endsWithSep) {
		allParts.push('');
	}

	var ret = allParts.join('/');
	if (root) {
		ret = root.replace(/\/|\\/g, '/') + ret;
	}

	return ret;
}

export function isUNC(path: string): boolean {
	if (!isWindows || !path) {
		return false; // UNC is a windows concept
	}

	path = this.normalize(path, true);

	return path[0] === nativeSep && path[1] === nativeSep;
}

function isPosixAbsolute(path: string): boolean {
	return path && path[0] === '/';
}

export function makeAbsolute(path: string, isPathNormalized?: boolean): string {
	return isPosixAbsolute(!isPathNormalized ? normalize(path) : path) ? path : sep + path;
}

export function isRelative(path: string): boolean {
	return path && path.length > 1 && path[0] === '.';
}

const _slash = '/'.charCodeAt(0);

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

	if (isWindows && endsWith(name, '.')) {
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
