/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { fromNow, safeIntl } from '../../../../base/common/date.js';
import { language, regionalLocale } from '../../../../base/common/platform.js';

const dayInMilliseconds = 24 * 60 * 60 * 1000;

const tokensPerSecondFormatter = safeIntl.NumberFormat(language, { maximumFractionDigits: 1 });

const tokenCountFormatter = safeIntl.NumberFormat(language);

/** By number of decimals, which stay fixed so that a count keeps its width as it grows. */
const abbreviatedTokenCountFormatters = [1, 2, 3].map(decimals => safeIntl.NumberFormat(language, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));

const chatRequestTimeFormatter = safeIntl.DateTimeFormat(regionalLocale, {
	hour: 'numeric',
	minute: '2-digit',
});

const chatRequestFullDateTimeFormatter = safeIntl.DateTimeFormat(regionalLocale, {
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

export function formatChatResponseElapsedTime(elapsedMs: number | undefined): string | undefined {
	return typeof elapsedMs === 'number' && elapsedMs >= 1000
		? formatElapsedTime(elapsedMs)
		: undefined;
}

export interface IFormattedChatResponseStats {
	/** Short forms in display order, such as `2m 43s` and `62 tk/s`. */
	readonly parts: readonly string[];
	readonly ariaLabel: string;
}

/**
 * A count of output tokens that stays short as it grows: exact up to 999, then in tenths of a
 * thousand (`1.1k`), then with four digits of a million or a billion (`1.234m`, `12.34m`), so that
 * a large count still moves with each model call. Never rounded up: a count shows what was reached.
 */
function formatOutputTokenCount(tokens: number): string {
	if (tokens < 1_000) {
		return tokenCountFormatter.value.format(tokens);
	}
	const unit = tokens < 1_000_000 ? 1_000 : tokens < 1_000_000_000 ? 1_000_000 : 1_000_000_000;
	const units = Math.floor(tokens / unit);
	const decimals = unit === 1_000 || units >= 100 ? 1 : units >= 10 ? 2 : 3;
	// The smallest step shown divides the unit evenly, so the count is cut off without rounding errors.
	const scale = 10 ** decimals;
	const value = abbreviatedTokenCountFormatters[decimals - 1].value.format(Math.floor(tokens / (unit / scale)) / scale);
	switch (unit) {
		case 1_000: return localize({ key: 'chatResponseStats.thousands', comment: ['{0} is a number of thousands, such as 1.1'] }, "{0}k", value);
		case 1_000_000: return localize({ key: 'chatResponseStats.millions', comment: ['{0} is a number of millions, such as 1.234'] }, "{0}m", value);
		default: return localize({ key: 'chatResponseStats.billions', comment: ['{0} is a number of billions, such as 1.234'] }, "{0}b", value);
	}
}

/**
 * Combines a response's formatted working time and its output tokens, omitting whichever is unknown.
 * The tokens are reported as a speed or as a count, so callers pass the one that shows.
 */
export function formatChatResponseStats(elapsed: string | undefined, tokensPerSecond: number | undefined, outputTokens?: number): IFormattedChatResponseStats | undefined {
	const parts: string[] = [];
	const ariaParts: string[] = [];
	if (elapsed) {
		parts.push(elapsed);
		ariaParts.push(localize('chatResponseStats.elapsed', "Elapsed time {0}", elapsed));
	}
	if (tokensPerSecond !== undefined && Number.isFinite(tokensPerSecond) && tokensPerSecond > 0) {
		// Whole numbers read steadily; a slow model keeps one decimal so it does not round to zero.
		const speed = tokensPerSecondFormatter.value.format(tokensPerSecond >= 10 ? Math.round(tokensPerSecond) : Math.max(0.1, tokensPerSecond));
		parts.push(localize('chatResponseStats.tokensPerSecond', "{0} tk/s", speed));
		ariaParts.push(localize('chatResponseStats.tokensPerSecondAria', "{0} tokens per second", speed));
	}
	if (outputTokens !== undefined && Number.isFinite(outputTokens) && outputTokens >= 1) {
		const tokens = Math.floor(outputTokens);
		parts.push(tokens === 1
			? localize('chatResponseStats.outputToken', "1 token")
			: localize({ key: 'chatResponseStats.outputTokens', comment: ['{0} is a count of tokens, which can be abbreviated, such as 1.1k'] }, "{0} tokens", formatOutputTokenCount(tokens)));
		// The label keeps the exact count.
		ariaParts.push(tokens === 1
			? localize('chatResponseStats.outputTokenAria', "1 output token")
			: localize('chatResponseStats.outputTokensAria', "{0} output tokens", tokenCountFormatter.value.format(tokens)));
	}
	return parts.length ? { parts, ariaLabel: ariaParts.join(', ') } : undefined;
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

export function formatChatToolError(error: string | boolean | undefined, exitCode?: number): string | undefined {
	if (typeof error === 'string' && error) {
		return localize('toolExecutionFailedWithMessage', "Tool execution failed: {0}", error);
	}
	if (exitCode !== undefined && exitCode !== 0) {
		return localize('toolExecutionFailedWithExitCode', "Tool execution failed with exit code {0}", exitCode);
	}
	return error ? localize('toolExecutionFailed', "Tool execution failed") : undefined;
}
