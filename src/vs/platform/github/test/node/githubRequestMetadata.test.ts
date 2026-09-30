/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IProductService } from '../../../product/common/productService.js';
import { createGitHubClientMetadata, GitHubRequestMetadata } from '../../common/githubRequestMetadata.js';
import { GitHubTransport } from '../../common/githubTransport.js';
import { GitHubAccountHandle, GitHubClientMetadata, IGitHubEndpointProvider } from '../../common/githubTypes.js';
import { FakeGitHubScheduler } from './fakeGitHubScheduler.js';

const client: GitHubClientMetadata = {
	application: 'vscode-insiders/1.141.0',
	source: 'vscode-insiders-workbench/1.141.0',
	egress: 'node',
};
const account: GitHubAccountHandle = { host: 'api.github.com', accountId: '1' };
const apiBaseUri = 'https://api.github.com';
const endpoint: IGitHubEndpointProvider = {
	onDidChange: Event.None,
	getApiBaseUri: () => apiBaseUri,
	getGraphQlUri: () => `${apiBaseUri}/graphql`,
};
const initialHeaders = {
	'x-client-application': client.application,
	'x-client-source': client.source,
	'x-client-feature': 'github.query',
	'x-is-retry': 'false',
};

function metadataHeaders(headers: HeadersInit | undefined): Record<string, string> {
	return Object.fromEntries([...new Headers(headers)].filter(([name]) => name.startsWith('x-client-') || name === 'x-is-retry'));
}

suite('GitHub request metadata', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the actual product, channel, component, and version', () => {
		const identities = ['code', 'code-insiders', 'code-exploration', 'code-oss', 'custom-editor'].map(applicationName => {
			const product = new class extends mock<IProductService>() {
				override readonly applicationName = applicationName;
				override readonly version = '1.141.0';
			}();
			return createGitHubClientMetadata(product, 'agent-host', 'node');
		});
		assert.deepStrictEqual(identities, [
			{ application: 'vscode/1.141.0', source: 'vscode-agent-host/1.141.0', egress: 'node' },
			{ application: 'vscode-insiders/1.141.0', source: 'vscode-insiders-agent-host/1.141.0', egress: 'node' },
			{ application: 'vscode-exploration/1.141.0', source: 'vscode-exploration-agent-host/1.141.0', egress: 'node' },
			{ application: 'code-oss/1.141.0', source: 'code-oss-agent-host/1.141.0', egress: 'node' },
			{ application: 'custom-editor/1.141.0', source: 'custom-editor-agent-host/1.141.0', egress: 'node' },
		]);
	});

	test('browser identification follows the GitHub.com CORS allowlist, not desktop versus web UI', () => {
		const browser = new GitHubRequestMetadata({ ...client, egress: 'browser' }, endpoint);
		const enterpriseEndpoint: IGitHubEndpointProvider = {
			onDidChange: Event.None,
			getApiBaseUri: () => 'https://enterprise.example.test/api/v3',
			getGraphQlUri: () => 'https://enterprise.example.test/api/graphql',
		};
		const enterpriseBrowser = new GitHubRequestMetadata({ ...client, egress: 'browser' }, enterpriseEndpoint);
		const enterpriseNode = new GitHubRequestMetadata(client, enterpriseEndpoint);
		assert.deepStrictEqual({
			rest: browser.getHeaders(`${apiBaseUri}/repos/o/r`, 'github.query', false),
			retry: browser.getHeaders(`${apiBaseUri}/graphql`, 'github.query', true),
			enterpriseBrowser: enterpriseBrowser.getHeaders(enterpriseEndpoint.getApiBaseUri(), 'github.query', false),
			enterpriseNode: metadataHeaders(enterpriseNode.getHeaders(enterpriseEndpoint.getGraphQlUri(), 'github.query', false)),
		}, {
			rest: { 'X-Client-Application': client.application },
			retry: { 'X-Client-Application': client.application },
			enterpriseBrowser: {},
			enterpriseNode: initialHeaders,
		});
	});

	test('only identifies current configured endpoints and never echoes arbitrary caller strings', () => {
		let base = apiBaseUri;
		const metadata = new GitHubRequestMetadata(client, {
			onDidChange: Event.None,
			getApiBaseUri: () => base,
			getGraphQlUri: () => `${base}/graphql`,
		});
		const initial = metadataHeaders(metadata.getHeaders(base, 'https://private.example/repo?prompt=private', false));
		const lookalike = metadata.getHeaders('https://api.github.com.untrusted.example/', 'github.query', false);
		base = 'https://enterprise.example.test';
		assert.deepStrictEqual({
			initial, lookalike,
			oldEndpoint: metadata.getHeaders(apiBaseUri, 'github.query', false),
			newEndpoint: metadataHeaders(metadata.getHeaders(`${base}/graphql`, 'github.query', false)),
		}, {
			initial: { ...initialHeaders, 'x-client-feature': 'github.other' },
			lookalike: {}, oldEndpoint: {}, newEndpoint: initialHeaders,
		});
	});

	test('rejects malformed or unbounded client identities without exposing their values', () => {
		for (const identity of ['private\r\nX-Injected: secret', 'https://private.example/repository', `${'x'.repeat(101)}/1`]) {
			for (const field of ['application', 'source'] as const) {
				assert.throws(() => new GitHubRequestMetadata({ ...client, [field]: identity }, endpoint), {
					kind: 'validation', message: 'Invalid GitHub client metadata',
				});
			}
		}
	});

	for (const kind of ['rest', 'graphql'] as const) {
		for (const failure of ['http', 'network'] as const) {
			test(`${kind}: marks only an actual ${failure} retry and does not mutate earlier headers`, async () => {
				const scheduler = store.add(new FakeGitHubScheduler({ jitterValues: [50] }));
				const started = new DeferredPromise<void>();
				const attempts: RequestInit[] = [];
				const transport = store.add(new GitHubTransport(async (_url, init) => {
					assert.ok(init);
					attempts.push(init);
					if (attempts.length === 1) {
						await started.complete();
						if (failure === 'network') {
							throw new Error('network failure');
						}
						return new Response('{}', { status: 503 });
					}
					return new Response('{"data":{"value":1}}');
				}, scheduler, false, undefined, { requestMetadata: new GitHubRequestMetadata(client, endpoint) }));
				const signal = new AbortController().signal;
				const pending = kind === 'rest'
					? transport.rest(account, 'token', { method: 'GET', url: `${apiBaseUri}/repos/o/r`, caller: 'github.query' }, signal)
					: transport.graphql(account, 'token', `${apiBaseUri}/graphql`, 'query { viewer { id } }', {}, signal, 'interactive', { caller: 'github.query' });
				await started.p;
				await Promise.resolve();
				await Promise.resolve();
				scheduler.advanceBy(150);
				await pending;
				assert.deepStrictEqual({
					headers: attempts.map(attempt => metadataHeaders(attempt.headers)),
					separateHeaders: attempts[0].headers !== attempts[1].headers,
					timers: scheduler.pendingCount,
				}, { headers: [initialHeaders, { ...initialHeaders, 'x-is-retry': 'true' }], separateHeaders: true, timers: 0 });
			});
		}

		test(`${kind}: coalesced readers retain the initiating caller's attribution`, async () => {
			const response = new DeferredPromise<Response>();
			const attempts: RequestInit[] = [];
			const transport = store.add(new GitHubTransport(async (_url, init) => {
				assert.ok(init);
				attempts.push(init);
				return response.p;
			}, undefined, false, undefined, { requestMetadata: new GitHubRequestMetadata(client, endpoint) }));
			const read = (caller: string) => kind === 'rest'
				? transport.rest(account, 'token', { method: 'GET', url: `${apiBaseUri}/repos/o/r`, caller }, new AbortController().signal)
				: transport.graphql(account, 'token', `${apiBaseUri}/graphql`, 'query { viewer { id } }', {}, new AbortController().signal, 'interactive', { caller });
			const first = read('github.query');
			const second = read('github.pullRequestQuery');
			await response.complete(new Response('{"data":{"value":1}}'));
			await Promise.all([first, second]);
			assert.deepStrictEqual(attempts.map(attempt => metadataHeaders(attempt.headers)), [initialHeaders]);
		});
	}

	test('failed mutations and downloads stay single-attempt operations', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const attempts: RequestInit[] = [];
		const transport = store.add(new GitHubTransport(async (_url, init) => {
			assert.ok(init);
			attempts.push(init);
			return new Response('{}', { status: 503 });
		}, scheduler, false, undefined, { requestMetadata: new GitHubRequestMetadata(client, endpoint) }));
		const signal = new AbortController().signal;
		const url = `${apiBaseUri}/repos/o/r`;
		await assert.rejects(transport.rest(account, 'token', { method: 'POST', url, body: {}, caller: 'github.mutations' }, signal), { kind: 'server' });
		await assert.rejects(transport.graphql(account, 'token', `${apiBaseUri}/graphql`, '# comment\nmutation Update { updatePullRequest { id } }', {}, signal, 'mutation', { caller: 'github.mutations' }), { kind: 'server' });
		await assert.rejects(transport.download(account, 'token', { url, timeout: 1_000, maximumBytes: 100, caller: 'github.mutations' }, signal), { kind: 'server' });
		scheduler.advanceBy(1_000);
		const mutationHeaders = { ...initialHeaders, 'x-client-feature': 'github.mutations' };
		assert.deepStrictEqual({
			methods: attempts.map(attempt => attempt.method),
			headers: attempts.map(attempt => metadataHeaders(attempt.headers)),
			timers: scheduler.pendingCount,
		}, { methods: ['POST', 'POST', 'GET'], headers: [mutationHeaders, mutationHeaders, mutationHeaders], timers: 0 });
	});

	test('redirects, repeated reads, ETag revalidation, and pagination are not retries', async () => {
		const paths: string[] = [];
		const attempts: RequestInit[] = [];
		const transport = store.add(new GitHubTransport(async (url, init) => {
			assert.ok(init);
			paths.push(String(url).slice(apiBaseUri.length));
			attempts.push(init);
			if (attempts.length === 1) {
				return new Response(null, { status: 302, headers: { Location: '/repos/o/renamed' } });
			}
			return attempts.length === 3
				? new Response(null, { status: 304 })
				: new Response('{}', { headers: { ETag: '"version-1"' } });
		}, undefined, false, undefined, { requestMetadata: new GitHubRequestMetadata(client, endpoint) }));
		const read = (url: string) => transport.rest(account, 'token', { method: 'GET', url, caller: 'github.query' }, new AbortController().signal);
		await read(`${apiBaseUri}/repos/o/r`);
		await read(`${apiBaseUri}/repos/o/r`);
		await read(`${apiBaseUri}/repos/o/r?page=2`);
		assert.deepStrictEqual({
			paths, headers: attempts.map(attempt => metadataHeaders(attempt.headers)),
			conditional: new Headers(attempts[2].headers).get('If-None-Match'),
		}, {
			paths: ['/repos/o/r', '/repos/o/renamed', '/repos/o/renamed', '/repos/o/r?page=2'],
			headers: [initialHeaders, initialHeaders, initialHeaders, initialHeaders], conditional: '"version-1"',
		});
	});

	test('download redirects retain same-origin attribution and strip it from storage requests', async () => {
		const attempts: RequestInit[] = [];
		const transport = store.add(new GitHubTransport(async (_url, init) => {
			assert.ok(init);
			attempts.push(init);
			if (attempts.length < 3) {
				return new Response(null, { status: 302, headers: { Location: attempts.length === 1 ? '/download/redirected' : 'https://storage.example.test/log?sig=private' } });
			}
			return new Response('log');
		}, undefined, false, undefined, { requestMetadata: new GitHubRequestMetadata(client, endpoint) }));
		await transport.download(account, 'token', {
			url: `${apiBaseUri}/download`, timeout: 1_000, maximumBytes: 100, caller: 'github.query',
		}, new AbortController().signal);
		assert.deepStrictEqual(attempts.map(attempt => ({
			metadata: metadataHeaders(attempt.headers),
			authorized: new Headers(attempt.headers).has('Authorization'),
		})), [
			{ metadata: initialHeaders, authorized: true },
			{ metadata: initialHeaders, authorized: true },
			{ metadata: {}, authorized: false },
		]);
	});
});
