/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Escapes the glob metacharacters in `value` so that it matches literally in a `fileMatch` pattern.
 * The pattern is turned into a regular expression by a glob parser that has no escape syntax, so
 * each metacharacter is encoded as `\xAB`: the parser copies it through, and the regular expression
 * reads it back as the literal character.
 */
export function escapeGlobCharacters(value: string): string {
	return value.replace(/[*?{}[\],\\]/g, c => `\\x${c.charCodeAt(0).toString(16)}`);
}
