/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import strings = require('vs/base/common/strings');

const FileNameMatch = /^(.*)\.([^.]*)|([^.]+)$/;

export function compareFileNames(one: string, other: string): number {
	let oneMatch = FileNameMatch.exec(one.toLowerCase());
	let otherMatch = FileNameMatch.exec(other.toLowerCase());

	let oneName = oneMatch[1] || oneMatch[3] || '';
	let oneExtension = oneMatch[2] || '';

	let otherName = otherMatch[1] || otherMatch[3] || '';
	let otherExtension = otherMatch[2] || '';

	if (oneName !== otherName) {
		return oneName < otherName ? -1 : 1;
	}

	return oneExtension < otherExtension ? -1 : 1;
}

export function compareAnything(one: string, other: string, lookFor: string): number {
	let elementAName = one.toLowerCase();
	let elementBName = other.toLowerCase();

	// Sort prefix matches over non prefix matches
	const prefixCompare = compareByPrefix(one, other, lookFor);
	if (prefixCompare) {
		return prefixCompare;
	}

	// Sort suffix matches over non suffix matches
	let elementASuffixMatch = strings.endsWith(elementAName, lookFor);
	let elementBSuffixMatch = strings.endsWith(elementBName, lookFor);
	if (elementASuffixMatch !== elementBSuffixMatch) {
		return elementASuffixMatch ? -1 : 1;
	}

	// Understand file names
	let r = compareFileNames(elementAName, elementBName);
	if (r !== 0) {
		return r;
	}

	// Compare by name
	return strings.localeCompare(elementAName, elementBName);
}

export function compareByPrefix(one: string, other: string, lookFor: string): number {
	let elementAName = one.toLowerCase();
	let elementBName = other.toLowerCase();

	// Sort prefix matches over non prefix matches
	let elementAPrefixMatch = elementAName.indexOf(lookFor) === 0;
	let elementBPrefixMatch = elementBName.indexOf(lookFor) === 0;
	if (elementAPrefixMatch !== elementBPrefixMatch) {
		return elementAPrefixMatch ? -1 : 1;
	}

	// Same prefix: Sort shorter matches to the top to have those on top that match more precisely
	else if (elementAPrefixMatch && elementBPrefixMatch) {
		if (elementAName.length < elementBName.length) {
			return -1;
		}

		if (elementAName.length > elementBName.length) {
			return 1;
		}
	}

	return 0;
}