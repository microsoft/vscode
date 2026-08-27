/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Matches a single escape sequence in serialized JSON, capturing the part after the backslash.
 *
 * Matching *every* escape rather than only the surrogate ones is what keeps this both correct and
 * linear. An escaped backslash is consumed whole, so text that merely looks like an escape (a
 * literal `\ud83d`, which `JSON.stringify` writes as `\\ud83d`) can never be mistaken for one, and
 * no position is ever rescanned. Matching `\\+u...` instead would be quadratic in the length of a
 * run of backslashes, which is reachable from tool output.
 */
const JSON_ESCAPE = /\\(u[dD][89a-fA-F][0-9a-fA-F]{2}|[\s\S])/g;

/** The escaped form of the Unicode replacement character, `\uFFFD`. */
const UNICODE_REPLACEMENT_ESCAPE = '\\ufffd';

/**
 * Serializes a request body to JSON that can be decoded as UTF-8 by the receiving service.
 *
 * `JSON.stringify` turns an unpaired surrogate into a `\uXXXX` escape rather than failing. That
 * escape has no UTF-8 encoding, so strict server-side JSON parsers reject the whole body with a
 * `400`. Because a rejected body is usually replayed conversation history, a single bad code unit
 * keeps failing every later request in that session until the conversation is abandoned.
 *
 * The repair happens on the serialized JSON rather than on the input because a `JSON.stringify`
 * replacer cannot rewrite property names, only values.
 *
 * @throws if `value` has no JSON representation at all, such as `undefined` or a function.
 */
export function stringifyJsonBody(value: unknown): string {
	const serialized = JSON.stringify(value);
	if (typeof serialized !== 'string') {
		throw new Error(`Illegal arguments! A value of type '${typeof value}' has no JSON representation!`);
	}
	// `JSON.stringify` escapes a surrogate code unit only when it is unpaired, and always writes the
	// escape in lowercase; well-formed pairs and every other non-ASCII character are written as
	// literal characters. Bodies are usually replayed conversation history and almost never contain
	// such an escape, so skip the scan entirely rather than walking megabytes for nothing. Text that
	// itself contains a `\ud` sequence merely costs a redundant scan, so this check is allowed to be
	// over-eager but never under-eager.
	if (!serialized.includes('\\ud')) {
		return serialized;
	}
	return serialized.replace(JSON_ESCAPE, (match, escape: string) =>
		escape.length === 1 ? match : UNICODE_REPLACEMENT_ESCAPE);
}
