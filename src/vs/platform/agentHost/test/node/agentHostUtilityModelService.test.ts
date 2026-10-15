/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, Disposable } from '../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { IAgentHostSessionStateStore } from '../../common/agentHostSessionStateStore.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { COPILOT_CLI_AGENT_PROVIDER_ID, GITHUB_COPILOT_PROTECTED_RESOURCE, type IAgent, type IAgentChats, type IAgentModelInfo, type IAgentHostAuthTokenRequest } from '../../common/agent.js';
import type { IByokLmBridgeConnection, IByokLmChatRequest, IByokLmModelInfo } from '../../common/agentHostByokLm.js';
import { AgentHostByokModelsEnabledConfigKey, AgentHostByokUtilityModelDefaultConfigKey, AgentHostUtilitySmallModelConfigKey } from '../../common/agentHostSchema.js';
import { createAgentModelByokMeta } from '../../common/agentModelByokMeta.js';
import { buildDefaultChatUri, MessageKind, SessionStatus, TurnState } from '../../common/state/sessionState.js';
import type { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostAuthenticationService, type IAgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { AgentHostAuthenticationScope } from '../../node/agentHostAuthenticationScope.js';
import type { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostUtilityModelService, AgentHostUtilityModelUnavailableError } from '../../node/agentHostUtilityModelService.js';
import type { IByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';
import type { ICopilotApiService } from '../../node/shared/copilotApiService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';
import type { IAgentHostCredentialSource } from '../../common/agentHostCredentials.js';

const SESSION = 'agent:/session';

const BYOK_MODELS: readonly IByokLmModelInfo[] = [
	{ vendor: 'ollama', id: 'llama3', modelIdentifier: 'ollama/llama3' },
	{ vendor: 'azure', id: 'gpt-5', modelIdentifier: 'azure/work/gpt-5' },
];

const AGENT_MODELS: readonly IAgentModelInfo[] = [
	{ provider: 'copilot', id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', supportsVision: false },
	{ provider: 'copilot', id: 'azure/work/gpt-5', name: 'GPT-5', supportsVision: false, _meta: createAgentModelByokMeta('azure/work/gpt-5') },
];

interface IScenario {
	readonly authenticationService?: IAgentHostAuthenticationService;
	readonly credentialSource?: IAgentHostCredentialSource;
	readonly chatCredentialSource?: IAgentHostCredentialSource;
	readonly chat?: string;
	readonly mainModel?: string;
	readonly utilitySmallModel?: string;
	readonly byokUtilityModelDefault?: string;
	readonly byokModelsEnabled?: boolean;
	readonly copilotToken?: boolean;
	/** Whether the host has a renderer BYOK bridge; `false` models a remote agent host. */
	readonly byokUtilityModelsSupported?: boolean;
	/** The model of the turn being served, passed by the caller. */
	readonly turnModel?: string;
	/** The model recorded on the chat's last completed turn. */
	readonly lastTurnModel?: string;
	/**
	 * Whether a renderer serves BYOK models. When `false`, the bridge has no
	 * serving connection and the Copilot agent's catalog drops BYOK models.
	 */
	readonly rendererConnected?: boolean;
	/** The session's agent provider id; defaults to the Copilot CLI provider. */
	readonly agentId?: string;
}

suite('AgentHostUtilityModelService', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	async function run(scenario: IScenario, includeInput = false): Promise<unknown> {
		const rootValues: Record<string, unknown> = {
			[AgentHostUtilitySmallModelConfigKey]: scenario.utilitySmallModel,
			[AgentHostByokUtilityModelDefaultConfigKey]: scenario.byokUtilityModelDefault,
			[AgentHostByokModelsEnabledConfigKey]: scenario.byokModelsEnabled,
		};
		const configurationService = new class extends mock<IAgentConfigurationService>() {
			override getRootValue(_schema: never, key: string) {
				return rootValues[key] as never;
			}
		}();
		const copilotCalls: string[] = [];
		const copilotApiService = upcastPartial<ICopilotApiService>({
			utilityChatCompletion: async token => {
				copilotCalls.push(token);
				return 'copilot text';
			},
		});
		const rendererConnected = scenario.rendererConnected ?? true;
		const byokRequests: Pick<IByokLmChatRequest, 'vendor' | 'modelId' | 'input' | 'modelOptions'>[] = [];
		const connection: IByokLmBridgeConnection = {
			chat: async request => {
				byokRequests.push({ vendor: request.vendor, modelId: request.modelId, input: request.input, modelOptions: request.modelOptions });
				return { output: [{ type: 'message', content: [{ type: 'text', text: 'byok ' }, { type: 'text', text: 'text' }] }] };
			},
			onDidChangeModels: Event.None,
			onDidDelta: Event.None,
		};
		const bridgeRegistry = upcastPartial<IByokLmBridgeRegistry>({
			getModels: () => rendererConnected ? BYOK_MODELS : [],
			getServingConnection: () => rendererConnected ? connection : undefined,
			onDidChangeModels: () => Disposable.None,
		});
		const agent = upcastPartial<IAgent>({
			id: scenario.agentId ?? COPILOT_CLI_AGENT_PROVIDER_ID,
			models: constObservable(rendererConnected ? AGENT_MODELS : AGENT_MODELS.filter(m => !m._meta)),
			chats: upcastPartial<IAgentChats>({
				getModel: () => scenario.mainModel ? { id: scenario.mainModel } : undefined,
			}),
		});
		const providerService = new class extends mock<IAgentHostProviderService>() {
			override getProviderForSession() { return agent; }
		}();
		const authenticationService = scenario.authenticationService ?? disposables.add(new class extends AgentHostAuthenticationService {
			override getSessionCredentialSource(resource: string) {
				return resource === scenario.chat && scenario.chatCredentialSource ? scenario.chatCredentialSource : super.getSessionCredentialSource(resource);
			}
			override getAuthToken(request: IAgentHostAuthTokenRequest, source?: IAgentHostCredentialSource) {
				return source ? source.getCredential(request)?.token
					: scenario.copilotToken !== false && request.resource === GITHUB_COPILOT_PROTECTED_RESOURCE.resource ? 'copilot-token' : undefined;
			}
		}(new NullLogService()));
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: SESSION,
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
			defaultChat: buildDefaultChatUri(SESSION),
		});
		if (scenario.lastTurnModel) {
			stateManager.seedDefaultChatTurns(SESSION, [{
				id: 'turn-1',
				message: { text: 'request', origin: { kind: MessageKind.User }, model: { id: scenario.lastTurnModel } },
				responseParts: [],
				usage: undefined,
				state: TurnState.Complete,
			}]);
		}
		const service = new AgentHostUtilityModelService(scenario.byokUtilityModelsSupported ?? true, configurationService, copilotApiService, bridgeRegistry, providerService, stateManager, authenticationService, createTestGitHubEndpointService(), new NullLogService(), createTestChatOwnershipService(stateManager), new class extends mock<IAgentHostSessionStateStore>() { override peek() { return undefined; } }());

		let result: string;
		try {
			result = await service.chatCompletion({ session: SESSION, chat: scenario.chat, credentialSource: scenario.credentialSource, model: scenario.turnModel ? { id: scenario.turnModel } : undefined }, { messages: [{ role: 'system', content: 'rules' }, { role: 'user', content: 'request' }], maxTokens: 32 });
		} catch (err) {
			result = err instanceof AgentHostUtilityModelUnavailableError ? `unavailable: ${err.reason}` : `error: ${err}`;
		}
		return includeInput
			? { result, byokRequests }
			: { result, copilotCalls, byokRequests: byokRequests.map(r => `${r.vendor}|${r.modelId}`) };
	}

	for (const available of [false, true]) {
		test(`uses the explicit session credential source without global fallback (${available})`, async () => {
			const requests: IAgentHostAuthTokenRequest[] = [];
			const result = await run({
				credentialSource: {
					getCredential: request => {
						requests.push(request);
						return available ? { resource: request.resource, token: 'session-token', revision: 1, expiresAt: undefined } : undefined;
					},
				},
			});
			assert.deepStrictEqual({ result, requests }, {
				result: { result: available ? 'copilot text' : 'unavailable: copilotSignInRequired', copilotCalls: available ? ['session-token'] : [], byokRequests: [] },
				requests: [{ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, session: SESSION }],
			});
		});
	}

	test('inherits the authoritative chat source instead of another chat or global credential', async () => {
		const source: IAgentHostCredentialSource = {
			getCredential: request => ({ resource: request.resource, token: 'chat-token', revision: 1, expiresAt: undefined }),
		};
		assert.deepStrictEqual(await run({ chat: 'ahp-chat:/peer', chatCredentialSource: source }), {
			result: 'copilot text', copilotCalls: ['chat-token'], byokRequests: [],
		});
	});

	for (const available of [true, false]) {
		test(`scoped utility work respects a renderer BYOK override (${available})`, async () => {
			assert.deepStrictEqual(await run({
				utilitySmallModel: 'ollama/llama3',
				credentialSource: {
					getCredential: request => available
						? { resource: request.resource, token: 'scoped', revision: 1, expiresAt: undefined }
						: undefined,
				},
			}), {
				result: 'byok text',
				copilotCalls: [],
				byokRequests: ['ollama|llama3'],
			});
		});
	}

	for (const unavailable of ['restored', 'disconnected'] as const) {
		test(`a ${unavailable} GitHub sponsor does not disable an explicitly configured BYOK utility model`, async () => {
			const authentication = disposables.add(new AgentHostAuthenticationService(new NullLogService()));
			const principal = { apiOrigin: 'https://api.github.com', userId: '101' };
			const resource = GITHUB_COPILOT_PROTECTED_RESOURCE;
			const agent = new class extends mock<IAgent>() {
				override getProtectedResources() { return [resource]; }
				override async authenticate() { return true; }
			}();
			await authentication.authenticate({ resource: resource.resource, scopes: resource.scopes_supported, token: 'legacy-token' }, [agent]);
			if (unavailable === 'restored') {
				authentication.restoreSessionCredentialPrincipal(SESSION, principal, buildDefaultChatUri(SESSION));
			} else {
				const scope = disposables.add(new AgentHostAuthenticationScope(async params => params, () => { }, principal));
				authentication.bindSessionCredentials(SESSION, scope, buildDefaultChatUri(SESSION));
				scope.dispose();
			}
			assert.deepStrictEqual(await run({ authenticationService: authentication, mainModel: 'azure/work/gpt-5', utilitySmallModel: 'ollama/llama3' }), {
				result: 'byok text', copilotCalls: [], byokRequests: ['ollama|llama3'],
			});
		});
	}

	test('does not map unexpected credential failures to sign-in required', async () => {
		assert.deepStrictEqual(await run({
			credentialSource: { getCredential: () => { throw new Error('Credential invariant failed'); } },
		}), {
			result: 'error: Error: Credential invariant failed', copilotCalls: [], byokRequests: [],
		});
	});

	test('resolves the override, BYOK main agent default, and Copilot routes', async () => {
		const scenarios: Record<string, IScenario> = {
			copilotMainModel: { mainModel: 'claude-sonnet-4.5' },
			noSelectedModel: {},
			copilotSignedOut: { mainModel: 'claude-sonnet-4.5', copilotToken: false },
			byokOverride: { mainModel: 'claude-sonnet-4.5', utilitySmallModel: 'ollama/llama3', copilotToken: false },
			byokOverrideInGroup: { utilitySmallModel: 'azure/gpt-5' },
			unknownOverrideFallsBack: { utilitySmallModel: 'ollama/missing' },
			copilotOverrideFallsBack: { utilitySmallModel: 'copilot/gpt-4.1' },
			malformedOverrideFallsBack: { utilitySmallModel: 'llama3' },
			overrideWithByokDisabled: { utilitySmallModel: 'ollama/llama3', byokModelsEnabled: false },
			byokMainDefaultsToCopilot: { mainModel: 'azure/work/gpt-5' },
			byokMainSignedOut: { mainModel: 'azure/work/gpt-5', copilotToken: false },
			byokMainMainAgent: { mainModel: 'azure/work/gpt-5', byokUtilityModelDefault: 'mainAgent', copilotToken: false },
			byokMainNone: { mainModel: 'azure/work/gpt-5', byokUtilityModelDefault: 'none' },
			byokMainNoneWithOverride: { mainModel: 'azure/work/gpt-5', byokUtilityModelDefault: 'none', utilitySmallModel: 'ollama/llama3' },
			byokMainMainAgentWithByokDisabled: { mainModel: 'azure/work/gpt-5', byokUtilityModelDefault: 'mainAgent', byokModelsEnabled: false },
			copilotMainIgnoresByokDefault: { mainModel: 'claude-sonnet-4.5', byokUtilityModelDefault: 'none' },
			remoteIgnoresOverride: { utilitySmallModel: 'ollama/llama3', byokUtilityModelsSupported: false },
			remoteIgnoresByokDefault: { mainModel: 'azure/work/gpt-5', byokUtilityModelDefault: 'none', byokUtilityModelsSupported: false },
			turnModelPrecedesChatSelection: { mainModel: 'claude-sonnet-4.5', turnModel: 'azure/work/gpt-5', byokUtilityModelDefault: 'none' },
			nonResidentChatUsesLastTurnModel: { lastTurnModel: 'azure/work/gpt-5', byokUtilityModelDefault: 'none' },
			chatSelectionPrecedesLastTurnModel: { mainModel: 'claude-sonnet-4.5', lastTurnModel: 'azure/work/gpt-5', byokUtilityModelDefault: 'none' },
			disconnectedCopilotMainModel: { mainModel: 'claude-sonnet-4.5', rendererConnected: false },
			disconnectedByokMainCopilotDefault: { mainModel: 'azure/work/gpt-5', rendererConnected: false },
			disconnectedByokMainMainAgent: { mainModel: 'azure/work/gpt-5', byokUtilityModelDefault: 'mainAgent', rendererConnected: false },
			disconnectedByokMainNone: { mainModel: 'azure/work/gpt-5', byokUtilityModelDefault: 'none', rendererConnected: false },
			disconnectedRestoredByokTurn: { lastTurnModel: 'azure/work/gpt-5', rendererConnected: false },
			disconnectedByokOverride: { mainModel: 'claude-sonnet-4.5', utilitySmallModel: 'ollama/llama3', rendererConnected: false },
			disconnectedCopilotOverrideFallsBack: { utilitySmallModel: 'copilot/gpt-4.1', rendererConnected: false },
			disconnectedOverrideWithByokDisabled: { utilitySmallModel: 'ollama/llama3', byokModelsEnabled: false, rendererConnected: false },
			disconnectedOtherProviderSlashId: { mainModel: 'org/model', agentId: 'codex', rendererConnected: false },
		};
		const results: Record<string, unknown> = {};
		for (const [name, scenario] of Object.entries(scenarios)) {
			results[name] = await run(scenario);
		}

		const copilot = { result: 'copilot text', copilotCalls: ['copilot-token'], byokRequests: [] };
		const signedOut = { result: 'unavailable: copilotSignInRequired', copilotCalls: [], byokRequests: [] };
		const byokUnavailable = { result: 'unavailable: byokModelUnavailable', copilotCalls: [], byokRequests: [] };
		assert.deepStrictEqual(results, {
			copilotMainModel: copilot,
			noSelectedModel: copilot,
			copilotSignedOut: signedOut,
			byokOverride: { result: 'byok text', copilotCalls: [], byokRequests: ['ollama|llama3'] },
			byokOverrideInGroup: { result: 'byok text', copilotCalls: [], byokRequests: ['azure|work/gpt-5'] },
			unknownOverrideFallsBack: copilot,
			copilotOverrideFallsBack: copilot,
			malformedOverrideFallsBack: copilot,
			overrideWithByokDisabled: copilot,
			byokMainDefaultsToCopilot: copilot,
			byokMainSignedOut: signedOut,
			byokMainMainAgent: { result: 'byok text', copilotCalls: [], byokRequests: ['azure|work/gpt-5'] },
			byokMainNone: { result: 'unavailable: notConfigured', copilotCalls: [], byokRequests: [] },
			byokMainNoneWithOverride: { result: 'byok text', copilotCalls: [], byokRequests: ['ollama|llama3'] },
			byokMainMainAgentWithByokDisabled: { result: 'unavailable: byokModelUnavailable', copilotCalls: [], byokRequests: [] },
			copilotMainIgnoresByokDefault: copilot,
			remoteIgnoresOverride: copilot,
			remoteIgnoresByokDefault: copilot,
			turnModelPrecedesChatSelection: { result: 'unavailable: notConfigured', copilotCalls: [], byokRequests: [] },
			nonResidentChatUsesLastTurnModel: { result: 'unavailable: notConfigured', copilotCalls: [], byokRequests: [] },
			chatSelectionPrecedesLastTurnModel: copilot,
			disconnectedCopilotMainModel: copilot,
			disconnectedByokMainCopilotDefault: byokUnavailable,
			disconnectedByokMainMainAgent: byokUnavailable,
			disconnectedByokMainNone: { result: 'unavailable: notConfigured', copilotCalls: [], byokRequests: [] },
			disconnectedRestoredByokTurn: byokUnavailable,
			disconnectedByokOverride: byokUnavailable,
			disconnectedCopilotOverrideFallsBack: copilot,
			disconnectedOverrideWithByokDisabled: copilot,
			disconnectedOtherProviderSlashId: copilot,
		});
	});

	test('forwards the utility messages and inference options to the BYOK bridge', async () => {
		const result = await run({ utilitySmallModel: 'ollama/llama3' }, true);
		assert.deepStrictEqual(result, {
			result: 'byok text',
			byokRequests: [{
				vendor: 'ollama',
				modelId: 'llama3',
				input: [
					{ type: 'message', role: 'system', content: [{ type: 'text', text: 'rules' }] },
					{ type: 'message', role: 'user', content: [{ type: 'text', text: 'request' }] },
				],
				modelOptions: { temperature: 0.1, top_p: 1, max_tokens: 32 },
			}],
		});
	});
});
