/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sep } from 'vs/base/common/path';
import { IdleValue } from 'vs/base/common/async';

// When comparing large numbers of strings, such as in sorting large arrays, is better for
// performance to create an Intl.Collator object and use the function provided by its compare
// property than it is to use String.prototype.localeCompare()

// A collator with numeric sorting enabled.
const intlFileNameCollatorNumeric: IdleValue<{ collator: Intl.Collator }> = new IdleValue(() => {
	const collator = new Intl.Collator(undefined, { numeric: true });
	return {
		collator: collator
	};
});

// A collator with numeric sorting enabled, and sensitivity to accents but not case.
const intlFileNameCollatorNumericCaseInsenstive: IdleValue<{ collator: Intl.Collator }> = new IdleValue(() => {
	const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'accent' });
	return {
		collator: collator
	};
});

// A collator with numeric sorting disabled.
const intlFileNameCollator: IdleValue<{ collator: Intl.Collator }> = new IdleValue(() => {
	const collator = new Intl.Collator(undefined, { numeric: false });
	return {
		collator: collator
	};
});

// A collator with numeric sorting disabled and sensitivity to accents but not case.
const intlFileNameCollatorCaseInsensitive: IdleValue<{ collator: Intl.Collator }> = new IdleValue(() => {
	const collator = new Intl.Collator(undefined, { numeric: false, sensitivity: 'accent' });
	return {
		collator: collator
	};
});

/**
 * Compare two filenames using a fullname numeric locale-based comparison that
 * falls back to a unicode comparison.
 *
 * @deprecated Use compareFileNamesNumeric instead.
 */
export function compareFileNames(one: string | null, other: string | null, caseSensitive = false): number {
	return compareFileNamesNumeric(one, other);
}

/** Compares filenames by name then extension, sorting numbers numerically instead of alphabetically. */
export function compareFileNamesNumeric(one: string | null, other: string | null, placeholder = false): number {
	const [oneName, oneExtension] = extractNameAndExtension(one);
	const [otherName, otherExtension] = extractNameAndExtension(other);
	const collatorNumeric = intlFileNameCollatorNumeric.getValue().collator;
	const collatorNumericCaseInsensitive = intlFileNameCollatorNumericCaseInsenstive.getValue().collator;
	let result;

	// Check for name differences, comparing numbers numerically instead of alphabetically.
	result = collatorNumeric.compare(oneName, otherName);
	if (result !== 0) {
		return result;
	}

	// Using the numeric option in the collator will make compare(`foo1`, `foo01`) === 0. Sort the shorter name first.
	if (oneName.length !== otherName.length) {
		return oneName.length < otherName.length ? -1 : 1;
	}

	// Check for case insensitive extension differences, comparing numbers numerically instead of alphabetically.
	result = collatorNumericCaseInsensitive.compare(oneExtension, otherExtension);
	if (result !== 0) {
		return result;
	}

	// If extensions are numerically equal but not equal in length, sort the shorter extension first.
	if (oneExtension.length !== otherExtension.length) {
		return oneExtension.length < otherExtension.length ? -1 : 1;
	}

	// Disambiguate the extension case if needed.
	if (oneExtension !== otherExtension) {
		return collatorNumeric.compare(oneExtension, otherExtension);
	}

	return 0;
}

/** Compares filenames by name case, then by name, then by extension. Sorts uppercase names before lowercase. */
export function compareFileNamesUpper(one: string | null, other: string | null) {
	const [oneName, oneExtension] = extractNameAndExtension(one);
	const [otherName, otherExtension] = extractNameAndExtension(other);
	const collator = intlFileNameCollator.getValue().collator;
	let result;

	// Check for case differences in names.
	result = compareCaseUpperFirst(oneName, otherName);
	if (result !== 0) {
		return result;
	}

	// Extension case should not be considered when grouping files by case.
	// Do not check here for case differences in extensions.

	// Check for name differences.
	result = collator.compare(oneName, otherName);
	if (result !== 0) {
		return result;
	}

	// Check for extension differences, including possible case differences.
	return collator.compare(oneExtension, otherExtension);
}

/** Compares filenames by name case, then by name, then by extension. Sorts lowercase names before uppercase. */
export function compareFileNamesLower(one: string | null, other: string | null) {
	const [oneName, oneExtension] = extractNameAndExtension(one);
	const [otherName, otherExtension] = extractNameAndExtension(other);
	const collator = intlFileNameCollator.getValue().collator;
	let result;

	// Check for case differences in names.
	result = compareCaseLowerFirst(oneName, otherName);
	if (result !== 0) {
		return result;
	}

	// Extension case should not be considered when grouping files by case.
	// Do not check here for case differences in extensions.

	// Check for name differences.
	result = collator.compare(oneName, otherName);
	if (result !== 0) {
		return result;
	}

	// Check for extension differences, including possible case differences.
	return collator.compare(oneExtension, otherExtension);
}

/** Compares filenames by name, then by extension. */
export function compareFileNamesMixed(one: string | null, other: string | null) {
	const [oneName, oneExtension] = extractNameAndExtension(one);
	const [otherName, otherExtension] = extractNameAndExtension(other);
	const collator = intlFileNameCollator.getValue().collator;
	let result;

	// Check for name differences.
	result = collator.compare(oneName, otherName);
	if (result !== 0) {
		return result;
	}

	// Check for extension differences.
	return collator.compare(oneExtension, otherExtension);
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

/** Compares filenames by name unicode value, then extension unicode value. */
export function noIntlCompareFileNames(one: string | null, other: string | null, caseSensitive = false): number {
	if (!caseSensitive) {
		one = one && one.toLowerCase();
		other = other && other.toLowerCase();
	}

	const [oneName, oneExtension] = extractNameAndExtension(one);
	const [otherName, otherExtension] = extractNameAndExtension(other);

	// Check for name differences.
	if (oneName !== otherName) {
		return oneName < otherName ? -1 : 1;
	}

	// Names are equal. Compare extensions.
	if (oneExtension !== otherExtension) {
		return oneExtension < otherExtension ? -1 : 1;
	}

	return 0;
}

/**
 * Compare file names using a numeric locale-based comparison, first by extension, then by name.
 * Falls back to a unicode comparison when extensions or names are otherwise equal.
 *
 * @deprecated Use compareFileExtensionsNumeric instead.
 */
export function compareFileExtensions(one: string | null, other: string | null): number {
	return compareFileExtensionsNumeric(one, other);
}

/** Compares filenames by extenson, then by name. Sorts numbers numerically, not alphabetically. */
export function compareFileExtensionsNumeric(one: string | null, other: string | null): number {
	const [oneName, oneExtension] = extractNameAndExtension(one);
	const [otherName, otherExtension] = extractNameAndExtension(other);
	const collatorNumeric = intlFileNameCollatorNumeric.getValue().collator;
	const collatorNumericCaseInsensitive = intlFileNameCollatorNumericCaseInsenstive.getValue().collator;
	let result;

	// Check for extension differences, ignoring differences in case and comparing numbers numerically.
	result = collatorNumericCaseInsensitive.compare(oneExtension, otherExtension);
	if (result !== 0) {
		return result;
	}

	// Disambiguate equivalent numbers in extensions.
	if (oneExtension.length !== otherExtension.length) {
		return oneExtension.length < otherExtension.length ? -1 : 1;
	}

	// Compare names.
	result = collatorNumeric.compare(oneName, otherName);
	if (result !== 0) {
		return result;
	}

	// Disambiguate equivalent numbers in names.
	if (oneName.length !== otherName.length) {
		return oneName.length < otherName.length ? -1 : 1;
	}

	// Disambiguate extension case if needed.
	if (oneExtension !== otherExtension) {
		return collatorNumeric.compare(oneExtension, otherExtension);
	}

	return 0;
}

/** Compares filenames by extension, then by name case, then by name. Sorts uppercase names before lowercase. */
export function compareFileExtensionsUpper(one: string | null, other: string | null): number {
	const [oneName, oneExtension] = extractNameAndExtension(one);
	const [otherName, otherExtension] = extractNameAndExtension(other);
	const collator = intlFileNameCollator.getValue().collator;
	const collatorCaseInsensitive = intlFileNameCollatorCaseInsensitive.getValue().collator;

	// Check for case insensitive differences in extensions.
	let result = collatorCaseInsensitive.compare(oneExtension, otherExtension);
	if (result !== 0) {
		return result;
	}

	// Check for case differences in names.
	result = compareCaseUpperFirst(oneName, otherName);
	if (result !== 0) {
		return result;
	}

	// Check for other differences in names.
	result = collator.compare(oneName, otherName);
	if (result !== 0) {
		return result;
	}

	// Disambiguate extension case if needed.
	if (oneExtension !== otherExtension) {
		return collator.compare(oneExtension, otherExtension);
	}

	return 0;
}

/** Compares filenames by extension, then by name case, then by name. Sorts lowercase names before uppercase. */
export function compareFileExtensionsLower(one: string | null, other: string | null): number {
	const [oneName, oneExtension] = extractNameAndExtension(one);
	const [otherName, otherExtension] = extractNameAndExtension(other);
	const collator = intlFileNameCollator.getValue().collator;
	const collatorCaseInsensitive = intlFileNameCollatorCaseInsensitive.getValue().collator;

	// Check for case insensitive differences in extensions.
	let result = collatorCaseInsensitive.compare(oneExtension, otherExtension);
	if (result !== 0) {
		return result;
	}

	// Check for case differences in names.
	result = compareCaseLowerFirst(oneName, otherName);
	if (result !== 0) {
		return result;
	}

	// Check for other differences in names.
	result = collator.compare(oneName, otherName);
	if (result !== 0) {
		return result;
	}

	// Disambiguate extension case if needed.
	if (oneExtension !== otherExtension) {
		return collator.compare(oneExtension, otherExtension);
	}

	return 0;
}

/** Compares filenames by extension, then by name. */
export function compareFileExtensionsMixed(one: string | null, other: string | null): number {
	const [oneName, oneExtension] = extractNameAndExtension(one);
	const [otherName, otherExtension] = extractNameAndExtension(other);
	const collator = intlFileNameCollator.getValue().collator;
	const collatorCaseInsensitive = intlFileNameCollatorCaseInsensitive.getValue().collator;

	// Check for case insensitive differences in extensions.
	let result = collatorCaseInsensitive.compare(oneExtension, otherExtension);
	if (result !== 0) {
		return result;
	}

	// Check for differences in names.
	result = collator.compare(oneName, otherName);
	if (result !== 0) {
		return result;
	}

	// Disambiguate extension case if needed.
	if (oneExtension !== otherExtension) {
		return collator.compare(oneExtension, otherExtension);
	}

	return 0;
}

/** Compares filenames by extension unicode value, then by name unicode value. */
export function compareFileExtensionsUnicode(one: string | null, other: string | null) {
	const [oneName, oneExtension] = extractNameAndExtension(one);
	const [otherName, otherExtension] = extractNameAndExtension(other);

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

const FileNameMatch = /^(.*?)(\.([^.]*))?$/;

/** Extracts the name and extension from a full filename, with special handling for dotfiles */
function extractNameAndExtension(str?: string | null): [string, string] {
	const match = str ? FileNameMatch.exec(str) as Array<string> : ([] as Array<string>);

	let result: [string, string] = [(match && match[1]) || '', (match && match[3]) || ''];

	// treat an empty filename with an extension, or a filename that starts with a dot, as a dotfile name
	if (!result[0] && result[1] || result[0] && result[0].charAt(0) === '.') {
		result = [result[0] + '.' + result[1], ''];
	}

	return result;
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
export function compareCaseLowerFirst(one: string, other: string): number {
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
export function compareCaseUpperFirst(one: string, other: string): number {
	if (isUpper(one) && isLower(other)) {
		return -1;
	}
	if (isLower(one) && isUpper(other)) {
		return 1;
	}
	return 0;
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
			return compareFileNamesNumeric(oneParts[i], otherParts[i]);
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
	const r = compareFileNamesNumeric(elementAName, elementBName);
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
