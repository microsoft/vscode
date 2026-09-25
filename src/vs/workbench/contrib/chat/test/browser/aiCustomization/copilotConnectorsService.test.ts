/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IRequestContext, IRequestOptions } from '../../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { CopilotConnectorsRequestService } from '../../../../../../platform/copilotConnectors/common/copilotConnectorsRequestService.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import product from '../../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { CopilotConnectorsMarketplaceProvider, CopilotConnectorsService } from '../../../browser/aiCustomization/copilotConnectorsService.js';
import { CustomizationMarketplaceMediaType } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';

function catalogResponse(status: 'available' | 'connected', names = ['mail']): unknown {
	return {
		plugins: names.map(name => ({
			name,
			metadata: {
				displayName: `${name} connector`,
				description: `Connect ${name}`,
				tags: ['productivity'],
				capabilities: ['Search'],
				representativeQueries: [`Search ${name}`],
				iconUrl: `https://example.com/${name}.png`,
				documentationUrl: `https://example.com/${name}`,
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

suite('CopilotConnectorsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture(responses: Array<{ readonly status?: number; readonly body?: unknown; readonly ready?: Promise<void> }>, enabled = true, enterprise = false) {
		const requests: Array<{ readonly type: string | undefined; readonly url: string; readonly data: string | undefined }> = [];
		const requestTokens: CancellationToken[] = [];
		const authorizationHeaders: (string | undefined)[] = [];
		const authenticationCalls: Parameters<IAuthenticationService['getSessions']>[] = [];
		const consentCalls: Parameters<IAuthenticationService['createSession']>[] = [];
		const signInCalls: Parameters<IDefaultAccountService['signIn']>[] = [];
		const requestService = new class extends mock<IRequestService>() {
			override async request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
				assert.ok(options.url);
				requests.push({ type: options.type, url: options.url, data: options.data });
				requestTokens.push(token);
				authorizationHeaders.push(options.headers?.Authorization?.toString());
				const response = responses.shift() ?? {};
				if (response.ready) {
					await response.ready;
				}
				const body = response.body === undefined ? '' : JSON.stringify(response.body);
				return {
					res: { statusCode: response.status ?? 200, headers: {} },
					stream: bufferToStream(VSBuffer.fromString(body)),
				};
			}
		}();
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
		const openerService = new class extends mock<IOpenerService>() {
			override async open(resource: URI) {
				opened.push(resource.toString(true));
				return true;
			}
		}();
		const service = store.add(new CopilotConnectorsService(
			new CopilotConnectorsRequestService(requestService, productService, new NullLogService()),
			authenticationService,
			defaultAccountService,
			productService,
			configurationService,
			openerService,
		));
		return {
			service, requests, requestTokens, authorizationHeaders, opened, configurationService, authenticationCalls, consentCalls, signInCalls, authenticationService, defaultAccountService,
			initialAccount, initialSession, accountChanged, sessionsChanged,
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

	test('validates catalog metadata and exposes an MCP marketplace source', async () => {
		const fixture = createFixture([{ body: catalogResponse('available', ['mail', 'calendar']) }]);
		const source = new CopilotConnectorsMarketplaceProvider(fixture.service, fixture.configurationService);

		const first = await source.query({ query: 'connector', mediaType: CustomizationMarketplaceMediaType.McpServer, pageSize: 1 }, CancellationToken.None);
		const second = await source.query({ query: 'connector', mediaType: CustomizationMarketplaceMediaType.McpServer, pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);

		assert.deepStrictEqual({
			first: first.items.map(item => ({ identifier: item.identifier, installation: item.installation, publisher: item.publisher })),
			second: second.items.map(item => item.identifier),
			total: first.total,
			hasCursor: typeof first.nextCursor === 'string',
			requests: fixture.requests.map(request => request.url),
		}, {
			first: [{ identifier: 'mail', installation: { kind: 'copilotConnector', name: 'mail' }, publisher: 'GitHub Copilot' }],
			second: ['calendar'],
			total: 2,
			hasCursor: true,
			requests: ['https://api.github.test/copilot-connectors/api/v1/plugins'],
		});
	});

	test('ranks keywords and representative queries locally using the cached authenticated catalog', async () => {
		const fixture = createFixture([{
			body: {
				plugins: [{
					name: 'service',
					metadata: { displayName: 'Entry', keywords: ['inbox'], representativeQueries: ['Schedule a meeting'] },
				}]
			}
		}]);
		const source = new CopilotConnectorsMarketplaceProvider(fixture.service, fixture.configurationService);
		const keywords = await source.query({ query: 'inbox' }, CancellationToken.None);
		const examples = await source.query({ query: 'schedule meeting' }, CancellationToken.None);
		assert.deepStrictEqual({
			keywordScores: keywords.items.map(item => item.score),
			exampleScores: examples.items.map(item => item.score),
			metadata: fixture.service.connectors.map(connector => [connector.keywords, connector.representativeQueries]),
			requests: fixture.requests.map(request => [request.type, request.url]),
			authentication: fixture.authenticationCalls,
		}, {
			keywordScores: [65],
			exampleScores: [28],
			metadata: [[['inbox'], ['Schedule a meeting']]],
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

	test('ordinary GitHub session browses without consent but cannot reveal connection state', async () => {
		const catalog = catalogResponse('connected') as { plugins: { connection: Record<string, unknown> }[] };
		catalog.plugins[0].connection = {
			status: 'connected',
			statusDetail: 'reconnect_required',
			errorMessage: 'Private work account',
			protectedResourceMetadataUrl: 'https://example.com/private-work-account',
			scopes: ['private:account'],
		};
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
			mcpServers: fixture.service.connectedMcpServers,
			consent: fixture.consentCalls,
		}, {
			authorizationRequired: false,
			connectionStateKnown: false,
			requests: ['https://api.github.test/copilot-connectors/api/v1/plugins', 'https://api.github.test/copilot-connectors/api/v1/plugins'],
			authorization: true,
			status: 'unknown',
			detail: undefined,
			error: undefined,
			resource: undefined,
			scopes: [],
			mcpServers: [],
			consent: [],
		});
	});

	test('a narrow token receives an explicit rollout error when the catalog still requires connector scope', async () => {
		const fixture = createFixture([{ status: 403 }, { body: catalogResponse('connected') }]);
		fixture.setSessions([{ ...fixture.initialSession, scopes: ['read:user'] }]);
		await assert.rejects(fixture.service.getConnectors(CancellationToken.None), /Browsing without connector authorization may not yet be available/);
		const before = {
			requests: fixture.requests.length,
			consent: fixture.consentCalls.length,
			status: fixture.service.connectors,
			authorizationRequired: fixture.service.authorizationRequired,
			catalogMayRequireConsent: fixture.service.catalogMayRequireConsent,
		};
		await fixture.service.checkConnection(CancellationToken.None);
		assert.deepStrictEqual({
			before,
			after: fixture.service.connectors[0]?.connectionStatus,
			consent: fixture.consentCalls.length,
			requests: fixture.requests.map(request => request.type),
		}, {
			before: { requests: 1, consent: 0, status: [], authorizationRequired: true, catalogMayRequireConsent: true },
			after: 'connected', consent: 1, requests: ['GET', 'GET'],
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

	test('signing in to browse requests only ordinary GitHub scopes and keeps connection status unknown', async () => {
		const fixture = createFixture([{ body: catalogResponse('connected') }]);
		fixture.setAccount(null);
		fixture.setSessions([]);
		await fixture.service.signIn(CancellationToken.None);
		const connectors = await fixture.service.getConnectors(CancellationToken.None);
		assert.deepStrictEqual({
			signIn: fixture.signInCalls,
			consent: fixture.consentCalls,
			status: connectors[0]?.connectionStatus,
			connected: fixture.service.connectedMcpServers,
		}, { signIn: [[]], consent: [], status: 'unknown', connected: [] });
	});

	test('explicit connector sign-in uses unchanged default sign-in followed by separate connector consent', async () => {
		const fixture = createFixture([{ body: catalogResponse('available') }]);
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
		const fixture = createFixture([{ body: catalogResponse('available') }]);
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

	test('checking connection requires an explicit action and never connects an existing service', async () => {
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
			before: 'unknown', after: 'connected', consent: 1,
			requests: [
				['GET', 'https://api.github.test/copilot-connectors/api/v1/plugins'],
				['GET', 'https://api.github.test/copilot-connectors/api/v1/plugins'],
			],
		});
	});

	test('already authorized sessions do not request consent', async () => {
		const fixture = createFixture([{ body: catalogResponse('available') }]);
		await fixture.service.authorize(CancellationToken.None);
		await fixture.service.getConnectors(CancellationToken.None);
		assert.deepStrictEqual({ consent: fixture.consentCalls, authorization: fixture.authorizationHeaders }, {
			consent: [], authorization: ['Bearer test-token'],
		});
	});

	test('read-only connector access can browse and upgrades only on an explicit connection', async () => {
		const fixture = createFixture([
			{ body: catalogResponse('available') },
			{ body: catalogResponse('available') },
			{ status: 204 },
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

	test('only reuses an existing scoped session belonging to the active account', async () => {
		const fixture = createFixture([{ body: catalogResponse('available') }]);
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
				account: fixture.initialAccount, authorizationRequired: false, status: 'unknown',
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
							{ name: 'description', metadata: { displayName: 'Entry', description: 'Search Mail' } },
							{ name: 'prefix', metadata: { displayName: 'Mail Alpha' } },
							{ name: 'exact', metadata: { displayName: 'Mail' } },
						]
					}
				},
				{
					body: {
						plugins: [
							{ name: 'new', metadata: { displayName: 'Mail' } },
							{ name: 'description', metadata: { displayName: 'Mail' } },
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
			const fixture = createFixture([{ body: catalogResponse('available', ['mail', 'calendar']) }, { body: catalogResponse('available', ['fresh']) }]);
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
		const fixture = createFixture([{ body: catalogResponse('available', ['mail', 'calendar']) }]);
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
		const fixture = createFixture([{ body: catalogResponse('available', ['mail', 'calendar']) }]);
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
		const fixture = createFixture([{ body: catalogResponse('available') }]);
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
		const fixture = createFixture([{ body: catalogResponse('available', ['old']) }, { body: catalogResponse('available', ['new']) }]);
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
		const fixture = createFixture([{ body: catalogResponse('available') }]);
		await setEnabled(fixture.configurationService, false);
		await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, true);
		const snapshot = await fixture.service.getConnectorsSnapshot(CancellationToken.None);
		assert.deepStrictEqual({ names: snapshot.connectors.map(connector => connector.name), invalid: snapshot.cacheToken.isCancellationRequested }, { names: ['mail'], invalid: false });
	});

	test('an old account response cannot overwrite a newer account catalog or create a snapshot', async () => {
		const ready = new DeferredPromise<void>();
		const fixture = createFixture([{ body: catalogResponse('available', ['old']), ready: ready.p }, { body: catalogResponse('available', ['new']) }]);
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
		const fixture = createFixture([{ body: catalogResponse('available') }]);
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
			const fixture = createFixture([{ body: catalogResponse('available'), ready: ready.p }]);
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
		const fixture = createFixture([{ body: catalogResponse('connected') }, { body: catalogResponse('available', ['calendar']) }]);
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
			{ body: catalogResponse('available', ['mail']), ready: olderResponse.p },
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
				plugins: servers.map(({ connector, server }) => ({
					name: connector,
					metadata: { displayName: connector, description: connector },
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
			{ body: catalogResponse('available') },
			{ body: { consent_link: 'https://github.com/settings/copilot/connectors/mail' } },
			{ body: catalogResponse('connected') },
		]);

		await fixture.service.connect('mail', CancellationToken.None);

		assert.deepStrictEqual({
			requests: fixture.requests,
			opened: fixture.opened,
			connectionStateKnown: fixture.service.connectionStateKnown,
			connected: fixture.service.connectedMcpServers.map(server => ({
				connector: server.connector.name,
				serverName: server.serverName,
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
			connected: [{ connector: 'mail', serverName: 'mail-server' }],
		});
	});

	test('disconnects a connector and refreshes its state', async () => {
		const fixture = createFixture([
			{ body: catalogResponse('connected') },
			{ status: 204 },
			{ body: catalogResponse('available') },
		]);
		await fixture.service.getConnectors(CancellationToken.None);
		const disconnected: string[] = [];
		store.add(fixture.service.onDidDisconnect(name => disconnected.push(name)));

		await fixture.service.disconnect('mail', CancellationToken.None);

		assert.deepStrictEqual({
			requests: fixture.requests.map(request => ({ type: request.type, url: request.url })),
			status: fixture.service.connectors[0]?.connectionStatus,
			disconnected,
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
		});
	});

	test('does not initialize or request connectors while the experiment is disabled', async () => {
		const fixture = createFixture([{ body: catalogResponse('connected') }], false);

		const connectors = await fixture.service.getConnectors(CancellationToken.None);

		assert.deepStrictEqual({ connectors, requests: fixture.requests }, { connectors: [], requests: [] });
	});

	test('does not send a GitHub Enterprise token to the dotcom connectors endpoint', async () => {
		const fixture = createFixture([{ body: catalogResponse('connected') }], true, true);

		const connectors = await fixture.service.getConnectors(CancellationToken.None);

		assert.deepStrictEqual({ connectors, requests: fixture.requests }, { connectors: [], requests: [] });
	});
});
