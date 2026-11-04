/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { Sequencer } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import type { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { CODEX_PROFILE_IMAGE_SCHEME, MAX_CODEX_PROFILE_IMAGE_BYTES, type ICodexProfileImageReference } from '../../common/codexAccount.js';

const CHATGPT_ACCOUNTS_URL = 'https://chatgpt.com/backend-api/wham/accounts/check';
const CHATGPT_PROFILE_URL = 'https://chatgpt.com/backend-api/wham/profiles/me';
const CHATGPT_ORIGIN = 'https://chatgpt.com';
const PROFILE_IMAGE_REQUEST_TIMEOUT_MS = 10_000;
const PROFILE_IMAGE_MAX_REDIRECTS = 5;
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

export interface ICodexProfileImage {
	readonly mediaType: string;
	readonly bytes: Uint8Array;
}

/**
 * Owns the one process-local resource that backs the current account image.
 * Root state carries only the returned reference; clients read the bytes once
 * through the Agent Host resource protocol.
 */
export class CodexProfileImageStore extends Disposable {

	private readonly _provider = this._register(new InMemoryFileSystemProvider());
	private readonly _mutationSequencer = new Sequencer();
	private _reference: ICodexProfileImageReference | undefined;

	constructor(fileService: IFileService) {
		super();
		this._provider.setReadOnly(true);
		this._register(fileService.registerProvider(CODEX_PROFILE_IMAGE_SCHEME, this._provider));
	}

	clear(): Promise<void> {
		return this._mutationSequencer.queue(() => this._clear());
	}

	update(image: ICodexProfileImage | undefined): Promise<ICodexProfileImageReference | undefined> {
		return this._mutationSequencer.queue(() => this._update(image));
	}

	private async _clear(): Promise<void> {
		const reference = this._reference;
		this._reference = undefined;
		if (reference) {
			await this._deleteResource(reference);
		}
	}

	private async _update(image: ICodexProfileImage | undefined): Promise<ICodexProfileImageReference | undefined> {
		if (!image) {
			await this._clear();
			return undefined;
		}

		const nonce = createHash('sha256')
			.update(image.mediaType)
			.update(image.bytes)
			.digest('hex');
		if (this._reference?.nonce === nonce) {
			return this._reference;
		}

		const resource = URI.from({ scheme: CODEX_PROFILE_IMAGE_SCHEME, path: `/profile-${nonce}.${getProfileImageExtension(image.mediaType)}` });
		if (this._reference) {
			const previousReference = this._reference;
			this._reference = undefined;
			await this._deleteResource(previousReference);
		}
		await this._provider.writeFile(resource, image.bytes, { create: true, overwrite: true, append: false, unlock: false, atomic: false });
		this._reference = {
			uri: resource.toString(),
			contentType: image.mediaType,
			sizeHint: image.bytes.byteLength,
			nonce,
		};
		return this._reference;
	}

	private _deleteResource(reference: ICodexProfileImageReference): Promise<void> {
		return this._provider.delete(URI.parse(reference.uri), { recursive: false, useTrash: false, atomic: false });
	}
}

/**
 * Fetches the current ChatGPT account image. Failures intentionally resolve to
 * `undefined` so UI callers can retain their normal account-icon fallback.
 */
export async function fetchCodexProfileImage(accessToken: string, fetchFn: FetchFunction): Promise<ICodexProfileImage | undefined> {
	const accountId = getChatGPTAccountId(accessToken);
	const headers = { ...getAuthenticatedHeaders(accessToken, accountId), Accept: 'application/json' };
	const profile = await fetchJson(CHATGPT_PROFILE_URL, headers, fetchFn);
	const profileImageUrl = getChatGPTProfileImageUrl(profile)
		?? getCodexProfileImageUrl(await fetchJson(CHATGPT_ACCOUNTS_URL, headers, fetchFn), accountId);
	if (!profileImageUrl) {
		return undefined;
	}

	const inlineImage = parseSupportedProfileImageDataUri(profileImageUrl);
	if (inlineImage) {
		return inlineImage;
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

	const imageResponse = await fetchProfileImageResponse(resolvedImageUrl, accessToken, accountId, fetchFn);
	if (!imageResponse) {
		return undefined;
	}
	if (!imageResponse.ok) {
		await cancelResponseBody(imageResponse);
		return undefined;
	}

	const mediaType = imageResponse.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
	if (!mediaType || !SUPPORTED_PROFILE_IMAGE_MEDIA_TYPES.has(mediaType)) {
		await cancelResponseBody(imageResponse);
		return undefined;
	}

	const contentLength = Number(imageResponse.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > MAX_CODEX_PROFILE_IMAGE_BYTES) {
		await cancelResponseBody(imageResponse);
		return undefined;
	}

	const bytes = await readProfileImageBytes(imageResponse);
	if (!bytes) {
		return undefined;
	}

	return { mediaType, bytes };
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
	let account = accountId ? accounts.find(candidate => candidate.id === accountId) : undefined;
	if (!account && Array.isArray(response.account_ordering)) {
		const orderedAccountId = response.account_ordering.find(candidate => typeof candidate === 'string');
		account = accounts.find(candidate => candidate.id === orderedAccountId);
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

async function fetchProfileImageResponse(initialUrl: URL, accessToken: string, accountId: string | undefined, fetchFn: FetchFunction): Promise<Response | undefined> {
	let url = initialUrl;
	const signal = AbortSignal.timeout(PROFILE_IMAGE_REQUEST_TIMEOUT_MS);
	for (let redirectCount = 0; redirectCount <= PROFILE_IMAGE_MAX_REDIRECTS; redirectCount++) {
		if (url.protocol !== 'https:') {
			return undefined;
		}

		let response: Response;
		try {
			response = await fetchFn(url, {
				headers: isAuthenticatedImageHost(url)
					? { ...getAuthenticatedHeaders(accessToken, accountId), Accept: 'image/*' }
					: { Accept: 'image/*' },
				redirect: 'manual',
				signal,
			});
		} catch {
			return undefined;
		}

		if (!isRedirectStatus(response.status)) {
			return response;
		}
		const location = response.headers.get('location');
		if (!location || redirectCount === PROFILE_IMAGE_MAX_REDIRECTS) {
			await cancelResponseBody(response);
			return undefined;
		}

		let redirectedUrl: URL;
		try {
			redirectedUrl = new URL(location, url);
		} catch {
			await cancelResponseBody(response);
			return undefined;
		}
		await cancelResponseBody(response);
		url = redirectedUrl;
	}
	return undefined;
}

function isRedirectStatus(status: number): boolean {
	return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function cancelResponseBody(response: Response): Promise<void> {
	try {
		await response.body?.cancel();
	} catch {
		// Best effort: the stream may already be closed or errored.
	}
}

async function readProfileImageBytes(response: Response): Promise<Buffer | undefined> {
	if (!response.body) {
		return undefined;
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			size += value.byteLength;
			if (size > MAX_CODEX_PROFILE_IMAGE_BYTES) {
				await reader.cancel();
				return undefined;
			}
			chunks.push(value);
		}
	} catch {
		return undefined;
	} finally {
		reader.releaseLock();
	}

	if (size === 0) {
		return undefined;
	}
	return chunks.length === 1 ? Buffer.from(chunks[0]) : Buffer.concat(chunks, size);
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

function parseSupportedProfileImageDataUri(value: string): ICodexProfileImage | undefined {
	if (value.length > Math.ceil(MAX_CODEX_PROFILE_IMAGE_BYTES * 4 / 3) + 64) {
		return undefined;
	}
	const match = /^data:(image\/(?:avif|gif|jpeg|png|webp));base64,([a-zA-Z0-9+/]*={0,2})$/.exec(value);
	if (!match || !SUPPORTED_PROFILE_IMAGE_MEDIA_TYPES.has(match[1])) {
		return undefined;
	}
	const bytes = Buffer.from(match[2], 'base64');
	return bytes.byteLength > 0 && bytes.byteLength <= MAX_CODEX_PROFILE_IMAGE_BYTES
		? { mediaType: match[1], bytes }
		: undefined;
}

function getProfileImageExtension(mediaType: string): string {
	return mediaType === 'image/jpeg' ? 'jpg' : mediaType.slice('image/'.length);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
