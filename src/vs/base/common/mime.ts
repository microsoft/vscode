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
	mime: string;
	filename?: string;
	extension?: string;
	filepattern?: string;
	firstline?: RegExp;
	userConfigured?: boolean;
}

let registeredAssociations: ITextMimeAssociation[] = [];

/**
 * Associate a text mime to the registry.
 */
export function registerTextMime(association: ITextMimeAssociation): void {

	// Register
	registeredAssociations.push(association);

	// Check for conflicts unless this is a user configured association
	if (!association.userConfigured) {
		registeredAssociations.forEach(a => {
			if (a.mime === association.mime || a.userConfigured) {
				return; // same mime or userConfigured is ok
			}

			if (association.extension && a.extension === association.extension) {
				console.warn(`Overwriting extension <<${association.extension}>> to now point to mime <<${association.mime}>>`);
			}

			if (association.filename && a.filename === association.filename) {
				console.warn(`Overwriting filename <<${association.filename}>> to now point to mime <<${association.mime}>>`);
			}

			if (association.filepattern && a.filepattern === association.filepattern) {
				console.warn(`Overwriting filepattern <<${association.filepattern}>> to now point to mime <<${association.mime}>>`);
			}

			if (association.firstline && a.firstline === association.firstline) {
				console.warn(`Overwriting firstline <<${association.firstline}>> to now point to mime <<${association.mime}>>`);
			}
		});
	}
}

/**
 * Clear text mimes from the registry.
 */
export function clearTextMimes(onlyUserConfigured?: boolean): void {
	if (!onlyUserConfigured) {
		registeredAssociations = [];
	} else {
		registeredAssociations = registeredAssociations.filter(a => !a.userConfigured);
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

	// 1.) User configured mappings have highest priority
	let configuredMime = guessMimeTypeByPath(path, registeredAssociations.filter(a => a.userConfigured));
	if (configuredMime) {
		return [configuredMime, MIME_TEXT];
	}

	// 2.) Registered mappings have middle priority
	let registeredMime = guessMimeTypeByPath(path, registeredAssociations.filter(a => !a.userConfigured));
	if (registeredMime) {
		return [registeredMime, MIME_TEXT];
	}

	// 3.) Firstline has lowest priority
	if (firstLine) {
		let firstlineMime = guessMimeTypeByFirstline(firstLine);
		if (firstlineMime) {
			return [firstlineMime, MIME_TEXT];
		}
	}

	return [MIME_UNKNOWN];
}

function guessMimeTypeByPath(path: string, associations: ITextMimeAssociation[]): string {
	let filename = paths.basename(path);

	let filenameMatch: ITextMimeAssociation;
	let patternMatch: ITextMimeAssociation;
	let extensionMatch: ITextMimeAssociation;

	for (var i = 0; i < associations.length; i++) {
		let association = associations[i];

		// First exact name match
		if (association.filename && filename === association.filename.toLowerCase()) {
			filenameMatch = association;
			break; // take it!
		}

		// Longest pattern match
		if (association.filepattern) {
			let target = association.filepattern.indexOf(paths.sep) >= 0 ? path : filename; // match on full path if pattern contains path separator
			if (match(association.filepattern.toLowerCase(), target)) {
				if (!patternMatch || association.filepattern.length > patternMatch.filepattern.length) {
					patternMatch = association;
				}
			}
		}

		// Longest extension match
		if (association.extension) {
			if (strings.endsWith(filename, association.extension.toLowerCase())) {
				if (!extensionMatch || association.extension.length > extensionMatch.extension.length) {
					extensionMatch = association;
				}
			}
		}
	}

	// 1.) Exact name match has second highest prio
	if (filenameMatch) {
		return filenameMatch.mime;
	}

	// 2.) Match on pattern
	if (patternMatch) {
		return patternMatch.mime;
	}

	// 3.) Match on extension comes next
	if (extensionMatch) {
		return extensionMatch.mime;
	}

	return null;
}

function guessMimeTypeByFirstline(firstLine: string): string {
	if (strings.startsWithUTF8BOM(firstLine)) {
		firstLine = firstLine.substr(1);
	}

	if (firstLine.length > 0) {
		for (let i = 0; i < registeredAssociations.length; ++i) {
			let association = registeredAssociations[i];
			if (!association.firstline) {
				continue;
			}

			// Make sure the entire line matches, not just a subpart.
			let matches = firstLine.match(association.firstline);
			if (matches && matches.length > 0 && matches[0].length === firstLine.length) {
				return association.mime;
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
	for (var i = 0; i < registeredAssociations.length; i++) {
		let association = registeredAssociations[i];
		if (association.userConfigured) {
			continue; // only support registered ones
		}

		if (association.mime === theMime && association.extension) {
			return prefix + association.extension;
		}
	}

	return null;
}