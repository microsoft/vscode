/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMatch, matchesFuzzy } from './filters.js';
import { ltrim } from './strings.js';
import { ThemeIcon } from './themables.js';

const iconStartMarker = '$(';

const iconsRegex = new RegExp(`\\$\\(${ThemeIcon.iconNameExpression}(?:${ThemeIcon.iconModifierExpression})?\\)`, 'g'); // no capturing groups

const escapeIconsRegex = new RegExp(`(\\\\)?${iconsRegex.source}`, 'g');
export function escapeIcons(text: string): string {
	return text.replace(escapeIconsRegex, (match, escaped) => escaped ? match : `\\${match}`);
}

const markdownEscapedIconsRegex = new RegExp(`\\\\${iconsRegex.source}`, 'g');
export function markdownEscapeEscapedIcons(text: string): string {
	// Need to add an extra \ for escaping in markdown
	return text.replace(markdownEscapedIconsRegex, match => `\\${match}`);
}

const stripIconsRegex = new RegExp(`(\\s)?(\\\\)?${iconsRegex.source}(\\s)?`, 'g');

/**
 * Takes a label with icons (`$(iconId)xyz`)  and strips the icons out (`xyz`)
 */
export function stripIcons(text: string): string {
	if (text.indexOf(iconStartMarker) === -1) {
		return text;
	}

	return text.replace(stripIconsRegex, (match, preWhitespace, escaped, postWhitespace) => escaped ? match : preWhitespace || postWhitespace || '');
}


/**
 * Takes a label with icons (`$(iconId)xyz`), removes the icon syntax adds whitespace so that screen readers can read the text better.
 */
export function getCodiconAriaLabel(text: string | undefined) {
	if (!text) {
		return '';
	}

	return text.replace(/\$\((.*?)\)/g, (_match, codiconName) => ` ${codiconName} `).trim();
}


export interface IParsedLabelWithIcons {
	readonly text: string;
	readonly iconOffsets?: readonly number[];
}

const _parseIconsRegex = new RegExp(`\\$\\(${ThemeIcon.iconNameCharacter}+\\)`, 'g');

/**
 * Takes a label with icons (`abc $(iconId)xyz`) and returns the text (`abc xyz`) and the offsets of the icons (`[3]`)
 */
export function parseLabelWithIcons(input: string): IParsedLabelWithIcons {

	_parseIconsRegex.lastIndex = 0;

	let text = '';
	const iconOffsets: number[] = [];
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


export function matchesFuzzyIconAware(query: string, target: IParsedLabelWithIcons, enableSeparateSubstringMatching = false): IMatch[] | null {
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
