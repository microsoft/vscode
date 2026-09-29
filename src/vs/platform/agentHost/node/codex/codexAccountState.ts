/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICodexAccountRateLimitInfo, ICodexAccountRateLimitsInfo } from '../../common/codexAccount.js';
import type { GetAccountRateLimitsResponse } from './protocol/generated/v2/GetAccountRateLimitsResponse.js';
import type { GetAccountResponse } from './protocol/generated/v2/GetAccountResponse.js';
import type { RateLimitWindow } from './protocol/generated/v2/RateLimitWindow.js';

export interface ICodexAccountState {
	readonly usageSource: 'openai' | 'copilot';
	readonly status: 'unknown' | 'signedIn' | 'signedOut' | 'unavailable' | 'error';
	readonly authType?: 'chatgpt' | 'apiKey' | 'other';
	readonly email?: string;
	readonly planType?: string;
	readonly requiresOpenaiAuth?: boolean;
	readonly error?: string;
}

export function codexAccountStateFromResponse(response: GetAccountResponse): ICodexAccountState {
	if (response.account?.type === 'chatgpt') {
		return { usageSource: 'openai', status: 'signedIn', authType: 'chatgpt', email: response.account.email ?? undefined, planType: response.account.planType, requiresOpenaiAuth: response.requiresOpenaiAuth };
	}
	if (response.account?.type === 'apiKey') {
		return { usageSource: 'openai', status: 'unavailable', authType: 'apiKey', requiresOpenaiAuth: response.requiresOpenaiAuth };
	}
	if (response.account) {
		return { usageSource: 'openai', status: 'unavailable', authType: 'other', requiresOpenaiAuth: response.requiresOpenaiAuth };
	}
	return { usageSource: 'openai', status: response.requiresOpenaiAuth ? 'signedOut' : 'unavailable', requiresOpenaiAuth: response.requiresOpenaiAuth };
}

export function codexAccountRateLimitFromResponse(response: GetAccountRateLimitsResponse): ICodexAccountRateLimitInfo | undefined {
	const windows = codexAccountRateLimitsFromResponse(response) ?? [];
	if (windows.length === 0) {
		return undefined;
	}
	const weeklyWindowMins = 7 * 24 * 60;
	return windows.reduce((best, candidate) => {
		if (candidate.windowDurationMins === undefined) {
			return best;
		}
		if (best.windowDurationMins === undefined) {
			return candidate;
		}
		return Math.abs(candidate.windowDurationMins - weeklyWindowMins) < Math.abs(best.windowDurationMins - weeklyWindowMins) ? candidate : best;
	});
}

export function codexAccountRateLimitsFromResponse(response: GetAccountRateLimitsResponse): ICodexAccountRateLimitsInfo | undefined {
	const codexSnapshot = response.rateLimitsByLimitId?.codex;
	const snapshot = codexSnapshot?.primary || codexSnapshot?.secondary ? codexSnapshot : response.rateLimits;
	const primary = codexAccountRateLimitWindowFromResponse(snapshot.primary);
	const secondary = codexAccountRateLimitWindowFromResponse(snapshot.secondary);
	const rateLimits = [primary, secondary].filter((rateLimit): rateLimit is ICodexAccountRateLimitInfo => !!rateLimit);
	return rateLimits.length > 0 ? rateLimits : undefined;
}

function codexAccountRateLimitWindowFromResponse(window: RateLimitWindow | null): ICodexAccountRateLimitInfo | undefined {
	if (!window || !Number.isFinite(window.usedPercent)) {
		return undefined;
	}
	return {
		usedPercent: Math.min(100, Math.max(0, window.usedPercent)),
		windowDurationMins: window.windowDurationMins !== null && window.windowDurationMins > 0 ? window.windowDurationMins : undefined,
		resetsAt: window.resetsAt !== null && window.resetsAt > 0 ? window.resetsAt : undefined,
	};
}
