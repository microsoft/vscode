/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from './strings';

let intlFileNameCollator: Intl.Collator;
let intlFileNameCollatorIsNumeric: boolean;

setFileNameComparer(new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }));

export function setFileNameComparer(collator: Intl.Collator): void {
	intlFileNameCollator = collator;
	intlFileNameCollatorIsNumeric = collator.resolvedOptions().numeric;
}

export function compareFileNames(one: string, other: string, caseSensitive = false): number {
	if (intlFileNameCollator) {
		const a = one || '';
		const b = other || '';
		const result = intlFileNameCollator.compare(a, b);

		// Using the numeric option in the collator will
		// make compare(`foo1`, `foo01`) === 0. We must disambiguate.
		if (intlFileNameCollatorIsNumeric && result === 0 && a !== b) {
			return a < b ? -1 : 1;
		}

		return result;
	}

	return noIntlCompareFileNames(one, other, caseSensitive);
}

const FileNameMatch = /^(.*?)(\.([^.]*))?$/;

export function noIntlCompareFileNames(one: string, other: string, caseSensitive = false): number {
	if (!caseSensitive) {
		one = one && one.toLowerCase();
		other = other && other.toLowerCase();
	}

	const [oneName, oneExtension] = extractNameAndExtension(one);
	const [otherName, otherExtension] = extractNameAndExtension(other);

	if (oneName !== otherName) {
		return oneName < otherName ? -1 : 1;
	}

	if (oneExtension === otherExtension) {
		return 0;
	}

	return oneExtension < otherExtension ? -1 : 1;
}

function extractNameAndExtension(str?: string): [string, string] {
	const match = str ? FileNameMatch.exec(str) : [] as RegExpExecArray;

	return [(match && match[1]) || '', (match && match[3]) || ''];
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
	return elementAName.localeCompare(elementBName);
}

export function compareByPrefix(one: string, other: string, lookFor: string): number {
	let elementAName = one.toLowerCase();
	let elementBName = other.toLowerCase();

	// Sort prefix matches over non prefix matches
	let elementAPrefixMatch = strings.startsWith(elementAName, lookFor);
	let elementBPrefixMatch = strings.startsWith(elementBName, lookFor);
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
