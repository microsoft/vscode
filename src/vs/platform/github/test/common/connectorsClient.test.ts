/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { ClientConnectionEvent, IPCServer } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { AccountClient } from '../../common/account/accountClient.js';
import { copilotConnectorsScope } from '../../common/connectors/connectors.js';
import { ConnectorsClient } from '../../common/connectors/connectorsClient.js';
import { ApiRequest, IApiRequestProvider } from '../../common/client/request.js';
import { SchemaError } from '../../common/client/schema.js';
import { GitHubService } from '../../common/githubService.js';
import { GitHubAuthorizationContext, GitHubCredentialChange, GitHubRequestError, GitHubServiceOptions } from '../../common/githubTypes.js';
import { ApiRequestMessage, IGitHubCredentialBroker } from '../../common/remote/ipc.js';
import { GitHubChannelClient } from '../../common/remote/ipcClient.js';
import { registerGitHubChannel } from '../../common/remote/ipcServer.js';
import { parseApiResponse } from '../../common/remote/serialization.js';
import { RequestFetch } from '../../common/types.js';
import { TestConnection } from './testConnection.js';
import { createConnectorPlugin } from './connectorsFixtures.js';

suite('Copilot Connectors request contract', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('rejects every operation when no provider is configured', async () => {
		const client = new ConnectorsClient();
		const signal = new AbortController().signal;
		const expected = { kind: 'validation', message: 'No approved Copilot connectors endpoint is configured for this client' };
		await assert.rejects(client.getCatalog(signal), expected);
		await assert.rejects(client.connect('mail', signal), expected);
		await assert.rejects(client.disconnect('mail', signal), expected);
	});

	test('rejects every pre-cancelled operation without contacting the provider', async () => {
		const provider: IApiRequestProvider = {
			request: async () => assert.fail('Cancelled operations must not reach the provider'),
		};
		const client = new ConnectorsClient(provider);
		const signal = AbortSignal.abort(new CancellationError());
		await assert.rejects(client.getCatalog(signal), isCancellationError);
		await assert.rejects(client.connect('mail', signal), isCancellationError);
		await assert.rejects(client.disconnect('mail', signal), isCancellationError);
	});

	test('declares only the operation-specific success status and body mode', async () => {
		const requests: ApiRequest[] = [];
		const dispatched = new Error('Request reached the provider');
		const provider: IApiRequestProvider = {
			request: async (request: ApiRequest) => { requests.push(request); throw dispatched; },
		};
		const client = new ConnectorsClient(provider);
		const signal = new AbortController().signal;
		await assert.rejects(client.getCatalog(signal), error => error === dispatched);
		await assert.rejects(client.connect('mail', signal), error => error === dispatched);
		await assert.rejects(client.disconnect('mail', signal), error => error === dispatched);
		assert.deepStrictEqual(requests.map(request => ({ method: request.method, status: request.expectedStatus, mode: request.responseBody ?? 'json' })), [
			{ method: 'GET', status: 200, mode: 'json' },
			{ method: 'PUT', status: 200, mode: 'json' },
			{ method: 'DELETE', status: 204, mode: 'none' },
		]);
	});
});

for (const remote of [false, true]) {
	suite(`Copilot Connectors ${remote ? 'IPC' : 'local'} client`, () => {
		const store = ensureNoDisposablesAreLeakedInTestSuite();
		const signal = () => new AbortController().signal;

		async function setup(options: { fetch?: RequestFetch; endpoint?: string; scopes?: readonly string[]; enterprise?: boolean } = {}) {
			const authorization: GitHubAuthorizationContext = {
				providerId: options.enterprise ? 'github-enterprise' : 'github', sessionId: 'selected',
				accountId: 'account', scopes: options.scopes ?? ['read:user', copilotConnectorsScope],
			};
			const endpoints = options.enterprise
				? { apiBaseUri: 'https://enterprise.test/api/v3', graphQlUri: 'https://enterprise.test/api/graphql' }
				: { apiBaseUri: 'https://api.github.com', graphQlUri: 'https://api.github.com/graphql' };
			const grants = store.add(new Emitter<GitHubCredentialChange>());
			const renewals = store.add(new Emitter<GitHubCredentialChange>());
			let token = 'selected-token';
			let tokenLookups = 0;
			const broker: IGitHubCredentialBroker = {
				_serviceBrand: undefined,
				onDidChange: grants.event,
				onDidChangeToken: renewals.event,
				resolveClient: async context => {
					assert.deepStrictEqual(context, authorization);
					return { authorization, ...endpoints };
				},
				getToken: async context => {
					assert.deepStrictEqual(context, authorization);
					tokenLookups++;
					return token;
				},
			};
			const requests: { url: string; method: string | undefined; body: string | undefined; authorization: string | null; etag: string | null; redirect: RequestRedirect | undefined }[] = [];
			const serviceOptions: GitHubServiceOptions = {
				connectorsApiBaseUri: options.endpoint ?? 'https://api.github.com/copilot-connectors/api/v1/',
				fetch: async (input, init) => {
					const url = String(input);
					if (url === `${endpoints.apiBaseUri}/user`) {
						return Response.json({ id: 101 });
					}
					const headers = new Headers(init?.headers);
					requests.push({
						url, method: init?.method, body: typeof init?.body === 'string' ? init.body : undefined,
						authorization: headers.get('Authorization'), etag: headers.get('If-None-Match'), redirect: init?.redirect,
					});
					return options.fetch ? options.fetch(input, init)
						: init?.method === 'DELETE' ? new Response(null, { status: 204 })
							: init?.method === 'PUT' ? Response.json({ status: 'Unauthenticated', provisioning_state: 'Succeeded', consent_link: 'https://consent.test/connect' })
								: Response.json({ plugins: [createConnectorPlugin({ description: 'Mail' })] }, { headers: { etag: '"catalog"' } });
				},
			};
			const service = store.add(new GitHubService(serviceOptions, new NullLogService(), NullTelemetryService));
			let connection: TestConnection | undefined;
			let client;
			if (remote) {
				const connected = store.add(new Emitter<ClientConnectionEvent>());
				const server = store.add(new IPCServer<string>(connected.event));
				store.add(registerGitHubChannel(server, service));
				connection = store.add(new TestConnection(connected, 'connectors-window'));
				connection.registerCredentials(broker);
				client = store.add(await new GitHubChannelClient(connection.channel, new NullLogService()).acquireClient(authorization, signal()));
			} else {
				const scope = store.add(service.createRequestProviderScope(broker));
				const reference = scope.acquireClient({ authorization, ...endpoints });
				client = store.add(new AccountClient(authorization, reference.object, reference));
			}
			return {
				client, service, requests, connection, grants, authorization,
				tokenLookups: () => tokenLookups,
				renew: (value: string) => {
					token = value;
					renewals.fire({ providerId: authorization.providerId, sessionIds: [authorization.sessionId] });
				},
			};
		}

		test('revalidates catalogs but never caches connection operations', async () => {
			const fixture = await setup();
			const catalog = await fixture.client.connectors.getCatalog(signal());
			await fixture.client.connectors.getCatalog(signal());
			const connected = await fixture.client.connectors.connect('mail/name #1', signal());
			await fixture.client.connectors.disconnect('mail/name #1', signal());
			assert.deepStrictEqual({ catalog, connected, requests: fixture.requests }, {
				catalog: { plugins: [createConnectorPlugin({ description: 'Mail' })] },
				connected: { status: 'Unauthenticated', provisioning_state: 'Succeeded', consent_link: 'https://consent.test/connect' },
				requests: [
					{ method: 'GET', path: '/plugins' },
					{ method: 'GET', path: '/plugins' },
					{ method: 'PUT', path: '/connectors/managed/mail%2Fname%20%231/connection', body: '{"client_source":"VS_CODE"}' },
					{ method: 'DELETE', path: '/connectors/managed/mail%2Fname%20%231/connection' },
				].map((request, index) => ({
					url: `https://api.github.com/copilot-connectors/api/v1${request.path}`,
					method: request.method, body: request.body, authorization: 'Bearer selected-token', etag: index === 1 ? '"catalog"' : null, redirect: 'manual',
				})),
			});
		});

		test('leaves credential-class and permission authorization to the service', async () => {
			const fixture = await setup({ scopes: [] });
			await fixture.client.connectors.getCatalog(signal());
			await fixture.client.connectors.connect('mail', signal());
			await fixture.client.connectors.disconnect('mail', signal());
			assert.deepStrictEqual(fixture.requests.map(request => request.method), ['GET', 'PUT', 'DELETE']);
		});

		test('does not enable connectors for enterprise account clients', async () => {
			const fixture = await setup({ enterprise: true });
			await assert.rejects(fixture.client.connectors.getCatalog(signal()), { kind: 'validation' });
			assert.deepStrictEqual({ requests: fixture.requests, tokens: fixture.tokenLookups() }, { requests: [], tokens: 0 });
		});

		test('uses only the hosting binding endpoint', async () => {
			const fixture = await setup({ endpoint: 'https://approved.example.test/connectors/v2/' });
			await fixture.client.connectors.getCatalog(signal());
			assert.deepStrictEqual(fixture.requests.map(request => request.url), ['https://approved.example.test/connectors/v2/plugins']);
		});

		test('rejects invalid endpoints before obtaining a token', async () => {
			for (const endpoint of ['http://api.github.test', 'not a URL', 'https://user@api.github.test', 'https://api.github.test?path=other', 'https://api.github.test#other']) {
				const fixture = await setup({ endpoint });
				await assert.rejects(fixture.client.connectors.getCatalog(signal()));
				assert.deepStrictEqual({ requests: fixture.requests, tokens: fixture.tokenLookups() }, { requests: [], tokens: 0 });
			}
		});

		test('an invalid Connector endpoint does not affect credential renewal for other domains', async () => {
			const fixture = await setup({ endpoint: 'not a URL', fetch: async () => Response.json([]) });
			await fixture.client.users.listEmails(signal());
			fixture.renew('renewed-token');
			const emails = await fixture.client.users.listEmails(signal());
			assert.deepStrictEqual({ emails, tokenLookups: fixture.tokenLookups() }, { emails: [], tokenLookups: 2 });
		});

		test('rejects invalid connector names without making requests', async () => {
			const fixture = await setup();
			for (const name of ['', '.', '..', 'x'.repeat(4097)]) {
				await assert.rejects(async () => fixture.client.connectors.connect(name, signal()), { kind: 'validation' });
			}
			assert.deepStrictEqual(fixture.requests, []);
		});

		for (const status of [302, 401, 403, 500]) {
			test(`preserves HTTP ${status} without retrying or following redirects`, async () => {
				const fixture = await setup({
					fetch: async () => new Response('{"sensitive":"response"}', { status, headers: { Location: 'https://untrusted.test/next' } }),
				});
				await assert.rejects(fixture.client.connectors.getCatalog(signal()), error => {
					assert.ok(error instanceof GitHubRequestError);
					assert.ok(!error.message.includes('sensitive'));
					return error.statusCode === status;
				});
				assert.strictEqual(fixture.requests.length, 1);
			});
		}

		test('rejects malformed catalog JSON and shapes', async () => {
			for (const body of ['{invalid', '{"plugins":null}']) {
				const fixture = await setup({ fetch: async () => new Response(body) });
				await assert.rejects(fixture.client.connectors.getCatalog(signal()));
			}
		});

		test('preserves nullable manifest lists, advertised URLs, and disabled OAuth metadata', async () => {
			const plugin = createConnectorPlugin({
				author: { name: 'Publisher', email: 'author@example.com', url: 'https://publisher.test/' },
				commands: [{ name: 'help', body: 'Command content' }],
				agents: [],
				skills: [{ name: 'query', body: 'Skill content' }],
				mcpServers: { mcpServers: { mail: { type: 'http', url: 'https://routing.test/opaque-path?version=2' } } },
			});
			const fixture = await setup({ fetch: async () => Response.json({ plugins: [plugin] }) });
			assert.deepStrictEqual(await fixture.client.connectors.getCatalog(signal()), { plugins: [plugin] });
		});

		test('requires the actual nested service schema without turning missing fields into empty values', async () => {
			const plugin = createConnectorPlugin();
			for (const malformed of [
				{ ...plugin, author: undefined },
				{ ...plugin, metadata: { ...plugin.metadata, capabilities: 12 } },
				{ ...plugin, connection: { ...plugin.connection, status: 'Connected' } },
				{ ...plugin, connection: { ...plugin.connection, scopes: null } },
				{ ...plugin, skills: [{ name: 'skill' }] },
			]) {
				const fixture = await setup({ fetch: async () => Response.json({ plugins: [malformed] }) });
				await assert.rejects(fixture.client.connectors.getCatalog(signal()), SchemaError);
			}
		});

		test('preserves raw connection lifecycle strings and omitted optional diagnostics', async () => {
			for (const result of [
				{ status: 'Connected', provisioning_state: 'Succeeded' },
				{ status: '', provisioning_state: '', statuses: [{ status: 'Connected' }] },
				{
					status: 'Unauthenticated', provisioning_state: 'Succeeded',
					statuses: [{ status: 'Error', target: 'token', error: { code: 'Unauthenticated', message: 'Sign in required' } }],
					consent_link: 'https://consent.test/authorize?state=opaque',
				},
			]) {
				const fixture = await setup({ fetch: async () => Response.json(result) });
				assert.deepStrictEqual(await fixture.client.connectors.connect('mail', signal()), result);
			}
		});

		test('rejects empty and malformed connection successes rather than starting polling', async () => {
			for (const body of ['', 'null', '[]', '{}', '{"status":"Connected"}', '{"status":"Connected","provisioning_state":"Succeeded","statuses":null}']) {
				const fixture = await setup({ fetch: async () => new Response(body, { status: 200 }) });
				await assert.rejects(fixture.client.connectors.connect('mail', signal()));
			}
			const fixture = await setup({ fetch: async () => new Response('', { status: 200 }) });
			await assert.rejects(fixture.client.connectors.getCatalog(signal()), { kind: 'malformedResponse', statusCode: 200 });
		});

		test('accepts exactly five MiB and rejects an oversized response', async () => {
			const body = '{"plugins":[]}';
			const limit = 5 * 1024 * 1024;
			const fixture = await setup({ fetch: async () => new Response(' '.repeat(limit - body.length) + body) });
			assert.deepStrictEqual(await fixture.client.connectors.getCatalog(signal()), { plugins: [] });
			const oversized = await setup({ fetch: async () => new Response(' '.repeat(limit - body.length + 1) + body) });
			await assert.rejects(oversized.client.connectors.getCatalog(signal()), { kind: 'responseTooLarge' });
		});

		test('rejects unexpected success statuses for each service operation', async () => {
			for (const status of [201, 202, 204, 206]) {
				const fixture = await setup({ fetch: async () => new Response(null, { status }) });
				await assert.rejects(fixture.client.connectors.getCatalog(signal()), { kind: 'malformedResponse', statusCode: status });
				await assert.rejects(fixture.client.connectors.connect('mail', signal()), { kind: 'malformedResponse', statusCode: status });
			}
			for (const status of [200, 202]) {
				const fixture = await setup({ fetch: async () => new Response(null, { status }) });
				await assert.rejects(fixture.client.connectors.disconnect('mail', signal()), { kind: 'malformedResponse', statusCode: status });
			}
		});

		test('revalidates the catalog with the opaque server ETag', async () => {
			const etag = 'W/"catalog version 1"';
			const fixture = await setup({
				fetch: async (_input, init) => new Headers(init?.headers).get('If-None-Match') === etag
					? new Response(null, { status: 304, headers: { ETag: etag } })
					: Response.json({ plugins: [] }, { headers: { ETag: etag, 'Cache-Control': 'private, no-cache' } }),
			});
			await fixture.client.connectors.getCatalog(signal());
			const catalog = await fixture.client.connectors.getCatalog(signal());
			assert.deepStrictEqual({ catalog, validators: fixture.requests.map(request => request.etag) }, {
				catalog: { plugins: [] }, validators: [null, etag],
			});
		});

		test('noCache bypasses catalog revalidation without evicting another cached response', async () => {
			const fixture = await setup();
			await fixture.client.connectors.getCatalog(signal());
			await fixture.client.connectors.getCatalog(signal(), { noCache: true });
			await fixture.client.connectors.getCatalog(signal());
			assert.deepStrictEqual(fixture.requests.map(request => request.etag), [null, null, '"catalog"']);
		});

		test('server no-store disables catalog retention', async () => {
			const fixture = await setup({ fetch: async () => Response.json({ plugins: [] }, { headers: { ETag: '"private"', 'Cache-Control': 'no-store' } }) });
			await fixture.client.connectors.getCatalog(signal());
			await fixture.client.connectors.getCatalog(signal());
			assert.deepStrictEqual(fixture.requests.map(request => request.etag), [null, null]);
		});

		test('disconnect retains missing-connection and conflict failures', async () => {
			for (const status of [404, 409]) {
				const fixture = await setup({ fetch: async () => new Response('Connection unavailable', { status }) });
				await assert.rejects(fixture.client.connectors.disconnect('mail', signal()), { statusCode: status });
				assert.strictEqual(fixture.requests.length, 1);
			}
		});

		test('never retries an uncertain connection mutation', async () => {
			const fixture = await setup({ fetch: async () => { throw new Error('Connection lost'); } });
			await assert.rejects(fixture.client.connectors.connect('mail', signal()), { kind: 'network' });
			assert.deepStrictEqual(fixture.requests.map(request => request.method), ['PUT']);
		});

		test('cancels a stalled body and releases its stream', async () => {
			const started = new DeferredPromise<void>();
			let cancelled = false;
			const fixture = await setup({
				fetch: async () => {
					void started.complete();
					return new Response(new ReadableStream({ cancel: () => { cancelled = true; } }));
				}
			});
			const controller = new AbortController();
			const pending = fixture.client.connectors.getCatalog(controller.signal);
			const rejected = assert.rejects(pending, isCancellationError);
			await started.p;
			controller.abort(new CancellationError());
			await rejected;
			await fixture.connection?.flush();
			assert.strictEqual(cancelled, true);
		});

		test('retains shared quota cooldowns without replaying the refused request', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			let calls = 0;
			const fixture = await setup({
				fetch: async () => ++calls === 1
					? new Response('{"message":"limited"}', { status: 429, headers: { 'Retry-After': '1' } })
					: Response.json({ plugins: [] }),
			});
			await assert.rejects(fixture.client.connectors.getCatalog(signal()), { kind: 'rateLimit' });
			const start = Date.now();
			await fixture.client.connectors.getCatalog(signal());
			assert.deepStrictEqual({ calls, elapsed: Date.now() - start }, { calls: 2, elapsed: 1_000 });
		}));

		test('invalidates a custom-host catalog when the selected credential is renewed', async () => {
			const initialPlugin = createConnectorPlugin({ description: 'Initial catalog' });
			const renewedPlugin = createConnectorPlugin({ description: 'Renewed catalog' });
			let plugin = initialPlugin;
			const fixture = await setup({
				endpoint: 'https://approved.example.test:8443/connectors/v2/',
				fetch: async (_input, init) => {
					const etag = plugin === initialPlugin ? '"initial"' : '"renewed"';
					return new Headers(init?.headers).get('If-None-Match') === etag
						? new Response(null, { status: 304, headers: { ETag: etag } })
						: Response.json({ plugins: [plugin] }, { headers: { ETag: etag } });
				},
			});
			const initial = await fixture.client.connectors.getCatalog(signal());
			await fixture.client.connectors.getCatalog(signal());
			plugin = renewedPlugin;
			fixture.renew('renewed-token');
			const renewed = await fixture.client.connectors.getCatalog(signal());
			const revalidated = await fixture.client.connectors.getCatalog(signal());
			assert.deepStrictEqual({ initial, renewed, revalidated, validators: fixture.requests.map(request => request.etag) }, {
				initial: { plugins: [initialPlugin] },
				renewed: { plugins: [renewedPlugin] },
				revalidated: { plugins: [renewedPlugin] },
				validators: [null, '"initial"', null, '"renewed"'],
			});
		});

		test('renews only the selected grant and does not retain the old catalog', async () => {
			const fixture = await setup();
			await fixture.client.connectors.getCatalog(signal());
			fixture.renew('renewed-token');
			await fixture.client.connectors.getCatalog(signal());
			assert.deepStrictEqual(fixture.requests.map(request => ({ token: request.authorization, etag: request.etag })), [
				{ token: 'Bearer selected-token', etag: null }, { token: 'Bearer renewed-token', etag: null },
			]);
		});

		if (remote) {
			test('rejects forged operations and payloads without dispatch or credential lookup', async () => {
				const fixture = await setup();
				const connection = fixture.connection;
				assert.ok(connection);
				await connection.channel.call('acquireClient', { clientId: 'forged', authorization: fixture.authorization });
				const operations: { request: ApiRequest; bodyText?: string }[] = [
					{ request: { method: 'GET', path: '/user', expectedStatus: 200 } },
					{ request: { method: 'GET', path: '/plugins?other=endpoint', expectedStatus: 200 } },
					{ request: { method: 'POST', path: '/plugins', expectedStatus: 200 } },
					{ request: { method: 'PUT', path: '/connectors/managed/mail/connection', expectedStatus: 200 }, bodyText: '{"url":"https://untrusted.test"}' },
					{ request: { method: 'DELETE', path: '/connectors/managed/%2e%2e/connection', expectedStatus: 204, responseBody: 'none' } },
				];
				for (const operation of operations) {
					const message: ApiRequestMessage = [{ clientId: 'forged', target: 'connectors', request: operation.request }, operation.bodyText];
					const [metadata] = parseApiResponse(await connection.channel.call('request', message));
					assert.strictEqual(metadata.type, 'error');
					assert.deepStrictEqual({ type: metadata.error.type, kind: metadata.error.type === 'request' ? metadata.error.kind : undefined }, {
						type: 'request', kind: 'validation',
					});
				}
				assert.deepStrictEqual({ requests: fixture.requests, tokens: fixture.tokenLookups() }, { requests: [], tokens: 0 });
				await connection.channel.call('releaseClient', { clientId: 'forged' });
			});

			test('rejects anonymous connector requests at the IPC boundary', async () => {
				const fixture = await setup();
				const connection = fixture.connection;
				assert.ok(connection);
				await connection.channel.call('acquireAnonymousClient', { clientId: 'anonymous' }, CancellationToken.None);
				const request: ApiRequestMessage = [{
					clientId: 'anonymous', target: 'connectors',
					request: { method: 'GET', path: '/plugins', expectedStatus: 200 },
				}, undefined];
				const result = await connection.channel.call('request', request);
				const [metadata] = parseApiResponse(result);
				assert.strictEqual(metadata.type, 'error');
				assert.deepStrictEqual(metadata.error, {
					type: 'request', message: 'The requested API endpoint is not configured for this client', kind: 'validation',
				});
				assert.deepStrictEqual(fixture.requests, []);
				await connection.channel.call('releaseClient', { clientId: 'anonymous' });
			});
		}
	});
}
