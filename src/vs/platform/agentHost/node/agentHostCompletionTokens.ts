/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionTriggerCharacter } from './agentHostCompletions.js';

/** Token the user types after `#` to reference another session. */
export const SESSION_TOKEN = 'session';

/**
 * Result of {@link extractAtToken}.
 */
export interface IAtToken {
	readonly token: string;
	readonly triggerChar: string;
	readonly rangeStart: number;
	readonly rangeEnd: number;
}

/**
 * Walk back from `offset` to find the most recent `@`/`#` that is preceded by
 * whitespace (or start-of-string) and not interrupted by whitespace. Returns
 * the substring after the trigger together with the range to replace, or
 * `undefined` if no such token is being typed at `offset`.
 *
 * Shared by the file- and session-reference completion providers (and exported
 * for unit testing) so it lives in a neutral module rather than either provider.
 */
export function extractAtToken(text: string, offset: number): IAtToken | undefined {
	if (offset < 0 || offset > text.length) {
		return undefined;
	}
	for (let i = offset - 1; i >= 0; i--) {
		const ch = text.charCodeAt(i);
		// whitespace terminates the search
		if (ch === 0x20 /* space */ || ch === 0x09 /* tab */ || ch === 0x0a /* \n */ || ch === 0x0d /* \r */) {
			return undefined;
		}
		if (text[i] === CompletionTriggerCharacter.File || text[i] === CompletionTriggerCharacter.Hash) {
			// The trigger character must be at start-of-input or preceded by whitespace.
			if (i > 0) {
				const prev = text.charCodeAt(i - 1);
				const prevIsWs = prev === 0x20 || prev === 0x09 || prev === 0x0a || prev === 0x0d;
				if (!prevIsWs) {
					return undefined;
				}
			}
			return { token: text.slice(i + 1, offset), triggerChar: text[i], rangeStart: i, rangeEnd: offset };
		}
	}
	return undefined;
}

/**
 * Whether a `#`-token is heading toward a `#session` reference - a non-empty
 * prefix of `session` (so it matches as soon as `#s` is typed) or the completed
 * `session:<filter>` form. Deliberately does NOT match tokens that merely start
 * with `session` (e.g. `#sessions`, `#sessionManager`), so the file-reference
 * provider only cedes genuine session references. Shared so both providers agree.
 */
export function isSessionReferenceToken(token: string): boolean {
	const typed = token.toLowerCase();
	return typed.length > 0 && (SESSION_TOKEN.startsWith(typed) || typed.startsWith(`${SESSION_TOKEN}:`));
}
