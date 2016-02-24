/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import paths = require('vs/base/common/paths');
import types = require('vs/base/common/types');
import strings = require('vs/base/common/strings');
import {match} from 'vs/base/common/glob';

export let MIME_TEXT = 'text/plain';
export let MIME_BINARY = 'application/octet-stream';
export let MIME_UNKNOWN = 'application/unknown';

const registeredTextMimesByFilename: { [str: string]: string; } = Object.create(null);
const registeredTextMimesByFirstLine: { regexp: RegExp; mime: string; }[] = [];

// This is for automatic generation at native.guplfile.js#41 => darwinBundleDocumentTypes.extensions
export function generateKnownFilenames(onlyExtensions: boolean = true): any {
	let filter = (ext: string) => {
		if (onlyExtensions) {
			return /^\./.test(ext);
		}
		return true;
	};
	let removeLeadingDot = (ext: string) => {
		return ext.replace(/^\./, '');
	};

	let list: string[] = [];
	list = list.concat(Object.keys(registeredTextMimesByFilename));

	list = list.filter(filter).map(removeLeadingDot);
	list.sort();

	let result: string[] = [];
	let currentLetter: string = null;
	let previousItem: string = null;
	let currentRow: string[] = [];

	let pushCurrentRow = () => {
		if (currentRow.length > 0) {
			result.push('\'' + currentRow.join('\', \'') + '\'');
		}
	};

	for (let i = 0, len = list.length; i < len; i++) {
		let item = list[i];
		if (item.length === 0) {
			continue;
		}
		if (item === previousItem) {
			continue;
		}
		let letter = item.charAt(0);

		if (currentLetter !== letter) {
			pushCurrentRow();
			currentLetter = letter;
			currentRow = [];
		}

		currentRow.push(item);
		previousItem = item;
	}
	pushCurrentRow();

	return result.join(',\n');
}

/**
 * Allow to register extra text mimes dynamically based on filename
 */
export function registerTextMimeByFilename(nameOrPatternOrPrefix: string, mime: string): void {
	if (nameOrPatternOrPrefix && mime) {
		if (registeredTextMimesByFilename[nameOrPatternOrPrefix] && registeredTextMimesByFilename[nameOrPatternOrPrefix] !== mime) {
			console.warn('Overwriting filename <<' + nameOrPatternOrPrefix + '>> to now point to mime <<' + mime + '>>');
		}
		registeredTextMimesByFilename[nameOrPatternOrPrefix] = mime;
	}
}

/**
 * Allow to register extra text mimes dynamically based on firstline
 */
export function registerTextMimeByFirstLine(firstLineRegexp: RegExp, mime: string): void {
	if (firstLineRegexp && mime) {
		registeredTextMimesByFirstLine.push({ regexp: firstLineRegexp, mime: mime });
	}
}

/**
 * Given a comma separated list of mimes in order of priority, find if the list describes a binary
 * or textual resource.
 */
export function isBinaryMime(mimes: string): boolean;
export function isBinaryMime(mimes: string[]): boolean;
export function isBinaryMime(mimes: any): boolean {
	if (!mimes) {
		return false;
	}

	let mimeVals: string[];
	if (types.isArray(mimes)) {
		mimeVals = (<string[]>mimes);
	} else {
		mimeVals = (<string>mimes).split(',').map((mime) => mime.trim());
	}

	return mimeVals.indexOf(MIME_BINARY) >= 0;
}

/**
 * New function for mime type detection supporting application/unknown as concept.
 */
export function guessMimeTypes(path: string, firstLine?: string): string[] {
	if (!path) {
		return [MIME_UNKNOWN];
	}

	// 1.) Firstline gets highest priority
	if (firstLine) {
		if (strings.startsWithUTF8BOM(firstLine)) {
			firstLine = firstLine.substr(1);
		}

		if (firstLine.length > 0) {
			for (let i = 0; i < registeredTextMimesByFirstLine.length; ++i) {

				// Make sure the entire line matches, not just a subpart.
				let matches = firstLine.match(registeredTextMimesByFirstLine[i].regexp);
				if (matches && matches.length > 0 && matches[0].length === firstLine.length) {
					return [registeredTextMimesByFirstLine[i].mime, MIME_TEXT];
				}
			}
		}
	}

	// Check with file name and extension
	path = path.toLowerCase();
	let filename = paths.basename(path);

	let exactNameMatch: string;
	let extensionMatch: string;
	let patternNameMatch: string;

	// Check for dynamically registered match based on filename and extension
	for (let nameOrPatternOrPrefix in registeredTextMimesByFilename) {
		let nameOrPatternOrExtensionLower: string = nameOrPatternOrPrefix.toLowerCase();

		// First exact name match
		if (!exactNameMatch && filename === nameOrPatternOrExtensionLower) {
			exactNameMatch = nameOrPatternOrPrefix;
			break; // take it!
		}

		// Longest pattern match
		if (match(nameOrPatternOrExtensionLower, filename)) {
			if (!patternNameMatch || nameOrPatternOrExtensionLower.length > patternNameMatch.length) {
				patternNameMatch = nameOrPatternOrPrefix;
			}
		}

		// Longest extension match
		if (nameOrPatternOrPrefix[0] === '.' && strings.endsWith(filename, nameOrPatternOrExtensionLower)) {
			if (!extensionMatch || nameOrPatternOrExtensionLower.length > extensionMatch.length) {
				extensionMatch = nameOrPatternOrPrefix;
			}
		}
	}

	// 2.) Exact name match has second highest prio
	if (exactNameMatch) {
		return [registeredTextMimesByFilename[exactNameMatch], MIME_TEXT];
	}

	// 3.) Match on pattern
	if (patternNameMatch) {
		return [registeredTextMimesByFilename[patternNameMatch], MIME_TEXT];
	}

	// 4.) Match on extension comes next
	if (extensionMatch) {
		return [registeredTextMimesByFilename[extensionMatch], MIME_TEXT];
	}

	return [MIME_UNKNOWN];
}

export function isUnspecific(mime: string[] | string): boolean {
	if (!mime) {
		return true;
	}

	if (typeof mime === 'string') {
		return mime === MIME_BINARY || mime === MIME_TEXT || mime === MIME_UNKNOWN;
	}

	return mime.length === 1 && isUnspecific(mime[0]);
}

export function suggestFilename(theMime: string, prefix: string): string {
	for (let fileExtension in registeredTextMimesByFilename) {
		let mime = registeredTextMimesByFilename[fileExtension];
		if (mime === theMime) {
			return prefix + fileExtension;
		}
	}

	return null;
}