/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { once } from 'events';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { CopilotClient, CopilotRequestHandler, RuntimeConnection } from '@github/copilot-sdk';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICopilotHomeService } from '../../../../environment/common/copilotHome.js';
import { InstantiationService } from '../../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../../log/common/log.js';
import { copilotEntraDiscoveryResource, copilotEntraM365Audience } from '../../../common/copilotEntraAuthentication.js';
import { authenticationAccountMeta } from '../../../common/meta/agentAuthenticationAccount.js';
import { copilotAccountOperationMeta } from '../../../common/meta/copilotAccountOperation.js';
import { IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { AgentHostClientConnectionService, IAgentHostClientConnectionService } from '../../../node/agentHostClientConnectionService.js';
import { CopilotAccountService } from '../../../node/copilot/copilotAccountService.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { toCopilotAccountModelCatalog } from '../../../node/copilot/copilotAccountModelCatalog.js';
import { resolveCopilotManagedSettings } from '../../../node/copilot/copilotManagedSettings.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

class LocalAccountRequests extends CopilotRequestHandler {
	constructor(private readonly origin: string) {
		super();
	}

	override async sendRequest(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (url.origin !== this.origin || !['/models', '/quota'].includes(url.pathname)) {
			return new Response('Unexpected fixture request', { status: 403 });
		}
		return fetch(request);
	}
}

suite('Copilot account context native SDK', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the confirmed setup account for the catalog and policy without global login', async function () {
		this.timeout(60_000);
		const { createServer } = await import('http');
		const home = await mkdtemp(join(tmpdir(), 'copilot-account-context-'));
		const modelId = 'account-fixture-model';
		const accountId = 'host-owned-fixture-account';
		const requests: { path: string; authenticated: boolean }[] = [];
		const server = createServer((request, response) => {
			if (request.method !== 'GET' || !['/models', '/quota'].includes(request.url ?? '')) {
				response.writeHead(403);
				response.end();
				return;
			}
			const authenticated = request.headers.authorization === 'Bearer synthetic-m365-token';
			requests.push({ path: request.url!, authenticated });
			response.writeHead(authenticated ? 200 : 401, { 'content-type': 'application/json' });
			response.end(JSON.stringify(request.url === '/quota' ? {} : {
				data: [{ id: modelId, name: 'Account fixture model', capabilities: { type: 'chat', supports: { tool_calls: true } }, model_picker_enabled: true }],
			}));
		});
		server.on('connect', (_request, socket) => socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
		let client: CopilotClient | undefined;
		let accounts: CopilotAccountService | undefined;
		try {
			server.listen(0, '127.0.0.1');
			await once(server, 'listening');
			const address = server.address();
			assert.ok(address && typeof address !== 'string');
			const origin = `http://127.0.0.1:${address.port}`;
			await writeFile(join(home, 'config.json'), JSON.stringify({ staff: true }));
			await writeFile(join(home, 'settings.json'), JSON.stringify({ storeTokenPlaintext: true }));
			const env = createCopilotCliEnvironment(createIsolatedProviderEnvironment(home), [], false, undefined, undefined, true);
			Object.assign(env, {
				COPILOT_HOME: home, COPILOT_CACHE_HOME: join(home, 'cache'), GH_CONFIG_DIR: home,
				COPILOT_DISABLE_KEYTAR: '1', COPILOT_ENTRA_ONEAUTH: '0',
				COPILOT_LOKI_BASE_URL: origin, COPILOT_DEBUG_GITHUB_API_URL: origin, COPILOT_API_URL: origin,
				HTTP_PROXY: origin, HTTPS_PROXY: origin, ALL_PROXY: origin, NO_PROXY: '127.0.0.1,localhost',
			});
			client = new CopilotClient({
				connection: RuntimeConnection.forStdio(), env, useLoggedInUser: false,
				requestHandler: new LocalAccountRequests(origin), logLevel: 'error',
				entra: {
					clientId: 'account-fixture-client',
					tokenProvider: request => {
						if (request.kind === 'identity') {
							assert.ok(!request.accountId || request.accountId === accountId);
							return { kind: 'identity', accountId, username: 'fixture@example.test' };
						}
						assert.strictEqual(request.accountId, accountId);
						return request.scopes.includes(`${copilotEntraM365Audience}/.default`)
							? { kind: 'token', accountId, accessToken: 'synthetic-m365-token' }
							: { kind: 'unavailable' };
					},
				},
			});
			const connection = store.add(new CancellationTokenSource());
			const connections = store.add(new AgentHostClientConnectionService());
			store.add(connections.registerSource({
				hasSeenClient: () => true, isClientConnected: () => true,
				isLocalClient: () => true, usesLegacyChatUris: () => false,
				getConnectedClientTransportCounts: () => new Map([['fixture', 1]]),
				requestWorkspaceTrust: async () => false, requestMcpAuthentication: async () => false,
			}));
			const instantiation = store.add(new InstantiationService(new ServiceCollection(
				[ILogService, new NullLogService()],
				[IAgentHostClientConnectionService, connections],
				[ICopilotHomeService, upcastPartial<ICopilotHomeService>({ home: URI.file(home) })],
				[IAgentConfigurationService, upcastPartial<IAgentConfigurationService>({ copilotM365EnabledAtStartup: true })],
			), true));
			accounts = store.add(instantiation.createInstance(CopilotAccountService));
			await accounts.authenticate(Promise.resolve(client), {
				resource: copilotEntraDiscoveryResource, scopes: ['User.Read'], token: 'synthetic-identity-token',
				_meta: { ...authenticationAccountMeta({ providerId: 'microsoft', accountId }), ...copilotAccountOperationMeta({ kind: 'discover' }) },
			}, connection.token);
			const context = accounts.requireReady();
			const setup = await accounts.getSession(context);
			const catalog = toCopilotAccountModelCatalog(await setup.rpc.model.list());
			await assert.rejects(client.rpc.models.list({ selectionId: context.choice.selectionId }), /Selected authentication is no longer available/);
			await assert.rejects(client.rpc.managedSettings.resolve({ selectionId: context.choice.selectionId, clientName: 'vscode-agent-host' }), /Selected authentication is no longer available/);
			const policy = await resolveCopilotManagedSettings(setup.rpc.managedSettings, undefined, 5000);
			await accounts.verifySessionContext(setup, context);
			assert.deepStrictEqual({
				service: context.choice.service,
				setupModels: catalog.models.map(model => model.id),
				policyUnresolved: policy.resolved.failClosed,
				globalAuthentication: (await client.getAuthStatus()).isAuthenticated,
				sourceUnchanged: accounts.requireReady() === context,
				catalogFetched: requests.some(request => request.path === '/models'),
				authenticatedRequests: requests.every(request => request.authenticated),
			}, {
				service: 'm365', setupModels: [modelId],
				policyUnresolved: false, globalAuthentication: false, sourceUnchanged: true, catalogFetched: true, authenticatedRequests: true,
			});
			await accounts.reset();
			await assert.rejects(accounts.getSession(context), /no longer available/);
		} finally {
			try {
				await accounts?.reset();
			} finally {
				try {
					assert.deepStrictEqual(await client?.stop() ?? [], []);
				} finally {
					try {
						server.closeAllConnections();
						if (server.listening) {
							await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
						}
					} finally {
						await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
					}
				}
			}
		}
	});
});
