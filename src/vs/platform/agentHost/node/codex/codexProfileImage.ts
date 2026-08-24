/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const CHATGPT_ACCOUNTS_URL = 'https://chatgpt.com/backend-api/wham/accounts/check';
const CHATGPT_PROFILE_URL = 'https://chatgpt.com/backend-api/wham/profiles/me';
const CHATGPT_ORIGIN = 'https://chatgpt.com';
const MAX_PROFILE_IMAGE_BYTES = 1024 * 1024;
const PROFILE_IMAGE_REQUEST_TIMEOUT_MS = 10_000;
const SUPPORTED_PROFILE_IMAGE_MEDIA_TYPES = new Set([
	'image/avif',
	'image/gif',
	'image/jpeg',
	'image/png',
	'image/webp',
]);

type FetchFunction = typeof globalThis.fetch;

interface IChatGPTAccountsResponse {
	readonly account_ordering?: readonly unknown[];
	readonly accounts?: readonly unknown[];
}

interface IChatGPTAccountEntry {
	readonly id?: unknown;
	readonly profile_picture_url?: unknown;
}

/**
 * Fetches the current ChatGPT account image and returns a self-contained,
 * renderer-safe data URI. Failures intentionally resolve to `undefined` so UI
 * callers can retain their normal account-icon fallback.
 */
export async function fetchCodexProfileImageDataUri(accessToken: string, fetchFn: FetchFunction): Promise<string | undefined> {
	const accountId = getChatGPTAccountId(accessToken);
	const headers = { ...getAuthenticatedHeaders(accessToken, accountId), Accept: 'application/json' };
	const profile = await fetchJson(CHATGPT_PROFILE_URL, headers, fetchFn);
	const profileImageUrl = getChatGPTProfileImageUrl(profile)
		?? getCodexProfileImageUrl(await fetchJson(CHATGPT_ACCOUNTS_URL, headers, fetchFn), accountId);
	if (!profileImageUrl) {
		return undefined;
	}

	if (isSupportedProfileImageDataUri(profileImageUrl)) {
		return profileImageUrl;
	}

	let resolvedImageUrl: URL;
	try {
		resolvedImageUrl = new URL(profileImageUrl, CHATGPT_ORIGIN);
	} catch {
		return undefined;
	}
	if (resolvedImageUrl.protocol !== 'https:') {
		return undefined;
	}

	let imageResponse: Response;
	try {
		imageResponse = await fetchFn(resolvedImageUrl, {
			headers: isAuthenticatedImageHost(resolvedImageUrl)
				? { ...getAuthenticatedHeaders(accessToken, accountId), Accept: 'image/*' }
				: { Accept: 'image/*' },
			signal: AbortSignal.timeout(PROFILE_IMAGE_REQUEST_TIMEOUT_MS),
		});
	} catch {
		return undefined;
	}
	if (!imageResponse.ok) {
		return undefined;
	}

	const mediaType = imageResponse.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
	if (!mediaType || !SUPPORTED_PROFILE_IMAGE_MEDIA_TYPES.has(mediaType)) {
		return undefined;
	}

	const contentLength = Number(imageResponse.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > MAX_PROFILE_IMAGE_BYTES) {
		return undefined;
	}

	let bytes: Buffer;
	try {
		bytes = Buffer.from(await imageResponse.arrayBuffer());
	} catch {
		return undefined;
	}
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_PROFILE_IMAGE_BYTES) {
		return undefined;
	}

	return `data:${mediaType};base64,${bytes.toString('base64')}`;
}

export function getChatGPTProfileImageUrl(value: unknown): string | undefined {
	if (!isObject(value) || !isObject(value.profile)) {
		return undefined;
	}
	return typeof value.profile.profile_picture_url === 'string' && value.profile.profile_picture_url.trim()
		? value.profile.profile_picture_url.trim()
		: undefined;
}

export function getCodexProfileImageUrl(value: unknown, accountId: string | undefined): string | undefined {
	if (!isObject(value)) {
		return undefined;
	}

	const response = value as IChatGPTAccountsResponse;
	if (!Array.isArray(response.accounts)) {
		return undefined;
	}

	const accounts = response.accounts.filter(isObject) as IChatGPTAccountEntry[];
	let account: IChatGPTAccountEntry | undefined;
	if (Array.isArray(response.account_ordering)) {
		const orderedAccountId = response.account_ordering.find(candidate => typeof candidate === 'string');
		account = accounts.find(candidate => candidate.id === orderedAccountId);
	}
	if (!account && accountId) {
		account = accounts.find(candidate => candidate.id === accountId);
	}
	account ??= accounts[0];

	return typeof account?.profile_picture_url === 'string' && account.profile_picture_url.trim()
		? account.profile_picture_url.trim()
		: undefined;
}

export function getChatGPTAccountId(accessToken: string): string | undefined {
	const encodedPayload = accessToken.split('.', 3)[1];
	if (!encodedPayload) {
		return undefined;
	}

	try {
		const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
		if (!isObject(payload)) {
			return undefined;
		}
		const auth = payload['https://api.openai.com/auth'];
		if (!isObject(auth)) {
			return undefined;
		}
		const accountId = auth.chatgpt_account_id ?? auth.account_id;
		return typeof accountId === 'string' && accountId ? accountId : undefined;
	} catch {
		return undefined;
	}
}

function getAuthenticatedHeaders(accessToken: string, accountId: string | undefined): Record<string, string> {
	return {
		Authorization: `Bearer ${accessToken}`,
		...(accountId ? { 'ChatGPT-Account-Id': accountId } : {}),
		originator: 'vscode_codex',
	};
}

function isAuthenticatedImageHost(url: URL): boolean {
	if (url.port && url.port !== '443') {
		return false;
	}
	const host = url.hostname.toLowerCase();
	return host === 'chatgpt.com'
		|| (host.endsWith('.chatgpt.com') && host !== 'ab.chatgpt.com')
		|| host === 'openai.com'
		|| host.endsWith('.openai.com');
}

async function fetchJson(url: string, headers: Record<string, string>, fetchFn: FetchFunction): Promise<unknown> {
	try {
		const response = await fetchFn(url, {
			headers,
			signal: AbortSignal.timeout(PROFILE_IMAGE_REQUEST_TIMEOUT_MS),
		});
		return response.ok ? await response.json() : undefined;
	} catch {
		return undefined;
	}
}

function isSupportedProfileImageDataUri(value: string): boolean {
	if (value.length > Math.ceil(MAX_PROFILE_IMAGE_BYTES * 4 / 3) + 64) {
		return false;
	}
	return [...SUPPORTED_PROFILE_IMAGE_MEDIA_TYPES].some(mediaType => value.startsWith(`data:${mediaType};base64,`));
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
