/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import scorer = require('vs/base/common/scorer');
import strings = require('vs/base/common/strings');

let intlFileNameComparer: Intl.Collator;

export function setFileNameComparer(collator: Intl.Collator): void {
	intlFileNameComparer = collator;
}

export function compareFileNames(one: string, other: string): number {
	if (intlFileNameComparer) {
		return intlFileNameComparer.compare(one || '', other || '');
	}

	return noIntlCompareFileNames(one, other);
}

const FileNameMatch = /^([^.]*)(\.(.*))?$/;

export function noIntlCompareFileNames(one: string, other: string): number {
	let oneMatch = FileNameMatch.exec(one.toLowerCase());
	let otherMatch = FileNameMatch.exec(other.toLowerCase());

	let oneName = oneMatch[1] || '';
	let oneExtension = oneMatch[3] || '';

	let otherName = otherMatch[1] || '';
	let otherExtension = otherMatch[3] || '';

	if (oneName !== otherName) {
		return oneName < otherName ? -1 : 1;
	}

	if (oneExtension === otherExtension) {
		return 0;
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

export interface IScorableResourceAccessor<T> {
	getLabel(t: T): string;
	getResourcePath(t: T): string;
}

export function compareByScore<T>(elementA: T, elementB: T, accessor: IScorableResourceAccessor<T>, lookFor: string, lookForNormalizedLower: string, scorerCache?: { [key: string]: number }): number {
	const labelA = accessor.getLabel(elementA);
	const labelB = accessor.getLabel(elementB);

	// treat prefix matches highest in any case
	const prefixCompare = compareByPrefix(labelA, labelB, lookFor);
	if (prefixCompare) {
		return prefixCompare;
	}

	// Give higher importance to label score
	const labelAScore = scorer.score(labelA, lookFor, scorerCache);
	const labelBScore = scorer.score(labelB, lookFor, scorerCache);

	// Useful for understanding the scoring
	// elementA.setPrefix(labelAScore + ' ');
	// elementB.setPrefix(labelBScore + ' ');

	if (labelAScore !== labelBScore) {
		return labelAScore > labelBScore ? -1 : 1;
	}

	// Score on full resource path comes next (if available)
	let resourcePathA = accessor.getResourcePath(elementA);
	let resourcePathB = accessor.getResourcePath(elementB);
	if (resourcePathA && resourcePathB) {
		const resourceAScore = scorer.score(resourcePathA, lookFor, scorerCache);
		const resourceBScore = scorer.score(resourcePathB, lookFor, scorerCache);

		// Useful for understanding the scoring
		// elementA.setPrefix(elementA.getPrefix() + ' ' + resourceAScore + ': ');
		// elementB.setPrefix(elementB.getPrefix() + ' ' + resourceBScore + ': ');

		if (resourceAScore !== resourceBScore) {
			return resourceAScore > resourceBScore ? -1 : 1;
		}
	}

	// At this place, the scores are identical so we check for string lengths and favor shorter ones
	if (labelA.length !== labelB.length) {
		return labelA.length < labelB.length ? -1 : 1;
	}

	if (resourcePathA && resourcePathB && resourcePathA.length !== resourcePathB.length) {
		return resourcePathA.length < resourcePathB.length ? -1 : 1;
	}

	// Finally compare by label or resource path
	if (labelA === labelB && resourcePathA && resourcePathB) {
		return compareAnything(resourcePathA, resourcePathB, lookForNormalizedLower);
	}

	return compareAnything(labelA, labelB, lookForNormalizedLower);
}
