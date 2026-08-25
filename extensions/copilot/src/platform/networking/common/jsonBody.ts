/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Matches a `\uD800`-`\uDFFF` escape in serialized JSON, preceded by the run of backslashes it
 * belongs to. The run tells us whether the escape is real: `JSON.stringify` writes a literal
 * backslash as `\\`, so the `u` only starts an escape when the run has odd length. An even run is
 * text that merely looks like an escape, and must be left untouched.
 */
const SURROGATE_ESCAPE = /(\\+)u[dD][89a-fA-F][0-9a-fA-F]{2}/g;

/** The escaped form of the Unicode replacement character, `\uFFFD`. */
const UNICODE_REPLACEMENT_ESCAPE = 'ufffd';

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
	// A surrogate code unit is escaped only when it is unpaired: well-formed pairs, and every other
	// non-ASCII character, are written as literal characters.
	return serialized.replace(SURROGATE_ESCAPE, (match, backslashes: string) =>
		backslashes.length % 2 === 0 ? match : `${backslashes}${UNICODE_REPLACEMENT_ESCAPE}`);
}
