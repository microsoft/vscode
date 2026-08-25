/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHighSurrogate, isLowSurrogate } from '../../../util/vs/base/common/strings';

const UNICODE_REPLACEMENT_CHARACTER = '\uFFFD';

/**
 * Replaces every unpaired UTF-16 surrogate code unit with the Unicode replacement character.
 *
 * Returns the input unchanged when it is already well-formed, so the common case does not allocate.
 */
export function replaceLoneSurrogates(value: string): string {
	let result: string | undefined;
	let copiedUpTo = 0;

	for (let i = 0; i < value.length; i++) {
		const charCode = value.charCodeAt(i);
		if (isHighSurrogate(charCode) && i + 1 < value.length && isLowSurrogate(value.charCodeAt(i + 1))) {
			i++; // A well-formed pair, skip both halves.
			continue;
		}
		if (!isHighSurrogate(charCode) && !isLowSurrogate(charCode)) {
			continue;
		}
		result = (result ?? '') + value.substring(copiedUpTo, i) + UNICODE_REPLACEMENT_CHARACTER;
		copiedUpTo = i + 1;
	}

	return result === undefined ? value : result + value.substring(copiedUpTo);
}

const jsonReplacer = (_key: string, value: unknown): unknown => typeof value === 'string' ? replaceLoneSurrogates(value) : value;

/**
 * Serializes a request body to JSON that can be decoded as UTF-8 by the receiving service.
 *
 * `JSON.stringify` turns an unpaired surrogate into a `\uXXXX` escape rather than failing. That
 * escape has no UTF-8 encoding, so strict server-side JSON parsers reject the whole body with a
 * `400`. Because a rejected body is usually replayed conversation history, a single bad code unit
 * keeps failing every later request in that session until the conversation is abandoned.
 */
export function stringifyJsonBody(value: unknown): string {
	const serialized = JSON.stringify(value);
	// `JSON.stringify` only ever emits a `\ud` escape for a lone surrogate; well-formed pairs are
	// written as literal characters. Text that itself contains a `\ud` sequence merely costs us a
	// redundant second pass, so this check is allowed to be over-eager but never under-eager.
	return serialized.includes('\\ud') ? JSON.stringify(value, jsonReplacer) : serialized;
}
