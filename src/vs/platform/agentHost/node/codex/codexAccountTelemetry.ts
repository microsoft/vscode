/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICodexAccountTelemetryContext } from '../../common/agentHostTelemetry.js';
import type { ICodexAccountRateLimitInfo } from '../../common/codexAccount.js';
import type { ICodexAccountState } from './codexAccountState.js';
import { normalizeChatGPTPlanTier } from '../../common/codexAccountPlan.js';
export { normalizeChatGPTPlanTier } from '../../common/codexAccountPlan.js';

const MAX_RATE_LIMIT_SNAPSHOT_AGE_MS = 5 * 60 * 1000;
const WEEKLY_RATE_LIMIT_WINDOW_MINS = 7 * 24 * 60;
const FIVE_HOUR_RATE_LIMIT_WINDOW_MINS = 5 * 60;

export type CodexAccountTelemetryClassification = {
	chatgptAccountState?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'ChatGPT sign-in availability at Codex turn start: signedIn, signedOut, or unknown. Describes account context independently of the turn model provider.' };
	chatgptPlanTier?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Public ChatGPT plan family at Codex turn start for signed-in accounts: free, go, plus, pro, business, enterprise, edu, or unknown. Used to understand feature use across supported account configurations.' };
	chatgptWeeklyQuotaState?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'State of the cached ChatGPT weekly limit at Codex turn start: available, unavailable, missing, nonWeekly, stale, expired, or invalid. Distinguishes usable and unavailable turn context.' };
	chatgptWeeklyUsedPercentBucket?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Cached ChatGPT weekly used percentage at Codex turn start, rounded down to a 10-point bucket (0 through 100). Only for a signed-in account and a valid seven-day window observed within five minutes and before any known reset, to contextualize turn behavior.' };
	chatgptFiveHourQuotaState?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'State of the cached ChatGPT five-hour limit at Codex turn start: available, unavailable, missing, stale, expired, or invalid. Distinguishes usable and unavailable turn context.' };
	chatgptFiveHourUsedPercentBucket?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Cached ChatGPT five-hour used percentage at Codex turn start, rounded down to a 10-point bucket (0 through 100). Only for a signed-in account and a valid five-hour window observed within five minutes and before any known reset, to contextualize turn behavior.' };
};

export function getCodexAccountTelemetryContext(account: ICodexAccountState | undefined, rateLimit: ICodexAccountRateLimitInfo | undefined, observedAt: number | undefined, now = Date.now(), rateLimits?: readonly ICodexAccountRateLimitInfo[]): ICodexAccountTelemetryContext {
	if (account?.status !== 'signedIn' || account.authType !== 'chatgpt') {
		return Object.freeze({
			chatgptAccountState: account?.status === 'signedOut' ? 'signedOut' : 'unknown',
			chatgptWeeklyQuotaState: 'unavailable',
			chatgptFiveHourQuotaState: 'unavailable',
		});
	}
	return Object.freeze({
		chatgptAccountState: 'signedIn',
		chatgptPlanTier: normalizeChatGPTPlanTier(account.planType),
		...getWeeklyQuotaTelemetry(rateLimit, observedAt, now),
		...getFiveHourQuotaTelemetry(rateLimits, observedAt, now),
	});
}

/** Selects only schema fields so structurally wider objects cannot add telemetry. */
export function getCodexAccountTelemetryData(context: ICodexAccountTelemetryContext | undefined): ICodexAccountTelemetryContext | undefined {
	return context ? {
		chatgptAccountState: context.chatgptAccountState,
		...(context.chatgptPlanTier !== undefined ? { chatgptPlanTier: context.chatgptPlanTier } : {}),
		chatgptWeeklyQuotaState: context.chatgptWeeklyQuotaState,
		...(context.chatgptWeeklyUsedPercentBucket !== undefined ? { chatgptWeeklyUsedPercentBucket: context.chatgptWeeklyUsedPercentBucket } : {}),
		chatgptFiveHourQuotaState: context.chatgptFiveHourQuotaState,
		...(context.chatgptFiveHourUsedPercentBucket !== undefined ? { chatgptFiveHourUsedPercentBucket: context.chatgptFiveHourUsedPercentBucket } : {}),
	} : undefined;
}

function getWeeklyQuotaTelemetry(rateLimit: ICodexAccountRateLimitInfo | undefined, observedAt: number | undefined, now: number): Pick<ICodexAccountTelemetryContext, 'chatgptWeeklyQuotaState' | 'chatgptWeeklyUsedPercentBucket'> {
	if (!rateLimit || observedAt === undefined) {
		return { chatgptWeeklyQuotaState: 'missing' };
	}
	if (!Number.isFinite(observedAt) || observedAt < 0 || observedAt > now
		|| !Number.isFinite(rateLimit.usedPercent) || rateLimit.usedPercent < 0 || rateLimit.usedPercent > 100
		|| (rateLimit.windowDurationMins !== undefined && (!Number.isFinite(rateLimit.windowDurationMins) || rateLimit.windowDurationMins <= 0))
		|| (rateLimit.resetsAt !== undefined && (!Number.isFinite(rateLimit.resetsAt) || rateLimit.resetsAt <= 0))) {
		return { chatgptWeeklyQuotaState: 'invalid' };
	}
	if (now - observedAt > MAX_RATE_LIMIT_SNAPSHOT_AGE_MS) {
		return { chatgptWeeklyQuotaState: 'stale' };
	}
	if (rateLimit.windowDurationMins !== WEEKLY_RATE_LIMIT_WINDOW_MINS) {
		return { chatgptWeeklyQuotaState: 'nonWeekly' };
	}
	if (rateLimit.resetsAt !== undefined && rateLimit.resetsAt * 1000 <= now) {
		return { chatgptWeeklyQuotaState: 'expired' };
	}
	return { chatgptWeeklyQuotaState: 'available', chatgptWeeklyUsedPercentBucket: Math.floor(rateLimit.usedPercent / 10) * 10 };
}

function getFiveHourQuotaTelemetry(rateLimits: readonly ICodexAccountRateLimitInfo[] | undefined, observedAt: number | undefined, now: number): Pick<ICodexAccountTelemetryContext, 'chatgptFiveHourQuotaState' | 'chatgptFiveHourUsedPercentBucket'> {
	const rateLimit = rateLimits?.find(candidate => candidate.windowDurationMins === FIVE_HOUR_RATE_LIMIT_WINDOW_MINS);
	if (!rateLimit || observedAt === undefined) {
		return { chatgptFiveHourQuotaState: 'missing' };
	}
	if (!Number.isFinite(observedAt) || observedAt < 0 || observedAt > now
		|| !Number.isFinite(rateLimit.usedPercent) || rateLimit.usedPercent < 0 || rateLimit.usedPercent > 100
		|| (rateLimit.resetsAt !== undefined && (!Number.isFinite(rateLimit.resetsAt) || rateLimit.resetsAt <= 0))) {
		return { chatgptFiveHourQuotaState: 'invalid' };
	}
	if (now - observedAt > MAX_RATE_LIMIT_SNAPSHOT_AGE_MS) {
		return { chatgptFiveHourQuotaState: 'stale' };
	}
	if (rateLimit.resetsAt !== undefined && rateLimit.resetsAt * 1000 <= now) {
		return { chatgptFiveHourQuotaState: 'expired' };
	}
	return { chatgptFiveHourQuotaState: 'available', chatgptFiveHourUsedPercentBucket: Math.floor(rateLimit.usedPercent / 10) * 10 };
}
