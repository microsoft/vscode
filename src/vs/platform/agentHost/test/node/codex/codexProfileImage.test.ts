/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { fetchCodexProfileImageDataUri, getChatGPTAccountId, getCodexProfileImageUrl } from '../../../node/codex/codexProfileImage.js';

suite('Codex profile image', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('selects the current ChatGPT account', () => {
		const accessToken = createAccessToken('account-2');
		assert.strictEqual(getChatGPTAccountId(accessToken), 'account-2');
		assert.strictEqual(getCodexProfileImageUrl({
			account_ordering: ['account-1'],
			accounts: [
				{ id: 'account-1', profile_picture_url: 'https://example.test/one.png' },
				{ id: 'account-2', profile_picture_url: 'https://example.test/two.png' },
			],
		}, 'account-2'), 'https://example.test/one.png');
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

		assert.strictEqual(await fetchCodexProfileImageDataUri(accessToken, fetchFn), 'data:image/png;base64,iVBORw==');
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

		assert.strictEqual(await fetchCodexProfileImageDataUri(createAccessToken('account-1'), fetchFn), 'data:image/jpeg;base64,AQID');
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

		assert.strictEqual(await fetchCodexProfileImageDataUri(createAccessToken('account-1'), fetchFn), 'data:image/png;base64,AQID');
		assert.strictEqual(request, 2);
	});

	test('rejects unsafe profile-image responses', async () => {
		let request = 0;
		const fetchFn: typeof globalThis.fetch = async () => ++request === 1
			? Response.json({ profile: { profile_picture_url: 'https://chatgpt.com/avatar.svg' } })
			: new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } });
		assert.strictEqual(await fetchCodexProfileImageDataUri(createAccessToken('account-1'), fetchFn), undefined);
	});

	test('falls back when the profile image cannot be downloaded', async () => {
		let request = 0;
		const fetchFn: typeof globalThis.fetch = async () => {
			if (++request === 1) {
				return Response.json({ profile: { profile_picture_url: 'https://chatgpt.com/avatar.png' } });
			}
			throw new Error('network unavailable');
		};
		assert.strictEqual(await fetchCodexProfileImageDataUri(createAccessToken('account-1'), fetchFn), undefined);
	});
});

function createAccessToken(accountId: string): string {
	const payload = Buffer.from(JSON.stringify({
		'https://api.openai.com/auth': { chatgpt_account_id: accountId },
	})).toString('base64url');
	return `header.${payload}.signature`;
}

function getRequestUrl(input: string | URL | Request): string {
	return input instanceof Request ? input.url : input.toString();
}
