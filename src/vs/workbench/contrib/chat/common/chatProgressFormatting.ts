/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { fromNow, safeIntl } from '../../../../base/common/date.js';
import { language } from '../../../../base/common/platform.js';

const dayInMilliseconds = 24 * 60 * 60 * 1000;

const chatRequestTimeFormatter = safeIntl.DateTimeFormat(language, {
	hour: 'numeric',
	minute: '2-digit',
});

const chatRequestFullDateTimeFormatter = safeIntl.DateTimeFormat(language, {
	year: 'numeric',
	month: 'numeric',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
});

export interface IFormattedChatRequestTimestamp {
	readonly text: string;
	readonly fullText: string;
	readonly dateTime: string;
	readonly isRelative: boolean;
}

/**
 * Format a millisecond duration as a human-readable elapsed time string.
 * Examples: "0s", "45s", "1m 23s", "12m 5s"
 */
export function formatElapsedTime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	if (totalSeconds < 60) {
		return localize('seconds', "{0}s", totalSeconds);
	}
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return localize('minutesSeconds', "{0}m {1}s", minutes, seconds);
}

export function formatChatRequestTimestamp(timestamp: number | undefined): IFormattedChatRequestTimestamp | undefined {
	if (timestamp === undefined || !Number.isFinite(timestamp) || timestamp <= 0) {
		return undefined;
	}

	const date = new Date(timestamp);
	const age = Date.now() - timestamp;
	const isRelative = age > dayInMilliseconds;
	return {
		text: isRelative
			? fromNow(timestamp, false, true)
			: chatRequestTimeFormatter.value.format(date),
		fullText: chatRequestFullDateTimeFormatter.value.format(date),
		dateTime: date.toISOString(),
		isRelative,
	};
}

export function formatChatResponseDetails(details: string | undefined, timing: string | undefined): string {
	const parts: string[] = timing ? [timing] : [];
	if (details) {
		parts.push(details);
	}
	return parts.join(' \u2022 ');
}
