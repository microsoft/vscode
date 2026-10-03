/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { GitHubChannel, GitHubChannelClient } from '../../common/githubIpc.js';
import { RequestFetch } from '../../common/types.js';
import { SharedProcessGitHubService } from '../../electron-utility/githubService.js';

suite('SharedProcessGitHubService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(fetch: RequestFetch) {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		return store.add(new SharedProcessGitHubService(fetch, configuration, {
			_serviceBrand: undefined, ...product, applicationName: 'code-insiders', version: '1.141.0',
		}, new NullLogService(), NullTelemetryService));
	}

	function connect(service: SharedProcessGitHubService) {
		const channel = new GitHubChannel(service, new NullLogService());
		return new GitHubChannelClient({
			listen: () => Event.None,
			call: (command, args, token) => channel.call('window', command, args, token),
		});
	}

	test('initializes a local engine with node egress without fetching or adding authentication', async () => {
		const requests: Request[] = [];
		const service = createService(async (input, init) => {
			requests.push(new Request(input, init));
			return new Response('{"value":1}');
		});
		const attemptsAtConstruction = requests.length;
		assert.throws(() => service.acquireClient({
			apiBaseUri: 'https://api.github.com', graphQlUri: 'https://api.github.com/graphql',
			authorization: { providerId: 'github', sessionId: 'session', scopes: ['repo'] },
		}), { kind: 'authentication' });
		const client = store.add(service.acquireAnonymousClient({ apiBaseUri: 'https://api.github.com' })).object;
		const result = await client.get('/resource', new AbortController().signal, { caller: 'github.query' });
		assert.deepStrictEqual({
			attemptsAtConstruction, data: result.data,
			requests: requests.map(request => ({
				source: request.headers.get('x-client-source'), retry: request.headers.get('x-is-retry'),
				authorization: request.headers.get('authorization'), credentials: request.credentials,
			})),
		}, {
			attemptsAtConstruction: 0, data: { value: 1 },
			requests: [{ source: 'vscode-insiders-shared-process/1.141.0', retry: 'false', authorization: null, credentials: 'omit' }],
		});
	});

	test('retains public GitHub ETags across sequential call-scoped IPC reads', async () => {
		const requests: { etag: string | null; authorization: string | null }[] = [];
		const service = createService(async (_input, init) => {
			const headers = new Headers(init?.headers);
			const etag = headers.get('If-None-Match');
			requests.push({ etag, authorization: headers.get('Authorization') });
			return etag ? new Response(null, { status: 304 })
				: new Response('{"items":[{"title":"Issue"}]}', { headers: { ETag: '"issues"' } });
		});
		const firstWindow = connect(service);
		const secondWindow = connect(service);
		const first = await firstWindow.getAnonymous({ apiBaseUri: 'https://API.GITHUB.COM/', path: '/search/issues?q=query' }, CancellationToken.None);
		const second = await secondWindow.getAnonymous({ apiBaseUri: 'https://api.github.com', path: '/search/issues?q=query' }, CancellationToken.None);
		assert.deepStrictEqual({ requests, first: first.data, second: second.data }, {
			requests: [{ etag: null, authorization: null }, { etag: '"issues"', authorization: null }],
			first: { items: [{ title: 'Issue' }] }, second: { items: [{ title: 'Issue' }] },
		});
	});

	test('only the public GitHub lease is retained and binding disposal releases it', async () => {
		const service = createService(async () => assert.fail('acquiring clients must not fetch'));
		const reference = store.add(service.acquireAnonymousClient({ apiBaseUri: 'https://api.github.com' }));
		const client = reference.object;
		reference.dispose();
		for (let i = 0; i < 65; i++) {
			store.add(service.acquireAnonymousClient({ apiBaseUri: `https://api${i}.test` })).dispose();
		}
		const replacement = store.add(service.acquireAnonymousClient({ apiBaseUri: 'https://api.github.com/' }));
		assert.strictEqual(replacement.object, client);
		replacement.dispose();
		service.dispose();
		await assert.rejects(client.get('/resource', new AbortController().signal), /disposed/);
		assert.throws(() => service.acquireAnonymousClient({ apiBaseUri: 'https://api.github.com' }), /disposed/);
	});

	test('binding disposal cancels active requests despite the retained lease', async () => {
		const started = new DeferredPromise<AbortSignal>();
		const response = new DeferredPromise<Response>();
		const released = new DeferredPromise<void>();
		const service = createService(async (_input, init) => {
			assert.ok(init?.signal);
			void started.complete(init.signal);
			return response.p;
		});
		const client = connect(service);
		const rejected = assert.rejects(client.getAnonymous({ apiBaseUri: 'https://api.github.com', path: '/resource' }, CancellationToken.None));
		const signal = await started.p;
		service.dispose();
		await rejected;
		await response.complete(new Response(new ReadableStream({ cancel: () => { void released.complete(); } })));
		await released.p;
		assert.strictEqual(signal.aborted, true);
	});
});
