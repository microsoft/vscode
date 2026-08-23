/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICodexAccountRateLimitInfo } from '../../common/codexAccount.js';
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
	const codexSnapshot = response.rateLimitsByLimitId?.codex;
	const snapshot = codexSnapshot?.primary || codexSnapshot?.secondary ? codexSnapshot : response.rateLimits;
	const windows = [snapshot.primary, snapshot.secondary].filter((window): window is RateLimitWindow => !!window);
	if (windows.length === 0) {
		return undefined;
	}
	const weeklyWindowMins = 7 * 24 * 60;
	const window = windows.reduce((best, candidate) => {
		if (candidate.windowDurationMins === null) {
			return best;
		}
		if (best.windowDurationMins === null) {
			return candidate;
		}
		return Math.abs(candidate.windowDurationMins - weeklyWindowMins) < Math.abs(best.windowDurationMins - weeklyWindowMins) ? candidate : best;
	});
	if (!Number.isFinite(window.usedPercent)) {
		return undefined;
	}
	return {
		usedPercent: Math.min(100, Math.max(0, window.usedPercent)),
		windowDurationMins: window.windowDurationMins !== null && window.windowDurationMins > 0 ? window.windowDurationMins : undefined,
		resetsAt: window.resetsAt !== null && window.resetsAt > 0 ? window.resetsAt : undefined,
	};
}
