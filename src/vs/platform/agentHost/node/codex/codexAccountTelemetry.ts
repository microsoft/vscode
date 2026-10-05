/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICodexAccountTelemetryContext } from '../../common/agentHostTelemetry.js';
import type { ICodexAccountRateLimitInfo } from '../../common/codexAccount.js';
import type { ICodexAccountState } from './codexAccountState.js';
import type { PlanType } from './protocol/generated/PlanType.js';

const MAX_RATE_LIMIT_SNAPSHOT_AGE_MS = 5 * 60 * 1000;
const WEEKLY_RATE_LIMIT_WINDOW_MINS = 7 * 24 * 60;

const chatgptPlanTiers = {
	free: 'free',
	go: 'go',
	plus: 'plus',
	pro: 'pro',
	prolite: 'pro',
	team: 'business',
	self_serve_business_prolite: 'business',
	self_serve_business_usage_based: 'business',
	business: 'business',
	ent26: 'enterprise',
	enterprise_cbp_automation: 'enterprise',
	enterprise_cbp_usage_based: 'enterprise',
	enterprise: 'enterprise',
	edu: 'edu',
	edu_plus: 'edu',
	edu_pro: 'edu',
	unknown: 'unknown',
} as const satisfies Record<PlanType, NonNullable<ICodexAccountTelemetryContext['chatgptPlanTier']>>;

export type CodexAccountTelemetryClassification = {
	chatgptAccountState?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'ChatGPT sign-in availability at Codex turn start: signedIn, signedOut, or unknown. Describes account context independently of the turn model provider.' };
	chatgptPlanTier?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Public ChatGPT plan family at Codex turn start for signed-in accounts: free, go, plus, pro, business, enterprise, edu, or unknown. Used to understand feature use across supported account configurations.' };
	chatgptWeeklyQuotaState?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'State of the cached ChatGPT weekly limit at Codex turn start: available, unavailable, missing, nonWeekly, stale, expired, or invalid. Distinguishes usable and unavailable turn context.' };
	chatgptWeeklyUsedPercentBucket?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Cached ChatGPT weekly used percentage at Codex turn start, rounded down to a 10-point bucket (0 through 100). Only for a signed-in account and a valid seven-day window observed within five minutes and before any known reset, to contextualize turn behavior.' };
};

export function normalizeChatGPTPlanTier(planType: unknown): NonNullable<ICodexAccountTelemetryContext['chatgptPlanTier']> {
	return typeof planType === 'string' && Object.hasOwn(chatgptPlanTiers, planType) ? chatgptPlanTiers[planType as PlanType] : 'unknown';
}

export function getCodexAccountTelemetryContext(account: ICodexAccountState | undefined, rateLimit: ICodexAccountRateLimitInfo | undefined, observedAt: number | undefined, now = Date.now()): ICodexAccountTelemetryContext {
	if (account?.status !== 'signedIn' || account.authType !== 'chatgpt') {
		return Object.freeze({
			chatgptAccountState: account?.status === 'signedOut' ? 'signedOut' : 'unknown',
			chatgptWeeklyQuotaState: 'unavailable',
		});
	}
	return Object.freeze({
		chatgptAccountState: 'signedIn',
		chatgptPlanTier: normalizeChatGPTPlanTier(account.planType),
		...getWeeklyQuotaTelemetry(rateLimit, observedAt, now),
	});
}

/** Selects only schema fields so structurally wider objects cannot add telemetry. */
export function getCodexAccountTelemetryData(context: ICodexAccountTelemetryContext | undefined): ICodexAccountTelemetryContext | undefined {
	return context ? {
		chatgptAccountState: context.chatgptAccountState,
		...(context.chatgptPlanTier !== undefined ? { chatgptPlanTier: context.chatgptPlanTier } : {}),
		chatgptWeeklyQuotaState: context.chatgptWeeklyQuotaState,
		...(context.chatgptWeeklyUsedPercentBucket !== undefined ? { chatgptWeeklyUsedPercentBucket: context.chatgptWeeklyUsedPercentBucket } : {}),
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
