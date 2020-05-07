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

// A collator with numeric sorting enabled, and sensitivity to accents and diacritics but not case.
const intlFileNameCollatorNumericCaseInsenstive: IdleValue<{ collator: Intl.Collator }> = new IdleValue(() => {
	const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'accent' });
	return {
		collator: collator
	};
});

export function compareFileNames(one: string | null, other: string | null, caseSensitive = false): number {
	const a = one || '';
	const b = other || '';
	const result = intlFileNameCollatorBaseNumeric.getValue().collator.compare(a, b);

	// Using the numeric option in the collator will
	// make compare(`foo1`, `foo01`) === 0. We must disambiguate.
	if (intlFileNameCollatorBaseNumeric.getValue().collatorIsNumeric && result === 0 && a !== b) {
		return a < b ? -1 : 1;
	}

	return result;
}

/** Compares filenames by name then extension, sorting numbers numerically instead of alphabetically. */
export function compareFileNamesNumeric(one: string | null, other: string | null): number {
	const [oneName, oneExtension] = extractNameAndExtension(one, true);
	const [otherName, otherExtension] = extractNameAndExtension(other, true);
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

	let result = intlFileNameCollatorBaseNumeric.getValue().collator.compare(oneExtension, otherExtension);

	if (result === 0) {
		// Using the numeric option in the collator will
		// make compare(`foo1`, `foo01`) === 0. We must disambiguate.
		if (intlFileNameCollatorBaseNumeric.getValue().collatorIsNumeric && oneExtension !== otherExtension) {
			return oneExtension < otherExtension ? -1 : 1;
		}

		// Extensions are equal, compare filenames
		result = intlFileNameCollatorBaseNumeric.getValue().collator.compare(oneName, otherName);

		if (intlFileNameCollatorBaseNumeric.getValue().collatorIsNumeric && result === 0 && oneName !== otherName) {
			return oneName < otherName ? -1 : 1;
		}
	}

	return result;
}

/** Compares filenames by extenson, then by name. Sorts numbers numerically, not alphabetically. */
export function compareFileExtensionsNumeric(one: string | null, other: string | null): number {
	const [oneName, oneExtension] = extractNameAndExtension(one, true);
	const [otherName, otherExtension] = extractNameAndExtension(other, true);
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

/** Extracts the name and extension from a full filename, with optional special handling for dotfiles */
export function extractNameAndExtension(str?: string | null, dotfilesAsNames = false): [string, string] {
	const match = str ? FileNameMatch.exec(str) as Array<string> : ([] as Array<string>);

	let result: [string, string] = [(match && match[1]) || '', (match && match[3]) || ''];

	// if the dotfilesAsNames option is selected, treat an empty filename with an extension,
	// or a filename that starts with a dot, as a dotfile name
	if (dotfilesAsNames && (!result[0] && result[1] || result[0] && result[0].charAt(0) === '.')) {
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
