/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { matchesFuzzy } from './filters.js';
import { ltrim } from './strings.js';
import { ThemeIcon } from './themables.js';
const iconStartMarker = '$(';
const iconsRegex = new RegExp(`\\$\\(${ThemeIcon.iconNameExpression}(?:${ThemeIcon.iconModifierExpression})?\\)`, 'g'); // no capturing groups
const escapeIconsRegex = new RegExp(`(\\\\)?${iconsRegex.source}`, 'g');
export function escapeIcons(text) {
    return text.replace(escapeIconsRegex, (match, escaped) => escaped ? match : `\\${match}`);
}
const markdownEscapedIconsRegex = new RegExp(`\\\\${iconsRegex.source}`, 'g');
export function markdownEscapeEscapedIcons(text) {
    // Need to add an extra \ for escaping in markdown
    return text.replace(markdownEscapedIconsRegex, match => `\\${match}`);
}
const stripIconsRegex = new RegExp(`(\\s)?(\\\\)?${iconsRegex.source}(\\s)?`, 'g');
/**
 * Takes a label with icons (`$(iconId)xyz`)  and strips the icons out (`xyz`)
 */
export function stripIcons(text) {
    if (text.indexOf(iconStartMarker) === -1) {
        return text;
    }
    return text.replace(stripIconsRegex, (match, preWhitespace, escaped, postWhitespace) => escaped ? match : preWhitespace || postWhitespace || '');
}
/**
 * Takes a label with icons (`$(iconId)xyz`), removes the icon syntax adds whitespace so that screen readers can read the text better.
 */
export function getCodiconAriaLabel(text) {
    if (!text) {
        return '';
    }
    return text.replace(/\$\((.*?)\)/g, (_match, codiconName) => ` ${codiconName} `).trim();
}
const _parseIconsRegex = new RegExp(`\\$\\(${ThemeIcon.iconNameCharacter}+\\)`, 'g');
/**
 * Takes a label with icons (`abc $(iconId)xyz`) and returns the text (`abc xyz`) and the offsets of the icons (`[3]`)
 */
export function parseLabelWithIcons(input) {
    _parseIconsRegex.lastIndex = 0;
    let text = '';
    const iconOffsets = [];
    let iconsOffset = 0;
    while (true) {
        const pos = _parseIconsRegex.lastIndex;
        const match = _parseIconsRegex.exec(input);
        const chars = input.substring(pos, match?.index);
        if (chars.length > 0) {
            text += chars;
            for (let i = 0; i < chars.length; i++) {
                iconOffsets.push(iconsOffset);
            }
        }
        if (!match) {
            break;
        }
        iconsOffset += match[0].length;
    }
    return { text, iconOffsets };
}
export function matchesFuzzyIconAware(query, target, enableSeparateSubstringMatching = false) {
    const { text, iconOffsets } = target;
    // Return early if there are no icon markers in the word to match against
    if (!iconOffsets || iconOffsets.length === 0) {
        return matchesFuzzy(query, text, enableSeparateSubstringMatching);
    }
    // Trim the word to match against because it could have leading
    // whitespace now if the word started with an icon
    const wordToMatchAgainstWithoutIconsTrimmed = ltrim(text, ' ');
    const leadingWhitespaceOffset = text.length - wordToMatchAgainstWithoutIconsTrimmed.length;
    // match on value without icon
    const matches = matchesFuzzy(query, wordToMatchAgainstWithoutIconsTrimmed, enableSeparateSubstringMatching);
    // Map matches back to offsets with icon and trimming
    if (matches) {
        for (const match of matches) {
            const iconOffset = iconOffsets[match.start + leadingWhitespaceOffset] /* icon offsets at index */ + leadingWhitespaceOffset /* overall leading whitespace offset */;
            match.start += iconOffset;
            match.end += iconOffset;
        }
    }
    return matches;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWNvbkxhYmVscy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL2ljb25MYWJlbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFVLFlBQVksRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUNwRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQ3JDLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUUzQyxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUM7QUFFN0IsTUFBTSxVQUFVLEdBQUcsSUFBSSxNQUFNLENBQUMsU0FBUyxTQUFTLENBQUMsa0JBQWtCLE1BQU0sU0FBUyxDQUFDLHNCQUFzQixPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxzQkFBc0I7QUFFOUksTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLE1BQU0sQ0FBQyxVQUFVLFVBQVUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUN4RSxNQUFNLFVBQVUsV0FBVyxDQUFDLElBQVk7SUFDdkMsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLGdCQUFnQixFQUFFLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxFQUFFLENBQUMsQ0FBQztBQUMzRixDQUFDO0FBRUQsTUFBTSx5QkFBeUIsR0FBRyxJQUFJLE1BQU0sQ0FBQyxPQUFPLFVBQVUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUM5RSxNQUFNLFVBQVUsMEJBQTBCLENBQUMsSUFBWTtJQUN0RCxrREFBa0Q7SUFDbEQsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLHlCQUF5QixFQUFFLEtBQUssQ0FBQyxFQUFFLENB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