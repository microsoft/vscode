/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, Disposable } from '../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE, type IAgent, type IAgentChats, type IAgentModelInfo } from '../../common/agent.js';
import type { IByokLmBridgeConnection, IByokLmChatRequest, IByokLmModelInfo } from '../../common/agentHostByokLm.js';
import { AgentHostByokModelsEnabledConfigKey, AgentHostByokUtilityModelDefaultConfigKey, AgentHostUtilitySmallModelConfigKey } from '../../common/agentHostSchema.js';
import { createAgentModelByokMeta } from '../../common/agentModelByokMeta.js';
import { MessageKind, SessionStatus, TurnState } from '../../common/state/sessionState.js';
import type { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import type { IAgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import type { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostUtilityModelService, AgentHostUtilityModelUnavailableError } from '../../node/agentHostUtilityModelService.js';
import type { IByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';
import type { ICopilotApiService } from '../../node/shared/copilotApiService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';

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
		const byokRequests: Pick<IByokLmChatRequest, 'vendor' | 'modelId' | 'input'>[] = [];
		const connection: IByokLmBridgeConnection = {
			chat: async request => {
				byokRequests.push({ vendor: request.vendor, modelId: request.modelId, input: request.input });
				return { output: [{ type: 'message', content: [{ type: 'text', text: 'byok ' }, { type: 'text', text: 'text' }] }] };
			},
			onDidChangeModels: Event.None,
		};
		const bridgeRegistry = upcastPartial<IByokLmBridgeRegistry>({
			getModels: () => BYOK_MODELS,
			getServingConnection: () => connection,
			onDidChangeModels: () => Disposable.None,
		});
		const agent = upcastPartial<IAgent>({
			models: constObservable(AGENT_MODELS),
			chats: upcastPartial<IAgentChats>({
				getModel: () => scenario.mainModel ? { id: scenario.mainModel } : undefined,
			}),
		});
		const providerService = new class extends mock<IAgentHostProviderService>() {
			override getProviderForSession() { return agent; }
		}();
		const authenticationService = upcastPartial<IAgentHostAuthenticationService>({
			onDidChangeAuthToken: Event.None,
			getAuthToken: resource => scenario.copilotToken !== false && resource.resource === GITHUB_COPILOT_PROTECTED_RESOURCE.resource ? 'copilot-token' : undefined,
		});
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: SESSION,
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
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
		const service = new AgentHostUtilityModelService(scenario.byokUtilityModelsSupported ?? true, configurationService, copilotApiService, bridgeRegistry, providerService, stateManager, authenticationService, createTestGitHubEndpointService(), new NullLogService());

		let result: string;
		try {
			result = await service.chatCompletion({ session: SESSION, model: scenario.turnModel ? { id: scenario.turnModel } : undefined }, { messages: [{ role: 'system', content: 'rules' }, { role: 'user', content: 'request' }] });
		} catch (err) {
			result = err instanceof AgentHostUtilityModelUnavailableError ? `unavailable: ${err.reason}` : `error: ${err}`;
		}
		return includeInput
			? { result, byokRequests }
			: { result, copilotCalls, byokRequests: byokRequests.map(r => `${r.vendor}|${r.modelId}`) };
	}

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
		};
		const results: Record<string, unknown> = {};
		for (const [name, scenario] of Object.entries(scenarios)) {
			results[name] = await run(scenario);
		}

		const copilot = { result: 'copilot text', copilotCalls: ['copilot-token'], byokRequests: [] };
		const signedOut = { result: 'unavailable: copilotSignInRequired', copilotCalls: [], byokRequests: [] };
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
		});
	});

	test('forwards the utility messages to the BYOK bridge', async () => {
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
			}],
		});
	});
});
