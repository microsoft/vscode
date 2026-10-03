/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Reads numeric header feedback, optionally requiring a decimal nonnegative safe integer. */
export function parseHeaderNumber(value: string | null, nonNegativeInteger = false): number | undefined {
	if (value === null || !value.trim() || (nonNegativeInteger && !/^\d+$/.test(value.trim()))) {
		return undefined;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) && (!nonNegativeInteger || (Number.isSafeInteger(parsed) && parsed >= 0)) ? parsed : undefined;
}

/** Returns Retry-After seconds, with optional strict HTTP delay/date validation. */
export function parseRetryAfter(value: string | null, now: number, strict = false): number | undefined {
	const parsed = parseHeaderNumber(value, strict);
	if (parsed !== undefined) {
		return Math.max(0, parsed);
	}
	if (value === null) {
		return undefined;
	}
	if (strict) {
		value = value.trim();
		// Date.parse also accepts numeric lookalikes and treats asctime dates as local time.
		if (/^[A-Z][a-z]{2} [A-Z][a-z]{2} (?:\d{2}| \d) \d{2}:\d{2}:\d{2} \d{4}$/.test(value)) {
			value += ' GMT';
		} else if (!/^(?:[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4}|[A-Z][a-z]+, \d{2}-[A-Z][a-z]{2}-\d{2}) \d{2}:\d{2}:\d{2} GMT$/.test(value)) {
			return undefined;
		}
	}
	const date = Date.parse(value);
	return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1000)) : undefined;
}
