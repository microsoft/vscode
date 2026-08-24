/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { FileService } from '../../../../files/common/fileService.js';
import { NullLogService } from '../../../../log/common/log.js';
import { CodexProfileImageStore, fetchCodexProfileImage, getChatGPTAccountId, getCodexProfileImageUrl, type ICodexProfileImage } from '../../../node/codex/codexProfileImage.js';

suite('Codex profile image', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('selects the current ChatGPT account', () => {
		const accessToken = createAccessToken('account-2');
		assert.strictEqual(getChatGPTAccountId(accessToken), 'account-2');
		assert.strictEqual(getCodexProfileImageUrl({
			account_ordering: ['account-1'],
			accounts: [
				{ id: 'account-1', profile_picture_url: 'https://example.test/one.png' },
				{ id: 'account-2', profile_picture_url: 'https://example.test/two.png' },
			],
		}, 'account-2'), 'https://example.test/two.png');
	});

	test('downloads protected profile images with ChatGPT authentication', async () => {
		const accessToken = createAccessToken('account-1');
		const requests: { readonly url: string; readonly headers: Headers }[] = [];
		const fetchFn: typeof globalThis.fetch = async (input, init) => {
			requests.push({ url: getRequestUrl(input), headers: new Headers(init?.headers) });
			if (requests.length === 1) {
				return Response.json({
					profile: { profile_picture_url: '/backend-api/estuary/public_content/enc/avatar' },
				});
			}
			return new Response(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), {
				headers: { 'content-type': 'image/png' },
			});
		};

		assert.deepStrictEqual(asComparable(await fetchCodexProfileImage(accessToken, fetchFn)), { mediaType: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] });
		assert.deepStrictEqual(requests.map(request => request.url), [
			'https://chatgpt.com/backend-api/wham/profiles/me',
			'https://chatgpt.com/backend-api/estuary/public_content/enc/avatar',
		]);
		for (const request of requests) {
			assert.strictEqual(request.headers.get('authorization'), `Bearer ${accessToken}`);
			assert.strictEqual(request.headers.get('chatgpt-account-id'), 'account-1');
			assert.strictEqual(request.headers.get('originator'), 'vscode_codex');
		}
	});

	test('does not send credentials to public profile-image hosts', async () => {
		const requests: Headers[] = [];
		const fetchFn: typeof globalThis.fetch = async (_input, init) => {
			requests.push(new Headers(init?.headers));
			return requests.length === 1
				? Response.json({ profile: { profile_picture_url: 'https://images.example.test/avatar.jpg' } })
				: new Response(Uint8Array.from([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
		};

		assert.deepStrictEqual(asComparable(await fetchCodexProfileImage(createAccessToken('account-1'), fetchFn)), { mediaType: 'image/jpeg', bytes: [1, 2, 3] });
		assert.strictEqual(requests[1].has('authorization'), false);
		assert.strictEqual(requests[1].has('chatgpt-account-id'), false);
	});

	test('falls back to the current account image', async () => {
		let request = 0;
		const fetchFn: typeof globalThis.fetch = async () => ++request === 1
			? Response.json({ profile: { profile_picture_url: null } })
			: Response.json({
				account_ordering: ['account-1'],
				accounts: [{ id: 'account-1', profile_picture_url: 'data:image/png;base64,AQID' }],
			});

		assert.deepStrictEqual(asComparable(await fetchCodexProfileImage(createAccessToken('account-1'), fetchFn)), { mediaType: 'image/png', bytes: [1, 2, 3] });
		assert.strictEqual(request, 2);
	});

	test('rejects unsafe profile-image responses', async () => {
		let request = 0;
		const fetchFn: typeof globalThis.fetch = async () => ++request === 1
			? Response.json({ profile: { profile_picture_url: 'https://chatgpt.com/avatar.svg' } })
			: new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } });
		assert.strictEqual(await fetchCodexProfileImage(createAccessToken('account-1'), fetchFn), undefined);
	});

	test('falls back when the profile image cannot be downloaded', async () => {
		let request = 0;
		const fetchFn: typeof globalThis.fetch = async () => {
			if (++request === 1) {
				return Response.json({ profile: { profile_picture_url: 'https://chatgpt.com/avatar.png' } });
			}
			throw new Error('network unavailable');
		};
		assert.strictEqual(await fetchCodexProfileImage(createAccessToken('account-1'), fetchFn), undefined);
	});

	test('stores profile bytes behind a small resource reference', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const store = disposables.add(new CodexProfileImageStore(fileService));
		const reference = await store.update({ mediaType: 'image/png', bytes: Uint8Array.from([1, 2, 3]) });

		assert.deepStrictEqual(reference && {
			uri: reference.uri,
			contentType: reference.contentType,
			sizeHint: reference.sizeHint,
			nonceLength: reference.nonce.length,
		}, {
			uri: 'vscode-codex-profile-image:/profile.png',
			contentType: 'image/png',
			sizeHint: 3,
			nonceLength: 64,
		});
		assert.deepStrictEqual([...((await fileService.readFile(URI.parse(reference!.uri))).value.buffer)], [1, 2, 3]);
	});
});

function asComparable(image: ICodexProfileImage | undefined): { readonly mediaType: string; readonly bytes: number[] } | undefined {
	return image ? { mediaType: image.mediaType, bytes: [...image.bytes] } : undefined;
}

function createAccessToken(accountId: string): string {
	const payload = Buffer.from(JSON.stringify({
		'https://api.openai.com/auth': { chatgpt_account_id: accountId },
	})).toString('base64url');
	return `header.${payload}.signature`;
}

function getRequestUrl(input: string | URL | Request): string {
	return input instanceof Request ? input.url : input.toString();
}
