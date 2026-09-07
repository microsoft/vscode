/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import type { RootState } from './state/protocol/state.js';

export const CODEX_ACCOUNT_META_KEY = 'vscode.codexAccount';
export const CODEX_ACCOUNT_SIGN_IN_REQUEST_KEY = 'vscode.codexAccount.signInRequest';
export const CODEX_ACCOUNT_SIGN_OUT_REQUEST_KEY = 'vscode.codexAccount.signOutRequest';
export const CODEX_PROFILE_IMAGE_SCHEME = 'vscode-codex-profile-image';
export const MAX_CODEX_PROFILE_IMAGE_BYTES = 1024 * 1024;

const SUPPORTED_CODEX_PROFILE_IMAGE_MEDIA_TYPES = new Set([
	'image/avif',
	'image/gif',
	'image/jpeg',
	'image/png',
	'image/webp',
]);

export interface ICodexProfileImageReference {
	readonly uri: string;
	readonly contentType: string;
	readonly sizeHint: number;
	readonly nonce: string;
}

export interface ICodexAccountRateLimitInfo {
	readonly usedPercent: number;
	readonly windowDurationMins?: number;
	readonly resetsAt?: number;
}

export interface ICodexAccountInfo {
	readonly status: 'unknown' | 'downloading' | 'signedIn' | 'signedOut' | 'unavailable' | 'error';
	readonly email?: string;
	readonly planType?: string;
	readonly profileImage?: ICodexProfileImageReference;
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
		profileImage: readProfileImageReference(account.profileImage),
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

function readProfileImageReference(value: unknown): ICodexProfileImageReference | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const reference = value as Partial<ICodexProfileImageReference>;
	if (typeof reference.contentType !== 'string'
		|| !SUPPORTED_CODEX_PROFILE_IMAGE_MEDIA_TYPES.has(reference.contentType)
		|| typeof reference.sizeHint !== 'number'
		|| !Number.isInteger(reference.sizeHint)
		|| reference.sizeHint <= 0
		|| reference.sizeHint > MAX_CODEX_PROFILE_IMAGE_BYTES
		|| typeof reference.nonce !== 'string'
		|| !/^[a-f0-9]{64}$/.test(reference.nonce)
		|| !isProfileImageResourceUri(reference.uri, reference.contentType, reference.nonce)) {
		return undefined;
	}
	return {
		uri: reference.uri,
		contentType: reference.contentType,
		sizeHint: reference.sizeHint,
		nonce: reference.nonce,
	};
}

function isProfileImageResourceUri(value: unknown, contentType: string, nonce: string): value is string {
	if (typeof value !== 'string') {
		return false;
	}
	try {
		const uri = URI.parse(value);
		const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.slice('image/'.length);
		return uri.scheme === CODEX_PROFILE_IMAGE_SCHEME
			&& !uri.authority
			&& uri.path === `/profile-${nonce}.${extension}`
			&& !uri.query
			&& !uri.fragment;
	} catch {
		return false;
	}
}
