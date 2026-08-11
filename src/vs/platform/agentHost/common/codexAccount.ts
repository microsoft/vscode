/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { RootState } from './state/protocol/state.js';

export const CODEX_ACCOUNT_META_KEY = 'vscode.codexAccount';
export const CODEX_ACCOUNT_SIGN_IN_REQUEST_KEY = 'vscode.codexAccount.signInRequest';
export const CODEX_ACCOUNT_SIGN_OUT_REQUEST_KEY = 'vscode.codexAccount.signOutRequest';

export interface ICodexAccountRateLimitInfo {
	readonly usedPercent: number;
	readonly windowDurationMins?: number;
	readonly resetsAt?: number;
}

export interface ICodexAccountInfo {
	readonly status: 'unknown' | 'downloading' | 'signedIn' | 'signedOut' | 'unavailable' | 'error';
	readonly email?: string;
	readonly planType?: string;
	readonly requiresOpenaiAuth?: boolean;
	readonly rateLimit?: ICodexAccountRateLimitInfo;
	readonly authUrl?: string;
	readonly authUrlNonce?: string;
}

export function readCodexAccountInfo(state: RootState | undefined): ICodexAccountInfo {
	// eslint-disable-next-line local/code-no-untyped-meta-access -- sanctioned reader for the namespaced Codex account slot; validated below.
	const metaValue = state?._meta?.[CODEX_ACCOUNT_META_KEY];
	const value = state?.config?.values[CODEX_ACCOUNT_META_KEY] ?? metaValue;
	if (!value || typeof value !== 'object') {
		return { status: 'unknown' };
	}
	const account = value as Partial<ICodexAccountInfo>;
	if (account.status !== 'unknown' && account.status !== 'downloading' && account.status !== 'signedIn' && account.status !== 'signedOut' && account.status !== 'unavailable' && account.status !== 'error') {
		return { status: 'unknown' };
	}
	const rateLimit = account.rateLimit;
	const validRateLimit = rateLimit
		&& typeof rateLimit === 'object'
		&& typeof rateLimit.usedPercent === 'number'
		&& Number.isFinite(rateLimit.usedPercent)
		&& rateLimit.usedPercent >= 0
		&& rateLimit.usedPercent <= 100
		&& (rateLimit.windowDurationMins === undefined || (typeof rateLimit.windowDurationMins === 'number' && Number.isFinite(rateLimit.windowDurationMins) && rateLimit.windowDurationMins > 0))
		&& (rateLimit.resetsAt === undefined || (typeof rateLimit.resetsAt === 'number' && Number.isFinite(rateLimit.resetsAt) && rateLimit.resetsAt > 0));
	return {
		status: account.status,
		email: typeof account.email === 'string' ? account.email : undefined,
		planType: typeof account.planType === 'string' ? account.planType : undefined,
		requiresOpenaiAuth: typeof account.requiresOpenaiAuth === 'boolean' ? account.requiresOpenaiAuth : undefined,
		rateLimit: validRateLimit ? {
			usedPercent: rateLimit.usedPercent,
			windowDurationMins: rateLimit.windowDurationMins,
			resetsAt: rateLimit.resetsAt,
		} : undefined,
		authUrl: typeof account.authUrl === 'string' ? account.authUrl : undefined,
		authUrlNonce: typeof account.authUrlNonce === 'string' ? account.authUrlNonce : undefined,
	};
}
