/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { Event } from '../../../../../base/common/event.js';
import { join } from '../../../../../base/common/path.js';
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
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../../common/agentHostCheckpointService.js';
import { CodexAgent, toCodexModelSelectionId } from '../../../node/codex/codexAgent.js';
import { ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { createTestGitHubEndpointService } from '../testGitHubEndpointService.js';
import { AgentHostCodexMultiRootEnabledConfigKey } from '../../../common/agentHostSchema.js';
import { IAgentHostOTelService } from '../../../common/otel/agentHostOTelService.js';
import { AgentHostConfigKey } from '../../../common/agentHostCustomizationConfig.js';
import { createNoopCustomizationEnablementService } from '../testCustomizationEnablementService.js';

function createAgent(disposables: Pick<DisposableStore, 'add'>, models: () => Promise<CCAModel[]>, rootConfig: Record<string, boolean> = {}, userHome = '/tmp'): CodexAgent {
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
	instantiationService.stub(IAgentSdkDownloader, {
		_serviceBrand: undefined,
		isSdkResolvableWithoutDownload: () => new Promise<boolean>(() => { }),
	});
	instantiationService.stub(IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE);
	instantiationService.stub(IAgentHostOTelService, { _serviceBrand: undefined, getNativeSdkTelemetryConfig: async () => undefined });
	instantiationService.stub(IAgentHostSessionTitleSignal, { _serviceBrand: undefined, onDidChangeSessionTitle: Event.None });
	instantiationService.stub(IProductService, { _serviceBrand: undefined, version: '1.0.0-test' } as IProductService);
	instantiationService.stub(INativeEnvironmentService, { userHome: URI.file(userHome) });
	instantiationService.stub(ILogService, logService);
	return disposables.add(instantiationService.createInstance(CodexAgent));
}

suite('CodexAgent model refresh', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
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

	function createChatGPTHome(): string {
		const userHome = fs.mkdtempSync(join(os.tmpdir(), 'vscode-codex-agent-test-'));
		const codexHome = join(userHome, '.codex');
		fs.mkdirSync(codexHome);
		fs.writeFileSync(join(codexHome, 'auth.json'), JSON.stringify({
			auth_mode: 'chatgpt',
			tokens: { access_token: 'access', refresh_token: 'refresh' },
		}));
		return userHome;
	}

	function createChatGPTConnection(account: unknown = { type: 'chatgpt', email: 'person@example.com', planType: 'plus' }) {
		return {
			kind: 'ready',
			client: {
				request: async (method: string) => {
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

	test('eagerly enumerates authoritative ChatGPT models when existing auth is detected', async () => {
		const userHome = createChatGPTHome();
		try {
			const agent = createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true }, userHome);
			const connection = createChatGPTConnection();
			let resolveConnection!: () => void;
			const connectionPromise = new Promise<never>(resolve => { resolveConnection = () => resolve(connection as never); });
			let ensureConnectionCalls = 0;
			agent['_isSdkResolvableWithoutDownload'] = async () => false;
			agent['_ensureConnection'] = async () => {
				ensureConnectionCalls++;
				return connectionPromise;
			};

			await new Promise<void>(resolve => setTimeout(resolve, 0));
			assert.strictEqual(ensureConnectionCalls, 1);
			assert.deepStrictEqual(agent.models.get(), []);

			resolveConnection();
			await agent.refreshModels();

			assert.deepStrictEqual(agent.models.get().map(model => ({ provider: model.provider, id: model.id, name: model.name, meta: model._meta })), [{
				provider: 'chatgpt',
				id: toCodexModelSelectionId('openai', 'gpt-5.6-sol'),
				name: 'GPT-5.6-Sol',
				meta: { modelSourceId: 'chatgptSubscription' },
			}]);
		} finally {
			fs.rmSync(userHome, { recursive: true, force: true });
		}
	});

	test('does not enumerate ChatGPT models while signed-out use is disabled', async () => {
		const userHome = createChatGPTHome();
		try {
			const agent = createAgent(disposables, async () => [], {}, userHome);
			let ensureConnectionCalls = 0;
			agent['_isSdkResolvableWithoutDownload'] = async () => false;
			agent['_ensureConnection'] = async () => {
				ensureConnectionCalls++;
				return createChatGPTConnection() as never;
			};

			await new Promise<void>(resolve => setTimeout(resolve, 0));

			assert.strictEqual(ensureConnectionCalls, 0);
			assert.deepStrictEqual(agent.models.get(), []);
		} finally {
			fs.rmSync(userHome, { recursive: true, force: true });
		}
	});

	test('requires Copilot unless signed-out use and persisted ChatGPT auth are both present', () => {
		const userHome = createChatGPTHome();
		try {
			const copilotRequired = (agent: CodexAgent) => agent.getProtectedResources()[0].required;
			assert.deepStrictEqual({
				noChatGPTAuth: copilotRequired(createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true })),
				chatGPTAuthEnabled: copilotRequired(createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true }, userHome)),
				chatGPTAuthDisabled: copilotRequired(createAgent(disposables, async () => [], {}, userHome)),
			}, {
				noChatGPTAuth: true,
				chatGPTAuthEnabled: false,
				chatGPTAuthDisabled: true,
			});
		} finally {
			fs.rmSync(userHome, { recursive: true, force: true });
		}
	});

	test('requires Copilot again after persisted ChatGPT auth is removed', async () => {
		const userHome = createChatGPTHome();
		try {
			const agent = createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true }, userHome);
			assert.strictEqual(agent.getProtectedResources()[0].required, false);

			fs.rmSync(join(userHome, '.codex', 'auth.json'));
			agent['_connection'] = createChatGPTConnection(null) as never;
			await agent.refreshModels();

			assert.deepStrictEqual({
				copilotRequired: agent.getProtectedResources()[0].required,
				models: agent.models.get(),
			}, {
				copilotRequired: true,
				models: [],
			});
		} finally {
			fs.rmSync(userHome, { recursive: true, force: true });
		}
	});

	test('waits for an app-server already starting when signed-out use becomes enabled', async () => {
		const userHome = createChatGPTHome();
		try {
			const agent = createAgent(disposables, async () => [], {}, userHome);
			const connection = createChatGPTConnection();
			let resolveConnection!: () => void;
			agent['_connection'] = { kind: 'starting', promise: new Promise<never>(resolve => { resolveConnection = () => resolve(connection as never); }) };

			agent['_configurationService'].updateRootConfig({ [AgentHostConfigKey.AllowSignedOutWhenUsable]: true });
			await new Promise<void>(resolve => setTimeout(resolve, 0));
			assert.deepStrictEqual(agent.models.get(), []);

			resolveConnection();
			await agent.refreshModels();

			assert.deepStrictEqual(agent.models.get().map(model => model.id), [toCodexModelSelectionId('openai', 'gpt-5.6-sol')]);
		} finally {
			fs.rmSync(userHome, { recursive: true, force: true });
		}
	});

	test('does not publish ChatGPT models when detected credentials are invalid', async () => {
		const userHome = createChatGPTHome();
		try {
			const copilotModels = [{ id: 'copilot-model', name: 'Copilot Model', supported_endpoints: ['/responses'] }] as CCAModel[];
			const agent = createAgent(disposables, async () => copilotModels, { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true }, userHome);
			agent['_githubToken'] = 'token';
			agent['_connection'] = createChatGPTConnection(null) as never;

			await agent.refreshModels();

			assert.deepStrictEqual({
				providers: agent.models.get().map(model => model.provider),
				copilotRequired: agent.getProtectedResources()[0].required,
			}, {
				providers: ['copilot'],
				copilotRequired: true,
			});
		} finally {
			fs.rmSync(userHome, { recursive: true, force: true });
		}
	});

	test('does not publish a model when authoritative discovery fails', async () => {
		const userHome = createChatGPTHome();
		try {
			const agent = createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true }, userHome);
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
		} finally {
			fs.rmSync(userHome, { recursive: true, force: true });
		}
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
			requests,
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
