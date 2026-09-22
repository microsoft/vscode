/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICodexAccountRateLimitInfo } from '../../common/codexAccount.js';
import type { ICodexAccountTelemetry } from '../../common/codexAccountTelemetry.js';
import type { ICodexAccountState } from './codexAccountState.js';
import type { PlanType } from './protocol/generated/PlanType.js';

const MAX_RATE_LIMIT_SNAPSHOT_AGE_MS = 5 * 60 * 1000;
const WEEKLY_RATE_LIMIT_WINDOW_MINS = 7 * 24 * 60;

type ChatGPTPlanTier = NonNullable<ICodexAccountTelemetry['chatgptPlanTier']>;

const planTiers: Readonly<Record<PlanType, ChatGPTPlanTier>> = {
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
};

export interface ICodexRateLimitSnapshot {
	readonly rateLimit: ICodexAccountRateLimitInfo | undefined;
	readonly observedAt: number | undefined;
}

export function normalizeCodexPlanTier(planType: unknown): ChatGPTPlanTier {
	return typeof planType === 'string' && Object.hasOwn(planTiers, planType) ? planTiers[planType as PlanType] : 'unknown';
}

export function getCodexAccountTelemetryContext(account: ICodexAccountState | undefined, snapshot?: ICodexRateLimitSnapshot, now = Date.now()): ICodexAccountTelemetry {
	if (account?.usageSource !== 'openai' || account.status !== 'signedIn' || account.authType !== 'chatgpt') {
		const notSignedIn = account?.usageSource === 'openai' && (account.status === 'signedOut'
			|| (account.status === 'unavailable' && (account.authType === 'apiKey' || account.authType === 'other')));
		return Object.freeze({
			chatgptAccountState: notSignedIn ? 'notSignedIn' : 'unknown',
			chatgptWeeklyQuotaState: 'unavailable',
		});
	}
	return Object.freeze({
		chatgptAccountState: 'signedIn',
		chatgptPlanTier: normalizeCodexPlanTier(account.planType),
		...getWeeklyQuotaTelemetry(snapshot, now),
	});
}

function getWeeklyQuotaTelemetry(snapshot: ICodexRateLimitSnapshot | undefined, now: number): Pick<ICodexAccountTelemetry, 'chatgptWeeklyQuotaState' | 'chatgptWeeklyUsedPercentBucket'> {
	const rateLimit = snapshot?.rateLimit;
	const observedAt = snapshot?.observedAt;
	if (!rateLimit || observedAt === undefined) {
		return { chatgptWeeklyQuotaState: 'missing' };
	}
	if (!Number.isFinite(observedAt) || !Number.isFinite(now) || observedAt > now) {
		return { chatgptWeeklyQuotaState: 'invalid' };
	}
	if (now - observedAt > MAX_RATE_LIMIT_SNAPSHOT_AGE_MS) {
		return { chatgptWeeklyQuotaState: 'stale' };
	}
	if (rateLimit.windowDurationMins !== undefined && (!Number.isFinite(rateLimit.windowDurationMins) || rateLimit.windowDurationMins <= 0)) {
		return { chatgptWeeklyQuotaState: 'invalid' };
	}
	if (rateLimit.windowDurationMins !== WEEKLY_RATE_LIMIT_WINDOW_MINS) {
		return { chatgptWeeklyQuotaState: 'nonWeekly' };
	}
	if (!Number.isFinite(rateLimit.usedPercent) || rateLimit.usedPercent < 0 || rateLimit.usedPercent > 100
		|| (rateLimit.resetsAt !== undefined && (!Number.isFinite(rateLimit.resetsAt) || rateLimit.resetsAt <= 0 || !Number.isFinite(rateLimit.resetsAt * 1000)))) {
		return { chatgptWeeklyQuotaState: 'invalid' };
	}
	if (rateLimit.resetsAt !== undefined && rateLimit.resetsAt * 1000 <= now) {
		return { chatgptWeeklyQuotaState: 'expired' };
	}
	return {
		chatgptWeeklyQuotaState: 'available',
		chatgptWeeklyUsedPercentBucket: Math.floor(rateLimit.usedPercent / 10) * 10,
	};
}
