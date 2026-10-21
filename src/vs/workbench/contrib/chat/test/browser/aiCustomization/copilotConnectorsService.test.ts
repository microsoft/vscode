/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { AccountClient } from '../../../../../../platform/github/common/account/accountClient.js';
import { IGitHubAccountClient } from '../../../../../../platform/github/common/account/account.js';
import { GitHubService } from '../../../../../../platform/github/common/githubService.js';
import { GitHubAuthorizationContext, GitHubCredentialChange, GitHubRequestError } from '../../../../../../platform/github/common/githubTypes.js';
import { ConnectorCatalog, ConnectorPlugin } from '../../../../../../platform/github/common/connectors/connectors.js';
import { createConnectorPlugin } from '../../../../../../platform/github/test/common/connectorsFixtures.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import product from '../../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { NullTelemetryService, NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IWorkbenchGitHubService } from '../../../../../services/github/common/githubService.js';
import { CopilotConnectorsMarketplaceProvider, CopilotConnectorsService } from '../../../browser/aiCustomization/copilotConnectorsService.js';
import { CustomizationMarketplaceMediaType } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';

function catalogResponse(
	status: ConnectorPlugin['connection']['status'],
	names = ['mail'],
	publisherMetadata?: { readonly displayName?: string; readonly homepage?: string },
): ConnectorCatalog {
	return {
		plugins: names.map(name => createConnectorPlugin({
			name,
			description: `Connect ${name}`,
			homepage: publisherMetadata?.homepage ?? `https://example.com/${name}`,
			logo: `https://example.com/${name}.png`,
			metadata: {
				displayName: publisherMetadata?.displayName ?? `${name} connector`,
				capabilities: ['Search'],
			},
			connection: {
				status,
				protectedResourceMetadataUrl: `https://example.com/${name}/oauth`,
				scopes: ['write:plugin_gateway_connections'],
			},
			mcpServers: {
				mcpServers: {
					[`${name}-server`]: { type: 'http', url: `https://example.com/${name}/mcp` },
				},
			},
		})),
	};
}

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: Record<string, unknown> }[] = [];

	override publicLog2(eventName?: string, data?: Record<string, unknown>): void {
		if (eventName && data) {
			this.events.push({ name: eventName, data });
		}
	}
}

suite('CopilotConnectorsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture(responses: Array<{ readonly status?: number; readonly body?: unknown; readonly ready?: Promise<void>; readonly headers?: Record<string, string> }>, enabled = true, enterprise = false) {
		const requestLifetime = store.add(new DisposableStore());
		const requests: Array<{ readonly type: string | undefined; readonly url: string; readonly data: string | undefined }> = [];
		const requestTokens: CancellationToken[] = [];
		const authorizationHeaders: (string | undefined)[] = [];
		const validators: (string | null)[] = [];
		const authenticationCalls: Parameters<IAuthenticationService['getSessions']>[] = [];
		const consentCalls: Parameters<IAuthenticationService['createSession']>[] = [];
		const signInCalls: Parameters<IDefaultAccountService['signIn']>[] = [];
		const initialAccount: IDefaultAccount = {
			authenticationProvider: { id: 'github', name: 'GitHub', enterprise },
			accountName: 'octocat',
			sessionId: 'session',
			enterprise,
		};
		let account: IDefaultAccount | null = initialAccount;
		const accountChanged = store.add(new Emitter<IDefaultAccount | null>());
		const sessionsChanged = store.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
		const initialSession: AuthenticationSession = {
			id: 'session', accessToken: 'test-token', account: { id: 'account', label: 'octocat' }, scopes: ['read:user', 'write:plugin_gateway_connections'],
		};
		let sessions = [initialSession];
		const defaultAccountService = new class extends mock<IDefaultAccountService>() {
			override readonly onDidChangeDefaultAccount = accountChanged.event;
			override get currentDefaultAccount() { return account; }
			override async getDefaultAccount() { return account; }
			override getDefaultAccountAuthenticationProvider() { return account?.authenticationProvider ?? initialAccount.authenticationProvider; }
			override async signIn(...args: Parameters<IDefaultAccountService['signIn']>): Promise<IDefaultAccount | null> {
				signInCalls.push(args);
				account = initialAccount;
				sessions = [{ ...initialSession, scopes: ['read:user'] }];
				accountChanged.fire(account);
				return account;
			}
		}();
		const authenticationService = new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = sessionsChanged.event;
			override async getSessions(...args: Parameters<IAuthenticationService['getSessions']>) {
				authenticationCalls.push(args);
				return sessions;
			}
			override async createSession(...args: Parameters<IAuthenticationService['createSession']>) {
				consentCalls.push(args);
				const [, scopes, options] = args;
				assert.ok(Array.isArray(scopes));
				const session: AuthenticationSession = {
					id: 'authorized-session', accessToken: 'authorized-token', account: options?.account ?? initialSession.account, scopes,
				};
				sessions.push(session);
				sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { added: [session], changed: undefined, removed: undefined } });
				return session;
			}
		}();
		const productService = new class extends mock<IProductService>() {
			override readonly defaultChatAgent = {
				...product.defaultChatAgent,
				mcpConnectorsUrl: 'https://api.github.test/copilot-connectors/api/v1',
			};
		}();
		const configurationService = new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled]: enabled,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const opened: string[] = [];
		let reconciliationError: Error | undefined;
		const reconciliations: number[] = [];
		const reconciliationNames: Array<string | undefined> = [];
		const reconciliationWaits: Promise<void>[] = [];
		const agentHostService: IAgentHostService = new class extends mock<IAgentHostService>() {
			override async refreshCopilotConnectorSessions(name?: string): Promise<void> {
				reconciliations.push(reconciliations.length + 1);
				reconciliationNames.push(name);
				const wait = reconciliationWaits.shift();
				if (wait) {
					await wait;
				}
				if (reconciliationError) {
					throw reconciliationError;
				}
			}
		}();
		const openerService = new class extends mock<IOpenerService>() {
			override async open(resource: URI) {
				opened.push(resource.toString(true));
				return true;
			}
		}();
		const telemetryService = new TestTelemetryService();
		const grants: GitHubAuthorizationContext[] = [];
		const leases = { acquired: 0, released: 0 };
		const invalidatedGrants = store.add(new Emitter<GitHubCredentialChange>());
		const engine = store.add(new GitHubService({
			connectorsApiBaseUri: productService.defaultChatAgent.mcpConnectorsUrl,
			fetch: async (input, options) => {
				const url = String(input);
				if (url === 'https://api.github.com/user') {
					return Response.json({ id: 101 });
				}
				assert.ok(options?.signal);
				requests.push({ type: options.method, url, data: typeof options.body === 'string' ? options.body : undefined });
				requestTokens.push(CancellationToken.fromAbortSignal(options.signal, requestLifetime));
				authorizationHeaders.push(new Headers(options.headers).get('Authorization') ?? undefined);
				validators.push(new Headers(options.headers).get('If-None-Match'));
				const response = responses.shift() ?? {};
				if (response.ready) {
					await response.ready;
				}
				const body = response.body === undefined ? '' : JSON.stringify(response.body);
				return new Response(response.status === 204 || response.status === 304 ? null : body, { status: response.status ?? 200, headers: response.headers });
			},
		}, new NullLogService(), NullTelemetryService));
		const scope = store.add(engine.createRequestProviderScope({
			onDidChange: invalidatedGrants.event,
			getToken: context => sessions.find(session => session.id === context.sessionId && session.account.id === context.accountId)?.accessToken,
		}));
		const gitHubService = new class extends mock<IWorkbenchGitHubService>() {
			override async acquireAccountApiClient(authorization: GitHubAuthorizationContext, signal: AbortSignal): Promise<IGitHubAccountClient> {
				signal.throwIfAborted();
				grants.push(authorization);
				if (!sessions.some(session => session.id === authorization.sessionId && session.account.id === authorization.accountId)) {
					throw new GitHubRequestError('The selected session is unavailable', 'authentication');
				}
				const reference = scope.acquireClient({
					authorization, apiBaseUri: 'https://api.github.com', graphQlUri: 'https://api.github.com/graphql',
				});
				leases.acquired++;
				return new AccountClient(authorization, reference.object, toDisposable(() => { reference.dispose(); leases.released++; }));
			}
		}();
		const service = store.add(new CopilotConnectorsService(
			gitHubService,
			authenticationService,
			defaultAccountService,
			productService,
			configurationService,
			openerService,
			agentHostService,
			telemetryService,
			new NullLogService(),
		));
		return {
			service, requests, requestTokens, authorizationHeaders, opened, configurationService, authenticationCalls, consentCalls, signInCalls, authenticationService, defaultAccountService,
			gitHubService, grants, leases, validators,
			invalidateClient: () => invalidatedGrants.fire({ providerId: 'github', sessionIds: ['session'] }),
			initialAccount, initialSession, accountChanged, sessionsChanged, reconciliations, reconciliationNames, agentHostService, telemetryService,
			queueReconciliationWait: (wait: Promise<void>) => reconciliationWaits.push(wait),
			setReconciliationError: (error: Error | undefined) => { reconciliationError = error; },
			setAccount: (value: IDefaultAccount | null, notify = true) => {
				account = value;
				if (notify) {
					accountChanged.fire(value);
				}
			},
			setSessions: (value: AuthenticationSession[]) => { sessions = value; },
		};
	}

	async function setEnabled(configuration: TestConfigurationService, enabled: boolean): Promise<void> {
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, enabled);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean { return section === CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled; }
		}());
	}

	test('selects an explicit grant without passing tokens and releases its client', async () => {
		const fixture = createFixture([{ body: catalogResponse('not_connected') }]);
		await fixture.service.refresh(CancellationToken.None);
		fixture.service.dispose();
		assert.deepStrictEqual({ grants: fixture.grants, leases: fixture.leases }, {
			grants: [{
				providerId: 'github', sessionId: fixture.initialSession.id, accountId: fixture.initialSession.account.id,
				scopes: fixture.initialSession.scopes, authorizationServer: undefined,
			}],
			leases: { acquired: 1, released: 1 },
		});
	});

	test('retains one grant lease and reuses an unchanged catalog only after ETag revalidation', async () => {
		const etag = 'W/"catalog version 1"';
		const fixture = createFixture([
			{ body: catalogResponse('connected'), headers: { ETag: etag, 'Cache-Control': 'private, no-cache' } },
			{ status: 304, headers: { ETag: etag } },
		]);
		let changes = 0;
		store.add(fixture.service.onDidChange(() => { changes++; }));
		const first = await fixture.service.refresh(CancellationToken.None);
		const second = await fixture.service.refresh(CancellationToken.None);
		const retained = { ...fixture.leases };
		fixture.service.dispose();
		assert.deepStrictEqual({ first, second, validators: fixture.validators, retained, final: fixture.leases, changes }, {
			first, second: first, validators: [null, etag],
			retained: { acquired: 1, released: 0 }, final: { acquired: 1, released: 1 }, changes: 1,
		});
	});

	for (const change of ['account', 'scope', 'disable', 'invalidation']) {
		test(`${change} changes release the cached grant and prevent reuse of its validator`, async () => {
			const etag = '"account-catalog"';
			const fixture = createFixture([
				{ body: catalogResponse('connected'), headers: { ETag: etag } },
				{ body: catalogResponse('not_connected'), headers: { ETag: etag } },
			]);
			await fixture.service.refresh(CancellationToken.None);
			if (change === 'account') {
				fixture.setSessions([{ ...fixture.initialSession, id: 'other-session', account: { id: 'other-account', label: 'other' } }]);
				fixture.setAccount({ ...fixture.initialAccount, accountName: 'other', sessionId: 'other-session' });
			} else if (change === 'scope') {
				const updated = { ...fixture.initialSession, scopes: ['read:user'] };
				fixture.setSessions([updated]);
				fixture.sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { added: undefined, removed: undefined, changed: [updated] } });
			} else if (change === 'disable') {
				await setEnabled(fixture.configurationService, false);
				await setEnabled(fixture.configurationService, true);
			} else {
				fixture.invalidateClient();
			}
			const released = { ...fixture.leases };
			await fixture.service.refresh(CancellationToken.None);
			fixture.service.dispose();
			assert.deepStrictEqual({ validators: fixture.validators, released, final: fixture.leases }, {
				validators: [null, null], released: { acquired: 1, released: 1 }, final: { acquired: 2, released: 2 },
			});
		});
	}

	test('cancelling one refresh does not dispose the retained client used by another refresh', async () => {
		const response = new DeferredPromise<void>();
		const fixture = createFixture([
			{ body: catalogResponse('not_connected', ['mail']), ready: response.p },
			{ body: catalogResponse('connected', ['calendar']) },
		]);
		const cancellation = store.add(new CancellationTokenSource());
		const first = assert.rejects(fixture.service.refresh(cancellation.token), isCancellationError);
		await timeout(0);
		await fixture.service.refresh(CancellationToken.None);
		cancellation.cancel();
		await first;
		await response.complete();
		const retained = { ...fixture.leases };
		fixture.service.dispose();
		assert.deepStrictEqual({ names: fixture.service.connectors.map(connector => connector.name), retained, final: fixture.leases }, {
			names: ['calendar'], retained: { acquired: 1, released: 0 }, final: { acquired: 1, released: 1 },
		});
	});

	test('a malformed catalog does not clear a previously valid snapshot', async () => {
		const fixture = createFixture([{ body: catalogResponse('connected') }, { body: { plugins: null } }]);
		const first = await fixture.service.refresh(CancellationToken.None);
		await assert.rejects(fixture.service.refresh(CancellationToken.None), /invalid response/);
		assert.strictEqual(fixture.service.connectors, first);
	});

	test('bounds a stalled acquisition and disposes a client that arrives after timeout', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture([]);
		const pending = new DeferredPromise<IGitHubAccountClient>();
		const started = new DeferredPromise<{ authorization: GitHubAuthorizationContext; signal: AbortSignal }>();
		const acquire = fixture.gitHubService.acquireAccountApiClient;
		fixture.gitHubService.acquireAccountApiClient = async (authorization, signal) => {
			void started.complete({ authorization, signal });
			return pending.p;
		};
		const start = Date.now();
		const rejected = assert.rejects(fixture.service.refresh(CancellationToken.None), /request timed out/);
		const request = await started.p;
		await rejected;
		const elapsed = Date.now() - start;
		const late = await acquire(request.authorization, new AbortController().signal);
		await pending.complete(late);
		await timeout(0);
		assert.deepStrictEqual({ elapsed, aborted: request.signal.aborted, requests: fixture.requests, leases: fixture.leases }, {
			elapsed: 30_000, aborted: true, requests: [], leases: { acquired: 1, released: 1 },
		});
	}));

	test('times out a stalled request and releases its client after thirty seconds', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const response = new DeferredPromise<void>();
		const fixture = createFixture([{ body: catalogResponse('not_connected'), ready: response.p }]);
		const start = Date.now();
		await assert.rejects(fixture.service.refresh(CancellationToken.None), /request timed out/);
		await response.complete();
		fixture.service.dispose();
		assert.deepStrictEqual({ elapsed: Date.now() - start, aborted: fixture.requestTokens[0].isCancellationRequested, leases: fixture.leases }, {
			elapsed: 30_000, aborted: true, leases: { acquired: 1, released: 1 },
		});
	}));

	test('validates catalog metadata and exposes an MCP marketplace source', async () => {
		const fixture = createFixture([{ body: catalogResponse('not_connected', ['mail', 'calendar'], { homepage: 'https://github.com/features/copilot' }) }]);
		const source = new CopilotConnectorsMarketplaceProvider(fixture.service, fixture.configurationService);

		const first = await source.query({ query: 'connector', mediaType: CustomizationMarketplaceMediaType.McpServer, pageSize: 1 }, CancellationToken.None);
		const second = await source.query({ query: 'connector', mediaType: CustomizationMarketplaceMediaType.McpServer, pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);

		assert.deepStrictEqual({
			first: first.items.map(item => ({ identifier: item.identifier, installation: item.installation, publisher: item.publisher, publisherUrl: item.publisherUrl?.toString() })),
			second: second.items.map(item => item.identifier),
			total: first.total,
			hasCursor: typeof first.nextCursor === 'string',
			requests: fixture.requests.map(request => request.url),
		}, {
			first: [{ identifier: 'mail', installation: { kind: 'copilotConnector', name: 'mail' }, publisher: 'GitHub Copilot', publisherUrl: 'https://github.com/features/copilot' }],
			second: ['calendar'],
			total: 2,
			hasCursor: true,
			requests: ['https://api.github.test/copilot-connectors/api/v1/plugins'],
		});
	});

	test('projects top-level service metadata and public endpoints', async () => {
		const fixture = createFixture([{
			body: {
				plugins: [createConnectorPlugin({
					name: 'kusto',
					logo: 'https://static.powerapps.com/kusto/icon.png',
					version: '1.2.3',
					description: 'Search cloud logs',
					homepage: 'https://example.com/docs',
					repository: 'https://github.com/example/connector',
					license: 'MIT',
					keywords: ['logs', 'analytics'],
					author: { name: 'Connector Publisher', email: 'author@example.com', url: 'https://example.com' },
					metadata: { displayName: 'Azure Data Explorer' },
				})],
			},
		}]);
		const source = new CopilotConnectorsMarketplaceProvider(fixture.service, fixture.configurationService);
		const page = await source.query({}, CancellationToken.None);
		const marketplaceIcon = page.items[0]?.icon;
		const connector = fixture.service.connectors[0];

		assert.deepStrictEqual({
			connectorIcon: fixture.service.connectors[0]?.icon?.toString(),
			marketplaceIcon: URI.isUri(marketplaceIcon) ? marketplaceIcon.toString() : undefined,
			description: connector.description,
			version: connector.version,
			homepage: connector.homepage?.toString(),
			documentation: connector.documentation?.toString(),
			repository: connector.repository?.toString(),
			license: connector.license,
			keywords: connector.keywords,
			author: connector.author && { ...connector.author, url: connector.author.url?.toString() },
		}, {
			connectorIcon: 'https://static.powerapps.com/kusto/icon.png',
			marketplaceIcon: 'https://static.powerapps.com/kusto/icon.png',
			description: 'Search cloud logs',
			version: '1.2.3',
			homepage: 'https://example.com/docs',
			documentation: 'https://example.com/docs',
			repository: 'https://github.com/example/connector',
			license: 'MIT',
			keywords: ['logs', 'analytics'],
			author: { name: 'Connector Publisher', email: 'author@example.com', url: 'https://example.com/' },
		});
	});

	test('ranks top-level keywords locally without inventing unsupported metadata', async () => {
		const fixture = createFixture([{
			body: {
				plugins: [createConnectorPlugin({
					name: 'service',
					keywords: ['inbox'],
					metadata: { displayName: 'Entry' },
				})]
			}
		}]);
		const source = new CopilotConnectorsMarketplaceProvider(fixture.service, fixture.configurationService);
		const keywords = await source.query({ query: 'inbox' }, CancellationToken.None);
		assert.deepStrictEqual({
			keywordScores: keywords.items.map(item => item.score),
			metadata: fixture.service.connectors.map(connector => [connector.keywords, connector.representativeQueries]),
			requests: fixture.requests.map(request => [request.type, request.url]),
			authentication: fixture.authenticationCalls,
		}, {
			keywordScores: [65],
			metadata: [[['inbox'], []]],
			requests: [['GET', 'https://api.github.test/copilot-connectors/api/v1/plugins']],
			authentication: [['github', [], { silent: true }, true]],
		});
	});

	test('an authorized token rejected by the endpoint does not cause repeated consent', async () => {
		const fixture = createFixture([{ status: 403, body: { message: 'Insufficient OAuth scope' } }]);
		await assert.rejects(fixture.service.getConnectors(CancellationToken.None), /HTTP 403/);
		assert.deepStrictEqual({
			requests: fixture.requests.length,
			authentication: fixture.authenticationCalls,
			opened: fixture.opened,
			connectors: fixture.service.connectors,
			consent: fixture.consentCalls,
			authorizationRequired: fixture.service.authorizationRequired,
		}, { requests: 1, authentication: [['github', [], { silent: true }, true]], opened: [], connectors: [], consent: [], authorizationRequired: false });
	});

	test('ordinary GitHub sessions see catalog status without consent or enabling runtime tools', async () => {
		const catalog = catalogResponse('connected');
		const fixture = createFixture([{ body: catalog }, { body: catalog }]);
		fixture.setSessions([{ ...fixture.initialSession, scopes: ['read:user'] }]);
		const connectors = await fixture.service.getConnectors(CancellationToken.None);
		await fixture.service.refresh(CancellationToken.None);
		assert.deepStrictEqual({
			authorizationRequired: fixture.service.authorizationRequired,
			connectionStateKnown: fixture.service.connectionStateKnown,
			requests: fixture.requests.map(request => request.url),
			authorization: fixture.authorizationHeaders.every(header => header === `Bearer ${fixture.initialSession.accessToken}`),
			status: connectors[0]?.connectionStatus,
			detail: connectors[0]?.connectionStatusDetail,
			error: connectors[0]?.connectionErrorMessage,
			resource: connectors[0]?.protectedResourceMetadataUrl,
			scopes: connectors[0]?.scopes,
			mcpServers: fixture.service.connectedMcpServers.map(server => server.serverName),
			reconciliations: fixture.reconciliations.length,
			consent: fixture.consentCalls,
		}, {
			authorizationRequired: false,
			connectionStateKnown: true,
			requests: ['https://api.github.test/copilot-connectors/api/v1/plugins', 'https://api.github.test/copilot-connectors/api/v1/plugins'],
			authorization: true,
			status: 'connected',
			detail: undefined,
			error: undefined,
			resource: 'https://example.com/mail/oauth',
			scopes: ['write:plugin_gateway_connections'],
			mcpServers: ['mail-server'],
			reconciliations: 0,
			consent: [],
		});
	});

	test('only an authorized catalog change reconciles runtime tool availability', async () => {
		const catalog = catalogResponse('connected');
		const fixture = createFixture([{ body: catalog }, { body: catalog }]);
		fixture.setSessions([{ ...fixture.initialSession, scopes: ['read:user'] }]);
		await fixture.service.refresh(CancellationToken.None);
		const unscopedRefreshes = fixture.reconciliations.length;
		fixture.setSessions([fixture.initialSession]);
		await fixture.service.refresh(CancellationToken.None);
		assert.deepStrictEqual({ unscopedRefreshes, authorizedRefreshes: fixture.reconciliations.length, status: fixture.service.connectors[0].connectionStatus }, {
			unscopedRefreshes: 0, authorizedRefreshes: 1, status: 'connected',
		});
	});

	test('reports bounded catalog snapshots for every status and access mode', async () => {
		const scoped = createFixture([{
			body: {
				plugins: [
					createConnectorPlugin({
						name: 'connected',
						connection: { status: 'connected' },
						mcpServers: {
							mcpServers: {
								first: { type: 'http', url: 'https://example.com/connected/first' },
								second: { type: 'http', url: 'https://example.com/connected/second' },
							}
						},
					}),
					createConnectorPlugin({
						name: 'not-connected',
						connection: { status: 'not_connected' },
						mcpServers: {
							mcpServers: {
								only: { type: 'http', url: 'https://example.com/not-connected' },
							}
						},
					}),
					createConnectorPlugin({ name: 'pending', connection: { status: 'pending' }, mcpServers: { mcpServers: {} } }),
					createConnectorPlugin({
						name: 'error',
						connection: { status: 'error' },
						mcpServers: {
							mcpServers: {
								only: { type: 'http', url: 'https://example.com/error' },
							}
						},
					}),
				],
			},
		}]);
		await scoped.service.refresh(CancellationToken.None);

		const unscoped = createFixture([{ body: catalogResponse('connected', ['mail', 'calendar']) }]);
		unscoped.setSessions([{ ...unscoped.initialSession, scopes: ['read:user'] }]);
		await unscoped.service.refresh(CancellationToken.None);

		const unavailable = createFixture([], true, true);
		await unavailable.service.refresh(CancellationToken.None);

		const snapshot = (telemetry: TestTelemetryService) => telemetry.events.find(event => event.name === 'copilotConnectors.catalogSnapshot')?.data;
		assert.deepStrictEqual({
			scoped: snapshot(scoped.telemetryService),
			unscoped: snapshot(unscoped.telemetryService),
			unavailable: snapshot(unavailable.telemetryService),
		}, {
			scoped: {
				catalogAccess: 'scoped',
				connectorCount: 4,
				connectedConnectorCount: 1,
				notConnectedConnectorCount: 1,
				pendingConnectorCount: 1,
				errorConnectorCount: 1,
				unknownConnectorCount: 0,
				mcpServerCount: 4,
				connectedMcpServerCount: 2,
			},
			unscoped: {
				catalogAccess: 'unscoped',
				connectorCount: 2,
				connectedConnectorCount: 2,
				notConnectedConnectorCount: 0,
				pendingConnectorCount: 0,
				errorConnectorCount: 0,
				unknownConnectorCount: 0,
				mcpServerCount: 2,
				connectedMcpServerCount: 2,
			},
			unavailable: {
				catalogAccess: 'unavailable',
				connectorCount: 0,
				connectedConnectorCount: 0,
				notConnectedConnectorCount: 0,
				pendingConnectorCount: 0,
				errorConnectorCount: 0,
				unknownConnectorCount: 0,
				mcpServerCount: 0,
				connectedMcpServerCount: 0,
			},
		});
	});

	test('a narrow token receives a catalog error without requesting connector consent', async () => {
		const fixture = createFixture([{ status: 403 }, { body: catalogResponse('connected') }]);
		fixture.setSessions([{ ...fixture.initialSession, scopes: ['read:user'] }]);
		await assert.rejects(fixture.service.getConnectors(CancellationToken.None), /catalog is unavailable for this account/);
		const before = {
			requests: fixture.requests.length,
			consent: fixture.consentCalls.length,
			status: fixture.service.connectors,
			authorizationRequired: fixture.service.authorizationRequired,
		};
		await fixture.service.checkConnection(CancellationToken.None);
		assert.deepStrictEqual({
			before,
			after: fixture.service.connectors[0]?.connectionStatus,
			consent: fixture.consentCalls.length,
			requests: fixture.requests.map(request => request.type),
		}, {
			before: { requests: 1, consent: 0, status: [], authorizationRequired: false },
			after: 'connected', consent: 0, requests: ['GET', 'GET'],
		});
	});

	test('signed-out discovery offers sign-in without prompting or requesting the catalog', async () => {
		const fixture = createFixture([]);
		fixture.setAccount(null);
		fixture.setSessions([]);
		const source = new CopilotConnectorsMarketplaceProvider(fixture.service, fixture.configurationService);
		await assert.rejects(source.query({}, CancellationToken.None), /Sign in to view connectors/);
		assert.deepStrictEqual({
			authorizationRequired: fixture.service.authorizationRequired,
			signIn: fixture.signInCalls,
			consent: fixture.consentCalls,
			requests: fixture.requests,
		}, { authorizationRequired: true, signIn: [], consent: [], requests: [] });
	});

	test('signing in to browse requests only ordinary GitHub scopes and exposes catalog status', async () => {
		const fixture = createFixture([{ body: catalogResponse('connected') }]);
		fixture.setAccount(null);
		fixture.setSessions([]);
		await fixture.service.signIn(CancellationToken.None);
		const connectors = await fixture.service.getConnectors(CancellationToken.None);
		assert.deepStrictEqual({
			signIn: fixture.signInCalls,
			consent: fixture.consentCalls,
			status: connectors[0]?.connectionStatus,
			connected: fixture.service.connectedMcpServers.map(server => server.serverName),
		}, { signIn: [[]], consent: [], status: 'connected', connected: ['mail-server'] });
	});

	test('explicit connector sign-in uses unchanged default sign-in followed by separate connector consent', async () => {
		const fixture = createFixture([{ body: catalogResponse('not_connected') }]);
		fixture.setAccount(null);
		fixture.setSessions([]);
		await fixture.service.authorize(CancellationToken.None);
		const connectors = await fixture.service.getConnectors(CancellationToken.None);
		assert.deepStrictEqual({
			signIn: fixture.signInCalls,
			consent: fixture.consentCalls,
			defaultSession: fixture.defaultAccountService.currentDefaultAccount?.sessionId,
			authorizationRequired: fixture.service.authorizationRequired,
			connectors: connectors.map(connector => connector.name),
		}, {
			signIn: [[]],
			consent: [['github', ['read:user', 'write:plugin_gateway_connections'], { account: { id: 'account', label: 'octocat' } }]],
			defaultSession: 'session',
			authorizationRequired: false,
			connectors: ['mail'],
		});
	});

	for (const outcome of ['cancelled', 'disabled', 'disposed']) {
		test(`default sign-in ${outcome} does not continue to connector consent`, async () => {
			const fixture = createFixture([]);
			fixture.setAccount(null);
			fixture.setSessions([]);
			const signIn = new DeferredPromise<IDefaultAccount | null>();
			fixture.defaultAccountService.signIn = () => signIn.p;
			const cancellation = store.add(new CancellationTokenSource());
			const authorization = assert.rejects(fixture.service.authorize(cancellation.token), isCancellationError);
			await timeout(0);
			if (outcome === 'disabled') {
				await setEnabled(fixture.configurationService, false);
			} else if (outcome === 'disposed') {
				fixture.service.dispose();
			} else {
				cancellation.cancel();
			}
			await signIn.complete(fixture.initialAccount);
			await authorization;
			assert.deepStrictEqual({ consent: fixture.consentCalls, requests: fixture.requests }, { consent: [], requests: [] });
		});
	}

	test('explicit consent upgrades the active account and reuses its scoped session without changing the default session', async () => {
		const fixture = createFixture([{ body: catalogResponse('not_connected') }]);
		fixture.setSessions([{ ...fixture.initialSession, scopes: ['read:user'] }]);
		await Promise.all([fixture.service.authorize(CancellationToken.None), fixture.service.authorize(CancellationToken.None)]);
		const connectors = await fixture.service.getConnectors(CancellationToken.None);
		assert.deepStrictEqual({
			consent: fixture.consentCalls,
			authorization: fixture.authorizationHeaders,
			authorizationRequired: fixture.service.authorizationRequired,
			defaultSession: fixture.defaultAccountService.currentDefaultAccount?.sessionId,
			connectors: connectors.map(connector => connector.name),
		}, {
			consent: [['github', ['read:user', 'write:plugin_gateway_connections'], { account: { id: 'account', label: 'octocat' } }]],
			authorization: ['Bearer authorized-token'],
			authorizationRequired: false,
			defaultSession: 'session',
			connectors: ['mail'],
		});
	});

	test('checking connection only refreshes status without consent or mutation', async () => {
		const fixture = createFixture([{ body: catalogResponse('connected') }, { body: catalogResponse('connected') }]);
		fixture.setSessions([{ ...fixture.initialSession, scopes: ['read:user'] }]);
		const before = await fixture.service.getConnectors(CancellationToken.None);
		await fixture.service.checkConnection(CancellationToken.None);
		assert.deepStrictEqual({
			before: before[0]?.connectionStatus,
			after: fixture.service.connectors[0]?.connectionStatus,
			consent: fixture.consentCalls.length,
			requests: fixture.requests.map(request => [request.type, request.url]),
		}, {
			before: 'connected', after: 'connected', consent: 0,
			requests: [
				['GET', 'https://api.github.test/copilot-connectors/api/v1/plugins'],
				['GET', 'https://api.github.test/copilot-connectors/api/v1/plugins'],
			],
		});
	});

	test('already authorized sessions do not request consent', async () => {
		const fixture = createFixture([{ body: catalogResponse('not_connected') }]);
		await fixture.service.authorize(CancellationToken.None);
		await fixture.service.getConnectors(CancellationToken.None);
		assert.deepStrictEqual({ consent: fixture.consentCalls, authorization: fixture.authorizationHeaders }, {
			consent: [], authorization: ['Bearer test-token'],
		});
	});

	test('read-only connector access can browse and upgrades only on an explicit connection', async () => {
		const fixture = createFixture([
			{ body: catalogResponse('not_connected') },
			{ body: catalogResponse('not_connected') },
			{ body: { status: 'Connected', provisioning_state: 'Succeeded' } },
			{ body: catalogResponse('connected') },
		]);
		fixture.setSessions([{ ...fixture.initialSession, scopes: ['read:user', 'read:plugin_gateway_connections'] }]);
		await fixture.service.getConnectors(CancellationToken.None);
		const browse = { consent: fixture.consentCalls.length, authorizationRequired: fixture.service.authorizationRequired };
		await fixture.service.connect('mail', CancellationToken.None);
		assert.deepStrictEqual({
			browse,
			consent: fixture.consentCalls,
			authorization: fixture.authorizationHeaders,
			status: fixture.service.connectors[0]?.connectionStatus,
		}, {
			browse: { consent: 0, authorizationRequired: false },
			consent: [['github', ['read:user', 'read:plugin_gateway_connections', 'write:plugin_gateway_connections'], { account: { id: 'account', label: 'octocat' } }]],
			authorization: ['Bearer test-token', 'Bearer test-token', 'Bearer authorized-token', 'Bearer test-token'],
			status: 'connected',
		});
	});

	test('a narrow connector-only session does not satisfy authorization for the default session account', async () => {
		const fixture = createFixture([]);
		const defaultSession = { ...fixture.initialSession, scopes: ['read:user', 'user:email'] };
		fixture.setSessions([
			defaultSession,
			{ ...fixture.initialSession, id: 'narrow-session', accessToken: 'narrow-token', scopes: ['write:plugin_gateway_connections'] },
			{ ...fixture.initialSession, id: 'partial-session', accessToken: 'partial-token', scopes: ['user:email', 'write:plugin_gateway_connections'] },
		]);
		await fixture.service.authorize(CancellationToken.None);
		await fixture.service.refreshAgentHostSessions('workiqmcp');
		assert.deepStrictEqual({ consent: fixture.consentCalls, reconciliations: fixture.reconciliationNames }, {
			consent: [['github', ['read:user', 'user:email', 'write:plugin_gateway_connections'], { account: { id: 'account', label: 'octocat' } }]],
			reconciliations: ['workiqmcp'],
		});
	});

	test('only reuses an existing scoped session belonging to the active account', async () => {
		const fixture = createFixture([{ body: catalogResponse('not_connected') }]);
		const scoped = { ...fixture.initialSession, id: 'scoped-session', accessToken: 'scoped-token' };
		fixture.setSessions([
			{ ...scoped, id: 'other-session', account: { id: 'other-account', label: 'someone-else' } },
			{ ...fixture.initialSession, scopes: ['read:user'] },
			scoped,
		]);
		await fixture.service.authorize(CancellationToken.None);
		const first = await fixture.service.getConnectorsSnapshot(CancellationToken.None);
		fixture.sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { added: undefined, changed: [scoped], removed: undefined } });
		assert.deepStrictEqual({ consent: fixture.consentCalls, authorization: fixture.authorizationHeaders, invalidated: first.cacheToken.isCancellationRequested }, {
			consent: [], authorization: ['Bearer scoped-token'], invalidated: true,
		});
	});

	test('refreshes live sessions only when the active account connector authorization changes', async () => {
		const fixture = createFixture([{ body: catalogResponse('connected') }]);
		const unscoped = { ...fixture.initialSession, scopes: ['read:user'] };
		fixture.setSessions([unscoped]);
		await fixture.service.refresh(CancellationToken.None);

		const renewedUnscoped = { ...unscoped, accessToken: 'renewed-unscoped-token' };
		fixture.setSessions([renewedUnscoped]);
		fixture.sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { added: undefined, changed: [renewedUnscoped], removed: undefined } });
		await timeout(0);

		const afterUnscopedRenewal = fixture.reconciliations.length;
		const upscoped = { ...unscoped, id: 'connector-authorized-session', scopes: [...unscoped.scopes, 'write:plugin_gateway_connections'] };
		fixture.setSessions([renewedUnscoped, upscoped]);
		fixture.sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { added: [upscoped], changed: undefined, removed: undefined } });
		await timeout(0);

		const afterGain = fixture.reconciliations.length;
		const renewed = { ...upscoped, accessToken: 'renewed-token' };
		fixture.setSessions([renewedUnscoped, renewed]);
		fixture.sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { added: undefined, changed: [renewed], removed: undefined } });
		await timeout(0);

		const afterRenewal = fixture.reconciliations.length;
		fixture.setSessions([renewedUnscoped]);
		fixture.sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { added: undefined, changed: undefined, removed: [renewed] } });
		await timeout(0);

		assert.deepStrictEqual({ afterUnscopedRenewal, afterGain, afterRenewal, afterLoss: fixture.reconciliations.length }, {
			afterUnscopedRenewal: 0,
			afterGain: 1,
			afterRenewal: 1,
			afterLoss: 2,
		});
	});

	test('refreshes live sessions when connector authorization arrives before catalog initialization', async () => {
		const fixture = createFixture([]);
		const unscoped = { ...fixture.initialSession, scopes: ['read:user'] };
		const upscoped = { ...unscoped, id: 'connector-authorized-session', scopes: [...unscoped.scopes, 'write:plugin_gateway_connections'] };
		const otherAccountScoped = { ...upscoped, id: 'other-account-session', account: { id: 'other-account', label: 'someone-else' } };
		fixture.setSessions([unscoped, otherAccountScoped]);
		fixture.sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { added: [otherAccountScoped], changed: undefined, removed: undefined } });
		await timeout(0);

		const afterOtherAccount = fixture.reconciliations.length;
		fixture.setSessions([unscoped, upscoped]);
		fixture.sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { added: [upscoped], changed: undefined, removed: undefined } });
		await timeout(0);

		assert.deepStrictEqual({ afterOtherAccount, afterActiveAccount: fixture.reconciliations.length }, {
			afterOtherAccount: 0,
			afterActiveAccount: 1,
		});
	});

	for (const outcome of ['cancelled', 'denied', 'wrong-account', 'missing-scope']) {
		test(`authorization ${outcome} does not make connector mutations or switch the active account`, async () => {
			const fixture = createFixture([{ body: catalogResponse('connected') }]);
			const oldSession = { ...fixture.initialSession, scopes: ['read:user'] };
			fixture.setSessions([oldSession]);
			fixture.authenticationService.createSession = async () => {
				switch (outcome) {
					case 'cancelled': throw new CancellationError();
					case 'denied': throw new Error('Permission denied');
					case 'wrong-account': return { ...fixture.initialSession, account: { id: 'other-account', label: 'someone-else' } };
					default: return oldSession;
				}
			};
			await assert.rejects(fixture.service.authorize(CancellationToken.None), outcome === 'cancelled' ? isCancellationError : /Permission denied|same GitHub account|did not grant permission/);
			const connectors = await fixture.service.getConnectors(CancellationToken.None);
			assert.deepStrictEqual({
				requests: fixture.requests,
				account: fixture.defaultAccountService.currentDefaultAccount,
				authorizationRequired: fixture.service.authorizationRequired,
				status: connectors[0]?.connectionStatus,
			}, {
				requests: [{ type: 'GET', url: 'https://api.github.test/copilot-connectors/api/v1/plugins', data: undefined }],
				account: fixture.initialAccount, authorizationRequired: false, status: 'connected',
			});
		});
	}

	for (const change of ['source', 'account', 'dispose', 'caller']) {
		test(`pending consent is cancelled by a ${change} change and cannot apply a late result`, async () => {
			const fixture = createFixture([]);
			fixture.setSessions([{ ...fixture.initialSession, scopes: ['read:user'] }]);
			const consent = new DeferredPromise<AuthenticationSession>();
			const started = new DeferredPromise<void>();
			const cancellation = store.add(new CancellationTokenSource());
			fixture.authenticationService.createSession = async () => {
				await started.complete();
				return consent.p;
			};
			const result = assert.rejects(fixture.service.authorize(cancellation.token), isCancellationError);
			await started.p;
			switch (change) {
				case 'source': await setEnabled(fixture.configurationService, false); break;
				case 'account': fixture.setAccount({ ...fixture.initialAccount, accountName: 'someone-else', sessionId: 'other-session' }); break;
				case 'dispose': fixture.service.dispose(); break;
				default: cancellation.cancel();
			}
			await result;
			await consent.complete(fixture.initialSession);
			assert.deepStrictEqual({ requests: fixture.requests, connectors: fixture.service.connectors }, { requests: [], connectors: [] });
		});
	}

	test('disabled connectors do not look up a session or request consent', async () => {
		const fixture = createFixture([], false);
		await assert.rejects(fixture.service.authorize(CancellationToken.None), isCancellationError);
		assert.deepStrictEqual({ authentication: fixture.authenticationCalls, consent: fixture.consentCalls, requests: fixture.requests }, {
			authentication: [], consent: [], requests: [],
		});
	});

	test('native pages retain their ranked catalog after the sixty-second cache refresh changes metadata and membership', async () => {
		await runWithFakedTimers({}, async () => {
			await timeout(1);
			const fixture = createFixture([
				{
					body: {
						plugins: [
							createConnectorPlugin({ name: 'description', description: 'Search Mail', metadata: { displayName: 'Entry' } }),
							createConnectorPlugin({ name: 'prefix', metadata: { displayName: 'Mail Alpha' } }),
							createConnectorPlugin({ name: 'exact', metadata: { displayName: 'Mail' } }),
						]
					}
				},
				{
					body: {
						plugins: [
							createConnectorPlugin({ name: 'new', metadata: { displayName: 'Mail' } }),
							createConnectorPlugin({ name: 'description', metadata: { displayName: 'Mail' } }),
						]
					}
				},
			]);
			const source = new CopilotConnectorsMarketplaceProvider(fixture.service, fixture.configurationService);
			const options = { query: 'mail', pageSize: 1 };
			const first = await source.query(options, CancellationToken.None);
			await timeout(60_001);
			await fixture.service.getConnectors(CancellationToken.None);
			const second = await source.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
			const third = await source.query({ ...options, cursor: second.nextCursor }, CancellationToken.None);
			const fresh = await source.query(options, CancellationToken.None);
			assert.deepStrictEqual({
				old: [first, second, third].map(page => [page.items[0].identifier, page.items[0].score, page.total]),
				fresh: fresh.items.map(item => [item.identifier, item.score]),
				catalog: fixture.service.connectors.map(connector => connector.name),
				requests: fixture.requests.length,
				sameContext: first.cacheToken === fresh.cacheToken,
			}, {
				old: [['exact', 100, 3], ['prefix', 90, 3], ['description', 25, 3]],
				fresh: [['new', 100]],
				catalog: ['new', 'description'],
				requests: 2,
				sameContext: true,
			});
		});
	});

	for (const change of ['account', 'session', 'source']) {
		test(`${change} changes invalidate native snapshots and the catalog cache`, async () => {
			const fixture = createFixture([{ body: catalogResponse('not_connected', ['mail', 'calendar']) }, { body: catalogResponse('not_connected', ['fresh']) }]);
			const source = new CopilotConnectorsMarketplaceProvider(fixture.service, fixture.configurationService);
			let accountChanges = 0;
			store.add(fixture.service.onDidChangeAccount(() => accountChanges++));
			const first = await source.query({ pageSize: 1 }, CancellationToken.None);
			if (change === 'account') {
				fixture.setAccount({ ...fixture.initialAccount, accountName: 'another-account', sessionId: 'another-session' });
				fixture.setSessions([{ ...fixture.initialSession, id: 'another-session' }]);
			} else if (change === 'session') {
				const session = { ...fixture.initialSession, accessToken: 'rotated-test-token' };
				fixture.setSessions([session]);
				fixture.sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { added: undefined, removed: undefined, changed: [session] } });
			} else {
				await setEnabled(fixture.configurationService, false);
				await setEnabled(fixture.configurationService, true);
			}
			const cleared = fixture.service.connectors.length === 0;
			await assert.rejects(source.query({ pageSize: 1, cursor: first.nextCursor }, CancellationToken.None), /Start a new search/);
			const readsBeforeNewQuery = fixture.requests.length;
			const fresh = await source.query({ pageSize: 1 }, CancellationToken.None);
			assert.deepStrictEqual({
				accountChanges, cleared, invalid: first.cacheToken?.isCancellationRequested, readsBeforeNewQuery,
				fresh: fresh.items.map(item => item.identifier), requests: fixture.requests.length,
			}, { accountChanges: change === 'account' ? 1 : 0, cleared: true, invalid: true, readsBeforeNewQuery: 1, fresh: ['fresh'], requests: 2 });
		});
	}

	test('sign-out refuses a continuation instead of exposing the previous account catalog', async () => {
		const fixture = createFixture([{ body: catalogResponse('not_connected', ['mail', 'calendar']) }]);
		const source = new CopilotConnectorsMarketplaceProvider(fixture.service, fixture.configurationService);
		const first = await source.query({ pageSize: 1 }, CancellationToken.None);
		fixture.setAccount(null);
		await assert.rejects(source.query({ pageSize: 1, cursor: first.nextCursor }, CancellationToken.None), /Start a new search/);
		await assert.rejects(source.query({}, CancellationToken.None), /Sign in to view connectors/);
		assert.deepStrictEqual({
			authorizationRequired: fixture.service.authorizationRequired,
			catalog: fixture.service.connectors,
			requests: fixture.requests.length,
			signIn: fixture.signInCalls,
		}, { authorizationRequired: true, catalog: [], requests: 1, signIn: [] });
	});

	test('unchanged account identity and unrelated authentication events preserve snapshots', async () => {
		const fixture = createFixture([{ body: catalogResponse('not_connected', ['mail', 'calendar']) }]);
		const source = new CopilotConnectorsMarketplaceProvider(fixture.service, fixture.configurationService);
		const first = await source.query({ pageSize: 1 }, CancellationToken.None);
		fixture.setAccount({ ...fixture.initialAccount });
		fixture.sessionsChanged.fire({ providerId: 'other-provider', label: 'Other', event: { added: undefined, removed: undefined, changed: [fixture.initialSession] } });
		fixture.sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { added: undefined, removed: undefined, changed: [{ ...fixture.initialSession, id: 'unrelated-session', account: { id: 'unrelated-account', label: 'someone-else' } }] } });
		const second = await source.query({ pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({
			items: second.items.map(item => item.identifier), invalid: first.cacheToken?.isCancellationRequested,
			sameContext: first.cacheToken === second.cacheToken, requests: fixture.requests.length,
		}, { items: ['calendar'], invalid: false, sameContext: true, requests: 1 });
	});

	test('initial account resolution happens before pinning the catalog context', async () => {
		const fixture = createFixture([{ body: catalogResponse('not_connected') }]);
		fixture.setAccount(null);
		fixture.defaultAccountService.getDefaultAccount = async () => {
			fixture.setAccount(fixture.initialAccount);
			return fixture.initialAccount;
		};
		const snapshot = await fixture.service.getConnectorsSnapshot(CancellationToken.None);
		assert.deepStrictEqual({ names: snapshot.connectors.map(connector => connector.name), invalid: snapshot.cacheToken.isCancellationRequested, requests: fixture.requests.length }, {
			names: ['mail'], invalid: false, requests: 1,
		});
	});

	test('snapshots bind the current account even before its change notification is delivered', async () => {
		const fixture = createFixture([{ body: catalogResponse('not_connected', ['old']) }, { body: catalogResponse('not_connected', ['new']) }]);
		const old = await fixture.service.getConnectorsSnapshot(CancellationToken.None);
		fixture.setAccount({ ...fixture.initialAccount, accountName: 'another-account', sessionId: 'another-session' }, false);
		fixture.setSessions([{ ...fixture.initialSession, id: 'another-session' }]);
		const fresh = await fixture.service.getConnectorsSnapshot(CancellationToken.None);
		assert.deepStrictEqual({
			oldInvalid: old.cacheToken.isCancellationRequested, freshInvalid: fresh.cacheToken.isCancellationRequested,
			names: fresh.connectors.map(connector => connector.name), requests: fixture.requests.length,
		}, { oldInvalid: true, freshInvalid: false, names: ['new'], requests: 2 });
	});

	test('re-enabling is observed before starting a snapshot even if the configuration notification is pending', async () => {
		const fixture = createFixture([{ body: catalogResponse('not_connected') }]);
		await setEnabled(fixture.configurationService, false);
		await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, true);
		const snapshot = await fixture.service.getConnectorsSnapshot(CancellationToken.None);
		assert.deepStrictEqual({ names: snapshot.connectors.map(connector => connector.name), invalid: snapshot.cacheToken.isCancellationRequested }, { names: ['mail'], invalid: false });
	});

	test('an old account response cannot overwrite a newer account catalog or create a snapshot', async () => {
		const ready = new DeferredPromise<void>();
		const fixture = createFixture([{ body: catalogResponse('not_connected', ['old']), ready: ready.p }, { body: catalogResponse('not_connected', ['new']) }]);
		const pending = fixture.service.getConnectorsSnapshot(CancellationToken.None);
		const rejected = assert.rejects(pending, /Start a new search/);
		await timeout(0);
		fixture.setAccount({ ...fixture.initialAccount, accountName: 'another-account', sessionId: 'another-session' });
		fixture.setSessions([{ ...fixture.initialSession, id: 'another-session' }]);
		await fixture.service.refresh(CancellationToken.None);
		await ready.complete();
		await rejected;
		assert.deepStrictEqual({
			cancelled: fixture.requestTokens[0].isCancellationRequested,
			names: fixture.service.connectors.map(connector => connector.name), requests: fixture.requests.length,
		}, { cancelled: true, names: ['new'], requests: 2 });
	});

	test('an account change during session lookup does not send the old credential', async () => {
		const fixture = createFixture([]);
		const sessions = new DeferredPromise<AuthenticationSession[]>();
		fixture.authenticationService.getSessions = async () => sessions.p;
		const pending = fixture.service.refresh(CancellationToken.None);
		const rejected = assert.rejects(pending, isCancellationError);
		await timeout(0);
		fixture.setAccount(null);
		await sessions.complete([fixture.initialSession]);
		await rejected;
		assert.deepStrictEqual(fixture.requests, []);
	});

	test('disposing the service invalidates snapshots and removes identity listeners', async () => {
		const fixture = createFixture([{ body: catalogResponse('not_connected') }]);
		const snapshot = await fixture.service.getConnectorsSnapshot(CancellationToken.None);
		fixture.service.dispose();
		assert.deepStrictEqual({
			invalid: snapshot.cacheToken.isCancellationRequested,
			accountObserved: fixture.accountChanged.hasListeners(), sessionsObserved: fixture.sessionsChanged.hasListeners(),
		}, { invalid: true, accountObserved: false, sessionsObserved: false });
	});

	for (const enabled of [true, false]) {
		test(enabled ? 'unchanged enablement preserves an in-flight catalog request' : 'disabling the source cancels an in-flight catalog request', async () => {
			const ready = new DeferredPromise<void>();
			const fixture = createFixture([{ body: catalogResponse('not_connected'), ready: ready.p }]);
			const pending = fixture.service.refresh(CancellationToken.None);
			const result = enabled ? pending : assert.rejects(pending, isCancellationError);
			await timeout(0);
			await setEnabled(fixture.configurationService, enabled);
			const cancelled = fixture.requestTokens[0].isCancellationRequested;
			await ready.complete();
			await result;
			assert.deepStrictEqual({
				cancelled, requests: fixture.requests.length, names: fixture.service.connectors.map(connector => connector.name),
			}, { cancelled: !enabled, requests: 1, names: enabled ? ['mail'] : [] });
		});
	}

	test('re-enabling fetches a fresh catalog rather than reviving the disabled source cache', async () => {
		const fixture = createFixture([{ body: catalogResponse('connected') }, { body: catalogResponse('not_connected', ['calendar']) }]);
		await fixture.service.getConnectors(CancellationToken.None);
		await setEnabled(fixture.configurationService, false);
		const disabled = fixture.service.connectors;
		await setEnabled(fixture.configurationService, true);
		await fixture.service.getConnectors(CancellationToken.None);
		assert.deepStrictEqual({
			disabled, names: fixture.service.connectors.map(connector => connector.name), requests: fixture.requests.length,
		}, { disabled: [], names: ['calendar'], requests: 2 });
	});

	test('an older refresh cannot overwrite a newer catalog result', async () => {
		const olderResponse = new DeferredPromise<void>();
		const fixture = createFixture([
			{ body: catalogResponse('not_connected', ['mail']), ready: olderResponse.p },
			{ body: catalogResponse('connected', ['calendar']) },
		]);

		const older = fixture.service.refresh(CancellationToken.None);
		await timeout(0);
		const newer = await fixture.service.refresh(CancellationToken.None);
		olderResponse.complete();
		const olderResult = await older;

		assert.deepStrictEqual({
			newer: newer.map(connector => connector.name),
			older: olderResult.map(connector => connector.name),
			current: fixture.service.connectors.map(connector => connector.name),
		}, {
			newer: ['calendar'],
			older: ['calendar'],
			current: ['calendar'],
		});
	});

	test('preserves connector/server identities, including same-named MCP servers', async () => {
		const servers = [
			{ connector: 'mail', server: 'search' },
			{ connector: 'calendar', server: 'search' },
			{ connector: 'a-b', server: 'c' },
			{ connector: 'a', server: 'b-c' },
		];
		const fixture = createFixture([{
			body: {
				plugins: servers.map(({ connector, server }) => createConnectorPlugin({
					name: connector,
					description: connector,
					metadata: { displayName: connector },
					connection: { status: 'connected' },
					mcpServers: {
						mcpServers: {
							[server]: { type: 'http', url: `https://example.com/${connector}/mcp` },
						},
					},
				})),
			},
		}]);

		await fixture.service.refresh(CancellationToken.None);

		assert.deepStrictEqual(fixture.service.connectedMcpServers.map(server => ({
			id: server.id,
			connector: server.connector.name,
			server: server.serverName,
		})), [
			{ id: 'mail:search', connector: 'mail', server: 'search' },
			{ id: 'calendar:search', connector: 'calendar', server: 'search' },
			{ id: 'a-b:c', connector: 'a-b', server: 'c' },
			{ id: 'a:b-c', connector: 'a', server: 'b-c' },
		]);
	});

	test('opens consent and waits for the connector to become connected', async () => {
		const fixture = createFixture([
			{ body: catalogResponse('not_connected') },
			{ body: { status: 'Unauthenticated', provisioning_state: 'Succeeded', consent_link: 'https://github.com/settings/copilot/connectors/mail' } },
			{ body: catalogResponse('connected') },
		]);

		await fixture.service.connect('mail', CancellationToken.None);

		assert.deepStrictEqual({
			requests: fixture.requests,
			opened: fixture.opened,
			connectionStateKnown: fixture.service.connectionStateKnown,
			reconciliations: fixture.reconciliations.length,
			connected: fixture.service.connectedMcpServers.map(server => ({
				connector: server.connector.name,
				serverName: server.serverName,
			})),
			telemetry: fixture.telemetryService.events.map(event => ({
				...event,
				data: typeof event.data.durationMs === 'number' ? { ...event.data, durationMs: true } : event.data,
			})),
		}, {
			requests: [{
				type: 'GET',
				url: 'https://api.github.test/copilot-connectors/api/v1/plugins',
				data: undefined,
			}, {
				type: 'PUT',
				url: 'https://api.github.test/copilot-connectors/api/v1/connectors/managed/mail/connection',
				data: '{"client_source":"VS_CODE"}',
			}, {
				type: 'GET',
				url: 'https://api.github.test/copilot-connectors/api/v1/plugins',
				data: undefined,
			}],
			opened: ['https://github.com/settings/copilot/connectors/mail'],
			connectionStateKnown: true,
			reconciliations: 2,
			connected: [{ connector: 'mail', serverName: 'mail-server' }],
			telemetry: [{
				name: 'copilotConnectors.catalogSnapshot',
				data: {
					catalogAccess: 'scoped',
					connectorCount: 1,
					connectedConnectorCount: 0,
					notConnectedConnectorCount: 1,
					pendingConnectorCount: 0,
					errorConnectorCount: 0,
					unknownConnectorCount: 0,
					mcpServerCount: 1,
					connectedMcpServerCount: 0,
				},
			}, {
				name: 'copilotConnectors.catalogSnapshot',
				data: {
					catalogAccess: 'scoped',
					connectorCount: 1,
					connectedConnectorCount: 1,
					notConnectedConnectorCount: 0,
					pendingConnectorCount: 0,
					errorConnectorCount: 0,
					unknownConnectorCount: 0,
					mcpServerCount: 1,
					connectedMcpServerCount: 1,
				},
			}, {
				name: 'copilotConnectors.connectionAction',
				data: {
					action: 'connect',
					outcome: 'success',
					connectionStatusBefore: 'not_loaded',
					connectionStatusAfter: 'connected',
					durationMs: true,
					connectorMcpServerCount: 1,
					httpStatusCode: undefined,
				},
			}],
		});
	});

	test('accepts a connected lifecycle response without requesting additional provider consent', async () => {
		const fixture = createFixture([
			{ body: catalogResponse('not_connected') },
			{ body: { status: 'Connected', provisioning_state: 'Succeeded' } },
			{ body: catalogResponse('connected') },
		]);
		await fixture.service.connect('mail', CancellationToken.None);
		assert.deepStrictEqual({ methods: fixture.requests.map(request => request.type), opened: fixture.opened, status: fixture.service.connectors[0].connectionStatus }, {
			methods: ['GET', 'PUT', 'GET'], opened: [], status: 'connected',
		});
	});

	test('continues polling without opening an unusable consent link', async () => {
		const fixture = createFixture([
			{ body: catalogResponse('not_connected') },
			{ body: { status: 'Unauthenticated', provisioning_state: 'Succeeded', consent_link: 'http://untrusted.test/authorize' } },
			{ body: catalogResponse('connected') },
		]);
		await fixture.service.connect('mail', CancellationToken.None);
		assert.deepStrictEqual({ methods: fixture.requests.map(request => request.type), opened: fixture.opened, status: fixture.service.connectors[0].connectionStatus }, {
			methods: ['GET', 'PUT', 'GET'], opened: [], status: 'connected',
		});
	});

	function connectionResponse(status: ConnectorPlugin['connection']['status']): { readonly body: ConnectorCatalog } {
		return { body: catalogResponse(status) };
	}

	async function connectOutcome(fixture: ReturnType<typeof createFixture>): Promise<{ readonly error?: string; readonly requests: number }> {
		try {
			await fixture.service.connect('mail', CancellationToken.None);
			return { requests: fixture.requests.length };
		} catch (e) {
			return { error: e.message, requests: fixture.requests.length };
		}
	}

	test('fails as declined once a pending connection returns to not connected, ignoring stale state right after the PUT', () => runWithFakedTimers({ maxTaskCount: 1000 }, async () => {
		const fixture = createFixture([
			connectionResponse('not_connected'),
			{ body: { status: 'Unauthenticated', provisioning_state: 'Succeeded', consent_link: 'https://github.com/settings/copilot/connectors/mail' } },
			connectionResponse('not_connected'),
			connectionResponse('pending'),
			connectionResponse('not_connected'),
		]);

		assert.deepStrictEqual(await connectOutcome(fixture), {
			error: 'Authorization for mail connector was declined.',
			requests: 5,
		});
	}));

	test('fails immediately when the connection enters error', () => runWithFakedTimers({ maxTaskCount: 1000 }, async () => {
		const fixture = createFixture([
			connectionResponse('not_connected'),
			{ body: { status: 'Unauthenticated', provisioning_state: 'Succeeded' } },
			connectionResponse('error'),
		]);

		assert.deepStrictEqual(await connectOutcome(fixture), { error: 'mail connector reported an error.', requests: 3 });
	}));

	test('a pre-existing error is not treated as terminal until the reconnect becomes pending', () => runWithFakedTimers({ maxTaskCount: 1000 }, async () => {
		const fixture = createFixture([
			connectionResponse('error'),
			{ body: { status: 'Unauthenticated', provisioning_state: 'Succeeded' } },
			connectionResponse('error'),
			connectionResponse('pending'),
			connectionResponse('error'),
		]);

		assert.deepStrictEqual(await connectOutcome(fixture), {
			error: 'mail connector reported an error.',
			requests: 5,
		});
	}));

	test('a pre-existing error can still reconnect successfully', () => runWithFakedTimers({ maxTaskCount: 1000 }, async () => {
		const fixture = createFixture([
			connectionResponse('error'),
			{ body: { status: 'Unauthenticated', provisioning_state: 'Succeeded' } },
			connectionResponse('error'),
			connectionResponse('connected'),
		]);

		assert.deepStrictEqual(await connectOutcome(fixture), { requests: 4 });
	}));

	test('keeps waiting for a connection that stays pending and then times out', () => runWithFakedTimers({ maxTaskCount: 1000 }, async () => {
		const fixture = createFixture([
			connectionResponse('not_connected'),
			{ body: { status: 'Unauthenticated', provisioning_state: 'Succeeded' } },
			...Array.from({ length: 200 }, () => connectionResponse('pending')),
		]);

		assert.deepStrictEqual(await connectOutcome(fixture), {
			error: 'Connector authorization did not finish in time. Complete authorization in the browser, then try again.',
			requests: 152,
		});
	}));

	test('reports failed connection actions with bounded diagnostics', async () => {
		const fixture = createFixture([
			{ body: catalogResponse('not_connected') },
			{ status: 500 },
		]);

		await assert.rejects(fixture.service.connect('mail', CancellationToken.None), /HTTP 500/);

		assert.deepStrictEqual(fixture.telemetryService.events
			.filter(event => event.name === 'copilotConnectors.connectionAction')
			.map(event => ({
				...event,
				data: { ...event.data, durationMs: typeof event.data.durationMs === 'number' },
			})), [{
				name: 'copilotConnectors.connectionAction',
				data: {
					action: 'connect',
					outcome: 'error',
					connectionStatusBefore: 'not_loaded',
					connectionStatusAfter: 'not_connected',
					durationMs: true,
					connectorMcpServerCount: 1,
					httpStatusCode: 500,
				},
			}]);
	});

	test('reports cancelled connection actions without request diagnostics', async () => {
		const fixture = createFixture([]);
		const cancellation = store.add(new CancellationTokenSource());
		cancellation.cancel();

		await assert.rejects(fixture.service.connect('mail', cancellation.token), isCancellationError);

		assert.deepStrictEqual(fixture.telemetryService.events.map(event => ({
			...event,
			data: { ...event.data, durationMs: typeof event.data.durationMs === 'number' },
		})), [{
			name: 'copilotConnectors.connectionAction',
			data: {
				action: 'connect',
				outcome: 'cancelled',
				connectionStatusBefore: 'not_loaded',
				connectionStatusAfter: 'not_loaded',
				durationMs: true,
				connectorMcpServerCount: undefined,
				httpStatusCode: undefined,
			},
		}]);
	});

	test('refreshes live sessions on the first authoritative catalog even when no connector is connected', async () => {
		const fixture = createFixture([{ body: catalogResponse('not_connected') }]);

		await fixture.service.refresh(CancellationToken.None);

		assert.deepStrictEqual({
			connectionStateKnown: fixture.service.connectionStateKnown,
			reconciliations: fixture.reconciliations.length,
		}, {
			connectionStateKnown: true,
			reconciliations: 1,
		});
	});

	test('does not refresh live sessions again when connected membership is unchanged', async () => {
		const fixture = createFixture([
			{ body: catalogResponse('connected') },
			{ body: catalogResponse('connected') },
		]);

		await fixture.service.refresh(CancellationToken.None);
		await fixture.service.refresh(CancellationToken.None);

		assert.deepStrictEqual({
			reconciliations: fixture.reconciliations.length,
			catalogSnapshots: fixture.telemetryService.events.filter(event => event.name === 'copilotConnectors.catalogSnapshot').length,
		}, {
			reconciliations: 1,
			catalogSnapshots: 1,
		});
	});

	test('passes a named reconnect without forcing ordinary catalog refreshes', async () => {
		const fixture = createFixture([
			{ body: catalogResponse('connected', ['mail', 'calendar']) },
			{ body: catalogResponse('connected', ['mail', 'calendar']) },
		]);
		await fixture.service.refresh(CancellationToken.None);
		await fixture.service.connect('mail', CancellationToken.None);
		assert.deepStrictEqual(fixture.reconciliationNames, [undefined, 'mail']);
	});

	test('does not send an old account named reconnect after an account switch during refresh', async () => {
		const fixture = createFixture([{ body: catalogResponse('connected') }]);
		const gate = new DeferredPromise<void>();
		fixture.queueReconciliationWait(gate.p);
		const connecting = assert.rejects(fixture.service.connect('mail', CancellationToken.None), isCancellationError);
		await timeout(0);
		fixture.setAccount({ ...fixture.initialAccount, accountName: 'another-account', sessionId: 'another-session' });
		gate.complete();
		await connecting;
		assert.deepStrictEqual(fixture.reconciliationNames.filter(name => name !== undefined), []);
	});

	test('refreshes changed connected catalog metadata without forcing a reconnect', async () => {
		const fixture = createFixture([
			{ body: catalogResponse('connected', ['mail']) },
			{ body: catalogResponse('connected', ['mail'], { displayName: 'Renamed Mail' }) },
		]);
		await fixture.service.refresh(CancellationToken.None);
		await fixture.service.refresh(CancellationToken.None);
		assert.deepStrictEqual(fixture.reconciliationNames, [undefined, undefined]);
	});

	test('supports hosts without the local Connector refresh extension', async () => {
		const fixture = createFixture([{ body: catalogResponse('connected') }]);
		fixture.agentHostService.refreshCopilotConnectorSessions = undefined;
		await fixture.service.connect('mail', CancellationToken.None);
		assert.deepStrictEqual(fixture.reconciliations, []);
	});

	test('disconnects a connector and refreshes its state', async () => {
		const fixture = createFixture([
			{ body: catalogResponse('connected') },
			{ status: 204 },
			{ body: catalogResponse('not_connected') },
		]);
		await fixture.service.getConnectors(CancellationToken.None);
		const disconnected: string[] = [];
		store.add(fixture.service.onDidDisconnect(name => disconnected.push(name)));

		await fixture.service.disconnect('mail', CancellationToken.None);

		assert.deepStrictEqual({
			requests: fixture.requests.map(request => ({ type: request.type, url: request.url })),
			status: fixture.service.connectors[0]?.connectionStatus,
			disconnected,
			reconciliations: fixture.reconciliations.length,
			telemetry: fixture.telemetryService.events.map(event => ({
				...event,
				data: typeof event.data.durationMs === 'number' ? { ...event.data, durationMs: true } : event.data,
			})),
		}, {
			requests: [{
				type: 'GET',
				url: 'https://api.github.test/copilot-connectors/api/v1/plugins',
			}, {
				type: 'DELETE',
				url: 'https://api.github.test/copilot-connectors/api/v1/connectors/managed/mail/connection',
			}, {
				type: 'GET',
				url: 'https://api.github.test/copilot-connectors/api/v1/plugins',
			}],
			status: 'not_connected',
			disconnected: ['mail'],
			reconciliations: 2,
			telemetry: [{
				name: 'copilotConnectors.catalogSnapshot',
				data: {
					catalogAccess: 'scoped',
					connectorCount: 1,
					connectedConnectorCount: 1,
					notConnectedConnectorCount: 0,
					pendingConnectorCount: 0,
					errorConnectorCount: 0,
					unknownConnectorCount: 0,
					mcpServerCount: 1,
					connectedMcpServerCount: 1,
				},
			}, {
				name: 'copilotConnectors.catalogSnapshot',
				data: {
					catalogAccess: 'scoped',
					connectorCount: 1,
					connectedConnectorCount: 0,
					notConnectedConnectorCount: 1,
					pendingConnectorCount: 0,
					errorConnectorCount: 0,
					unknownConnectorCount: 0,
					mcpServerCount: 1,
					connectedMcpServerCount: 0,
				},
			}, {
				name: 'copilotConnectors.connectionAction',
				data: {
					action: 'disconnect',
					outcome: 'success',
					connectionStatusBefore: 'connected',
					connectionStatusAfter: 'not_connected',
					durationMs: true,
					connectorMcpServerCount: 1,
					httpStatusCode: undefined,
				},
			}],
		});
	});

	test('keeps authoritative connector state when live Agent Host refresh fails', async () => {
		const fixture = createFixture([{ body: catalogResponse('connected') }]);
		fixture.setReconciliationError(new Error('Agent Host unavailable'));

		const connectors = await fixture.service.refresh(CancellationToken.None);

		assert.deepStrictEqual({
			status: connectors[0]?.connectionStatus,
			reconciliations: fixture.reconciliations.length,
		}, {
			status: 'connected',
			reconciliations: 1,
		});
	});

	test('does not serialize live Connector refreshes across chats in the workbench', async () => {
		const fixture = createFixture([
			{ body: catalogResponse('connected') },
			{ body: catalogResponse('not_connected') },
		]);
		const firstReconciliation = new DeferredPromise<void>();
		fixture.queueReconciliationWait(firstReconciliation.p);

		const firstRefresh = fixture.service.refresh(CancellationToken.None);
		await timeout(0);
		assert.strictEqual(fixture.reconciliations.length, 1);

		const secondRefresh = fixture.service.refresh(CancellationToken.None);
		await timeout(0);
		assert.deepStrictEqual({
			status: fixture.service.connectors[0]?.connectionStatus,
			reconciliations: fixture.reconciliations.length,
		}, {
			status: 'not_connected',
			reconciliations: 2,
		});

		firstReconciliation.complete();
		await Promise.all([firstRefresh, secondRefresh]);

		assert.strictEqual(fixture.reconciliations.length, 2);
	});

	test('does not request another live refresh after the experiment is disabled', async () => {
		const fixture = createFixture([
			{ body: catalogResponse('connected') },
			{ body: catalogResponse('not_connected') },
		]);
		const firstReconciliation = new DeferredPromise<void>();
		fixture.queueReconciliationWait(firstReconciliation.p);

		const firstRefresh = fixture.service.refresh(CancellationToken.None);
		await timeout(0);
		const secondRefresh = fixture.service.refresh(CancellationToken.None);
		await timeout(0);
		await setEnabled(fixture.configurationService, false);
		await fixture.service.refresh(CancellationToken.None);
		firstReconciliation.complete();
		await Promise.all([firstRefresh, secondRefresh]);

		assert.deepStrictEqual({
			connectors: fixture.service.connectors,
			reconciliations: fixture.reconciliations.length,
		}, {
			connectors: [],
			reconciliations: 2,
		});
	});

	test('does not initialize or request connectors while the experiment is disabled', async () => {
		const fixture = createFixture([{ body: catalogResponse('connected') }], false);

		const connectors = await fixture.service.getConnectors(CancellationToken.None);

		assert.deepStrictEqual({
			connectors,
			requests: fixture.requests,
			reconciliations: fixture.reconciliations,
			accountListeners: fixture.accountChanged.hasListeners(),
			sessionListeners: fixture.sessionsChanged.hasListeners(),
		}, {
			connectors: [],
			requests: [],
			reconciliations: [],
			accountListeners: false,
			sessionListeners: false,
		});
	});

	test('does not send a GitHub Enterprise token to the dotcom connectors endpoint', async () => {
		const fixture = createFixture([{ body: catalogResponse('connected') }], true, true);

		const connectors = await fixture.service.getConnectors(CancellationToken.None);

		assert.deepStrictEqual({ connectors, requests: fixture.requests }, { connectors: [], requests: [] });
	});
});
