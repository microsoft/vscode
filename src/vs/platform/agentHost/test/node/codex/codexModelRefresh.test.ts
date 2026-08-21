/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import type { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IAgentHostGitHubEndpointService } from '../../../node/agentHostGitHubEndpointService.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { IAgentHostCustomizationEnablementService } from '../../../node/agentHostCustomizationEnablementService.js';
import { AgentHostStateManager } from '../../../node/agentHostStateManager.js';
import { IAgentHostSessionTitleSignal } from '../../../node/agentHostSessionTitleSignal.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { RecordingAgentSdkDownloader } from '../testAgentSdkDownloader.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../../common/agentHostCheckpointService.js';
import { AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY, AGENT_SDK_SETUP_RELOAD_REQUEST_KEY, readAgentSdkSetupInfos } from '../../../common/agentSdkSetup.js';
import { CodexAgent, toCodexModelSelectionId } from '../../../node/codex/codexAgent.js';
import { ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { createTestGitHubEndpointService } from '../testGitHubEndpointService.js';
import { AgentHostCodexMultiRootEnabledConfigKey } from '../../../common/agentHostSchema.js';
import { IAgentHostOTelService } from '../../../common/otel/agentHostOTelService.js';
import { AgentHostConfigKey } from '../../../common/agentHostCustomizationConfig.js';
import { createNoopCustomizationEnablementService } from '../testCustomizationEnablementService.js';

interface ITestAgentContext {
	readonly agent: CodexAgent;
	readonly stateManager: AgentHostStateManager;
	readonly configurationService: AgentConfigurationService;
	readonly sdkDownloader: RecordingAgentSdkDownloader;
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
	instantiationService.stub(IAgentHostCustomizationEnablementService, createNoopCustomizationEnablementService());
	instantiationService.stub(IAgentHostGitHubEndpointService, createTestGitHubEndpointService());
	instantiationService.stub(IAgentSdkDownloader, sdkDownloader);
	instantiationService.stub(IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE);
	instantiationService.stub(IAgentHostOTelService, { _serviceBrand: undefined, getNativeSdkTelemetryConfig: async () => undefined });
	instantiationService.stub(IAgentHostSessionTitleSignal, { _serviceBrand: undefined, onDidChangeSessionTitle: Event.None });
	instantiationService.stub(IProductService, { _serviceBrand: undefined, version: '1.0.0-test' } as IProductService);
	instantiationService.stub(INativeEnvironmentService, { userHome: URI.file('/tmp') });
	instantiationService.stub(ILogService, logService);
	const agent = disposables.add(instantiationService.createInstance(CodexAgent));
	return { agent, stateManager, configurationService, sdkDownloader };
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

	test('eagerly enumerates the authoritative catalog at startup when the SDK is already local', async () => {
		const agent = createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true });
		const requests: string[] = [];
		let resolveConnection!: () => void;
		const connectionPromise = new Promise<never>(resolve => { resolveConnection = () => resolve(createChatGPTConnection(undefined, requests) as never); });
		let connectionRequested = false;
		agent['_ensureConnection'] = async () => {
			connectionRequested = true;
			return connectionPromise;
		};

		await new Promise<void>(resolve => setTimeout(resolve, 0));
		assert.deepStrictEqual({ connectionRequested, models: agent.models.get() }, { connectionRequested: true, models: [] });

		resolveConnection();
		await agent.refreshModels();

		assert.deepStrictEqual({
			// One enumeration, not one per caller that happened to want the connection.
			enumerations: requests.filter(method => method === 'model/list').length,
			models: agent.models.get().map(model => ({ provider: model.provider, id: model.id, name: model.name, meta: model._meta })),
		}, {
			enumerations: 1,
			models: [{
				provider: 'chatgpt',
				id: toCodexModelSelectionId('openai', 'gpt-5.6-sol'),
				name: 'GPT-5.6-Sol',
				meta: { modelSourceId: 'chatgptSubscription' },
			}],
		});
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
		agent['_connection'] = { kind: 'starting', promise: new Promise<never>(resolve => { resolveConnection = () => resolve(connection as never); }) };

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
			providers: ['copilot'],
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

	test('surfaces current ChatGPT subscription models under the ChatGPT provider', async () => {
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
			provider: 'chatgpt',
			id: toCodexModelSelectionId('openai', 'gpt-5.6-sol'),
			name: 'GPT-5.6-Sol',
			thinkingLevel: {
				enum: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
				default: 'low',
			},
			meta: { modelSourceId: 'chatgptSubscription' },
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
			provider: 'custom-provider',
			id: toCodexModelSelectionId('custom-provider', 'gpt-5.6-sol'),
			meta: undefined,
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
			provider: 'chatgpt',
			meta: undefined,
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
			provider: 'custom-provider',
			meta: undefined,
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

	test('a download that lands stays `downloading` until the catalog does, so the banner never flashes "no account"', async () => {
		const sdkDownloader = createNotDownloaded();
		sdkDownloader.loadSdkRootResult = async () => { sdkDownloader.resolvableWithoutDownload = true; return '/tmp/codex-sdk'; };
		const ctx = createAgentContext(disposables, async () => [], {}, sdkDownloader);
		let releaseEnumeration = () => { };
		const enumerated = new Promise<void>(resolve => { releaseEnumeration = resolve; });
		const connection = createChatGPTConnection();
		ctx.agent['_ensureConnection'] = async () => ({
			...connection,
			client: {
				request: async (method: string) => {
					if (method === 'model/list') {
						await enumerated;
					}
					return connection.client.request(method);
				},
			},
		} as never);
		await settle();

		dispatchDownload(ctx);
		await settle();
		const enumerating = { download: readSetup(ctx)?.download, models: ctx.agent.models.get().length };

		releaseEnumeration();
		await settle();

		assert.deepStrictEqual({ enumerating, after: readSetup(ctx)?.download, models: ctx.agent.models.get().length }, {
			// `ready` while the catalog is still empty is precisely how the window
			// renders "we looked and found no account".
			enumerating: { download: 'downloading', models: 0 },
			after: 'ready',
			models: 1,
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
