/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IRequestContext, IRequestOptions } from '../../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import product from '../../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { CopilotConnectorsMarketplaceSource, CopilotConnectorsService } from '../../../browser/aiCustomization/copilotConnectorsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
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
		const authenticationCalls: Parameters<IAuthenticationService['getSessions']>[] = [];
		const requestService = new class extends mock<IRequestService>() {
			override async request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
				assert.ok(options.url);
				requests.push({ type: options.type, url: options.url, data: options.data });
				requestTokens.push(token);
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
			id: 'session', accessToken: 'test-token', account: { id: 'account', label: 'octocat' }, scopes: ['read:user'],
		};
		let sessions = [initialSession];
		const defaultAccountService = new class extends mock<IDefaultAccountService>() {
			override readonly onDidChangeDefaultAccount = accountChanged.event;
			override get currentDefaultAccount() { return account; }
			override async getDefaultAccount() { return account; }
			override getDefaultAccountAuthenticationProvider() { return account?.authenticationProvider ?? initialAccount.authenticationProvider; }
		}();
		const authenticationService = new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = sessionsChanged.event;
			override async getSessions(...args: Parameters<IAuthenticationService['getSessions']>) {
				authenticationCalls.push(args);
				return sessions;
			}
		}();
		const productService = new class extends mock<IProductService>() {
			override readonly defaultChatAgent = {
				...product.defaultChatAgent,
				mcpConnectorsUrl: 'https://api.github.test/copilot-connectors/api/v1',
			};
		}();
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled]: enabled,
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
			requestService,
			authenticationService,
			defaultAccountService,
			productService,
			configurationService,
			openerService,
			new NullLogService(),
		));
		return {
			service, requests, requestTokens, opened, configurationService, authenticationCalls, authenticationService, defaultAccountService,
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
		await configuration.setUserConfiguration(ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled, enabled);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean { return section === ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled; }
		}());
	}

	test('validates catalog metadata and exposes an MCP marketplace source', async () => {
		const fixture = createFixture([{ body: catalogResponse('available', ['mail', 'calendar']) }]);
		const source = new CopilotConnectorsMarketplaceSource(fixture.service, fixture.configurationService);

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
		const fixture = createFixture([{ body: { plugins: [{
			name: 'service',
			metadata: { displayName: 'Entry', keywords: ['inbox'], representativeQueries: ['Schedule a meeting'] },
		}] } }]);
		const source = new CopilotConnectorsMarketplaceSource(fixture.service, fixture.configurationService);
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

	test('reports insufficient endpoint scope without requesting a broader GitHub session', async () => {
		const fixture = createFixture([{ status: 403, body: { message: 'Insufficient OAuth scope' } }]);
		await assert.rejects(fixture.service.getConnectors(CancellationToken.None), /HTTP 403/);
		assert.deepStrictEqual({
			requests: fixture.requests.length,
			authentication: fixture.authenticationCalls,
			opened: fixture.opened,
			connectors: fixture.service.connectors,
		}, { requests: 1, authentication: [['github', [], { silent: true }, true]], opened: [], connectors: [] });
	});

	test('native pages retain their ranked catalog after the sixty-second cache refresh changes metadata and membership', async () => {
		await runWithFakedTimers({}, async () => {
			await timeout(1);
			const fixture = createFixture([
				{ body: { plugins: [
					{ name: 'description', metadata: { displayName: 'Entry', description: 'Search Mail' } },
					{ name: 'prefix', metadata: { displayName: 'Mail Alpha' } },
					{ name: 'exact', metadata: { displayName: 'Mail' } },
				] } },
				{ body: { plugins: [
					{ name: 'new', metadata: { displayName: 'Mail' } },
					{ name: 'description', metadata: { displayName: 'Mail' } },
				] } },
			]);
			const source = new CopilotConnectorsMarketplaceSource(fixture.service, fixture.configurationService);
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
			const source = new CopilotConnectorsMarketplaceSource(fixture.service, fixture.configurationService);
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
				cleared, invalid: first.cacheToken?.isCancellationRequested, readsBeforeNewQuery,
				fresh: fresh.items.map(item => item.identifier), requests: fixture.requests.length,
			}, { cleared: true, invalid: true, readsBeforeNewQuery: 1, fresh: ['fresh'], requests: 2 });
		});
	}

	test('sign-out refuses a continuation instead of exposing the previous account catalog', async () => {
		const fixture = createFixture([{ body: catalogResponse('available', ['mail', 'calendar']) }]);
		const source = new CopilotConnectorsMarketplaceSource(fixture.service, fixture.configurationService);
		const first = await source.query({ pageSize: 1 }, CancellationToken.None);
		fixture.setAccount(null);
		await assert.rejects(source.query({ pageSize: 1, cursor: first.nextCursor }, CancellationToken.None), /Start a new search/);
		const fresh = await source.query({}, CancellationToken.None);
		assert.deepStrictEqual({ items: fresh.items, catalog: fixture.service.connectors, requests: fixture.requests.length }, { items: [], catalog: [], requests: 1 });
	});

	test('unchanged account identity and unrelated authentication events preserve snapshots', async () => {
		const fixture = createFixture([{ body: catalogResponse('available', ['mail', 'calendar']) }]);
		const source = new CopilotConnectorsMarketplaceSource(fixture.service, fixture.configurationService);
		const first = await source.query({ pageSize: 1 }, CancellationToken.None);
		fixture.setAccount({ ...fixture.initialAccount });
		fixture.sessionsChanged.fire({ providerId: 'other-provider', label: 'Other', event: { added: undefined, removed: undefined, changed: [fixture.initialSession] } });
		fixture.sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { added: undefined, removed: undefined, changed: [{ ...fixture.initialSession, id: 'unrelated-session' }] } });
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
		await fixture.configurationService.setUserConfiguration(ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled, true);
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

		await fixture.service.disconnect('mail', CancellationToken.None);

		assert.deepStrictEqual({
			requests: fixture.requests.map(request => ({ type: request.type, url: request.url })),
			status: fixture.service.connectors[0]?.connectionStatus,
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
