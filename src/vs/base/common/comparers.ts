/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import strings = require('vs/base/common/strings');

var FileNameMatch = /^(.*)\.([^.]*)|([^.]+)$/;

export function compareFileNames(one: string, other: string): number {
	var oneMatch = FileNameMatch.exec(one.toLowerCase());
	var otherMatch = FileNameMatch.exec(other.toLowerCase());

	var oneName = oneMatch[1] || oneMatch[3] || '';
	var oneExtension = oneMatch[2] || '';

	var otherName = otherMatch[1] || otherMatch[3] || '';
	var otherExtension = otherMatch[2] || '';

	if (oneName !== otherName) {
		return oneName < otherName ? -1 : 1;
	}

	return oneExtension < otherExtension ? -1 : 1;
}

export function compareAnything(one: string, other: string, lookFor: string): number {
	var elementAName = one.toLowerCase();
	var elementBName = other.toLowerCase();

	// Sort prefix matches over non prefix matches
	var elementAPrefixMatch = elementAName.indexOf(lookFor) === 0;
	var elementBPrefixMatch = elementBName.indexOf(lookFor) === 0;
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

	// Sort suffix matches over non suffix matches
	var elementASuffixMatch = strings.endsWith(elementAName, lookFor);
	var elementBSuffixMatch = strings.endsWith(elementBName, lookFor);
	if (elementASuffixMatch !== elementBSuffixMatch) {
		return elementASuffixMatch ? -1 : 1;
	}

	// Understand file names
	var r = compareFileNames(elementAName, elementBName);
	if (r !== 0) {
		return r;
	}

	// Compare by name
	return strings.localeCompare(elementAName, elementBName);
}