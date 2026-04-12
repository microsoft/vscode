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
const intlFileNameCollatorBaseNumeric = new Lazy(() => {
    const collator = safeIntl.Collator(undefined, { numeric: true, sensitivity: 'base' }).value;
    return {
        collator,
        collatorIsNumeric: collator.resolvedOptions().numeric
    };
});
// A collator with numeric sorting enabled.
const intlFileNameCollatorNumeric = new Lazy(() => {
    const collator = safeIntl.Collator(undefined, { numeric: true }).value;
    return {
        collator
    };
});
// A collator with numeric sorting enabled, and sensitivity to accents and diacritics but not case.
const intlFileNameCollatorNumericCaseInsensitive = new Lazy(() => {
    const collator = safeIntl.Collator(undefined, { numeric: true, sensitivity: 'accent' }).value;
    return {
        collator
    };
});
/** Compares filenames without distinguishing the name from the extension. Disambiguates by unicode comparison. */
export function compareFileNames(one, other, caseSensitive = false) {
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
export function compareFileNamesDefault(one, other) {
    const collatorNumeric = intlFileNameCollatorNumeric.value.collator;
    one = one || '';
    other = other || '';
    return compareAndDisambiguateByLength(collatorNumeric, one, other);
}
/** Compares full filenames grouping uppercase names before lowercase. */
export function compareFileNamesUpper(one, other) {
    const collatorNumeric = intlFileNameCollatorNumeric.value.collator;
    one = one || '';
    other = other || '';
    return compareCaseUpperFirst(one, other) || compareAndDisambiguateByLength(collatorNumeric, one, other);
}
/** Compares full filenames grouping lowercase names before uppercase. */
export function compareFileNamesLower(one, other) {
    const collatorNumeric = intlFileNameCollatorNumeric.value.collator;
    one = one || '';
    other = other || '';
    return compareCaseLowerFirst(one, other) || compareAndDisambiguateByLength(collatorNumeric, one, other);
}
/** Compares full filenames by unicode value. */
export function compareFileNamesUnicode(one, other) {
    one = one || '';
    other = other || '';
    if (one === other) {
        return 0;
    }
    return one < other ? -1 : 1;
}
/** Compares filenames by extension, then by name. Disambiguates by unicode comparison. */
export function compareFileExtensions(one, other) {
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
export function compareFileExtensionsDefault(one, other) {
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
export function compareFileExtensionsUpper(one, other) {
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
export function compareFileExtensionsLower(one, other) {
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
export function compareFileExtensionsUnicode(one, other) {
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
function extractNameAndExtension(str, dotfilesAsNames = false) {
    const match = str ? FileNameMatch.exec(str) : [];
    let result = [(match && match[1]) || '', (match && match[3]) || ''];
    // if the dotfilesAsNames option is selected, treat an empty filename with an extension
    // or a filename that starts with a dot, as a dotfile name
    if (dotfilesAsNames && (!result[0] && result[1] || result[0] && result[0].charAt(0) === '.')) {
        result = [result[0] + '.' + result[1], ''];
    }
    return result;
}
/** Extracts the extension from a full filename. Treats dotfiles as names, not extensions. */
function extractExtension(str) {
    const match = str ? FileNameMatch.exec(str) : [];
    return (match && match[1] && match[1].charAt(0) !== '.' && match[3]) || '';
}
function compareAndDisambiguateByLength(collator, one, other) {
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
function startsWithLower(string) {
    const character = string.charAt(0);
    return (character.toLocaleUpperCase() !== character) ? true : false;
}
/** @returns `true` if the string starts with an uppercase letter. Otherwise, `false`. */
function startsWithUpper(string) {
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
function compareCaseLowerFirst(one, other) {
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
function compareCaseUpperFirst(one, other) {
    if (startsWithUpper(one) && startsWithLower(other)) {
        return -1;
    }
    return (startsWithLower(one) && startsWithUpper(other)) ? 1 : 0;
}
function comparePathComponents(one, other, caseSensitive = false) {
    if (!caseSensitive) {
        one = one && one.toLowerCase();
        other = other && other.toLowerCase();
    }
    if (one === other) {
        return 0;
    }
    return one < other ? -1 : 1;
}
export function comparePaths(one, other, caseSensitive = false) {
    const oneParts = one.split(sep);
    const otherParts = other.split(sep);
    const lastOne = oneParts.length - 1;
    const lastOther = otherParts.length - 1;
    let endOne, endOther;
    for (let i = 0;; i++) {
        endOne = lastOne === i;
        endOther = lastOther === i;
        if (endOne && endOther) {
            return compareFileNames(oneParts[i], otherParts[i], caseSensitive);
        }
        else if (endOne) {
            return -1;
        }
        else if (endOther) {
            return 1;
        }
        const result = comparePathComponents(oneParts[i], otherParts[i], caseSensitive);
        if (result !== 0) {
            return result;
        }
    }
}
export function compareAnything(one, other, lookFor) {
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
export function compareByPrefix(one, other, lookFor) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGFyZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vY29tcGFyZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFDckMsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLFdBQVcsQ0FBQztBQUNqQyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBRWhDLG1GQUFtRjtBQUNuRiw2RUFBNkU7QUFDN0UscURBQXFEO0FBRXJELDhGQUE4RjtBQUM5RixNQUFNLCtCQUErQixHQUFrRSxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUU7SUFDcEgsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQztJQUM1RixPQUFPO1FBQ04sUUFBUTtRQUNSLGlCQUFpQixFQUFFLFFBQVEsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxPQUFPO0tBQ3JELENBQUM7QUFDSCxDQUFDLENBQUMsQ0FBQztBQUVILDJDQUEyQztBQUMzQyxNQUFNLDJCQUEyQixHQUFzQyxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUU7SUFDcEYsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUM7SUFDdkUsT0FBTztRQUNOLFFBQVE7S0FDUixDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUM7QUFFSCxtR0FBbUc7QUFDbkcsTUFBTSwwQ0FBMEMsR0FBc0MsSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFO0lBQ25HLE1BQU0sUUFBUSxHQUFHLFFB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