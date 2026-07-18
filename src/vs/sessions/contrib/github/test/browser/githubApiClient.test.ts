/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IRequestContext, IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IRequestCompleteEvent, IRequestService } from '../../../../../platform/request/common/request.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { GitHubApiClient } from '../../browser/githubApiClient.js';

/**
 * Captures the options passed to {@link IRequestService.request} and returns a
 * configurable response. Only the surface used by {@link GitHubApiClient} is
 * implemented; the rest is unused in these tests.
 */
class FakeRequestService extends Disposable implements Partial<IRequestService> {
	readonly _serviceBrand: undefined;

	private readonly _onDidCompleteRequest = this._register(new Emitter<IRequestCompleteEvent>());
	readonly onDidCompleteRequest = this._onDidCompleteRequest.event;

	lastOptions: IRequestOptions | undefined;
	nextResponse: IRequestContext = {
		res: { statusCode: 304, headers: { etag: '"etag-2"' } },
		stream: bufferToStream(VSBuffer.wrap(new Uint8Array(0))),
	};

	async request(options: IRequestOptions, _token: CancellationToken): Promise<IRequestContext> {
		this.lastOptions = options;
		return this.nextResponse;
	}
}

class FakeAuthenticationService implements Partial<IAuthenticationService> {
	readonly _serviceBrand: undefined;

	async getSessions(): Promise<readonly AuthenticationSession[]> {
		return [{
			id: 'session-1',
			accessToken: 'token-123',
			account: { id: 'account-1', label: 'octocat' },
			scopes: ['repo'],
		}];
	}
}

suite('GitHubApiClient', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let requestService: FakeRequestService;
	let client: GitHubApiClient;

	setup(() => {
		requestService = store.add(new FakeRequestService());
		client = store.add(new GitHubApiClient(
			requestService as unknown as IRequestService,
			new FakeAuthenticationService() as unknown as IAuthenticationService,
			new NullLogService(),
		));
	});

	test('bypasses the HTTP cache so polling always reaches GitHub', async () => {
		await client.request('GET', '/repos/o/r/pulls/1', 'test');
		assert.strictEqual(requestService.lastOptions?.disableCache, true);
	});

	test('sends an If-None-Match conditional request when given an etag', async () => {
		await client.request('GET', '/repos/o/r/pulls/1', 'test', { etag: '"etag-1"' });

		const headers = requestService.lastOptions?.headers;
		assert.strictEqual(headers?.['If-None-Match'], '"etag-1"');
		// The conditional request must still bypass the cache, otherwise a stale
		// cached body would be returned instead of the server's 304/200.
		assert.strictEqual(requestService.lastOptions?.disableCache, true);
	});

	test('surfaces a 304 Not Modified response without data', async () => {
		const response = await client.request('GET', '/repos/o/r/pulls/1', 'test', { etag: '"etag-1"' });
		assert.deepStrictEqual(
			{ statusCode: response.statusCode, data: response.data, etag: response.etag },
			{ statusCode: 304, data: undefined, etag: '"etag-2"' },
		);
	});
});
