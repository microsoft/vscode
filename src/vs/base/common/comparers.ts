/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { safeIntl } from './date.js';
import { Lazy } from './lazy.js';
import { sep } from './path.js';

// When comparing large numbers of strings it's better for performance to create an
// Intl.Collator object and use the function provided by its compare property
// than it is to use String.prototype.localeCompare()

// A collator with numeric sorting enabled, and no sensitivity to case, accents or diacritics.
const intlFileNameCollatorBaseNumeric: Lazy<{ collator: Intl.Collator; collatorIsNumeric: boolean }> = new Lazy(() => {
	const collator = safeIntl.Collator(undefined, { numeric: true, sensitivity: 'base' }).value;
	return {
		collator,
		collatorIsNumeric: collator.resolvedOptions().numeric
	};
});

// A collator with numeric sorting enabled.
const intlFileNameCollatorNumeric: Lazy<{ collator: Intl.Collator }> = new Lazy(() => {
	const collator = safeIntl.Collator(undefined, { numeric: true }).value;
	return {
		collator
	};
});

// A collator with numeric sorting enabled, and sensitivity to accents and diacritics but not case.
const intlFileNameCollatorNumericCaseInsensitive: Lazy<{ collator: Intl.Collator }> = new Lazy(() => {
	const collator = safeIntl.Collator(undefined, { numeric: true, sensitivity: 'accent' }).value;
	return {
		collator
	};
});

/** Compares filenames without distinguishing the name from the extension. Disambiguates by unicode comparison. */
export function compareFileNames(one: string | null, other: string | null, caseSensitive = false): number {
	const a = one || '';
	const b = other || '';
	const result = intlFileNameCollatorBaseNumeric.value.collator.compare(a, b);

	// Using the numeric option will make compare(`foo1`, `foo01`) === 0. Disambiguate.
	if (intlFileNameCollatorBaseNumeric.value.collatorIsNumeric && result === 0 && a !== b) {
		return a < b ? -1 : 1;
	}

	return result;
}

/** Compares full filenames without grouping by case. */
export function compareFileNamesDefault(one: string | null, other: string | null): number {
	const collatorNumeric = intlFileNameCollatorNumeric.value.collator;
	one = one || '';
	other = other || '';

	return compareAndDisambiguateByLength(collatorNumeric, one, other);
}

/** Compares full filenames grouping uppercase names before lowercase. */
export function compareFileNamesUpper(one: string | null, other: string | null) {
	const collatorNumeric = intlFileNameCollatorNumeric.value.collator;
	one = one || '';
	other = other || '';

	return compareCaseUpperFirst(one, other) || compareAndDisambiguateByLength(collatorNumeric, one, other);
}

/** Compares full filenames grouping lowercase names before uppercase. */
export function compareFileNamesLower(one: string | null, other: string | null) {
	const collatorNumeric = intlFileNameCollatorNumeric.value.collator;
	one = one || '';
	other = other || '';

	return compareCaseLowerFirst(one, other) || compareAndDisambiguateByLength(collatorNumeric, one, other);
}

/** Compares full filenames by unicode value. */
export function compareFileNamesUnicode(one: string | null, other: string | null) {
	one = one || '';
	other = other || '';

	if (one === other) {
		return 0;
	}

	return one < other ? -1 : 1;
}

/** Compares filenames by extension, then by name. Disambiguates by unicode comparison. */
export function compareFileExtensions(one: string | null, other: string | null): number {
	const [oneName, oneExtension] = extractNameAndExtension(one);
	const [otherName, otherExtension] = extractNameAndExtension(other);

	let result = intlFileNameCollatorBaseNumeric.value.collator.compare(oneExtension, otherExtension);

	if (result === 0) {
		// Using the numeric option will  make compare(`foo1`, `foo01`) === 0. Disambiguate.
		if (intlFileNameCollatorBaseNumeric.value.collatorIsNumeric && oneExtension !== otherExtension) {
			return oneExtension < otherExtension ? -1 : 1;
		}

		// Extensions are equal, compare filenames
		result = intlFileNameCollatorBaseNumeric.value.collator.compare(oneName, otherName);

		if (intlFileNameCollatorBaseNumeric.value.collatorIsNumeric && result === 0 && oneName !== otherName) {
			return oneName < otherName ? -1 : 1;
		}
	}

	return result;
}

/** Compares filenames by extension, then by full filename. Mixes uppercase and lowercase names together. */
export function compareFileExtensionsDefault(one: string | null, other: string | null): number {
	one = one || '';
	other = other || '';
	const oneExtension = extractExtension(one);
	const otherExtension = extractExtension(other);
	const collatorNumeric = intlFileNameCollatorNumeric.value.collator;
	const collatorNumericCaseInsensitive = intlFileNameCollatorNumericCaseInsensitive.value.collator;

	return compareAndDisambiguateByLength(collatorNumericCaseInsensitive, oneExtension, otherExtension) ||
		compareAndDisambiguateByLength(collatorNumeric, one, other);
}

/** Compares filenames by extension, then case, then full filename. Groups uppercase names before lowercase. */
export function compareFileExtensionsUpper(one: string | null, other: string | null): number {
	one = one || '';
	other = other || '';
	const oneExtension = extractExtension(one);
	const otherExtension = extractExtension(other);
	const collatorNumeric = intlFileNameCollatorNumeric.value.collator;
	const collatorNumericCaseInsensitive = intlFileNameCollatorNumericCaseInsensitive.value.collator;

	return compareAndDisambiguateByLength(collatorNumericCaseInsensitive, oneExtension, otherExtension) ||
		compareCaseUpperFirst(one, other) ||
		compareAndDisambiguateByLength(collatorNumeric, one, other);
}

/** Compares filenames by extension, then case, then full filename. Groups lowercase names before uppercase. */
export function compareFileExtensionsLower(one: string | null, other: string | null): number {
	one = one || '';
	other = other || '';
	const oneExtension = extractExtension(one);
	const otherExtension = extractExtension(other);
	const collatorNumeric = intlFileNameCollatorNumeric.value.collator;
	const collatorNumericCaseInsensitive = intlFileNameCollatorNumericCaseInsensitive.value.collator;

	return compareAndDisambiguateByLength(collatorNumericCaseInsensitive, oneExtension, otherExtension) ||
		compareCaseLowerFirst(one, other) ||
		compareAndDisambiguateByLength(collatorNumeric, one, other);
}

/** Compares filenames by case-insensitive extension unicode value, then by full filename unicode value. */
export function compareFileExtensionsUnicode(one: string | null, other: string | null) {
	one = one || '';
	other = other || '';
	const oneExtension = extractExtension(one).toLowerCase();
	const otherExtension = extractExtension(other).toLowerCase();

	// Check for extension differences
	if (oneExtension !== otherExtension) {
		return oneExtension < otherExtension ? -1 : 1;
	}

	// Check for full filename differences.
	if (one !== other) {
		return one < other ? -1 : 1;
	}

	return 0;
}

const FileNameMatch = /^(.*?)(\.([^.]*))?$/;

/** Extracts the name and extension from a full filename, with optional special handling for dotfiles */
function extractNameAndExtension(str?: string | null, dotfilesAsNames = false): [string, string] {
	const match = str ? FileNameMatch.exec(str) as Array<string> : ([] as Array<string>);

	let result: [string, string] = [(match && match[1]) || '', (match && match[3]) || ''];

	// if the dotfilesAsNames option is selected, treat an empty filename with an extension
	// or a filename that starts with a dot, as a dotfile name
	if (dotfilesAsNames && (!result[0] && result[1] || result[0] && result[0].charAt(0) === '.')) {
		result = [result[0] + '.' + result[1], ''];
	}

	return result;
}

/** Extracts the extension from a full filename. Treats dotfiles as names, not extensions. */
function extractExtension(str?: string | null): string {
	const match = str ? FileNameMatch.exec(str) as Array<string> : ([] as Array<string>);

	return (match && match[1] && match[1].charAt(0) !== '.' && match[3]) || '';
}

function compareAndDisambiguateByLength(collator: Intl.Collator, one: string, other: string) {
	// Check for differences
	const result = collator.compare(one, other);
	if (result !== 0) {
		return result;
	}

	// In a numeric comparison, `foo1` and `foo01` will compare as equivalent.
	// Disambiguate by sorting the shorter string first.
	if (one.length !== other.length) {
		return one.length < other.length ? -1 : 1;
	}

	return 0;
}

/** @returns `true` if the string is starts with a lowercase letter. Otherwise, `false`. */
function startsWithLower(string: string) {
	const character = string.charAt(0);

	return (character.toLocaleUpperCase() !== character) ? true : false;
}

/** @returns `true` if the string starts with an uppercase letter. Otherwise, `false`. */
function startsWithUpper(string: string) {
	const character = string.charAt(0);

	return (character.toLocaleLowerCase() !== character) ? true : false;
}

/**
 * Compares the case of the provided strings - lowercase before uppercase
 *
 * @returns
 * ```text
 *   -1 if one is lowercase and other is uppercase
 *    1 if one is uppercase and other is lowercase
 *    0 otherwise
 * ```
 */
function compareCaseLowerFirst(one: string, other: string): number {
	if (startsWithLower(one) && startsWithUpper(other)) {
		return -1;
	}
	return (startsWithUpper(one) && startsWithLower(other)) ? 1 : 0;
}

/**
 * Compares the case of the provided strings - uppercase before lowercase
 *
 * @returns
 * ```text
 *   -1 if one is uppercase and other is lowercase
 *    1 if one is lowercase and other is uppercase
 *    0 otherwise
 * ```
 */
function compareCaseUpperFirst(one: string, other: string): number {
	if (startsWithUpper(one) && startsWithLower(other)) {
		return -1;
	}
	return (startsWithLower(one) && startsWithUpper(other)) ? 1 : 0;
}

function comparePathComponents(one: string, other: string, caseSensitive = false): number {
	if (!caseSensitive) {
		one = one && one.toLowerCase();
		other = other && other.toLowerCase();
	}

	if (one === other) {
		return 0;
	}

	return one < other ? -1 : 1;
}

export function comparePaths(one: string, other: string, caseSensitive = false): number {
	const oneParts = one.split(sep);
	const otherParts = other.split(sep);

	const lastOne = oneParts.length - 1;
	const lastOther = otherParts.length - 1;
	let endOne: boolean, endOther: boolean;

	for (let i = 0; ; i++) {
		endOne = lastOne === i;
		endOther = lastOther === i;

		if (endOne && endOther) {
			return compareFileNames(oneParts[i], otherParts[i], caseSensitive);
		} else if (endOne) {
			return -1;
		} else if (endOther) {
			return 1;
		}

		const result = comparePathComponents(oneParts[i], otherParts[i], caseSensitive);

		if (result !== 0) {
			return result;
		}
	}
}

export function compareAnything(one: string, other: string, lookFor: string): number {
	const elementAName = one.toLowerCase();
	const elementBName = other.toLowerCase();

	// Sort prefix matches over non prefix matches
	const prefixCompare = compareByPrefix(one, other, lookFor);
	if (prefixCompare) {
		return prefixCompare;
	}

	// Sort suffix matches over non suffix matches
	const elementASuffixMatch = elementAName.endsWith(lookFor);
	const elementBSuffixMatch = elementBName.endsWith(lookFor);
	if (elementASuffixMatch !== elementBSuffixMatch) {
		return elementASuffixMatch ? -1 : 1;
	}

	// Understand file names
	const r = compareFileNames(elementAName, elementBName);
	if (r !== 0) {
		return r;
	}

	// Compare by name
	return elementAName.localeCompare(elementBName);
}

export function compareByPrefix(one: string, other: string, lookFor: string): number {
	const elementAName = one.toLowerCase();
	const elementBName = other.toLowerCase();

	// Sort prefix matches over non prefix matches
	const elementAPrefixMatch = elementAName.startsWith(lookFor);
	const elementBPrefixMatch = elementBName.startsWith(lookFor);
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
