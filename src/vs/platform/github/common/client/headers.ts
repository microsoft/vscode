/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const asctimeDatePattern = /^[A-Z][a-z]{2} [A-Z][a-z]{2} (?:\d{2}| \d) \d{2}:\d{2}:\d{2} \d{4}$/;
const httpDateWithZonePattern = /^(?:[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4}|[A-Z][a-z]+, \d{2}-[A-Z][a-z]{2}-\d{2}) \d{2}:\d{2}:\d{2} GMT$/;

/** Reads header value as a decimal nonnegative safe integer. */
export function parseHeaderNumber(value: string | null): number | undefined {
	if (value === null || !/^\s*\d+\s*$/.test(value)) {
		return undefined;
	}

	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/** Reads Retry-After as nonnegative integer seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now: number): number | undefined {
	if (value === null) {
		return undefined;
	}

	const parsed = parseHeaderNumber(value);
	if (parsed !== undefined) {
		return parsed;
	}

	// Date.parse also accepts numeric lookalikes and treats asctime dates as local time.
	const trimmedValue = value.trim();
	const isAsctime = asctimeDatePattern.test(trimmedValue);
	if (!isAsctime && !httpDateWithZonePattern.test(trimmedValue)) {
		return undefined;
	}

	const date = Date.parse(isAsctime ? `${trimmedValue} GMT` : trimmedValue);
	return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1000)) : undefined;
}
