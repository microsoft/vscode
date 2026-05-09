/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDirection } from '../model.js';

export type EditorTextDirectionPreset = 'contextual' | 'auto' | 'auto-follow' | 'default' | 'ltr' | 'rtl';

export type ResolvedEditorTextDirectionPreset = Exclude<EditorTextDirectionPreset, 'contextual'>;

export type InternalEditorTextDirectionOptions = EditorTextDirectionPreset;

const proseLikeLanguageIds = new Set([
	'plaintext',
	'markdown',
	'mdx',
	'asciidoc',
	'restructuredtext',
	'git-commit',
	'scminput',
]);

const WEAK_NUMBER_CHARACTER = /[0-9\u0660-\u0669\u06F0-\u06F9]/u;
const STRONG_RTL_CHARACTER = /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/u;
const STRONG_LTR_CHARACTER = /[A-Za-z\u00C0-\u02AF\u1E00-\u1EFF]/u;

function isWhitespaceCharacter(ch: string): boolean {
	return /\s/u.test(ch);
}

function getDirectionDetectionSample(value: string): string {
	const openingFence = value.match(/^`+/)?.[0];
	const closingFence = value.match(/`+$/)?.[0];
	if (!openingFence || !closingFence || openingFence.length !== closingFence.length) {
		return value;
	}

	let sample = value.slice(openingFence.length, value.length - closingFence.length);
	if (sample.startsWith(' ') && sample.endsWith(' ')) {
		sample = sample.slice(1, -1);
	}

	if (openingFence.length >= 3) {
		const firstNewlineIndex = sample.indexOf('\n');
		if (firstNewlineIndex !== -1) {
			sample = sample.slice(firstNewlineIndex + 1);
		}
	}

	return sample.length > 0 ? sample : value;
}

function getFirstStrongCharacter(value: string): { direction: TextDirection; leadingNeutralCharacters: boolean } | null {
	value = getDirectionDetectionSample(value);
	let sawLeadingNeutralCharacter = false;
	let encounteredNonWhitespace = false;

	for (const ch of value) {
		if (!encounteredNonWhitespace && isWhitespaceCharacter(ch)) {
			continue;
		}

		encounteredNonWhitespace = true;

		if (WEAK_NUMBER_CHARACTER.test(ch)) {
			sawLeadingNeutralCharacter = true;
			continue;
		}

		if (STRONG_RTL_CHARACTER.test(ch)) {
			return { direction: TextDirection.RTL, leadingNeutralCharacters: sawLeadingNeutralCharacter };
		}
		if (STRONG_LTR_CHARACTER.test(ch)) {
			return { direction: TextDirection.LTR, leadingNeutralCharacters: sawLeadingNeutralCharacter };
		}

		sawLeadingNeutralCharacter = true;
	}

	return null;
}

export function resolveTextDirectionPreset(preset: EditorTextDirectionPreset, languageId?: string): ResolvedEditorTextDirectionPreset {
	if (preset !== 'contextual') {
		return preset;
	}

	return !languageId || proseLikeLanguageIds.has(languageId) ? 'auto-follow' : 'auto';
}

/**
 * Returns the direction for **rendering** a line (controls the `dir=` attribute on the view-line).
 * - `auto`: auto-detect, keep base direction when leading neutral characters precede the first strong character.
 * - `auto-follow`: auto-detect, let leading neutral characters follow the first strong character.
 */
export function getConfiguredTextDirection(value: string, preset: EditorTextDirectionPreset, baseDirection: TextDirection, languageId?: string): TextDirection {
	switch (resolveTextDirectionPreset(preset, languageId)) {
		case 'ltr':
			return TextDirection.LTR;
		case 'rtl':
			return TextDirection.RTL;
		case 'default':
			return baseDirection;
		case 'auto': {
			// Keep the line at base direction when a neutral prefix precedes the first strong character.
			const firstStrong = getFirstStrongCharacter(value);
			if (!firstStrong || firstStrong.leadingNeutralCharacters) {
				return baseDirection;
			}
			return firstStrong.direction;
		}
		case 'auto-follow': {
			// Let leading neutral characters follow the first strong character.
			const firstStrong = getFirstStrongCharacter(value);
			if (!firstStrong) {
				return baseDirection;
			}
			return firstStrong.direction;
		}
	}
}

/**
 * Returns the direction for **typing** (controls the `dir=` attribute on the textarea/input).
 * `auto` preserves the base typing direction when a neutral prefix precedes the first strong character.
 */
export function getConfiguredTypingDirection(value: string, preset: EditorTextDirectionPreset, baseDirection: TextDirection, languageId?: string): TextDirection {
	switch (resolveTextDirectionPreset(preset, languageId)) {
		case 'ltr':
			return TextDirection.LTR;
		case 'rtl':
			return TextDirection.RTL;
		case 'default':
			return baseDirection;
		case 'auto': {
			// Keep base direction for typing when a neutral prefix is present.
			const firstStrong = getFirstStrongCharacter(value);
			if (!firstStrong || firstStrong.leadingNeutralCharacters) {
				return baseDirection;
			}
			return firstStrong.direction;
		}
		case 'auto-follow': {
			// Type in the direction of the first strong character regardless of neutral prefix.
			const firstStrong = getFirstStrongCharacter(value);
			if (!firstStrong) {
				return baseDirection;
			}
			return firstStrong.direction;
		}
	}
}

export function textDirectionToString(textDirection: TextDirection): 'ltr' | 'rtl' {
	return textDirection === TextDirection.RTL ? 'rtl' : 'ltr';
}
