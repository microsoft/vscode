/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeRegExpCharacters, regExpLeadsToEndlessLoop } from '../../../../base/common/strings.js';

/** Sentinel for invalid or empty terminal approval patterns. */
export const neverMatchRegex = /(?!.*)/;

/** Compiles a terminal approval key with command boundaries and cross-platform path separators. */
export function convertAutoApproveEntryToRegex(value: string): RegExp {
	// If wrapped in `/`, treat as regex
	const regexMatch = value.match(/^\/(?<pattern>.+)\/(?<flags>[dgimsuvy]*)$/);
	const regexPattern = regexMatch?.groups?.pattern;
	if (regexPattern) {
		let flags = regexMatch.groups?.flags;
		if (flags) {
			flags = flags.replaceAll('g', '');
		}

		if (regexPattern === '.*') {
			return new RegExp(regexPattern);
		}

		try {
			const regex = new RegExp(regexPattern, flags || undefined);
			if (regExpLeadsToEndlessLoop(regex)) {
				return neverMatchRegex;
			}
			return regex;
		} catch {
			return neverMatchRegex;
		}
	}

	if (value === '') {
		return neverMatchRegex;
	}

	let sanitizedValue: string;

	// Match both path separators if it looks like a path
	if (value.includes('/') || value.includes('\\')) {
		let pattern = value.replace(/[/\\]/g, '%%PATH_SEP%%');
		pattern = escapeRegExpCharacters(pattern);
		pattern = pattern.replace(/%%PATH_SEP%%*/g, '[/\\\\]');
		sanitizedValue = `^(?:\\.[/\\\\])?${pattern}`;
	} else {
		sanitizedValue = escapeRegExpCharacters(value);
	}

	return new RegExp(`^${sanitizedValue}\\b`);
}
