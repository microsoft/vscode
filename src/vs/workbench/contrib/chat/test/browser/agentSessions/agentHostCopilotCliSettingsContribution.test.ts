/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IPolicyData, type IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostCopilotLocalMemoryEnabledSettingId, AgentHostCopilotMemoryEnabledSettingId, AgentHostCopilotModelCapabilityOverridesSettingId, AgentHostCopilotSdkLogLevelSettingId, AgentHostEnsembleEnabledSettingId, AgentHostEnsembleIntelligenceUsesHydraFusionSettingId, AgentHostHydraFusionEnabledSettingId, AgentHostOpus48PromptEnabledSettingId, CopilotSearchSubagentEnabledSettingId, AgentHostShellToolInitScriptEnabledSettingId, CopilotStabilityOrderedPromptEnabledSettingId, AgentHostToolSearchDeferThresholdSettingId, AgentHostToolSearchEnabledSettingId, CopilotClaudeAdvisorEnabledSettingId, CopilotCliConfigKey, CopilotLocalIndexEnabledSettingId, CopilotTgrepEnabledSettingId } from '../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { ClientAnnotationsAction, INotification, IRootConfigChangedAction, SessionAction, TerminalAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import type { ConfigPropertySchema, RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { LocalModelEnabledSettingId, LocalModelLlamaServerPathSettingId } from '../../../../../../platform/agentHost/common/localModel.js';
import { AgentHostCopilotCliSettingsContribution } from '../../../browser/agentSessions/agentHost/agentHostCopilotCliSettingsContribution.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;

	private readonly _onAgentHostStart = new Emitter<void>();
	override readonly onAgentHostStart = this._onAgentHostStart.event;
	override readonly onAgentHostExit = Event.None;
	override readonly onDidAction = Event.None;
	override readonly onDidNotification: Event<INotification> = Event.None;

	public dispatchedActions: { channel: string; action: SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction }[] = [];

	override dispatch(channel: string, action: SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction): void {
		this.dispatchedActions.push({ channel, action });
	}

	private _rootStateValue: RootState | undefined = undefined;
	private readonly _rootStateOnDidChange = new Emitter<RootState>();
	override readonly rootState: IAgentSubscription<RootState> = (() => {
		const self = this;
		return {
			get value() { return self._rootStateValue; },
			get verifiedValue() { return self._rootStateValue; },
			onDidChange: this._rootStateOnDidChange.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
	})();

	setRootState(state: RootState): void {
		this._rootStateValue = state;
		this._rootStateOnDidChange.fire(state);
	}

	dispose(): void {
		this._onAgentHostStart.dispose();
		this._rootStateOnDidChange.dispose();
	}
}

class MockDefaultAccountService extends mock<IDefaultAccountService>() {
	private readonly _onDidChangePolicyData = new Emitter<IPolicyData | null>();
	override readonly onDidChangePolicyData = this._onDidChangePolicyData.event;
	private readonly _onDidChangeDefaultAccount = new Emitter<IDefaultAccount | null>();
	override readonly onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event;
	override currentDefaultAccount: IDefaultAccount | null = null;

	constructor(override policyData: IPolicyData | null) {
		super();
	}

	setPreviewFeaturesEnabled(enabled: boolean): void {
		this.policyData = { chat_preview_features_enabled: enabled };
		this._onDidChangePolicyData.fire(this.policyData);
	}

	setDefaultAccount(account: IDefaultAccount | null): void {
		this.currentDefaultAccount = account;
		this._onDidChangeDefaultAccount.fire(account);
	}

	dispose(): void {
		this._onDidChangePolicyData.dispose();
		this._onDidChangeDefaultAccount.dispose();
	}
}

function makeRootStateWithSchema(properties: Record<string, ConfigPropertySchema>, values: Record<string, unknown> = {}): RootState {
	return {
		agents: [],
		config: {
			schema: { type: 'object', properties },
			values,
		},
	};
}

/** The full schema an up-to-date host advertises for the forwarded keys. */
const fullSchema: Record<string, ConfigPropertySchema> = {
	[CopilotCliConfigKey.CopilotSdkLogLevel]: { type: 'string', title: 'Copilot SDK Log Level' },
	[CopilotCliConfigKey.Opus48Prompt]: { type: 'boolean', title: 'Opus 4.8 Agent Prompt' },
	[CopilotCliConfigKey.StabilityOrderedPrompt]: { type: 'boolean', title: 'Stability-Ordered System Prompt' },
	[CopilotCliConfigKey.ClaudeAdvisor]: { type: 'boolean', title: 'Claude Advisor Tool' },
	[CopilotCliConfigKey.Tgrep]: { type: 'boolean', title: 'Indexed Search (tgrep)' },
	[CopilotCliConfigKey.SearchSubagent]: { type: 'boolean', title: 'Search Subagent' },
	[CopilotCliConfigKey.LocalIndexEnabled]: { type: 'boolean', title: 'Local Session Index' },
	[CopilotCliConfigKey.ToolSearchEnabled]: { type: 'boolean', title: 'Agent Host Tool Search' },
	[CopilotCliConfigKey.ToolSearchDeferThreshold]: { type: 'number', title: 'Tool Search Defer Threshold' },
	[CopilotCliConfigKey.HydraFusion]: { type: 'boolean', title: 'HydraFusion' },
	[CopilotCliConfigKey.HydraFusionV2]: { type: 'boolean', title: 'HydraFusion V2' },
	[CopilotCliConfigKey.Ensemble]: { type: 'boolean', title: 'Ensemble' },
	[CopilotCliConfigKey.EnsembleIntelligenceUsesHydraFusion]: { type: 'boolean', title: 'Ensemble Intelligence Uses HydraFusion' },
	[CopilotCliConfigKey.Memory]: { type: 'boolean', title: 'Copilot Memory' },
	[CopilotCliConfigKey.LocalMemory]: { type: 'boolean', title: 'Local Copilot Memory' },
	[CopilotCliConfigKey.AutoModeTierOverride]: { type: 'string', title: 'Auto Optimize for Override' },
	[CopilotCliConfigKey.ModelCapabilityOverrides]: { type: 'object', title: 'Model Capability Overrides' },
	[CopilotCliConfigKey.EnableShellInitScript]: { type: 'boolean', title: 'Shell Init Script' },
};

/** Two microtask hops: one for the await on computeValue, one for the dispatch. */
async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

function setup(disposables: DisposableStore, settings: Record<string, unknown>, policyData: IPolicyData | null = null) {
	const instantiationService = disposables.add(new TestInstantiationService());
	const agentHostService = new MockAgentHostService();
	const defaultAccountService = new MockDefaultAccountService(policyData);
	disposables.add({ dispose: () => agentHostService.dispose() });
	disposables.add({ dispose: () => defaultAccountService.dispose() });
	const configurationService = new TestConfigurationService(settings);
	disposables.add(configurationService.onDidChangeConfigurationEmitter);
	const contextKeyService = disposables.add(new ContextKeyService(configurationService));
	instantiationService.stub(IAgentHostService, agentHostService);
	instantiationService.stub(IConfigurationService, configurationService);
	instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: constObservable(true), managedSandboxEnforced: constObservable(false) });
	instantiationService.stub(IDefaultAccountService, defaultAccountService);
	instantiationService.stub(IContextKeyService, contextKeyService);
	disposables.add(instantiationService.createInstance(AgentHostCopilotCliSettingsContribution));
	return { agentHostService, defaultAccountService, configurationService, contextKeyService };
}

suite('AgentHostCopilotCliSettingsContribution', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards the experimentation settings into root config once the schema advertises them', async () => {
		// The capability-overrides value exercises the whole per-entry surface
		// (family, effort, tool filters) plus the '*' wildcard — the forwarder
		// must pass the object through structurally unchanged.
		const capabilityOverrides = {
			'preview-model-x': { family: 'claude-opus-4-8', reasoningEffort: 'high', availableTools: ['builtin:*'], excludedTools: ['mcp:*'], promptOverrideFile: '/prompts/evaluation.yaml' },
			'*': { reasoningEffort: 'medium' },
		};
		const { agentHostService } = setup(disposables, {
			[AgentHostCopilotSdkLogLevelSettingId]: 'trace',
			[AgentHostOpus48PromptEnabledSettingId]: true,
			[CopilotStabilityOrderedPromptEnabledSettingId]: true,
			[CopilotClaudeAdvisorEnabledSettingId]: true,
			[CopilotTgrepEnabledSettingId]: true,
			[CopilotSearchSubagentEnabledSettingId]: true,
			[CopilotLocalIndexEnabledSettingId]: false,
			[AgentHostToolSearchEnabledSettingId]: true,
			[AgentHostToolSearchDeferThresholdSettingId]: 5.9,
			[AgentHostCopilotModelCapabilityOverridesSettingId]: capabilityOverrides,
			[AgentHostHydraFusionEnabledSettingId]: 'v2',
			[AgentHostEnsembleEnabledSettingId]: true,
			[AgentHostEnsembleIntelligenceUsesHydraFusionSettingId]: true,
			[AgentHostCopilotMemoryEnabledSettingId]: true,
			[AgentHostCopilotLocalMemoryEnabledSettingId]: true,
			'github.copilot.chat.autoModeTierOverride': 'intelligence',
			[AgentHostShellToolInitScriptEnabledSettingId]: true,
		});
		agentHostService.setRootState(makeRootStateWithSchema(fullSchema));
		await flush();

		// The shared forwarder dispatches one RootConfigChanged per key; merge them
		// and assert the full forwarded set (order-independent).
		assert.strictEqual(agentHostService.dispatchedActions.length, 18);
		const merged = Object.assign({}, ...agentHostService.dispatchedActions.map(a => (a.action as IRootConfigChangedAction).config));
		assert.deepStrictEqual(merged, {
			[CopilotCliConfigKey.CopilotSdkLogLevel]: 'trace',
			[CopilotCliConfigKey.Opus48Prompt]: true,
			[CopilotCliConfigKey.StabilityOrderedPrompt]: true,
			[CopilotCliConfigKey.ClaudeAdvisor]: true,
			[CopilotCliConfigKey.Tgrep]: true,
			[CopilotCliConfigKey.SearchSubagent]: true,
			[CopilotCliConfigKey.LocalIndexEnabled]: false,
			[CopilotCliConfigKey.ToolSearchEnabled]: true,
			[CopilotCliConfigKey.ToolSearchDeferThreshold]: 5,
			[CopilotCliConfigKey.HydraFusion]: true,
			[CopilotCliConfigKey.HydraFusionV2]: true,
			[CopilotCliConfigKey.Ensemble]: true,
			[CopilotCliConfigKey.EnsembleIntelligenceUsesHydraFusion]: true,
			[CopilotCliConfigKey.Memory]: true,
			[CopilotCliConfigKey.LocalMemory]: true,
			[CopilotCliConfigKey.AutoModeTierOverride]: 'intelligence',
			[CopilotCliConfigKey.ModelCapabilityOverrides]: capabilityOverrides,
			[CopilotCliConfigKey.EnableShellInitScript]: true,
		});
	});

	test('forwards only the keys an older host advertises', async () => {
		const { agentHostService } = setup(disposables, {
			[AgentHostCopilotSdkLogLevelSettingId]: 'trace',
			[AgentHostOpus48PromptEnabledSettingId]: true,
		});
		agentHostService.setRootState(makeRootStateWithSchema({
			[CopilotCliConfigKey.Opus48Prompt]: { type: 'boolean', title: 'Opus 4.8 Agent Prompt' },
		}));
		await flush();

		assert.strictEqual(agentHostService.dispatchedActions.length, 1);
		assert.deepStrictEqual((agentHostService.dispatchedActions[0].action as IRootConfigChangedAction).config, {
			[CopilotCliConfigKey.Opus48Prompt]: true,
		});
	});

	test('forwards the local index default and subsequent setting changes', async () => {
		const { agentHostService, configurationService } = setup(disposables, {});
		agentHostService.setRootState(makeRootStateWithSchema({
			[CopilotCliConfigKey.LocalIndexEnabled]: fullSchema[CopilotCliConfigKey.LocalIndexEnabled],
		}));
		await flush();

		for (const value of [false, true]) {
			await configurationService.setUserConfiguration(CopilotLocalIndexEnabledSettingId, value);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([CopilotLocalIndexEnabledSettingId]),
				change: { keys: [CopilotLocalIndexEnabledSettingId], overrides: [] },
				affectsConfiguration: key => key === CopilotLocalIndexEnabledSettingId,
			});
			await flush();
		}

		assert.deepStrictEqual(agentHostService.dispatchedActions.map(a => (a.action as IRootConfigChangedAction).config), [
			{ [CopilotCliConfigKey.LocalIndexEnabled]: true },
			{ [CopilotCliConfigKey.LocalIndexEnabled]: false },
			{ [CopilotCliConfigKey.LocalIndexEnabled]: true },
		]);
	});

	test('disables HydraFusion when preview features are disabled', async () => {
		const { agentHostService, defaultAccountService } = setup(disposables, {
			[AgentHostHydraFusionEnabledSettingId]: true,
		}, { chat_preview_features_enabled: false });
		agentHostService.setRootState(makeRootStateWithSchema({
			[CopilotCliConfigKey.HydraFusion]: fullSchema[CopilotCliConfigKey.HydraFusion],
		}));
		await flush();

		assert.deepStrictEqual((agentHostService.dispatchedActions[0].action as IRootConfigChangedAction).config, {
			[CopilotCliConfigKey.HydraFusion]: false,
		});

		agentHostService.dispatchedActions.length = 0;
		defaultAccountService.setPreviewFeaturesEnabled(true);
		await flush();

		assert.deepStrictEqual((agentHostService.dispatchedActions[0].action as IRootConfigChangedAction).config, {
			[CopilotCliConfigKey.HydraFusion]: true,
		});
	});

	test('forwards HydraFusion and its v2 version from the setting value when preview features are allowed', async () => {
		const hydraFusionSchema = {
			[CopilotCliConfigKey.HydraFusion]: fullSchema[CopilotCliConfigKey.HydraFusion],
			[CopilotCliConfigKey.HydraFusionV2]: fullSchema[CopilotCliConfigKey.HydraFusionV2],
		};
		const forwarded = async (value: unknown, previewFeaturesEnabled = true, ensemble = false) => {
			const { agentHostService } = setup(disposables, { [AgentHostHydraFusionEnabledSettingId]: value, [AgentHostEnsembleEnabledSettingId]: ensemble }, { chat_preview_features_enabled: previewFeaturesEnabled });
			agentHostService.setRootState(makeRootStateWithSchema(hydraFusionSchema));
			await flush();
			const config: Record<string, unknown> = Object.assign({}, ...agentHostService.dispatchedActions.map(a => (a.action as IRootConfigChangedAction).config));
			return `${config[CopilotCliConfigKey.HydraFusion]}/${config[CopilotCliConfigKey.HydraFusionV2]}`;
		};

		assert.deepStrictEqual({
			v1: await forwarded(true),
			v2: await forwarded('v2'),
			disabled: await forwarded(false),
			unknown: await forwarded('v3'),
			v2PreviewFeaturesDisabled: await forwarded('v2', false),
			v1WithEnsemble: await forwarded(true, true, true),
			disabledWithEnsemble: await forwarded(false, true, true),
		}, {
			v1: 'true/false',
			v2: 'true/true',
			disabled: 'false/false',
			unknown: 'false/false',
			v2PreviewFeaturesDisabled: 'false/false',
			v1WithEnsemble: 'true/true',
			disabledWithEnsemble: 'true/true',
		});
	});

	test('forwards Ensemble and its Intelligence routing', async () => {
		const ensembleSchema = {
			[CopilotCliConfigKey.Ensemble]: fullSchema[CopilotCliConfigKey.Ensemble],
			[CopilotCliConfigKey.EnsembleIntelligenceUsesHydraFusion]: fullSchema[CopilotCliConfigKey.EnsembleIntelligenceUsesHydraFusion],
		};
		const forwarded = async (settings: Record<string, unknown>, previewFeaturesEnabled = true) => {
			const { agentHostService } = setup(disposables, settings, { chat_preview_features_enabled: previewFeaturesEnabled });
			agentHostService.setRootState(makeRootStateWithSchema(ensembleSchema));
			await flush();
			const config: Record<string, unknown> = Object.assign({}, ...agentHostService.dispatchedActions.map(a => (a.action as IRootConfigChangedAction).config));
			return `${config[CopilotCliConfigKey.Ensemble]}/${config[CopilotCliConfigKey.EnsembleIntelligenceUsesHydraFusion]}`;
		};
		assert.deepStrictEqual({
			off: await forwarded({}),
			ensemble: await forwarded({ [AgentHostEnsembleEnabledSettingId]: true }),
			routing: await forwarded({ [AgentHostEnsembleEnabledSettingId]: true, [AgentHostEnsembleIntelligenceUsesHydraFusionSettingId]: true }),
			previewFeaturesDisabled: await forwarded({ [AgentHostEnsembleEnabledSettingId]: true, [AgentHostEnsembleIntelligenceUsesHydraFusionSettingId]: true }, false),
		}, {
			off: 'false/false',
			ensemble: 'true/false',
			routing: 'true/true',
			previewFeaturesDisabled: 'false/false',
		});
	});

	test('forwards Copilot Memory and local memory only when opted in and preview features are allowed', async () => {
		const memorySchema = {
			[CopilotCliConfigKey.Memory]: fullSchema[CopilotCliConfigKey.Memory],
			[CopilotCliConfigKey.LocalMemory]: fullSchema[CopilotCliConfigKey.LocalMemory],
		};
		const mergedConfig = (service: MockAgentHostService) => Object.assign({}, ...service.dispatchedActions.map(a => (a.action as IRootConfigChangedAction).config));
		const { agentHostService: defaultHost } = setup(disposables, {});
		defaultHost.setRootState(makeRootStateWithSchema(memorySchema, {
			[CopilotCliConfigKey.Memory]: true,
			[CopilotCliConfigKey.LocalMemory]: true,
		}));
		const { agentHostService, defaultAccountService } = setup(disposables, {
			[AgentHostCopilotMemoryEnabledSettingId]: true,
			[AgentHostCopilotLocalMemoryEnabledSettingId]: true,
		}, { chat_preview_features_enabled: false });
		agentHostService.setRootState(makeRootStateWithSchema(memorySchema));
		await flush();
		const policyDisabled = mergedConfig(agentHostService);

		agentHostService.dispatchedActions.length = 0;
		defaultAccountService.setPreviewFeaturesEnabled(true);
		await flush();

		assert.deepStrictEqual({
			defaultOff: mergedConfig(defaultHost),
			policyDisabled,
			policyEnabled: mergedConfig(agentHostService),
		}, {
			defaultOff: { [CopilotCliConfigKey.Memory]: false, [CopilotCliConfigKey.LocalMemory]: false },
			policyDisabled: { [CopilotCliConfigKey.Memory]: false, [CopilotCliConfigKey.LocalMemory]: false },
			policyEnabled: { [CopilotCliConfigKey.Memory]: true, [CopilotCliConfigKey.LocalMemory]: true },
		});
	});

	test('forwards the on-device model settings and recomputes the account gate', async () => {
		const localModelSchema: Record<string, ConfigPropertySchema> = {
			[CopilotCliConfigKey.LocalModelEnabled]: { type: 'boolean', title: 'On-Device Models' },
			[CopilotCliConfigKey.LocalModelUseInAuto]: { type: 'boolean', title: 'Use On-Device Model in Auto' },
			[CopilotCliConfigKey.LocalModelLlamaServerPath]: { type: 'string', title: 'llama-server Path' },
			[CopilotCliConfigKey.LocalModelAccountGate]: { type: 'boolean', title: 'On-Device Models Allowed for Account' },
		};
		const mergedConfig = (service: MockAgentHostService) => Object.assign({}, ...service.dispatchedActions.map(a => (a.action as IRootConfigChangedAction).config));
		const { agentHostService, defaultAccountService, contextKeyService } = setup(disposables, {
			// Use in Auto is not set: it is forwarded as off.
			[LocalModelEnabledSettingId]: true,
			[LocalModelLlamaServerPathSettingId]: '  /opt/llama/llama-server ',
		});
		agentHostService.setRootState(makeRootStateWithSchema(localModelSchema));
		await flush();
		const signedOut = mergedConfig(agentHostService);

		agentHostService.dispatchedActions.length = 0;
		defaultAccountService.setDefaultAccount({ authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false }, accountName: 'octocat', sessionId: 's1', enterprise: false });
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		await flush();
		const signedIn = mergedConfig(agentHostService);

		agentHostService.dispatchedActions.length = 0;
		defaultAccountService.setPreviewFeaturesEnabled(false);
		await flush();

		assert.deepStrictEqual({ signedOut, signedIn, previewDisabled: mergedConfig(agentHostService) }, {
			signedOut: {
				[CopilotCliConfigKey.LocalModelEnabled]: true,
				[CopilotCliConfigKey.LocalModelUseInAuto]: false,
				[CopilotCliConfigKey.LocalModelLlamaServerPath]: '/opt/llama/llama-server',
				[CopilotCliConfigKey.LocalModelAccountGate]: false,
			},
			signedIn: {
				[CopilotCliConfigKey.LocalModelAccountGate]: true,
			},
			previewDisabled: {
				[CopilotCliConfigKey.LocalModelAccountGate]: false,
			},
		});
	});

	test('does not dispatch to a host whose schema does not advertise any key', async () => {
		const { agentHostService } = setup(disposables, {
			[AgentHostCopilotSdkLogLevelSettingId]: 'trace',
			[AgentHostOpus48PromptEnabledSettingId]: true,
		});
		agentHostService.setRootState(makeRootStateWithSchema({}));
		await flush();

		assert.deepStrictEqual(agentHostService.dispatchedActions as readonly unknown[], []);
	});

	test('does not re-dispatch when the root config already carries structurally equal values', async () => {
		const { agentHostService } = setup(disposables, {
			[AgentHostCopilotSdkLogLevelSettingId]: 'trace',
			[AgentHostOpus48PromptEnabledSettingId]: true,
			[AgentHostCopilotModelCapabilityOverridesSettingId]: { 'preview-model-x': { family: 'claude-opus-4-8' } },
		});
		agentHostService.setRootState(makeRootStateWithSchema(fullSchema, {
			[CopilotCliConfigKey.CopilotSdkLogLevel]: 'trace',
			[CopilotCliConfigKey.Opus48Prompt]: true,
			[CopilotCliConfigKey.StabilityOrderedPrompt]: false,
			[CopilotCliConfigKey.ClaudeAdvisor]: false,
			[CopilotCliConfigKey.Tgrep]: false,
			[CopilotCliConfigKey.SearchSubagent]: false,
			[CopilotCliConfigKey.LocalIndexEnabled]: true,
			[CopilotCliConfigKey.ToolSearchEnabled]: false,
			[CopilotCliConfigKey.ToolSearchDeferThreshold]: 1,
			[CopilotCliConfigKey.HydraFusion]: false,
			[CopilotCliConfigKey.HydraFusionV2]: false,
			[CopilotCliConfigKey.Ensemble]: false,
			[CopilotCliConfigKey.EnsembleIntelligenceUsesHydraFusion]: false,
			[CopilotCliConfigKey.Memory]: false,
			[CopilotCliConfigKey.LocalMemory]: false,
			[CopilotCliConfigKey.AutoModeTierOverride]: '',
			[CopilotCliConfigKey.ModelCapabilityOverrides]: { 'preview-model-x': { family: 'claude-opus-4-8' } },
			[CopilotCliConfigKey.EnableShellInitScript]: false,
		}));
		await flush();

		assert.deepStrictEqual(agentHostService.dispatchedActions as readonly unknown[], []);
	});
});
