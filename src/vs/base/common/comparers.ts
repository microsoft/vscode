/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sep } from 'vs/base/common/path';
import { IdleValue } from 'vs/base/common/async';

// When comparing large numbers of strings, such as in sorting large arrays, is better for
// performance to create an Intl.Collator object and use the function provided by its compare
// property than it is to use String.prototype.localeCompare()

// A collator with numeric sorting enabled, and no sensitivity to case or to accents
const intlFileNameCollatorBaseNumeric: IdleValue<{ collator: Intl.Collator, collatorIsNumeric: boolean }> = new IdleValue(() => {
	const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
	return {
		collator: collator,
		collatorIsNumeric: collator.resolvedOptions().numeric
	};
});

// A collator with numeric sorting enabled.
const intlFileNameCollatorNumeric: IdleValue<{ collator: Intl.Collator }> = new IdleValue(() => {
	const collator = new Intl.Collator(undefined, { numeric: true });
	return {
		collator: collator
	};
});

// Selects an option for grouping names by case
const enum CaseGrouping {
	Upper,
	Lower,
	None,
}

// A collator with numeric sorting enabled, and sensitivity to accents and diacritics but not case.
const intlFileNameCollatorNumericCaseInsensitive: IdleValue<{ collator: Intl.Collator }> = new IdleValue(() => {
	const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'accent' });
	return {
		collator: collator
	};
});

export function compareFileNames(one: string | null, other: string | null, caseSensitive = false): number {
	const a = one || '';
	const b = other || '';
	const result = intlFileNameCollatorBaseNumeric.value.collator.compare(a, b);

	// Using the numeric option in the collator will
	// make compare(`foo1`, `foo01`) === 0. We must disambiguate.
	if (intlFileNameCollatorBaseNumeric.value.collatorIsNumeric && result === 0 && a !== b) {
		return a < b ? -1 : 1;
	}

	return result;
}

/** Compares filenames by name, then by extension. Mixes uppercase and lowercase names together. */
export function compareFileNamesDefault(one: string | null, other: string | null): number {
	return compareNamesThenExtensions(one, other, CaseGrouping.None);
}


/** Compares filenames by name case, then by name, then by extension. Groups uppercase names before lowercase. */
export function compareFileNamesUpper(one: string | null, other: string | null) {
	return compareNamesThenExtensions(one, other, CaseGrouping.Upper);
}

/** Compares filenames by name case, then by name, then by extension. Groups lowercase names before uppercase. */
export function compareFileNamesLower(one: string | null, other: string | null) {
	return compareNamesThenExtensions(one, other, CaseGrouping.Lower);
}

/** Compares filenames by unicode value, not differentiating between names and extensions. */
export function compareFileNamesUnicode(one: string | null, other: string | null) {
	one = one || '';
	other = other || '';

	// Simply compare both strings. No name vs extension awareness.
	if (one === other) {
		return 0;
	}

	return one < other ? -1 : 1;
}

const FileNameMatch = /^(.*?)(\.([^.]*))?$/;

export function noIntlCompareFileNames(one: string | null, other: string | null, caseSensitive = false): number {
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

export function compareFileExtensions(one: string | null, other: string | null): number {
	const [oneName, oneExtension] = extractNameAndExtension(one);
	const [otherName, otherExtension] = extractNameAndExtension(other);

	let result = intlFileNameCollatorBaseNumeric.value.collator.compare(oneExtension, otherExtension);

	if (result === 0) {
		// Using the numeric option in the collator will
		// make compare(`foo1`, `foo01`) === 0. We must disambiguate.
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

/** Compares filenames by extenson, then by name. Mixes uppercase and lowercase names together */
export function compareFileExtensionsDefault(one: string | null, other: string | null): number {
	return compareExtensionsThenNames(one, other, CaseGrouping.None);
}

/** Compares filenames by extension, then by name case, then by name. Groups uppercase names before lowercase. */
export function compareFileExtensionsUpper(one: string | null, other: string | null): number {
	return compareExtensionsThenNames(one, other, CaseGrouping.Upper);
}

/** Compares filenames by extension, then by name case, then by name. Groups lowercase names before uppercase. */
export function compareFileExtensionsLower(one: string | null, other: string | null): number {
	return compareExtensionsThenNames(one, other, CaseGrouping.Lower);
}

/** Compares filenames by extension unicode value, then by name unicode value. */
export function compareFileExtensionsUnicode(one: string | null, other: string | null) {
	const [oneName, oneExtension] = extractNameAndExtension(one, true);
	const [otherName, otherExtension] = extractNameAndExtension(other, true);

	// Check for extension differences
	if (oneExtension !== otherExtension) {
		return oneExtension < otherExtension ? -1 : 1;
	}

	// Check for name differences.
	if (oneName !== otherName) {
		return oneName < otherName ? -1 : 1;
	}

	return 0;
}

/** Extracts the name and extension from a full filename, with optional special handling for dotfiles */
function extractNameAndExtension(str?: string | null, dotfilesAsNames = false): [string, string] {
	const match = str ? FileNameMatch.exec(str) as Array<string> : ([] as Array<string>);

	let result: [string, string] = [(match && match[1]) || '', (match && match[3]) || ''];

	// if the dotfilesAsNames option is selected, treat an empty filename with an extension,
	// or a filename that starts with a dot, as a dotfile name
	if (dotfilesAsNames && (!result[0] && result[1] || result[0] && result[0].charAt(0) === '.')) {
		result = [result[0] + '.' + result[1], ''];
	}

	return result;
}

function compareAndDisambiguateByLength(collator: Intl.Collator, one: string, other: string) {
	// Check for differences
	let result = collator.compare(one, other);
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

function compareNamesThenExtensions(one: string | null, other: string | null, caseGrouping: CaseGrouping) {
	const [oneName, oneExtension] = extractNameAndExtension(one, true);
	const [otherName, otherExtension] = extractNameAndExtension(other, true);
	const collatorNumeric = intlFileNameCollatorNumeric.getValue().collator;
	const collatorNumericCaseInsensitive = intlFileNameCollatorNumericCaseInsensitive.getValue().collator;
	let result = 0;

	// Compare names by case if case grouping is selected.
	switch (caseGrouping) {
		case CaseGrouping.Upper:
			result = compareCaseUpperFirst(oneName, otherName);
			break;
		case CaseGrouping.Lower:
			result = compareCaseLowerFirst(oneName, otherName);
			break;
		case CaseGrouping.None:
			break;
	}
	if (result !== 0) {
		return result;
	}

	// Check for name differences.
	result = compareAndDisambiguateByLength(collatorNumeric, oneName, otherName);
	if (result !== 0) {
		return result;
	}

	// Check for case insensitive extension differences.
	result = compareAndDisambiguateByLength(collatorNumericCaseInsensitive, oneExtension, otherExtension);
	if (result !== 0) {
		return result;
	}

	// Disambiguate the extension case if needed.
	if (oneExtension !== otherExtension) {
		return collatorNumeric.compare(oneExtension, otherExtension);
	}

	return 0;
}

function compareExtensionsThenNames(one: string | null, other: string | null, caseGrouping: CaseGrouping) {
	const [oneName, oneExtension] = extractNameAndExtension(one, true);
	const [otherName, otherExtension] = extractNameAndExtension(other, true);
	const collatorNumeric = intlFileNameCollatorNumeric.getValue().collator;
	const collatorNumericCaseInsensitive = intlFileNameCollatorNumericCaseInsensitive.getValue().collator;
	let result;

	// Check for extension differences, ignoring differences in case.
	result = compareAndDisambiguateByLength(collatorNumericCaseInsensitive, oneExtension, otherExtension);
	if (result !== 0) {
		return result;
	}

	// Compare names by case if case grouping is selected.
	switch (caseGrouping) {
		case CaseGrouping.Upper:
			result = compareCaseUpperFirst(oneName, otherName);
			break;
		case CaseGrouping.Lower:
			result = compareCaseLowerFirst(oneName, otherName);
			break;
		case CaseGrouping.None:
			break;
	}
	if (result !== 0) {
		return result;
	}

	// Compare names.
	result = compareAndDisambiguateByLength(collatorNumeric, oneName, otherName);
	if (result !== 0) {
		return result;
	}

	// Disambiguate extension case if needed.
	if (oneExtension !== otherExtension) {
		return collatorNumeric.compare(oneExtension, otherExtension);
	}

	return 0;
}

/** @returns `true` if the string is starts with a lowercase letter. Otherwise, `false`. */
function isLower(string: string) {
	const character = string.charAt(0);

	if (character.toLocaleUpperCase() !== character) {
		return true;
	}

	return false;
}

/** @returns `true` if the string starts with an uppercase letter. Otherwise, `false`. */
function isUpper(string: string) {
	const character = string.charAt(0);

	if (character.toLocaleLowerCase() !== character) {
		return true;
	}

	return false;
}

/**
 * Compares the case of the provided strings - with lowercase considered less than uppercase
 *
 * @returns
 * ```text
 *   -1 if one is lowercase and other is uppercase
 *    1 if one is uppercase and other is lowercase
 *    0 otherwise
 * ```
 */
function compareCaseLowerFirst(one: string, other: string): number {
	if (isLower(one) && isUpper(other)) {
		return -1;
	}
	if (isUpper(one) && isLower(other)) {
		return 1;
	}
	return 0;
}

/**
 * Compares the case of the provided strings - with uppercase considered less than lowercase
 *
 * @returns
 * ```text
 *   -1 if one is uppercase and other is lowercase
 *    1 if one is lowercase and other is uppercase
 *    0 otherwise
 * ```
 */
function compareCaseUpperFirst(one: string, other: string): number {
	if (isUpper(one) && isLower(other)) {
		return -1;
	}
	if (isLower(one) && isUpper(other)) {
		return 1;
	}
	return 0;
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
