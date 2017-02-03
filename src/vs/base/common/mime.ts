/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import paths = require('vs/base/common/paths');
import types = require('vs/base/common/types');
import strings = require('vs/base/common/strings');
import { match } from 'vs/base/common/glob';

export let MIME_TEXT = 'text/plain';
export let MIME_BINARY = 'application/octet-stream';
export let MIME_UNKNOWN = 'application/unknown';

export interface ITextMimeAssociation {
	id: string;
	mime: string;
	filename?: string;
	extension?: string;
	filepattern?: string;
	firstline?: RegExp;
	userConfigured?: boolean;
}

interface ITextMimeAssociationItem extends ITextMimeAssociation {
	filenameLowercase?: string;
	extensionLowercase?: string;
	filepatternLowercase?: string;
	filepatternOnPath?: boolean;
}

let registeredAssociations: ITextMimeAssociationItem[] = [];
let nonUserRegisteredAssociations: ITextMimeAssociationItem[] = [];
let userRegisteredAssociations: ITextMimeAssociationItem[] = [];

/**
 * Associate a text mime to the registry.
 */
export function registerTextMime(association: ITextMimeAssociation): void {

	// Register
	const associationItem = toTextMimeAssociationItem(association);
	registeredAssociations.push(associationItem);
	if (!associationItem.userConfigured) {
		nonUserRegisteredAssociations.push(associationItem);
	} else {
		userRegisteredAssociations.push(associationItem);
	}

	// Check for conflicts unless this is a user configured association
	if (!associationItem.userConfigured) {
		registeredAssociations.forEach(a => {
			if (a.mime === associationItem.mime || a.userConfigured) {
				return; // same mime or userConfigured is ok
			}

			if (associationItem.extension && a.extension === associationItem.extension) {
				console.warn(`Overwriting extension <<${associationItem.extension}>> to now point to mime <<${associationItem.mime}>>`);
			}

			if (associationItem.filename && a.filename === associationItem.filename) {
				console.warn(`Overwriting filename <<${associationItem.filename}>> to now point to mime <<${associationItem.mime}>>`);
			}

			if (associationItem.filepattern && a.filepattern === associationItem.filepattern) {
				console.warn(`Overwriting filepattern <<${associationItem.filepattern}>> to now point to mime <<${associationItem.mime}>>`);
			}

			if (associationItem.firstline && a.firstline === associationItem.firstline) {
				console.warn(`Overwriting firstline <<${associationItem.firstline}>> to now point to mime <<${associationItem.mime}>>`);
			}
		});
	}
}

function toTextMimeAssociationItem(association: ITextMimeAssociation): ITextMimeAssociationItem {
	return {
		id: association.id,
		mime: association.mime,
		filename: association.filename,
		extension: association.extension,
		filepattern: association.filepattern,
		firstline: association.firstline,
		userConfigured: association.userConfigured,
		filenameLowercase: association.filename ? association.filename.toLowerCase() : void 0,
		extensionLowercase: association.extension ? association.extension.toLowerCase() : void 0,
		filepatternLowercase: association.filepattern ? association.filepattern.toLowerCase() : void 0,
		filepatternOnPath: association.filepattern ? association.filepattern.indexOf(paths.sep) >= 0 : false
	};
}

/**
 * Clear text mimes from the registry.
 */
export function clearTextMimes(onlyUserConfigured?: boolean): void {
	if (!onlyUserConfigured) {
		registeredAssociations = [];
		nonUserRegisteredAssociations = [];
		userRegisteredAssociations = [];
	} else {
		registeredAssociations = registeredAssociations.filter(a => !a.userConfigured);
		userRegisteredAssociations = [];
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

	// 1.) User configured mappings have highest priority
	let configuredMime = guessMimeTypeByPath(path, filename, userRegisteredAssociations);
	if (configuredMime) {
		return [configuredMime, MIME_TEXT];
	}

	// 2.) Registered mappings have middle priority
	let registeredMime = guessMimeTypeByPath(path, filename, nonUserRegisteredAssociations);
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

function guessMimeTypeByPath(path: string, filename: string, associations: ITextMimeAssociationItem[]): string {
	let filenameMatch: ITextMimeAssociationItem;
	let patternMatch: ITextMimeAssociationItem;
	let extensionMatch: ITextMimeAssociationItem;

	for (let i = 0; i < associations.length; i++) {
		let association = associations[i];

		// First exact name match
		if (filename === association.filenameLowercase) {
			filenameMatch = association;
			break; // take it!
		}

		// Longest pattern match
		if (association.filepattern) {
			if (!patternMatch || association.filepattern.length > patternMatch.filepattern.length) {
				let target = association.filepatternOnPath ? path : filename; // match on full path if pattern contains path separator
				if (match(association.filepatternLowercase, target)) {
					patternMatch = association;
				}
			}
		}

		// Longest extension match
		if (association.extension) {
			if (!extensionMatch || association.extension.length > extensionMatch.extension.length) {
				if (strings.endsWith(filename, association.extensionLowercase)) {
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

export function suggestFilename(langId: string, prefix: string): string {
	for (let i = 0; i < registeredAssociations.length; i++) {
		let association = registeredAssociations[i];
		if (association.userConfigured) {
			continue; // only support registered ones
		}

		if (association.id === langId && association.extension) {
			return prefix + association.extension;
		}
	}

	return prefix; // without any known extension, just return the prefix
}