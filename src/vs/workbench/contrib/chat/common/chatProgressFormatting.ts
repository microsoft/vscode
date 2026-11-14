/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { fromNow, safeIntl } from '../../../../base/common/date.js';
import { regionalLocale } from '../../../../base/common/platform.js';

const dayInMilliseconds = 24 * 60 * 60 * 1000;

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

const chatRequestTimeWithSecondsFormatter = safeIntl.DateTimeFormat(regionalLocale, {
	hour: 'numeric',
	minute: '2-digit',
	second: '2-digit',
});

const chatRequestFullDateTimeWithSecondsFormatter = safeIntl.DateTimeFormat(regionalLocale, {
	year: 'numeric',
	month: 'numeric',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
	second: '2-digit',
});

export interface IFormattedChatRequestTimestamp {
	readonly text: string;
	readonly fullText: string;
	readonly dateTime: string;
	readonly isRelative: boolean;
}

/**
 * Format a millisecond duration as a human-readable elapsed time string.
 * Examples: "0s", "45s", "1m 23s", "2h 5m", "3d 4h", "2d"
 */
export function formatElapsedTime(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	if (totalSeconds < 60) {
		return localize('seconds', "{0}s", totalSeconds);
	}
	const totalMinutes = Math.floor(totalSeconds / 60);
	if (totalMinutes < 60) {
		return localize('minutesSeconds', "{0}m {1}s", totalMinutes, totalSeconds % 60);
	}
	const totalHours = Math.floor(totalMinutes / 60);
	if (totalHours < 24) {
		return localize('hoursMinutes', "{0}h {1}m", totalHours, totalMinutes % 60);
	}
	const days = Math.floor(totalHours / 24);
	const hours = totalHours % 24;
	return hours
		? localize('daysHours', "{0}d {1}h", days, hours)
		: localize('days', "{0}d", days);
}

/**
 * Formats a response's elapsed generation time for the footer.
 * Sub-second responses are rounded to a tenth of a second so quick replies
 * still show a duration instead of disappearing.
 */
export function formatChatResponseElapsedTime(elapsedMs: number | undefined, subSecond = false): string | undefined {
	if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
		return undefined;
	}
	if (elapsedMs < 1000) {
		return subSecond && elapsedMs > 0
			? localize('subSecond', "{0}s", Math.max(0.1, Math.round(elapsedMs / 100) / 10).toFixed(1))
			: undefined;
	}
	return formatElapsedTime(elapsedMs);
}

/**
 * Generation figures the chat footer shows for a completed response.
 *
 * `timeToFirstTokenMs` and `tokensPerSecond` come from the provider's report of
 * its latest model call; older providers that report only whole-turn totals get
 * a speed derived from the turn's busy time instead.
 */
export interface IChatResponseGenerationStats {
	/** Busy generation time of the whole turn, excluding time spent waiting for the user. */
	readonly elapsedMs?: number;
	readonly timeToFirstTokenMs?: number;
	readonly tokensPerSecond?: number;
	readonly promptTokens?: number;
	readonly completionTokens?: number;
	readonly reasoningTokens?: number;
	readonly cacheWriteTokens?: number;
	readonly outputBuffer?: number;
	readonly contextTokens?: number;
	readonly contextTokenLimit?: number;
}

/** Where a user wants the per-response generation figures. */
export type ChatResponseStatsDisplay = 'always' | 'hover' | 'off';

const tokensPerSecondFormatter = safeIntl.NumberFormat(regionalLocale, { maximumFractionDigits: 1 });

/**
 * Formats a generation speed for the response footer, e.g. `9.9 tok/s`.
 * Whole numbers keep no decimal so a fast model does not read as `42.0 tok/s`.
 */
export function formatTokensPerSecond(tokensPerSecond: number | undefined): string | undefined {
	if (typeof tokensPerSecond !== 'number' || !Number.isFinite(tokensPerSecond) || tokensPerSecond <= 0) {
		return undefined;
	}
	const rounded = tokensPerSecond >= 10 ? Math.round(tokensPerSecond) : Math.round(tokensPerSecond * 10) / 10;
	return rounded > 0
		? localize('tokensPerSecond', "{0} tok/s", tokensPerSecondFormatter.value.format(rounded))
		: undefined;
}

/** Combines the always-visible generation figures, e.g. `1m 23s • 9.9 tok/s`. */
export function formatChatResponseGenerationStats(stats: IChatResponseGenerationStats | undefined): string | undefined {
	const parts: string[] = [];
	const elapsed = formatChatResponseElapsedTime(stats?.elapsedMs, true);
	if (elapsed) {
		parts.push(elapsed);
	}
	const speed = formatTokensPerSecond(stats?.tokensPerSecond);
	if (speed) {
		parts.push(speed);
	}
	return parts.length ? parts.join(' \u2022 ') : undefined;
}

/** Formats a provider's time to first token: whole milliseconds below a second, seconds above. */
export function formatTimeToFirstToken(timeToFirstTokenMs: number | undefined): string | undefined {
	if (typeof timeToFirstTokenMs !== 'number' || !Number.isFinite(timeToFirstTokenMs) || timeToFirstTokenMs < 0) {
		return undefined;
	}
	return timeToFirstTokenMs >= 1000
		? localize('timeToFirstTokenSeconds', "{0}s", (Math.round(timeToFirstTokenMs / 100) / 10).toFixed(1))
		: localize('timeToFirstTokenMilliseconds', "{0}ms", Math.round(timeToFirstTokenMs));
}

export function formatChatRequestTimestamp(timestamp: number | undefined, withSeconds = false): IFormattedChatRequestTimestamp | undefined {
	if (timestamp === undefined || !Number.isFinite(timestamp) || timestamp <= 0) {
		return undefined;
	}

	const date = new Date(timestamp);
	const age = Date.now() - timestamp;
	const isRelative = age > dayInMilliseconds;
	return {
		text: isRelative
			? fromNow(timestamp, false, true)
			: (withSeconds ? chatRequestTimeWithSecondsFormatter : chatRequestTimeFormatter).value.format(date),
		fullText: (withSeconds ? chatRequestFullDateTimeWithSecondsFormatter : chatRequestFullDateTimeFormatter).value.format(date),
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
