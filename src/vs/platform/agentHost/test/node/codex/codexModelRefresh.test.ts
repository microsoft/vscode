/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import type { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IAgentHostGitHubEndpointService } from '../../../node/agentHostGitHubEndpointService.js';
import { IAgentHostProxyResolver } from '../../../node/agentHostProxyResolver.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { IAgentHostWorktreeIsolation, NullAgentHostWorktreeIsolation } from '../../../node/shared/worktreeIsolation.js';
import { IAgentHostCustomizationEnablementService } from '../../../node/agentHostCustomizationEnablementService.js';
import { AgentHostStateManager } from '../../../node/agentHostStateManager.js';
import { IAgentHostSessionTitleSignal } from '../../../node/agentHostSessionTitleSignal.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { RecordingAgentSdkDownloader } from '../testAgentSdkDownloader.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../../common/agentHostCheckpointService.js';
import { AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY, AGENT_SDK_SETUP_RELOAD_REQUEST_KEY, readAgentSdkSetupInfos } from '../../../common/agentSdkSetup.js';
import { AgentSession } from '../../../common/agent.js';
import { buildDefaultChatUri } from '../../../common/state/sessionState.js';
import { CodexAgent, toCodexModelSelectionId } from '../../../node/codex/codexAgent.js';
import { ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { createTestGitHubEndpointService } from '../testGitHubEndpointService.js';
import { AgentHostCodexMultiRootEnabledConfigKey } from '../../../common/agentHostSchema.js';
import { IAgentHostOTelService } from '../../../common/otel/agentHostOTelService.js';
import { AgentHostConfigKey } from '../../../common/agentHostCustomizationConfig.js';
import { createNoopCustomizationEnablementService } from '../testCustomizationEnablementService.js';
import { createTestAgentHostProxyResolver } from '../agentServiceTestUtils.js';
import { readCodexAccountInfo } from '../../../common/codexAccount.js';
import type { GetAccountResponse } from '../../../node/codex/protocol/generated/v2/GetAccountResponse.js';
import type { GetAccountRateLimitsResponse } from '../../../node/codex/protocol/generated/v2/GetAccountRateLimitsResponse.js';

interface ITestAgentContext {
	readonly agent: CodexAgent;
	readonly stateManager: AgentHostStateManager;
	readonly configurationService: AgentConfigurationService;
	readonly sdkDownloader: RecordingAgentSdkDownloader;
	readonly runStartupAccountProbe: () => Promise<void>;
}

/**
 * The downloader defaults to "SDK already on disk", which is what makes these
 * tests deterministic — otherwise the answer depends on whether the machine
 * running the suite has `@openai/codex` in `node_modules`. Tests wanting the
 * cold case override `_isSdkResolvableWithoutDownload` directly.
 */
function createAgentContext(disposables: Pick<DisposableStore, 'add'>, models: () => Promise<CCAModel[]>, rootConfig: Record<string, boolean> = {}, sdkDownloader = new RecordingAgentSdkDownloader()): ITestAgentContext {
	const instantiationService = new TestInstantiationService();
	const logService = new NullLogService();
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
	configurationService.updateRootConfig(rootConfig);
	instantiationService.stub(ISessionDataService, { _serviceBrand: undefined });
	instantiationService.stub(ICopilotApiService, { _serviceBrand: undefined, models });
	instantiationService.stub(ICodexProxyService, { _serviceBrand: undefined });
	instantiationService.stub(IAgentConfigurationService, configurationService);
	instantiationService.stub(IAgentHostWorktreeIsolation, new NullAgentHostWorktreeIsolation());
	instantiationService.stub(IAgentHostCustomizationEnablementService, createNoopCustomizationEnablementService());
	instantiationService.stub(IAgentHostGitHubEndpointService, createTestGitHubEndpointService());
	instantiationService.stub(IAgentHostProxyResolver, createTestAgentHostProxyResolver());
	instantiationService.stub(IAgentSdkDownloader, sdkDownloader);
	instantiationService.stub(IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE);
	instantiationService.stub(IAgentHostOTelService, { _serviceBrand: undefined, getNativeSdkTelemetryConfig: async () => undefined });
	instantiationService.stub(IAgentHostSessionTitleSignal, { _serviceBrand: undefined, onDidChangeSessionTitle: Event.None });
	instantiationService.stub(IProductService, { _serviceBrand: undefined, version: '1.0.0-test' } as IProductService);
	instantiationService.stub(INativeEnvironmentService, { userHome: URI.file('/tmp') });
	instantiationService.stub(ILogService, logService);
	const agent = disposables.add(instantiationService.createInstance(CodexAgent));
	const runStartupAccountProbe = agent['_probeAccountAtStartup'].bind(agent);
	agent['_probeAccountAtStartup'] = async () => { };
	return { agent, stateManager, configurationService, sdkDownloader, runStartupAccountProbe };
}

function createAgent(disposables: Pick<DisposableStore, 'add'>, models: () => Promise<CCAModel[]>, rootConfig: Record<string, boolean> = {}, sdkDownloader = new RecordingAgentSdkDownloader()): CodexAgent {
	return createAgentContext(disposables, models, rootConfig, sdkDownloader).agent;
}

const modelListResponse = {
	data: [{
		id: 'gpt-5.6-sol',
		model: 'gpt-5.6-sol',
		upgrade: null,
		upgradeInfo: null,
		availabilityNux: null,
		displayName: 'GPT-5.6-Sol',
		description: 'Latest frontier agentic coding model.',
		hidden: false,
		supportedReasoningEfforts: [
			{ reasoningEffort: 'low', description: 'Fast responses with lighter reasoning' },
			{ reasoningEffort: 'medium', description: 'Balances speed and reasoning depth for everyday tasks' },
			{ reasoningEffort: 'high', description: 'Greater reasoning depth for complex problems' },
			{ reasoningEffort: 'xhigh', description: 'Extra high reasoning depth for complex problems' },
			{ reasoningEffort: 'max', description: 'Maximum reasoning depth for the hardest problems' },
			{ reasoningEffort: 'ultra', description: 'Maximum reasoning with automatic task delegation' },
		],
		defaultReasoningEffort: 'low',
		inputModalities: ['text', 'image'],
		supportsPersonality: true,
		additionalSpeedTiers: [],
		serviceTiers: [],
		defaultServiceTier: null,
		isDefault: true,
	}],
	nextCursor: null,
};

/**
 * @param requests records every method the agent asks for, so a test can assert
 * on enumeration specifically — `config/read` shares this connection once the
 * SDK is local, so a raw "did we connect" count conflates callers.
 */
function createChatGPTConnection(account: unknown = { type: 'chatgpt', email: 'person@example.com', planType: 'plus' }, requests: string[] = []) {
	return {
		kind: 'ready',
		client: {
			request: async (method: string) => {
				requests.push(method);
				if (method === 'account/read') {
					return { account, requiresOpenaiAuth: true };
				}
				if (method === 'config/read') {
					return { config: { model_provider: 'openai' } };
				}
				if (method === 'model/list') {
					return modelListResponse;
				}
				throw new Error(`Unexpected request: ${method}`);
			},
		},
		proxyHandle: { dispose() { } },
		child: { kill: () => true },
	};
}

suite('CodexAgent model refresh', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the persistent app-server stopped until a Codex session is selected', async () => {
		const agent = createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true });
		const requests: string[] = [];
		const connection = createChatGPTConnection(undefined, requests);
		let connectionRequested = false;
		agent['_ensureConnection'] = async () => {
			connectionRequested = true;
			agent['_connection'] = connection as never;
			return connection as never;
		};

		// These are all ambient registration/startup paths in AgentService. None is
		// an affirmative choice to use Codex.
		const discoveryListener = agent.onDidDiscoverChats(() => { });
		const migrated = await agent.listChatsToMigrate();
		const session = AgentSession.uri('codex', 'existing-session');
		const metadata = await agent.getChatMetadata(URI.parse(buildDefaultChatUri(session)), session);
		await agent.authenticate(agent.getProtectedResources()[0].resource, 'token-replayed-at-registration');
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		discoveryListener.dispose();
		assert.deepStrictEqual({ connectionRequested, metadata, migrated, models: agent.models.get() }, {
			connectionRequested: false,
			metadata: undefined,
			migrated: [],
			models: [],
		});

		// Even an ambient catalog refresh must not cross the session boundary.
		await agent.refreshModels();
		assert.strictEqual(connectionRequested, false);

		// Session creation/restoration crosses the activation boundary; its catalog
		// refresh may now retain the app-server connection.
		agent['_activate']();
		await agent.refreshModels();

		assert.deepStrictEqual({
			connectionRequested,
			// One enumeration, not one per caller that happened to want the connection.
			enumerations: requests.filter(method => method === 'model/list').length,
			models: agent.models.get().map(model => ({ provider: model.provider, id: model.id, name: model.name, meta: model._meta })),
		}, {
			connectionRequested: true,
			enumerations: 1,
			models: [{
				provider: 'codex',
				id: toCodexModelSelectionId('openai', 'gpt-5.6-sol'),
				name: 'GPT-5.6-Sol',
				meta: { modelSourceId: 'chatgptSubscription', modelGroupId: 'chatgpt' },
			}],
		});
	});

	test('restored model waits for an authentication refresh queued behind activation', async () => {
		const copilotModels = [{ id: 'copilot-model', name: 'Copilot Model', supported_endpoints: ['/responses'] }] as CCAModel[];
		const firstRefreshStarted = new DeferredPromise<void>();
		const releaseFirstRefresh = new DeferredPromise<void>();
		const authenticatedRefreshStarted = new DeferredPromise<void>();
		const releaseAuthenticatedRefresh = new DeferredPromise<void>();
		let copilotRefreshes = 0;
		const agent = createAgent(disposables, async () => {
			copilotRefreshes++;
			await authenticatedRefreshStarted.complete();
			await releaseAuthenticatedRefresh.p;
			return copilotModels;
		});
		agent['_refreshProviderConfiguration'] = async () => { };
		agent['_resolveGitHubMcpServerConfiguration'] = async () => undefined;
		let codexRefreshes = 0;
		agent['_refreshCodexModels'] = async () => {
			codexRefreshes++;
			if (codexRefreshes === 1) {
				await firstRefreshStarted.complete();
				await releaseFirstRefresh.p;
			}
			return false;
		};

		agent['_activate']();
		await firstRefreshStarted.p;
		const selectedModel = { id: toCodexModelSelectionId('vscode-proxy', 'copilot-model') };
		const session = { model: selectedModel };
		const resolution = agent['_resolveModel'](session as never).then(
			model => ({ model, error: undefined }),
			error => ({ model: undefined, error: error instanceof Error ? error.message : String(error) }),
		);

		await agent.authenticate(agent.getProtectedResources()[0].resource, 'token');
		await releaseFirstRefresh.complete();
		await authenticatedRefreshStarted.p;
		await releaseAuthenticatedRefresh.complete();

		assert.deepStrictEqual({
			resolution: await resolution,
			sessionModel: session.model,
			copilotRefreshes,
			codexRefreshes,
		}, {
			resolution: { model: selectedModel, error: undefined },
			sessionModel: selectedModel,
			copilotRefreshes: 1,
			codexRefreshes: 2,
		});
	});

	test('model resolution starts discovery when the catalog is empty', async () => {
		const copilotModels = [{ id: 'copilot-model', name: 'Copilot Model', supported_endpoints: ['/responses'] }] as CCAModel[];
		const agent = createAgent(disposables, async () => copilotModels);
		agent['_githubToken'] = 'token';
		agent['_isSdkResolvableWithoutDownload'] = async () => false;
		const selectedModel = { id: toCodexModelSelectionId('vscode-proxy', 'copilot-model') };
		const session = { model: selectedModel };

		const resolved = await agent['_resolveModel'](session as never);

		assert.deepStrictEqual({ resolved, sessionModel: session.model }, {
			resolved: selectedModel,
			sessionModel: selectedModel,
		});
	});

	test('queues a fresh model refresh when Codex activates during an ambient refresh', async () => {
		const copilotModels = [{ id: 'copilot-model', name: 'Copilot Model', supported_endpoints: ['/responses'] }] as CCAModel[];
		const ambientRefreshStarted = new DeferredPromise<void>();
		const ambientCodexRefreshFinished = new DeferredPromise<void>();
		const releaseAmbientRefresh = new DeferredPromise<void>();
		let copilotRefreshes = 0;
		const agent = createAgent(disposables, async () => {
			copilotRefreshes++;
			if (copilotRefreshes === 1) {
				await ambientRefreshStarted.complete();
				await releaseAmbientRefresh.p;
			}
			return copilotModels;
		}, { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true });
		agent['_githubToken'] = 'token';
		agent['_refreshProviderConfiguration'] = async () => { };
		const refreshCodexModels = agent['_refreshCodexModels'].bind(agent);
		let codexRefreshes = 0;
		agent['_refreshCodexModels'] = async () => {
			const result = await refreshCodexModels();
			codexRefreshes++;
			if (codexRefreshes === 1) {
				await ambientCodexRefreshFinished.complete();
			}
			return result;
		};
		const requests: string[] = [];
		const connection = createChatGPTConnection(undefined, requests);
		agent['_ensureConnection'] = async () => {
			agent['_connection'] = connection as never;
			return connection as never;
		};

		const ambientRefresh = agent.refreshModels();
		await Promise.all([ambientRefreshStarted.p, ambientCodexRefreshFinished.p]);
		agent['_activate']();
		const activatedRefresh = agent.refreshModels();
		await releaseAmbientRefresh.complete();
		await Promise.all([ambientRefresh, activatedRefresh]);

		assert.deepStrictEqual({
			copilotRefreshes,
			codexRefreshes,
			enumerations: requests.filter(method => method === 'model/list').length,
			providers: agent.models.get().map(model => model.provider),
		}, {
			copilotRefreshes: 2,
			codexRefreshes: 2,
			enumerations: 1,
			providers: ['codex', 'codex'],
		});
	});

	test('an explicit session restore activates metadata reads while ambient listing stays passive', async () => {
		const ctx = createAgentContext(disposables, async () => []);
		const session = AgentSession.uri('codex', 'restore-activation');
		const chat = URI.parse(buildDefaultChatUri(session));
		let reads = 0;
		ctx.agent['_refreshProviderConfiguration'] = async () => { };
		ctx.agent['_readSession'] = async () => {
			reads++;
			return undefined;
		};

		const ambient = await ctx.agent.getChatMetadata(chat, session);
		const activatedAfterAmbient = ctx.agent['_activated'];
		const fallback = await ctx.agent.getChatMetadata(chat, session, undefined, { registryFallback: { startTime: 1, modifiedTime: 2 } });
		const restored = await ctx.agent.getChatMetadata(chat, session, undefined, { activation: 'restore' });

		assert.deepStrictEqual({
			ambient,
			activatedAfterAmbient,
			fallback,
			restored,
			activatedAfterRestore: ctx.agent['_activated'],
			reads,
		}, {
			ambient: undefined,
			activatedAfterAmbient: false,
			fallback: { chat, startTime: 1, modifiedTime: 2 },
			restored: undefined,
			activatedAfterRestore: true,
			reads: 1,
		});
	});

	test('startup account probe releases its one-off process before profile download finishes and still publishes complete details', async () => {
		const ctx = createAgentContext(disposables, async () => []);
		const requests: string[] = [];
		const disposed: string[] = [];
		const rateLimitStarted = new DeferredPromise<void>();
		const releaseRateLimit = new DeferredPromise<void>();
		const profileImageStarted = new DeferredPromise<void>();
		const releaseProfileImage = new DeferredPromise<void>();
		const profileImageStored = new DeferredPromise<void>();
		const profileImageNonce = 'a'.repeat(64);
		const profileImage = {
			uri: `vscode-codex-profile-image:/profile-${profileImageNonce}.png`,
			contentType: 'image/png',
			sizeHint: 3,
			nonce: profileImageNonce,
		};
		ctx.agent['_proxyResolver'].fetch = async () => {
			await profileImageStarted.complete();
			await releaseProfileImage.p;
			return Response.json({ profile: { profile_picture_url: 'data:image/png;base64,AQID' } });
		};
		ctx.agent['_getProfileImageStore'] = () => ({
			update: async () => {
				await profileImageStored.complete();
				return profileImage;
			},
			clear: async () => { },
		}) as never;
		ctx.agent['_startRawConnection'] = async () => ({
			client: {
				request: async (method: string) => {
					requests.push(method);
					if (method === 'account/read') {
						return { account: { type: 'chatgpt', email: 'person@example.com', planType: 'plus' }, requiresOpenaiAuth: true };
					}
					if (method === 'account/rateLimits/read') {
						await rateLimitStarted.complete();
						await releaseRateLimit.p;
						return {
							rateLimits: {
								primary: null,
								secondary: { usedPercent: 1, windowDurationMins: 7 * 24 * 60, resetsAt: 123 },
							},
							rateLimitsByLimitId: null,
							rateLimitResetCredits: null,
						};
					}
					if (method === 'getAuthStatus') {
						return { authMethod: 'chatgpt', authToken: 'header.payload.signature', requiresOpenaiAuth: true };
					}
					throw new Error(`Unexpected request: ${method}`);
				},
				dispose: () => { disposed.push('client'); },
			},
			proxyHandle: { dispose: () => { disposed.push('proxy'); } },
			child: { kill: () => { disposed.push('child'); return true; } },
		}) as never;

		const probe = ctx.runStartupAccountProbe();
		await Promise.all([rateLimitStarted.p, profileImageStarted.p]);
		assert.deepStrictEqual(disposed, []);
		await releaseRateLimit.complete();
		await probe;
		assert.deepStrictEqual(disposed, ['client', 'proxy', 'child']);
		await releaseProfileImage.complete();
		await profileImageStored.p;
		await new Promise<void>(resolve => setImmediate(resolve));

		assert.deepStrictEqual({
			requests,
			disposed,
			account: readCodexAccountInfo(ctx.stateManager.rootState),
			connection: ctx.agent['_connection'].kind,
		}, {
			requests: ['account/read', 'account/rateLimits/read', 'getAuthStatus'],
			disposed: ['client', 'proxy', 'child'],
			account: {
				status: 'signedIn',
				email: 'person@example.com',
				planType: 'plus',
				profileImage,
				requiresOpenaiAuth: true,
				rateLimit: { usedPercent: 1, windowDurationMins: 7 * 24 * 60, resetsAt: 123 },
				authUrl: undefined,
				authUrlNonce: undefined,
			},
			connection: 'idle',
		});
	});

	test('startup account probe tears down its one-off connection when account details stall', async () => {
		const ctx = createAgentContext(disposables, async () => []);
		Object.defineProperty(ctx.agent, '_startupAccountProbeTimeoutMs', { value: 5 });
		const disposed: string[] = [];
		const rateLimitStarted = new DeferredPromise<void>();
		const releaseRateLimit = new DeferredPromise<void>();
		const authStatusStarted = new DeferredPromise<void>();
		const releaseAuthStatus = new DeferredPromise<void>();
		ctx.agent['_startRawConnection'] = async () => ({
			client: {
				request: async (method: string) => {
					if (method === 'account/read') {
						return { account: { type: 'chatgpt', email: 'person@example.com', planType: 'plus' }, requiresOpenaiAuth: true };
					}
					if (method === 'account/rateLimits/read') {
						await rateLimitStarted.complete();
						await releaseRateLimit.p;
						return { rateLimits: { primary: null, secondary: null }, rateLimitsByLimitId: null, rateLimitResetCredits: null };
					}
					if (method === 'getAuthStatus') {
						await authStatusStarted.complete();
						await releaseAuthStatus.p;
						return { authMethod: 'chatgpt', authToken: null, requiresOpenaiAuth: true };
					}
					throw new Error(`Unexpected request: ${method}`);
				},
				dispose: () => { disposed.push('client'); },
			},
			proxyHandle: { dispose: () => { disposed.push('proxy'); } },
			child: { kill: () => { disposed.push('child'); return true; } },
		}) as never;

		const probe = ctx.runStartupAccountProbe();
		await Promise.all([rateLimitStarted.p, authStatusStarted.p]);
		await probe;

		assert.deepStrictEqual({
			disposed,
			account: readCodexAccountInfo(ctx.stateManager.rootState),
			connection: ctx.agent['_connection'].kind,
		}, {
			disposed: ['client', 'proxy', 'child'],
			account: {
				status: 'signedIn',
				email: 'person@example.com',
				planType: 'plus',
				profileImage: undefined,
				requiresOpenaiAuth: true,
				rateLimit: undefined,
				authUrl: undefined,
				authUrlNonce: undefined,
			},
			connection: 'idle',
		});

		const persistentReadStarted = new DeferredPromise<void>();
		const persistentClient = {
			request: async (method: string) => {
				assert.strictEqual(method, 'account/read');
				await persistentReadStarted.complete(undefined);
				return { account: null, requiresOpenaiAuth: true };
			},
		};
		ctx.agent['_connection'] = {
			kind: 'ready',
			client: persistentClient,
			proxyHandle: { dispose() { } },
			child: { kill: () => true },
		} as never;
		const persistentRefresh = ctx.agent['_refreshAccount'](persistentClient as never, false);
		await new Promise<void>(resolve => setImmediate(resolve));
		const persistentReadStartedBeforeDetailsReleased = persistentReadStarted.isSettled;
		await Promise.all([releaseRateLimit.complete(), releaseAuthStatus.complete()]);
		await persistentRefresh;

		assert.strictEqual(persistentReadStartedBeforeDetailsReleased, true);
	});

	test('startup account probe does not download a missing SDK', async () => {
		const ctx = createAgentContext(disposables, async () => []);
		ctx.agent['_isSdkResolvableWithoutDownload'] = async () => false;
		let connectionRequests = 0;
		ctx.agent['_startRawConnection'] = async () => {
			connectionRequests++;
			throw new Error('startup probe must not download');
		};
		await ctx.runStartupAccountProbe();

		assert.deepStrictEqual({
			connectionRequests,
			account: readCodexAccountInfo(ctx.stateManager.rootState),
		}, {
			connectionRequests: 0,
			account: { status: 'unknown', email: undefined, planType: undefined, profileImage: undefined, requiresOpenaiAuth: undefined, rateLimit: undefined, authUrl: undefined, authUrlNonce: undefined },
		});
	});

	test('standalone ChatGPT sign-in uses a temporary connection until login completes', async () => {
		const ctx = createAgentContext(disposables, async () => []);
		const requests: string[] = [];
		const disposed: string[] = [];
		let signedIn = false;
		let loginCompleted: ((params: { loginId: string | null; success: boolean; error: string | null }) => void) | undefined;
		ctx.agent['_startRawConnection'] = async () => ({
			client: {
				onExit: Event.None,
				request: async (method: string) => {
					requests.push(method);
					if (method === 'account/read') {
						return { account: signedIn ? { type: 'chatgpt', email: 'person@example.com', planType: 'plus' } : null, requiresOpenaiAuth: true };
					}
					if (method === 'account/login/start') {
						queueMicrotask(() => {
							loginCompleted?.({ loginId: 'older-login', success: true, error: null });
						});
						setImmediate(() => {
							signedIn = true;
							loginCompleted?.({ loginId: 'login-1', success: true, error: null });
						});
						return { type: 'chatgpt', loginId: 'login-1', authUrl: 'https://example.com/login' };
					}
					if (method === 'account/rateLimits/read') {
						return { rateLimits: { primary: null, secondary: null }, rateLimitsByLimitId: null, rateLimitResetCredits: null };
					}
					if (method === 'getAuthStatus') {
						return { authMethod: 'chatgpt', authToken: null, requiresOpenaiAuth: true };
					}
					throw new Error(`Unexpected request: ${method}`);
				},
				onNotification: (_method: string, handler: typeof loginCompleted) => {
					loginCompleted = handler;
					return { dispose() { } };
				},
				dispose: () => { disposed.push('client'); },
			},
			proxyHandle: { dispose: () => { disposed.push('proxy'); } },
			child: { kill: () => { disposed.push('child'); return true; } },
		}) as never;

		await ctx.agent['_signInToChatGPT']('request-1');

		assert.deepStrictEqual({
			requests,
			disposed,
			account: readCodexAccountInfo(ctx.stateManager.rootState),
			connection: ctx.agent['_connection'].kind,
		}, {
			requests: ['account/read', 'account/login/start', 'account/read', 'account/rateLimits/read', 'getAuthStatus'],
			disposed: ['client', 'proxy', 'child'],
			account: { status: 'signedIn', email: 'person@example.com', planType: 'plus', profileImage: undefined, requiresOpenaiAuth: true, rateLimit: undefined, authUrl: undefined, authUrlNonce: undefined },
			connection: 'idle',
		});
	});

	test('persistent sign-in does not republish an auth URL after an early login completion', async () => {
		const ctx = createAgentContext(disposables, async () => []);
		const requests: string[] = [];
		const client = {
			request: async (method: string) => {
				requests.push(method);
				if (method === 'account/read') {
					return { account: null, requiresOpenaiAuth: true };
				}
				if (method === 'account/login/start') {
					// Model the persistent connection's global completion handler
					// winning the race against this request's response.
					ctx.agent['_setOpenAIAccountState']({
						usageSource: 'openai',
						status: 'signedIn',
						authType: 'chatgpt',
						email: 'person@example.com',
						planType: 'plus',
						requiresOpenaiAuth: true,
					});
					return { type: 'chatgpt', loginId: 'login-early', authUrl: 'https://example.com/obsolete-login' };
				}
				throw new Error(`Unexpected request: ${method}`);
			},
		};
		ctx.agent['_connection'] = {
			kind: 'ready',
			client,
			proxyHandle: { dispose() { } },
			child: { kill: () => true },
		} as never;

		await ctx.agent['_signInToChatGPT']('request-early');

		assert.deepStrictEqual({
			requests,
			account: readCodexAccountInfo(ctx.stateManager.rootState),
		}, {
			requests: ['account/read', 'account/login/start'],
			account: {
				status: 'signedIn',
				email: 'person@example.com',
				planType: 'plus',
				profileImage: undefined,
				requiresOpenaiAuth: true,
				rateLimit: undefined,
				authUrl: undefined,
				authUrlNonce: undefined,
			},
		});
	});

	test('shutdown cancels a one-off account connection that is still starting', async () => {
		const agent = createAgent(disposables, async () => []);
		await agent['_startupAccountProbe'].complete(undefined);
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const cancelled = new DeferredPromise<void>();
		const disposed: string[] = [];
		const ready = {
			client: { dispose: () => disposed.push('client') },
			proxyHandle: { dispose: () => disposed.push('proxy') },
			child: { kill: () => { disposed.push('child'); return true; } },
		};
		agent['_startRawConnection'] = (async (_timeout?: number, token?: CancellationToken) => {
			const cancellationListener = token?.onCancellationRequested(() => {
				ready.client.dispose();
				ready.proxyHandle.dispose();
				ready.child.kill();
				void cancelled.complete();
			});
			await started.complete();
			await (token ? Promise.race([release.p, cancelled.p]) : release.p);
			cancellationListener?.dispose();
			if (token?.isCancellationRequested) {
				throw new Error('start cancelled');
			}
			return ready;
		}) as never;

		const operation = agent['_withOnDemandConnection'](async () => undefined);
		const rejected = assert.rejects(operation);
		await started.p;
		await agent.shutdown();
		const disposedAtShutdown = [...disposed];
		await release.complete();
		await rejected;

		assert.deepStrictEqual(disposedAtShutdown, ['client', 'proxy', 'child']);
	});

	test('shutdown suppresses a local-SDK model refresh queued before shutdown', async () => {
		const agent = createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true });
		agent['_activated'] = true;
		const sdkCheckStarted = new DeferredPromise<void>();
		const releaseSdkCheck = new DeferredPromise<void>();
		let refreshes = 0;
		agent['_isSdkResolvableWithoutDownload'] = async () => {
			await sdkCheckStarted.complete(undefined);
			await releaseSdkCheck.p;
			return true;
		};
		agent.refreshModels = async () => { refreshes++; };

		agent['_startModelRefreshWhenSdkIsLocal']();
		await sdkCheckStarted.p;
		await agent.shutdown();
		await releaseSdkCheck.complete(undefined);
		await new Promise<void>(resolve => setImmediate(resolve));

		assert.strictEqual(refreshes, 0);
	});

	test('shutdown suppresses chat discovery whose SDK check was already in flight', async () => {
		const agent = createAgent(disposables, async () => []);
		agent['_activated'] = true;
		const sdkCheckStarted = new DeferredPromise<void>();
		const releaseSdkCheck = new DeferredPromise<void>();
		let catalogueReads = 0;
		agent['_isSdkResolvableWithoutDownload'] = async () => {
			await sdkCheckStarted.complete(undefined);
			await releaseSdkCheck.p;
			return true;
		};
		agent['_emitCodexChats'] = async () => {
			catalogueReads++;
			return true;
		};

		const discovery = agent['_startCodexChatDiscovery']();
		await sdkCheckStarted.p;
		await agent.shutdown();
		await releaseSdkCheck.complete(undefined);
		await discovery;

		assert.strictEqual(catalogueReads, 0);
	});

	test('does not enumerate at startup while signed-out use is disabled', async () => {
		const agent = createAgent(disposables, async () => [], {});
		const requests: string[] = [];
		agent['_ensureConnection'] = async () => createChatGPTConnection(undefined, requests) as never;

		await new Promise<void>(resolve => setTimeout(resolve, 0));

		// Reading `config.toml` may still open a connection — that is unrelated to
		// enumeration. What must not happen is asking about the account or catalog.
		assert.deepStrictEqual({
			enumerationRequests: requests.filter(method => method === 'account/read' || method === 'model/list'),
			models: agent.models.get(),
		}, {
			enumerationRequests: [],
			models: [],
		});
	});

	test('reports an empty catalog rather than downloading the SDK to enumerate', async () => {
		const sdkDownloader = new RecordingAgentSdkDownloader(false);
		const agent = createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true }, sdkDownloader);
		let ensureConnectionCalls = 0;
		agent['_isSdkResolvableWithoutDownload'] = async () => false;
		agent['_ensureConnection'] = async () => {
			ensureConnectionCalls++;
			return createChatGPTConnection() as never;
		};

		await agent.refreshModels();

		// The download is an explicit gesture now, so a refresh that finds no local
		// SDK reports the honest empty catalog and leaves the offer to the banner.
		assert.deepStrictEqual({
			ensureConnectionCalls,
			models: agent.models.get(),
			downloads: sdkDownloader.progressInterests,
		}, {
			ensureConnectionCalls: 0,
			models: [],
			downloads: [],
		});
	});

	test('never requires Copilot, whatever the flag says and whatever the account turns out to be', async () => {
		const copilotRequired = (agent: CodexAgent) => agent.getProtectedResources()[0].required;
		const withoutSdk = createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true });
		withoutSdk['_isSdkResolvableWithoutDownload'] = async () => false;
		const withoutAccount = createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true });
		withoutAccount['_connection'] = createChatGPTConnection(null) as never;
		const withAccount = createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true });
		withAccount['_connection'] = createChatGPTConnection() as never;
		await Promise.all([withoutAccount.refreshModels(), withAccount.refreshModels()]);

		// `required: false` is unconditional: a `true` here from any of these
		// combinations puts the whole Agents window behind a GitHub sign-in wall,
		// because `resolveSignedOutWindowGate` forces sign-in only when *every*
		// session type requires GitHub.
		assert.deepStrictEqual({
			signedOutUseDisabled: copilotRequired(createAgent(disposables, async () => [], {})),
			noLocalSdk: copilotRequired(withoutSdk),
			noAccount: copilotRequired(withoutAccount),
			chatGPTAccount: copilotRequired(withAccount),
		}, {
			signedOutUseDisabled: false,
			noLocalSdk: false,
			noAccount: false,
			chatGPTAccount: false,
		});
	});

	test('waits for an app-server already starting when signed-out use becomes enabled', async () => {
		const agent = createAgent(disposables, async () => [], {});
		const connection = createChatGPTConnection();
		let resolveConnection!: () => void;
		const starting = new Promise<typeof connection>(resolve => { resolveConnection = () => resolve(connection); }).then(ready => {
			agent['_connection'] = ready as never;
			return ready;
		});
		agent['_connection'] = { kind: 'starting', promise: starting } as never;

		agent['_configurationService'].updateRootConfig({ [AgentHostConfigKey.AllowSignedOutWhenUsable]: true });
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		assert.deepStrictEqual(agent.models.get(), []);

		resolveConnection();
		await agent.refreshModels();

		assert.deepStrictEqual(agent.models.get().map(model => model.id), [toCodexModelSelectionId('openai', 'gpt-5.6-sol')]);
	});

	test('publishes no ChatGPT models when the app server reports no account', async () => {
		const copilotModels = [{ id: 'copilot-model', name: 'Copilot Model', supported_endpoints: ['/responses'] }] as CCAModel[];
		const agent = createAgent(disposables, async () => copilotModels, { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true });
		agent['_githubToken'] = 'token';
		agent['_connection'] = createChatGPTConnection(null) as never;

		await agent.refreshModels();

		assert.deepStrictEqual({
			providers: agent.models.get().map(model => model.provider),
			copilotRequired: agent.getProtectedResources()[0].required,
		}, {
			providers: ['codex'],
			copilotRequired: false,
		});
	});

	test('does not publish a model when authoritative discovery fails', async () => {
		const agent = createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true });
		agent['_connection'] = {
			kind: 'ready',
			client: {
				request: async (method: string) => {
					if (method === 'account/read') {
						return { account: { type: 'chatgpt', email: null, planType: 'plus' }, requiresOpenaiAuth: true };
					}
					throw new Error('model discovery failed');
				},
			},
			proxyHandle: { dispose() { } },
			child: { kill: () => true },
		} as never;

		await agent.refreshModels();
		assert.deepStrictEqual(agent.models.get(), []);
	});

	test('keeps the last known-good models when a periodic refresh fails', async () => {
		let shouldFail = false;
		const models = [{ id: 'gpt-5.5', name: 'GPT-5.5', supported_endpoints: ['/responses'] }] as CCAModel[];
		const agent = createAgent(disposables, async () => {
			if (shouldFail) {
				throw new Error('transient failure');
			}
			return models;
		});
		agent['_isSdkResolvableWithoutDownload'] = async () => false;

		const resource = agent.getProtectedResources()[0].resource;
		await agent.authenticate(resource, 'token');
		await agent.refreshModels();
		shouldFail = true;
		await agent.refreshModels();

		assert.deepStrictEqual(agent.models.get().map(model => model.id), [toCodexModelSelectionId('vscode-proxy', 'gpt-5.5')]);
	});

	test('retries Copilot model discovery after a transient authentication refresh failure', async () => {
		let attempts = 0;
		const models = [{ id: 'gpt-5.5', name: 'GPT-5.5', supported_endpoints: ['/responses'] }] as CCAModel[];
		const agent = createAgent(disposables, async () => {
			attempts++;
			if (attempts === 1) {
				throw new Error('503 Service Unavailable');
			}
			return models;
		});
		agent['_isSdkResolvableWithoutDownload'] = async () => false;
		Object.defineProperties(agent, {
			_modelRefreshBaseDelayMs: { value: 1 },
			_modelRefreshMaxDelayMs: { value: 1 },
		});

		await agent.authenticate(agent.getProtectedResources()[0].resource, 'token');
		await agent.refreshModels();
		const modelsAfterTransientFailure = agent.models.get().map(model => model.id);
		await waitForState(agent.models, currentModels => currentModels.length > 0);

		assert.deepStrictEqual({
			attempts,
			modelsAfterTransientFailure,
			modelsAfterRetry: agent.models.get().map(model => model.id),
		}, {
			attempts: 2,
			modelsAfterTransientFailure: [],
			modelsAfterRetry: [toCodexModelSelectionId('vscode-proxy', 'gpt-5.5')],
		});
	});

	test('uses the reasoning efforts advertised by Copilot models', async () => {
		const model: CCAModel = {
			billing: { is_premium: true, multiplier: 1, restricted_to: [] },
			capabilities: {
				family: 'gpt-5.6',
				limits: { max_context_window_tokens: 272_000, max_output_tokens: 32_000, max_prompt_tokens: 240_000 },
				object: 'model_capabilities',
				supports: { parallel_tool_calls: true, streaming: true, tool_calls: true, vision: true },
				tokenizer: 'o200k_base',
				type: 'chat',
			},
			id: 'gpt-5.6-sol',
			is_chat_default: true,
			is_chat_fallback: false,
			model_picker_category: 'advanced',
			model_picker_enabled: true,
			name: 'GPT-5.6-Sol',
			object: 'model',
			policy: { state: 'enabled', terms: '' },
			preview: false,
			supported_endpoints: ['/responses'],
			vendor: 'OpenAI',
			version: 'gpt-5.6-sol',
		};
		(model.capabilities.supports as { reasoning_effort?: string[] }).reasoning_effort = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
		const agent = createAgent(disposables, async () => [model]);

		await agent.authenticate(agent.getProtectedResources()[0].resource, 'token');
		await agent.refreshModels();

		assert.deepStrictEqual(agent.models.get().map(model => ({
			id: model.id,
			thinkingLevel: model.configSchema?.properties.thinkingLevel && {
				enum: model.configSchema.properties.thinkingLevel.enum,
				default: model.configSchema.properties.thinkingLevel.default,
			},
		})), [{
			id: toCodexModelSelectionId('vscode-proxy', 'gpt-5.6-sol'),
			thinkingLevel: {
				enum: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
				default: 'medium',
			},
		}]);
	});

	test('omits the thinking level when a Copilot model advertises no reasoning efforts', async () => {
		const model = { id: 'gpt-5.5', name: 'GPT-5.5', supported_endpoints: ['/responses'] } as CCAModel;
		const agent = createAgent(disposables, async () => [model]);

		await agent.authenticate(agent.getProtectedResources()[0].resource, 'token');
		await agent.refreshModels();

		assert.strictEqual(agent.models.get()[0].configSchema, undefined);
	});

	test('applies authentication received while the connection is starting to the proxy', async () => {
		const agent = createAgent(disposables, async () => []);
		agent['_queueModelRefresh'] = async () => { };
		agent['_refreshProviderConfiguration'] = async () => { };

		const appliedTokens: string[] = [];
		const ready = {
			client: { dispose() { } },
			proxyHandle: {
				setToken: (token: string) => appliedTokens.push(token),
				dispose() { },
			},
			child: { kill: () => true },
		};
		let resolveStart!: (value: typeof ready) => void;
		agent['_startConnection'] = () => new Promise<typeof ready>(resolve => resolveStart = resolve) as never;

		const connection = agent['_ensureConnection']();
		await agent.authenticate(agent.getProtectedResources()[0].resource, 'token-arriving-during-start');
		resolveStart(ready);
		await connection;

		assert.deepStrictEqual(appliedTokens, ['token-arriving-during-start']);
	});

	test('cancels an app-server that is still starting when shutdown begins', async () => {
		const agent = createAgent(disposables, async () => []);
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const cancelled = new DeferredPromise<void>();
		const disposed: string[] = [];
		const ready = {
			client: { dispose: () => disposed.push('client') },
			proxyHandle: { dispose: () => disposed.push('proxy') },
			child: { kill: () => { disposed.push('child'); return true; } },
		};
		agent['_startConnection'] = (async (_generation: number, token?: CancellationToken) => {
			const cancellationListener = token?.onCancellationRequested(() => {
				ready.client.dispose();
				ready.proxyHandle.dispose();
				ready.child.kill();
				void cancelled.complete();
			});
			await started.complete();
			await (token ? Promise.race([release.p, cancelled.p]) : release.p);
			cancellationListener?.dispose();
			if (token?.isCancellationRequested) {
				throw new Error('start cancelled');
			}
			return ready;
		}) as never;

		const connecting = agent['_ensureConnection']();
		await started.p;
		await agent.shutdown();
		const disposedAtShutdown = [...disposed];
		await release.complete();
		await assert.rejects(connecting);

		assert.deepStrictEqual(disposedAtShutdown, ['client', 'proxy', 'child']);
	});

	test('ignores a delayed connection-loss event from a replaced client', () => {
		const agent = createAgent(disposables, async () => []);
		const disposed: string[] = [];
		const stale = {
			client: { dispose: () => disposed.push('stale-client') },
			proxyHandle: { dispose: () => disposed.push('stale-proxy') },
			child: { kill: () => { disposed.push('stale-child'); return true; } },
		};
		const current = {
			client: { dispose: () => disposed.push('current-client') },
			proxyHandle: { dispose: () => disposed.push('current-proxy') },
			child: { kill: () => { disposed.push('current-child'); return true; } },
		};
		agent['_connectionGeneration'] = 4;
		agent['_connection'] = { kind: 'ready', ...current } as never;

		// Both the generation and client identity protect the replacement: the
		// first models a queued event from the prior generation; the second guards
		// against a callback whose bookkeeping was stale but generation was not.
		agent['_handleConnectionLost'](stale as never, 3);
		agent['_handleConnectionLost'](stale as never, 4);

		assert.deepStrictEqual({
			isCurrentClient: agent['_isCurrentConnection'](current as never),
			disposed,
		}, {
			isCurrentClient: true,
			disposed: [],
		});
	});

	test('does not promote a connection that dies while startup is completing', async () => {
		const agent = createAgent(disposables, async () => []);
		const disposed: string[] = [];
		agent['_startConnection'] = async generation => {
			// Let `_ensureConnection` publish its `starting` state before simulating
			// an exit in the narrow window before this promise resolves.
			await Promise.resolve();
			const ready = {
				client: { dispose: () => disposed.push('client') },
				proxyHandle: { dispose: () => disposed.push('proxy') },
				child: { kill: () => { disposed.push('child'); return true; } },
				subscriptions: { dispose: () => disposed.push('subscriptions') },
			};
			agent['_handleConnectionLost'](ready as never, generation);
			return ready as never;
		};

		await assert.rejects(agent['_ensureConnection'](), /replaced while starting/);

		assert.strictEqual(agent['_connection'].kind, 'idle');
		assert.deepStrictEqual(disposed, ['subscriptions', 'client', 'proxy', 'child']);
	});

	test('rejects an app-server that exited before persistent listeners were attached', async () => {
		const agent = createAgent(disposables, async () => []);
		const disposed: string[] = [];
		const registration = () => ({ dispose() { } });
		agent['_startRawConnection'] = async () => ({
			client: {
				onExit: Event.None,
				onTransportError: Event.None,
				onNotification: registration,
				onRequest: registration,
				dispose: () => { disposed.push('client'); },
			},
			proxyHandle: { dispose: () => { disposed.push('proxy'); } },
			child: {
				exitCode: 1,
				signalCode: null,
				kill: () => { disposed.push('child'); return false; },
			},
		}) as never;

		await assert.rejects(agent['_startConnection'](0, CancellationToken.None), /exited before persistent startup completed/);

		assert.deepStrictEqual(disposed, ['client', 'proxy', 'child']);
	});

	test('drops a model catalog returned by a replaced app-server', async () => {
		const agent = createAgent(disposables, async () => []);
		agent['_activated'] = true;
		const modelListStarted = new DeferredPromise<void>();
		const releaseModelList = new DeferredPromise<void>();
		const staleConnection = {
			kind: 'ready',
			client: {
				request: async (method: string) => {
					if (method === 'account/read') {
						return { account: { type: 'chatgpt', email: 'old@example.com', planType: 'plus' }, requiresOpenaiAuth: true };
					}
					if (method === 'config/read') {
						return { config: { model_provider: 'openai' } };
					}
					if (method === 'model/list') {
						await modelListStarted.complete();
						await releaseModelList.p;
						return modelListResponse;
					}
					throw new Error(`Unexpected request: ${method}`);
				},
			},
			proxyHandle: { dispose() { } },
			child: { kill: () => true },
		};
		agent['_connection'] = staleConnection as never;

		const refreshing = agent['_refreshCodexModels']();
		await modelListStarted.p;
		const currentModels = [{ provider: 'chatgpt', id: toCodexModelSelectionId('openai', 'current-model'), name: 'Current Model', supportsVision: false }];
		agent['_codexModels'] = currentModels;
		agent['_connection'] = createChatGPTConnection() as never;
		await releaseModelList.complete();
		await refreshing;

		assert.strictEqual(agent['_codexModels'], currentModels);
	});

	test('drops provider configuration returned by a replaced app-server', async () => {
		const ctx = createAgentContext(disposables, async () => []);
		ctx.agent['_activated'] = true;
		const configReadStarted = new DeferredPromise<void>();
		const releaseConfigRead = new DeferredPromise<void>();
		ctx.agent['_connection'] = {
			kind: 'ready',
			client: {
				request: async (method: string) => {
					assert.strictEqual(method, 'config/read');
					await configReadStarted.complete();
					await releaseConfigRead.p;
					return {
						config: {},
						layers: [{ name: { type: 'user', profile: null }, config: { personality: 'friendly', auto_review: { policy: 'always' } } }],
					};
				},
			},
			proxyHandle: { dispose() { } },
			child: { kill: () => true },
		} as never;

		const refreshing = ctx.agent['_refreshProviderConfiguration']();
		await configReadStarted.p;
		ctx.agent['_connection'] = createChatGPTConnection() as never;
		await releaseConfigRead.complete();
		await refreshing;

		assert.deepStrictEqual({
			ready: ctx.agent['_providerConfigurationReady'],
			values: ctx.agent['_providerConfigurationValues'],
		}, {
			ready: false,
			values: {},
		});
	});

	test('serializes account reads so later refreshes publish last', async () => {
		const agent = createAgent(disposables, async () => []);
		const firstStarted = new DeferredPromise<void>();
		const secondStarted = new DeferredPromise<void>();
		const requestStarted = [firstStarted, secondStarted];
		const firstResponse = new DeferredPromise<GetAccountResponse>();
		const secondResponse = new DeferredPromise<GetAccountResponse>();
		const responses = [
			firstResponse,
			secondResponse,
		];
		let requestIndex = 0;
		const client = {
			request: async (method: string) => {
				assert.strictEqual(method, 'account/read');
				const index = requestIndex++;
				await requestStarted[index].complete();
				return responses[index].p;
			},
		} as never;
		agent['_connection'] = {
			kind: 'ready',
			client,
			proxyHandle: { dispose() { } },
			child: { kill: () => true },
		} as never;

		const first = agent['_refreshAccount'](client, false);
		const second = agent['_refreshAccount'](client, false);
		await firstStarted.p;
		assert.strictEqual(requestIndex, 1);
		await firstResponse.complete({ account: null, requiresOpenaiAuth: true });
		await first;

		await secondStarted.p;
		assert.strictEqual(requestIndex, 2);
		await secondResponse.complete({
			account: { type: 'chatgpt', email: 'new@example.com', planType: 'pro' },
			requiresOpenaiAuth: true,
		});
		await second;

		assert.deepStrictEqual(agent['_openAIAccountState'], {
			usageSource: 'openai',
			status: 'signedIn',
			authType: 'chatgpt',
			email: 'new@example.com',
			planType: 'pro',
			requiresOpenaiAuth: true,
		});
	});

	test('drops a thread catalog returned by a replaced app-server', async () => {
		const agent = createAgent(disposables, async () => []);
		const listStarted = new DeferredPromise<void>();
		const releaseList = new DeferredPromise<void>();
		const staleConnection = {
			kind: 'ready',
			client: {
				request: async (method: string) => {
					assert.strictEqual(method, 'thread/list');
					await listStarted.complete();
					await releaseList.p;
					return { data: [], nextCursor: null };
				},
			},
			proxyHandle: { dispose() { } },
			child: { kill: () => true },
		};
		agent['_connection'] = staleConnection as never;

		const listing = agent['_listCodexChats']();
		await listStarted.p;
		agent['_connection'] = createChatGPTConnection() as never;
		await releaseList.complete();

		assert.strictEqual(await listing, undefined);
	});

	test('keeps the newest rate-limit response when reads complete out of order', async () => {
		const agent = createAgent(disposables, async () => []);
		let resolveFirst!: (value: GetAccountRateLimitsResponse) => void;
		let resolveSecond!: (value: GetAccountRateLimitsResponse) => void;
		const responses = [
			new Promise<GetAccountRateLimitsResponse>(resolve => resolveFirst = resolve),
			new Promise<GetAccountRateLimitsResponse>(resolve => resolveSecond = resolve),
		];
		let requestIndex = 0;
		const client = {
			request: async (method: string) => {
				assert.strictEqual(method, 'account/rateLimits/read');
				return responses[requestIndex++];
			},
		} as never;
		agent['_connection'] = {
			kind: 'ready',
			client,
			proxyHandle: { dispose() { } },
			child: { kill: () => true },
		} as never;
		agent['_openAIAccountState'] = { usageSource: 'openai', status: 'signedIn', authType: 'chatgpt', email: 'person@example.com', planType: 'plus', requiresOpenaiAuth: true };

		const first = agent['_refreshAccountRateLimits'](client, 'person@example.com');
		const second = agent['_refreshAccountRateLimits'](client, 'person@example.com');
		resolveSecond({
			rateLimits: { limitId: null, limitName: null, primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 200 }, secondary: null, credits: null, individualLimit: null, spendControlReached: null, planType: null, rateLimitReachedType: null },
			rateLimitsByLimitId: null,
			rateLimitResetCredits: null,
		});
		await second;
		resolveFirst({
			rateLimits: { limitId: null, limitName: null, primary: { usedPercent: 90, windowDurationMins: 300, resetsAt: 100 }, secondary: null, credits: null, individualLimit: null, spendControlReached: null, planType: null, rateLimitReachedType: null },
			rateLimitsByLimitId: null,
			rateLimitResetCredits: null,
		});
		await first;

		assert.deepStrictEqual(agent['_openAIAccountRateLimit'], { usedPercent: 20, windowDurationMins: 300, resetsAt: 200 });
	});

	test('surfaces current ChatGPT subscription models in the ChatGPT group', async () => {
		const agent = createAgent(disposables, async () => []);
		agent['_connection'] = {
			kind: 'ready',
			client: {
				request: async (method: string) => {
					if (method === 'account/read') {
						return { account: { type: 'chatgpt', email: 'person@example.com', planType: 'plus' }, requiresOpenaiAuth: true };
					}
					if (method === 'config/read') {
						return { config: { model_provider: 'openai' } };
					}
					if (method === 'model/list') {
						return modelListResponse;
					}
					throw new Error(`Unexpected request: ${method}`);
				},
			},
			proxyHandle: { dispose() { } },
			child: { kill: () => true },
		} as never;

		await agent.refreshModels();

		assert.deepStrictEqual(agent.models.get().map(model => ({
			provider: model.provider,
			id: model.id,
			name: model.name,
			thinkingLevel: model.configSchema?.properties.thinkingLevel && {
				enum: model.configSchema.properties.thinkingLevel.enum,
				default: model.configSchema.properties.thinkingLevel.default,
			},
			meta: model._meta,
		})), [{
			provider: 'codex',
			id: toCodexModelSelectionId('openai', 'gpt-5.6-sol'),
			name: 'GPT-5.6-Sol',
			thinkingLevel: {
				enum: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
				default: 'low',
			},
			meta: { modelSourceId: 'chatgptSubscription', modelGroupId: 'chatgpt' },
		}]);
	});

	test('omits the thinking level when a Codex model advertises no reasoning efforts', async () => {
		const agent = createAgent(disposables, async () => []);
		agent['_connection'] = {
			kind: 'ready',
			client: {
				request: async (method: string) => {
					if (method === 'account/read') {
						return { account: { type: 'chatgpt', email: 'person@example.com', planType: 'plus' }, requiresOpenaiAuth: true };
					}
					if (method === 'config/read') {
						return { config: { model_provider: 'openai' } };
					}
					if (method === 'model/list') {
						return {
							...modelListResponse,
							data: modelListResponse.data.map(model => ({ ...model, supportedReasoningEfforts: [] })),
						};
					}
					throw new Error(`Unexpected request: ${method}`);
				},
			},
			proxyHandle: { dispose() { } },
			child: { kill: () => true },
		} as never;

		await agent.refreshModels();

		assert.strictEqual(agent.models.get()[0].configSchema, undefined);
	});

	test('removes ChatGPT models when account/read reports signed out', async () => {
		const agent = createAgent(disposables, async () => []);
		agent['_codexModels'] = [{ provider: 'chatgpt', id: toCodexModelSelectionId('openai', 'gpt-5.6-sol'), name: 'GPT-5.6-Sol', supportsVision: true }];
		agent['_connection'] = {
			kind: 'ready',
			client: {
				request: async (method: string) => {
					assert.strictEqual(method, 'account/read');
					return { account: null, requiresOpenaiAuth: true };
				},
			},
			proxyHandle: { dispose() { } },
			child: { kill: () => true },
		} as never;

		await agent['_refreshCodexModels']();

		assert.deepStrictEqual(agent['_codexModels'], []);
	});

	test('keeps configured non-human providers out of the ChatGPT group', async () => {
		const agent = createAgent(disposables, async () => []);
		agent['_connection'] = {
			kind: 'ready',
			client: {
				request: async (method: string) => {
					if (method === 'account/read') {
						return { account: { type: 'apiKey' }, requiresOpenaiAuth: true };
					}
					if (method === 'config/read') {
						return { config: { model_provider: 'custom-provider' } };
					}
					if (method === 'model/list') {
						return modelListResponse;
					}
					throw new Error(`Unexpected request: ${method}`);
				},
			},
			proxyHandle: { dispose() { } },
			child: { kill: () => true },
		} as never;

		await agent['_refreshCodexModels']();

		assert.deepStrictEqual(agent['_codexModels'].map(model => ({ provider: model.provider, id: model.id, meta: model._meta })), [{
			provider: 'codex',
			id: toCodexModelSelectionId('custom-provider', 'gpt-5.6-sol'),
			meta: { modelGroupId: 'custom-provider' },
		}]);
	});

	test('does not treat a custom provider named chatgpt as a ChatGPT subscription', async () => {
		const agent = createAgent(disposables, async () => []);
		agent['_connection'] = {
			kind: 'ready',
			client: {
				request: async (method: string) => {
					if (method === 'account/read') {
						return { account: { type: 'apiKey' }, requiresOpenaiAuth: false };
					}
					if (method === 'config/read') {
						return { config: { model_provider: 'chatgpt' } };
					}
					if (method === 'model/list') {
						return modelListResponse;
					}
					throw new Error(`Unexpected request: ${method}`);
				},
			},
			proxyHandle: { dispose() { } },
			child: { kill: () => true },
		} as never;

		await agent['_refreshCodexModels']();

		assert.deepStrictEqual(agent['_codexModels'].map(model => ({ provider: model.provider, meta: model._meta })), [{
			provider: 'codex',
			meta: { modelGroupId: 'chatgpt' },
		}]);
	});

	test('does not relabel a custom provider when ChatGPT authentication is available', async () => {
		const agent = createAgent(disposables, async () => []);
		agent['_connection'] = {
			kind: 'ready',
			client: {
				request: async (method: string) => {
					if (method === 'account/read') {
						return { account: { type: 'chatgpt', email: 'person@example.com', planType: 'plus' }, requiresOpenaiAuth: false };
					}
					if (method === 'config/read') {
						return { config: { model_provider: 'custom-provider' } };
					}
					if (method === 'model/list') {
						return modelListResponse;
					}
					throw new Error(`Unexpected request: ${method}`);
				},
			},
			proxyHandle: { dispose() { } },
			child: { kill: () => true },
		} as never;

		await agent['_refreshCodexModels']();

		assert.deepStrictEqual(agent['_codexModels'].map(model => ({ provider: model.provider, meta: model._meta })), [{
			provider: 'codex',
			meta: { modelGroupId: 'custom-provider' },
		}]);
	});

	test('signs out through app-server and refreshes account state', async () => {
		const agent = createAgent(disposables, async () => []);
		const requests: string[] = [];
		agent['_connection'] = {
			kind: 'ready',
			client: {
				request: async (method: string) => {
					requests.push(method);
					if (method === 'account/logout') {
						return {};
					}
					if (method === 'account/read') {
						return { account: null, requiresOpenaiAuth: true };
					}
					throw new Error(`Unexpected request: ${method}`);
				},
			},
			proxyHandle: { dispose() { } },
			child: { kill: () => true },
		} as never;
		agent['_queueModelRefresh'] = async () => { };

		await agent['_signOutOfChatGPT']();

		assert.deepStrictEqual({
			// Scoped to the sign-out gesture: with the SDK local, the startup
			// `config.toml` read lands on this same connection.
			requests: requests.filter(method => method.startsWith('account/')),
			accountStatus: agent['_openAIAccountState'].status,
		}, {
			requests: ['account/logout', 'account/read'],
			accountStatus: 'signedOut',
		});
	});

	test('clears Copilot proxy credentials and models when authentication is removed', async () => {
		const agent = createAgent(disposables, async () => []);
		const appliedTokens: string[] = [];
		agent['_githubToken'] = 'stale-token';
		agent['_copilotModels'] = [{
			provider: 'copilot',
			id: toCodexModelSelectionId('vscode-proxy', 'gpt-5.3-codex'),
			name: 'GPT-5.3-Codex',
			supportsVision: false,
		}];
		agent['_models'].set(agent['_copilotModels'], undefined);
		agent['_connection'] = {
			kind: 'ready',
			client: {
				request: async (method: string) => {
					if (method === 'account/read') {
						return { account: null, requiresOpenaiAuth: true };
					}
					throw new Error(`Unexpected request: ${method}`);
				},
			},
			proxyHandle: {
				setToken: (token: string) => appliedTokens.push(token),
				dispose() { },
			},
			child: { kill: () => true },
		} as never;

		await agent.authenticate(agent.getProtectedResources()[0].resource, '');
		await agent.refreshModels();

		assert.deepStrictEqual({
			githubToken: agent['_githubToken'],
			appliedTokens,
			models: agent.models.get(),
		}, {
			githubToken: undefined,
			appliedTokens: [''],
			models: [],
		});
	});

	test('advertises multiple working directories only while enabled', () => {
		const agent = createAgent(disposables, async () => []);
		const disabledByDefault = agent.getDescriptor().capabilities?.multipleWorkingDirectories;
		agent['_configurationService'].updateRootConfig({ [AgentHostCodexMultiRootEnabledConfigKey]: true });
		const whenEnabled = agent.getDescriptor().capabilities?.multipleWorkingDirectories;
		agent['_configurationService'].updateRootConfig({ [AgentHostCodexMultiRootEnabledConfigKey]: false });
		const afterDisabling = agent.getDescriptor().capabilities?.multipleWorkingDirectories;

		assert.deepStrictEqual({ disabledByDefault, whenEnabled, afterDisabling }, {
			disabledByDefault: undefined,
			whenEnabled: { immutablePrimary: true },
			afterDisabling: undefined,
		});
	});
});

suite('CodexAgent — agent SDK setup channel', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** What the workbench would read off root state right now. */
	function readSetup(ctx: ITestAgentContext) {
		return readAgentSdkSetupInfos(ctx.stateManager.rootState).find(setup => setup.agent === 'codex');
	}

	/** Addresses a download request at an agent the way `IAgentSdkSetupService` does. */
	function dispatchDownload(ctx: ITestAgentContext, agent = 'codex', request = 'req-1'): void {
		ctx.configurationService.updateRootConfig({ [AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY]: { agent, request } });
	}

	/** Addresses a reload request the same way, as the banner's link does. */
	function dispatchReload(ctx: ITestAgentContext, agent = 'codex', request = 'req-1'): void {
		ctx.configurationService.updateRootConfig({ [AGENT_SDK_SETUP_RELOAD_REQUEST_KEY]: { agent, request } });
	}

	/** Waits for the ctor's queued publish (and any refresh it chains) to settle. */
	async function settle(): Promise<void> {
		for (let i = 0; i < 20; i++) {
			await new Promise<void>(resolve => setTimeout(resolve, 0));
		}
	}

	/**
	 * A build that knows where to fetch the SDK from but has not yet — the state
	 * the banner's offer exists for. Both flags are set explicitly because
	 * `isAvailable` false would fall through to `resolveCodexDevSdkRoot()`.
	 */
	function createNotDownloaded(): RecordingAgentSdkDownloader {
		const sdkDownloader = new RecordingAgentSdkDownloader();
		sdkDownloader.resolvableWithoutDownload = false;
		return sdkDownloader;
	}

	test('an SDK already on disk publishes `ready`, plus the docs URL and sign-in affordance the banner offers', async () => {
		const ctx = createAgentContext(disposables, async () => []);
		await settle();

		assert.deepStrictEqual(readSetup(ctx), {
			agent: 'codex',
			download: 'ready',
			setupDocsUrl: 'https://learn.chatgpt.com/codex/auth',
			// Unlike Claude, ChatGPT sign-in is a control request the app server
			// answers, so the banner can start it without the user leaving the window.
			signInProviderName: 'ChatGPT',
		});
	});

	test('a cold cache publishes `notDownloaded`, which is what turns the banner into an offer', async () => {
		const ctx = createAgentContext(disposables, async () => [], {}, createNotDownloaded());
		await settle();

		assert.strictEqual(readSetup(ctx)?.download, 'notDownloaded');
	});

	test('an explicit download fetches the SDK, holds progress interest for the fetch, and ends at `ready`', async () => {
		const sdkDownloader = createNotDownloaded();
		let releaseDownload = () => { };
		const downloaded = new Promise<void>(resolve => {
			// Releasing the gate is the moment the SDK lands on disk.
			releaseDownload = () => { sdkDownloader.resolvableWithoutDownload = true; resolve(); };
		});
		sdkDownloader.loadSdkRootResult = async () => { await downloaded; return '/tmp/codex-sdk'; };
		const ctx = createAgentContext(disposables, async () => [], {}, sdkDownloader);
		// The refresh the download chains must not spawn a real app server.
		ctx.agent['_ensureConnection'] = async () => { throw new Error('offline'); };
		await settle();

		dispatchDownload(ctx);
		await settle();
		const inFlight = {
			download: readSetup(ctx)?.download,
			interests: [...sdkDownloader.progressInterests],
			held: sdkDownloader.heldProgressInterests,
		};

		releaseDownload();
		await settle();

		assert.deepStrictEqual({ inFlight, after: readSetup(ctx)?.download, held: sdkDownloader.heldProgressInterests }, {
			inFlight: { download: 'downloading', interests: ['codex'], held: 1 },
			after: 'ready',
			held: 0,
		});
	});

	test('a download that lands publishes ready without starting a persistent catalog connection', async () => {
		const sdkDownloader = createNotDownloaded();
		sdkDownloader.loadSdkRootResult = async () => { sdkDownloader.resolvableWithoutDownload = true; return '/tmp/codex-sdk'; };
		const ctx = createAgentContext(disposables, async () => [], {}, sdkDownloader);
		let connectionRequests = 0;
		ctx.agent['_ensureConnection'] = async () => {
			connectionRequests++;
			throw new Error('persistent connection should remain stopped');
		};
		await settle();

		dispatchDownload(ctx);
		await settle();

		assert.deepStrictEqual({ download: readSetup(ctx)?.download, models: ctx.agent.models.get().length, connectionRequests }, {
			download: 'ready',
			models: 0,
			connectionRequests: 0,
		});
	});

	test('the request key is cleared as it is consumed, so an identical later press still lands', async () => {
		const sdkDownloader = createNotDownloaded();
		let downloads = 0;
		sdkDownloader.loadSdkRootResult = async () => { downloads++; return '/tmp/codex-sdk'; };
		const ctx = createAgentContext(disposables, async () => [], {}, sdkDownloader);
		ctx.agent['_ensureConnection'] = async () => { throw new Error('offline'); };
		await settle();

		dispatchDownload(ctx, 'codex', 'press-1');
		await settle();
		const consumed = ctx.configurationService.getRootConfigValues()[AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY];

		dispatchDownload(ctx, 'codex', 'press-2');
		await settle();

		assert.deepStrictEqual({ consumed, downloads }, { consumed: undefined, downloads: 2 });
	});

	test('a request addressed to another agent is ignored', async () => {
		const sdkDownloader = createNotDownloaded();
		const ctx = createAgentContext(disposables, async () => [], {}, sdkDownloader);
		await settle();

		dispatchDownload(ctx, 'claude');
		await settle();

		assert.deepStrictEqual({
			downloads: sdkDownloader.progressInterests,
			// Left in place for the agent it names, rather than consumed by this one.
			key: ctx.configurationService.getRootConfigValues()[AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY],
		}, {
			downloads: [],
			key: { agent: 'claude', request: 'req-1' },
		});
	});

	test('a failed download releases the progress interest and stops claiming to be downloading', async () => {
		const sdkDownloader = createNotDownloaded();
		sdkDownloader.loadSdkRootResult = async () => { throw new Error('CDN unreachable'); };
		const ctx = createAgentContext(disposables, async () => [], {}, sdkDownloader);
		await settle();

		dispatchDownload(ctx);
		await settle();

		assert.deepStrictEqual({
			download: readSetup(ctx)?.download,
			held: sdkDownloader.heldProgressInterests,
		}, {
			download: 'notDownloaded',
			held: 0,
		});
	});

	test('a reload is claimed here too, since the request handling is the shared channel and not per-agent code', async () => {
		const ctx = createAgentContext(disposables, async () => []);
		ctx.agent['_ensureConnection'] = async () => { throw new Error('offline'); };
		await settle();

		dispatchReload(ctx);
		await settle();

		assert.deepStrictEqual({
			key: ctx.configurationService.getRootConfigValues()[AGENT_SDK_SETUP_RELOAD_REQUEST_KEY],
			// Reload only re-reads what is already there; nothing is ever fetched.
			interests: ctx.sdkDownloader.progressInterests,
		}, {
			key: undefined,
			interests: [],
		});
	});
});
