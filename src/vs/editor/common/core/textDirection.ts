/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDirection } from '../model.js';

export type EditorTextDirectionPreset = 'auto' | 'auto-keep' | 'auto-follow' | 'default' | 'ltr' | 'rtl';

export type InternalEditorTextDirectionOptions = EditorTextDirectionPreset;

const STRONG_RTL_CHARACTER = /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/u;
const STRONG_LTR_CHARACTER = /[A-Za-z\u00C0-\u02AF\u1E00-\u1EFF]/u;

function isWhitespaceCharacter(ch: string): boolean {
	return /\s/u.test(ch);
}

function getFirstStrongCharacter(value: string): { direction: TextDirection; leadingNeutralCharacters: boolean } | null {
	let sawLeadingNeutralCharacter = false;
	let encounteredNonWhitespace = false;

	for (const ch of value) {
		if (!encounteredNonWhitespace && isWhitespaceCharacter(ch)) {
			continue;
		}

		encounteredNonWhitespace = true;

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

/**
 * Returns the direction for **rendering** a line (controls the `dir=` attribute on the view-line).
 * - `auto`: auto-detect, keep base direction when leading neutral characters precede the first strong character.
 * - `auto-keep`: auto-detect, keep neutral prefix (e.g. `#`) at the left edge; use `getConfiguredTypingDirection` for textarea direction.
 * - `auto-follow`: auto-detect, let leading neutral characters follow the first strong character.
 */
export function getConfiguredTextDirection(value: string, preset: EditorTextDirectionPreset, baseDirection: TextDirection): TextDirection {
	switch (preset) {
		case 'ltr':
			return TextDirection.LTR;
		case 'rtl':
			return TextDirection.RTL;
		case 'default':
			return baseDirection;
		case 'auto':
		case 'auto-keep': {
			// Both keep the line at base direction when a neutral prefix precedes the first strong character.
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
 * Unlike `getConfiguredTextDirection`, `auto-keep` returns RTL here so the user types
 * right-to-left after neutral prefix characters even though the line renders LTR.
 */
export function getConfiguredTypingDirection(value: string, preset: EditorTextDirectionPreset, baseDirection: TextDirection): TextDirection {
	switch (preset) {
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
		case 'auto-keep': {
			// Preserve base typing direction when a neutral prefix is present.
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
