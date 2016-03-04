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

export interface ITextMimeAssociation {
	pattern?: string;
	firstLineRegExp?: RegExp;
	userConfigured?: boolean;
}

const registeredTextMimesByFilename: { [str: string]: string; } = Object.create(null);
const userConfiguredTextMimesByFilename: { [str: string]: string; } = Object.create(null);
const registeredTextMimesByFirstLine: { regexp: RegExp; mime: string; }[] = [];

/**
 * Associate a text mime to the registry
 */
export function registerTextMime(mime: string, association: ITextMimeAssociation): void {
	if (mime && association) {

		// Firstline pattern
		if (association.firstLineRegExp) {
			registeredTextMimesByFirstLine.push({ regexp: association.firstLineRegExp, mime: mime });
		}

		// User configured
		if (association.userConfigured && association.pattern) {
			userConfiguredTextMimesByFilename[association.pattern] = mime;
		}

		// Built in or via Extension
		else if (association.pattern) {
			if (registeredTextMimesByFilename[association.pattern] && registeredTextMimesByFilename[association.pattern] !== mime) {
				console.warn('Overwriting filename <<' + association.pattern + '>> to now point to mime <<' + mime + '>>');
			}
			registeredTextMimesByFilename[association.pattern] = mime;
		}
	}
}

/**
 * Given a file, return the best matching mime type for it
 */
export function guessMimeTypes(path: string, firstLine?: string): string[] {
	if (!path) {
		return [MIME_UNKNOWN];
	}

	path = path.toLowerCase();
	let filename = paths.basename(path);

	// 1.) Configured mappings have highest priority
	let configuredMime = guessMimeTypeByFilename(filename, userConfiguredTextMimesByFilename);
	if (configuredMime) {
		return [configuredMime, MIME_TEXT];
	}

	// 2.) Firstline has high priority over registered mappings
	if (firstLine) {
		let firstlineMime = guessMimeTypeByFirstline(firstLine);
		if (firstlineMime) {
			return [firstlineMime, MIME_TEXT];
		}
	}

	// 3.) Registered mappings have lowest priority
	let registeredMime = guessMimeTypeByFilename(filename, registeredTextMimesByFilename);
	if (registeredMime) {
		return [registeredMime, MIME_TEXT];
	}

	return [MIME_UNKNOWN];
}

function guessMimeTypeByFilename(filename: string, map: { [str: string]: string; }): string {
	let exactNameMatch: string;
	let extensionMatch: string;
	let patternNameMatch: string;

	// Check for dynamically registered match based on filename and extension
	for (let nameOrPatternOrPrefix in map) {
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
		return map[exactNameMatch];
	}

	// 3.) Match on pattern
	if (patternNameMatch) {
		return map[patternNameMatch];
	}

	// 4.) Match on extension comes next
	if (extensionMatch) {
		return map[extensionMatch];
	}

	return null;
}

function guessMimeTypeByFirstline(firstLine: string): string {
	if (strings.startsWithUTF8BOM(firstLine)) {
		firstLine = firstLine.substr(1);
	}

	if (firstLine.length > 0) {
		for (let i = 0; i < registeredTextMimesByFirstLine.length; ++i) {

			// Make sure the entire line matches, not just a subpart.
			let matches = firstLine.match(registeredTextMimesByFirstLine[i].regexp);
			if (matches && matches.length > 0 && matches[0].length === firstLine.length) {
				return registeredTextMimesByFirstLine[i].mime;
			}
		}
	}

	return null;
}

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