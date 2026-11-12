/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { once } from 'events';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { CopilotClient, CopilotRequestHandler, RuntimeConnection, type CopilotSession } from '@github/copilot-sdk';
import { join } from '../../../../../base/common/path.js';
import { isLinux } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICopilotHomeService } from '../../../../environment/common/copilotHome.js';
import { InstantiationService } from '../../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../../log/common/log.js';
import type { AuthenticateParams, IAgent } from '../../../common/agent.js';
import { copilotEntraDiscoveryResource, copilotEntraM365Audience, copilotEntraResources } from '../../../common/copilotEntraAuthentication.js';
import { authenticationAccountMeta } from '../../../common/meta/agentAuthenticationAccount.js';
import { waitForState } from '../../../../../base/common/observable.js';
import { IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { AgentHostAuthenticationService, IAgentHostAuthenticationService } from '../../../node/agentHostAuthenticationService.js';
import { CopilotAccountService } from '../../../node/copilot/copilotAccountService.js';
import { ActiveClientToolSet } from '../../../node/activeClientState.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { toCopilotAccountModelCatalog } from '../../../node/copilot/copilotAccountModelCatalog.js';
import { CopilotGitHubSessionCredentials } from '../../../node/copilot/copilotGitHubCredentials.js';
import { createTestLauncher, testRuntime } from '../copilotSessionLauncherTestHelpers.js';
import type { CopilotSessionLaunchPlan } from '../../../node/copilot/copilotSessionLauncher.js';
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

	// Native Entra accounts support Windows/macOS only; see e2e/KNOWN_ISSUES.md.
	(isLinux ? test.skip : test)('authenticates and configures a new conversation and resumes its live SDK binding without global login', async function () {
		this.timeout(90_000);
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
			const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
			const instantiation = store.add(new InstantiationService(new ServiceCollection(
				[ILogService, new NullLogService()],
				[IAgentHostAuthenticationService, authentication],
				[ICopilotHomeService, upcastPartial<ICopilotHomeService>({ home: URI.file(home) })],
				[IAgentConfigurationService, upcastPartial<IAgentConfigurationService>({ copilotM365EnabledAtStartup: true })],
			), true));
			accounts = store.add(instantiation.createInstance(CopilotAccountService));
			client = new CopilotClient({
				connection: RuntimeConnection.forStdio(), env, useLoggedInUser: false,
				requestHandler: new LocalAccountRequests(origin), logLevel: 'error',
				entra: accounts.authenticationOptions,
			});
			const accountService = accounts;
			const runtime = client;
			const provider = new class extends mock<IAgent>() {
				override readonly id = 'copilotcli';
				override getProtectedResources() { return accountService.getProtectedResources(); }
				override async authenticate() { return false; }
				override validateAuthentication(params: AuthenticateParams) {
					accountService.authentication!.validateAuthentication(params, accountService.getProtectedResources().find(resource => resource.resource === params.resource));
				}
				override async handleAuthenticationToken(params: AuthenticateParams) {
					if (!await accountService.authentication!.authenticate(params, accountService.getProtectedResources().find(resource => resource.resource === params.resource))) {
						return false;
					}
					return true;
				}
				override async completeAuthentication(params: AuthenticateParams) {
					if (params.token && (params.resource === copilotEntraDiscoveryResource || accountService.state.get().kind === 'choiceRequired')) {
						await accountService.authenticate(Promise.resolve(runtime), params);
					}
				}
			}();
			const discovery: AuthenticateParams = {
				resource: copilotEntraDiscoveryResource, scopes: ['User.Read'], token: 'synthetic-identity-token',
				_meta: authenticationAccountMeta({ providerId: 'microsoft', accountId, label: 'fixture@example.test' }),
			};
			const challenged = waitForState(accounts.authentication!.authenticationRequired, requirement => requirement?.resource.resource === copilotEntraResources.get(copilotEntraM365Audience));
			const discovering = authentication.authenticate(discovery, [provider]);
			await challenged;
			assert.deepStrictEqual(await authentication.authenticate({
				resource: copilotEntraResources.get(copilotEntraM365Audience)!, scopes: [`${copilotEntraM365Audience}/.default`], token: 'synthetic-m365-token',
				_meta: authenticationAccountMeta({ providerId: 'microsoft', accountId, label: 'fixture@example.test' }),
			}, [provider]), { authenticated: true });
			assert.deepStrictEqual(await discovering, { authenticated: true });
			const context = accounts.requireReady();
			const setup = await accounts.getSession(context, Promise.resolve(client));
			const catalog = toCopilotAccountModelCatalog(await setup.rpc.model.list());
			await assert.rejects(client.rpc.models.list({ selectionId: context.choice.selectionId }), /Selected authentication is no longer available/);
			// The runtime cannot resolve this account's managed settings yet, so the host applies none to its catalog.
			await assert.rejects(client.rpc.managedSettings.resolve({ selectionId: context.choice.selectionId, clientName: 'vscode-agent-host' }), /Selected authentication is no longer available/);
			const policyRequests: Parameters<CopilotClient['rpc']['managedSettings']['resolve']>[0][] = [];
			let policyCompletions = 0;
			const resolvePolicy = client.rpc.managedSettings.resolve;
			client.rpc.managedSettings.resolve = async request => {
				policyRequests.push(request);
				const result = await resolvePolicy(request);
				policyCompletions++;
				return result;
			};
			const launcher = createTestLauncher(undefined, {}, undefined, undefined, undefined, undefined, undefined, accounts);
			const opens: string[] = [];
			const plan = {
				client: {
					rpc: client.rpc,
					createSession: config => { opens.push(`create:${config?.sessionId}`); return runtime.createSession(config); },
					resumeSession: (id, config) => { opens.push(`resume:${id}`); return runtime.resumeSession(id, config); },
					deleteSession: id => runtime.deleteSession(id),
				} satisfies CopilotSessionLaunchPlan['client'],
				sessionId: 'account-conversation', workingDirectory: URI.file(home), resolvedAgentName: undefined, isEphemeral: true,
				snapshot: { discoveredAgents: [], additionalRootInstructions: [], tools: [], plugins: [], mcpServers: {} },
				activeClientToolSet: new ActiveClientToolSet(), shellManager: undefined,
				githubCredentials: CopilotGitHubSessionCredentials.fromClientAuthentication(undefined), accountContext: context,
			};
			const activeAccount = async (session: CopilotSession) => {
				const active = await session.rpc.accounts.get({ query: { kind: 'activeAccount' } });
				return active.kind === 'activeAccount' ? active.account?.kind : undefined;
			};
			const conversation = store.add(await launcher.launch({ ...plan, kind: 'create', model: { id: modelId } }, testRuntime));
			assert.deepStrictEqual({ requests: policyRequests, completions: policyCompletions }, {
				requests: [{ clientName: 'vscode-agent-host', workingDirectory: plan.workingDirectory.fsPath }], completions: 1,
			});
			const conversationAccount = await activeAccount(conversation.session);
			const conversationModels = toCopilotAccountModelCatalog(await conversation.session.rpc.model.list());
			const resumed = store.add(await launcher.launch({ ...plan, kind: 'resume', fallback: { model: { id: modelId } } }, testRuntime));
			const resumedAccount = await activeAccount(resumed.session);
			const resumedModels = toCopilotAccountModelCatalog(await resumed.session.rpc.model.list());
			const currentModel = await resumed.session.rpc.model.getCurrent();
			const tools = await resumed.session.rpc.tools.getBuiltinDescriptors({});
			await resumed.session.disconnect();
			await client.deleteSession('account-conversation');
			// A conversation closed before its first message has no history, so the runtime rejects its resume and a replacement is created and signed in.
			const draftPlan = { ...plan, sessionId: 'account-draft' };
			const draft = store.add(await launcher.launch({ ...draftPlan, kind: 'create', model: { id: modelId } }, testRuntime));
			await draft.disconnect();
			const reopened = store.add(await launcher.launch({ ...draftPlan, kind: 'resume', fallback: { model: { id: modelId } } }, testRuntime));
			const reopenedAccount = await activeAccount(reopened.session);
			const reopenedModels = toCopilotAccountModelCatalog(await reopened.session.rpc.model.list());
			await reopened.session.disconnect();
			await client.deleteSession('account-draft');
			assert.deepStrictEqual({
				opens, reopenedAccount, reopenedModels: reopenedModels.models.map(model => model.id),
				service: context.choice.service,
				setupModels: catalog.models.map(model => model.id),
				conversationModels: conversationModels.models.map(model => model.id),
				resumedModels: resumedModels.models.map(model => model.id),
				conversationAccount, resumedAccount,
				selectedModel: currentModel.modelId,
				readToolAvailable: tools.tools.some(tool => tool.name === 'view'),
				policyRequests,
				policyCompletions,
				globalAuthentication: (await client.getAuthStatus()).isAuthenticated,
				sourceUnchanged: accounts.requireReady() === context,
				catalogFetched: requests.some(request => request.path === '/models'),
				authenticatedRequests: requests.every(request => request.authenticated),
			}, {
				opens: ['create:account-conversation', 'resume:account-conversation', 'create:account-draft', 'resume:account-draft', 'create:account-draft'],
				reopenedAccount: 'loki', reopenedModels: [modelId],
				service: 'm365', setupModels: [modelId], conversationModels: [modelId], resumedModels: [modelId],
				conversationAccount: 'loki', resumedAccount: 'loki',
				selectedModel: modelId, readToolAvailable: true,
				policyRequests: Array.from({ length: 4 }, () => ({ clientName: 'vscode-agent-host', workingDirectory: plan.workingDirectory.fsPath })),
				policyCompletions: 4,
				globalAuthentication: false, sourceUnchanged: true, catalogFetched: true, authenticatedRequests: true,
			});
			await accounts.reset();
			await assert.rejects(accounts.getSession(context, Promise.resolve(client)), /no longer available/);
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
