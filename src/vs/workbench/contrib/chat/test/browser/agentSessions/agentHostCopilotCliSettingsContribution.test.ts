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
import { AgentHostCopilotExecutionSubagentEnabledSettingId, AgentHostCopilotExecutionSubagentModelSettingId, AgentHostCopilotLocalMemoryEnabledSettingId, AgentHostCopilotMemoryEnabledSettingId, AgentHostCopilotModelCapabilityOverridesSettingId, AgentHostCopilotSdkLogLevelSettingId, AgentHostDynamicAutoTiersEnabledSettingId, AgentHostHydraFusionEnabledSettingId, AgentHostOpus48PromptEnabledSettingId, CopilotSearchSubagentEnabledSettingId, CopilotSearchSubagentModelSettingId, CopilotExploreAgentEnabledSettingId, AgentHostShellToolInitScriptEnabledSettingId, CopilotStabilityOrderedPromptEnabledSettingId, AgentHostToolSearchDeferThresholdSettingId, AgentHostToolSearchEnabledSettingId, CopilotClaudeAdvisorEnabledSettingId, CopilotCliConfigKey, CopilotLocalIndexEnabledSettingId } from '../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { ClientAnnotationsAction, INotification, IRootConfigChangedAction, SessionAction, TerminalAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import type { ConfigPropertySchema, RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ConfigurationTarget, IConfigurationService, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
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
	[CopilotCliConfigKey.SearchSubagent]: { type: 'boolean', title: 'Search Subagent' },
	[CopilotCliConfigKey.SearchSubagentModel]: { type: 'string', title: 'Search Subagent Model' },
	[CopilotCliConfigKey.ExploreAgent]: { type: 'boolean', title: 'Explore Agent' },
	[CopilotCliConfigKey.ExecutionSubagent]: { type: 'boolean', title: 'Runtime Execution Subagent' },
	[CopilotCliConfigKey.ExecutionSubagentModel]: { type: 'string', title: 'Runtime Execution Subagent Model' },
	[CopilotCliConfigKey.ExecutionSubagentDefaultControlled]: { type: 'boolean', title: 'Runtime Execution Subagent Default Control' },
	[CopilotCliConfigKey.ExecutionSubagentModelDefaultControlled]: { type: 'boolean', title: 'Runtime Execution Subagent Model Default Control' },
	[CopilotCliConfigKey.LocalIndexEnabled]: { type: 'boolean', title: 'Local Session Index' },
	[CopilotCliConfigKey.ToolSearchEnabled]: { type: 'boolean', title: 'Agent Host Tool Search' },
	[CopilotCliConfigKey.ToolSearchDeferThreshold]: { type: 'number', title: 'Tool Search Defer Threshold' },
	[CopilotCliConfigKey.HydraFusion]: { type: 'boolean', title: 'HydraFusion' },
	[CopilotCliConfigKey.HydraFusionV2]: { type: 'boolean', title: 'HydraFusion V2' },
	[CopilotCliConfigKey.HydraFusionMultiRoot]: { type: 'boolean', title: 'HydraFusion Multi-Root' },
	[CopilotCliConfigKey.DynamicAutoTiers]: { type: 'boolean', title: 'Dynamic Auto Tiers' },
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

function setup(disposables: DisposableStore, settings: Record<string, unknown>, policyData: IPolicyData | null = null, configurationService = new TestConfigurationService(settings)) {
	const instantiationService = disposables.add(new TestInstantiationService());
	const agentHostService = new MockAgentHostService();
	const defaultAccountService = new MockDefaultAccountService(policyData);
	disposables.add({ dispose: () => agentHostService.dispose() });
	disposables.add({ dispose: () => defaultAccountService.dispose() });
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
			[CopilotSearchSubagentEnabledSettingId]: true,
			[CopilotSearchSubagentModelSettingId]: 'gpt-5',
			[CopilotExploreAgentEnabledSettingId]: false,
			[AgentHostCopilotExecutionSubagentEnabledSettingId]: true,
			[AgentHostCopilotExecutionSubagentModelSettingId]: ' exec-agent-b ',
			[CopilotLocalIndexEnabledSettingId]: false,
			[AgentHostToolSearchEnabledSettingId]: true,
			[AgentHostToolSearchDeferThresholdSettingId]: 5.9,
			[AgentHostCopilotModelCapabilityOverridesSettingId]: capabilityOverrides,
			[AgentHostHydraFusionEnabledSettingId]: 'multiRoot',
			[AgentHostDynamicAutoTiersEnabledSettingId]: true,
			[AgentHostCopilotMemoryEnabledSettingId]: true,
			[AgentHostCopilotLocalMemoryEnabledSettingId]: true,
			'github.copilot.chat.autoModeTierOverride': 'intelligence',
			[AgentHostShellToolInitScriptEnabledSettingId]: true,
		});
		agentHostService.setRootState(makeRootStateWithSchema(fullSchema));
		await flush();

		// The shared forwarder dispatches one RootConfigChanged per key; merge them
		// and assert the full forwarded set (order-independent). Dynamic Auto Tiers
		// is mirrored by the protocol client to every host rather than by this local-only forwarder.
		assert.strictEqual(agentHostService.dispatchedActions.length, 22);
		const merged = Object.assign({}, ...agentHostService.dispatchedActions.map(a => (a.action as IRootConfigChangedAction).config));
		assert.deepStrictEqual(merged, {
			[CopilotCliConfigKey.CopilotSdkLogLevel]: 'trace',
			[CopilotCliConfigKey.Opus48Prompt]: true,
			[CopilotCliConfigKey.StabilityOrderedPrompt]: true,
			[CopilotCliConfigKey.ClaudeAdvisor]: true,
			[CopilotCliConfigKey.SearchSubagent]: true,
			[CopilotCliConfigKey.SearchSubagentModel]: 'gpt-5',
			[CopilotCliConfigKey.ExploreAgent]: false,
			[CopilotCliConfigKey.ExecutionSubagent]: true,
			[CopilotCliConfigKey.ExecutionSubagentModel]: 'exec-agent-b',
			[CopilotCliConfigKey.ExecutionSubagentDefaultControlled]: false,
			[CopilotCliConfigKey.ExecutionSubagentModelDefaultControlled]: false,
			[CopilotCliConfigKey.LocalIndexEnabled]: false,
			[CopilotCliConfigKey.ToolSearchEnabled]: true,
			[CopilotCliConfigKey.ToolSearchDeferThreshold]: 5,
			[CopilotCliConfigKey.HydraFusion]: true,
			[CopilotCliConfigKey.HydraFusionV2]: true,
			[CopilotCliConfigKey.HydraFusionMultiRoot]: true,
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

	test('forwards runtime execution settings and resets independently of the extension-native setting', async () => {
		const { agentHostService, configurationService } = setup(disposables, {
			'github.copilot.chat.executionSubagent.enabled': true,
			'github.copilot.chat.executionSubagent.model': 'extension-model',
		});
		agentHostService.setRootState(makeRootStateWithSchema({
			[CopilotCliConfigKey.ExecutionSubagent]: fullSchema[CopilotCliConfigKey.ExecutionSubagent],
			[CopilotCliConfigKey.ExecutionSubagentModel]: fullSchema[CopilotCliConfigKey.ExecutionSubagentModel],
		}));
		await flush();

		for (const [settingId, value] of [
			[AgentHostCopilotExecutionSubagentEnabledSettingId, true],
			[AgentHostCopilotExecutionSubagentModelSettingId, ' exec-agent-b '],
			[AgentHostCopilotExecutionSubagentModelSettingId, '   '],
			[AgentHostCopilotExecutionSubagentEnabledSettingId, false],
		] as const) {
			await configurationService.setUserConfiguration(settingId, value);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([settingId]),
				change: { keys: [settingId], overrides: [] },
				affectsConfiguration: key => key === settingId,
			});
			await flush();
		}

		assert.deepStrictEqual(agentHostService.dispatchedActions.map(a => (a.action as IRootConfigChangedAction).config), [
			{ [CopilotCliConfigKey.ExecutionSubagent]: false },
			{ [CopilotCliConfigKey.ExecutionSubagentModel]: 'gpt-5.6-luna' },
			{ [CopilotCliConfigKey.ExecutionSubagent]: true },
			{ [CopilotCliConfigKey.ExecutionSubagentModel]: 'exec-agent-b' },
			{ [CopilotCliConfigKey.ExecutionSubagentModel]: '' },
			{ [CopilotCliConfigKey.ExecutionSubagent]: false },
		]);
	});

	test('forwards default provenance independently for execution settings, including overrides equal to defaults', async () => {
		const results: Record<string, Record<string, unknown>> = {};
		for (const settingId of [AgentHostCopilotExecutionSubagentEnabledSettingId, AgentHostCopilotExecutionSubagentModelSettingId]) {
			for (const scope of [undefined, 'applicationValue', 'userValue', 'policyValue', 'memoryValue'] as const) {
				const configurationService = new class extends TestConfigurationService {
					override inspect<T>(key: string): IConfigurationValue<T> {
						const value = this.getValue<T>(key);
						return {
							value,
							defaultValue: value,
							...(key === settingId && scope ? { [scope]: value } : {}),
						};
					}
				}({
					[AgentHostCopilotExecutionSubagentEnabledSettingId]: false,
					[AgentHostCopilotExecutionSubagentModelSettingId]: 'gpt-5.6-luna',
				});
				const { agentHostService } = setup(disposables, {}, null, configurationService);
				agentHostService.setRootState(makeRootStateWithSchema({
					[CopilotCliConfigKey.ExecutionSubagentDefaultControlled]: fullSchema[CopilotCliConfigKey.ExecutionSubagentDefaultControlled],
					[CopilotCliConfigKey.ExecutionSubagentModelDefaultControlled]: fullSchema[CopilotCliConfigKey.ExecutionSubagentModelDefaultControlled],
				}));
				await flush();
				results[`${settingId}:${scope ?? 'default'}`] = Object.assign({}, ...agentHostService.dispatchedActions.map(a => (a.action as IRootConfigChangedAction).config));
			}
		}

		const expected: Record<string, Record<string, unknown>> = {};
		for (const settingId of [AgentHostCopilotExecutionSubagentEnabledSettingId, AgentHostCopilotExecutionSubagentModelSettingId]) {
			for (const scope of ['default', 'applicationValue', 'userValue', 'policyValue', 'memoryValue']) {
				expected[`${settingId}:${scope}`] = {
					[CopilotCliConfigKey.ExecutionSubagentDefaultControlled]: scope === 'default' || settingId !== AgentHostCopilotExecutionSubagentEnabledSettingId,
					[CopilotCliConfigKey.ExecutionSubagentModelDefaultControlled]: scope === 'default' || settingId !== AgentHostCopilotExecutionSubagentModelSettingId,
				};
			}
		}
		assert.deepStrictEqual(results, expected);
	});

	test('updates execution setting provenance when an explicit override is added and removed', async () => {
		const { agentHostService, configurationService } = setup(disposables, {});
		agentHostService.setRootState(makeRootStateWithSchema({
			[CopilotCliConfigKey.ExecutionSubagentDefaultControlled]: fullSchema[CopilotCliConfigKey.ExecutionSubagentDefaultControlled],
			[CopilotCliConfigKey.ExecutionSubagentModelDefaultControlled]: fullSchema[CopilotCliConfigKey.ExecutionSubagentModelDefaultControlled],
		}));
		await flush();
		for (const [settingId, value] of [
			[AgentHostCopilotExecutionSubagentEnabledSettingId, false],
			[AgentHostCopilotExecutionSubagentModelSettingId, ''],
			[AgentHostCopilotExecutionSubagentEnabledSettingId, undefined],
			[AgentHostCopilotExecutionSubagentModelSettingId, undefined],
		] as const) {
			await configurationService.setUserConfiguration(settingId, value);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([settingId]),
				change: { keys: [settingId], overrides: [] },
				affectsConfiguration: key => key === settingId,
			});
			await flush();
		}
		assert.deepStrictEqual(agentHostService.dispatchedActions.map(a => (a.action as IRootConfigChangedAction).config), [
			{ [CopilotCliConfigKey.ExecutionSubagentDefaultControlled]: true },
			{ [CopilotCliConfigKey.ExecutionSubagentModelDefaultControlled]: true },
			{ [CopilotCliConfigKey.ExecutionSubagentDefaultControlled]: false },
			{ [CopilotCliConfigKey.ExecutionSubagentModelDefaultControlled]: false },
			{ [CopilotCliConfigKey.ExecutionSubagentDefaultControlled]: true },
			{ [CopilotCliConfigKey.ExecutionSubagentModelDefaultControlled]: true },
		]);
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

	test('forwards search and Explore defaults and subsequent setting changes independently', async () => {
		const { agentHostService, configurationService } = setup(disposables, {});
		agentHostService.setRootState(makeRootStateWithSchema({
			[CopilotCliConfigKey.SearchSubagent]: fullSchema[CopilotCliConfigKey.SearchSubagent],
			[CopilotCliConfigKey.SearchSubagentModel]: fullSchema[CopilotCliConfigKey.SearchSubagentModel],
			[CopilotCliConfigKey.ExploreAgent]: fullSchema[CopilotCliConfigKey.ExploreAgent],
		}));
		await flush();

		for (const [setting, value] of [
			[CopilotSearchSubagentEnabledSettingId, true],
			[CopilotSearchSubagentModelSettingId, 'gpt-5'],
			[CopilotExploreAgentEnabledSettingId, false],
			[CopilotSearchSubagentModelSettingId, ''],
			[CopilotExploreAgentEnabledSettingId, true],
			[CopilotSearchSubagentEnabledSettingId, false],
		] as const) {
			await configurationService.setUserConfiguration(setting, value);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([setting]),
				change: { keys: [setting], overrides: [] },
				affectsConfiguration: key => key === setting,
			});
			await flush();
		}

		assert.deepStrictEqual(agentHostService.dispatchedActions.map(a => (a.action as IRootConfigChangedAction).config), [
			{ [CopilotCliConfigKey.SearchSubagent]: false },
			{ [CopilotCliConfigKey.SearchSubagentModel]: '' },
			{ [CopilotCliConfigKey.ExploreAgent]: true },
			{ [CopilotCliConfigKey.SearchSubagent]: true },
			{ [CopilotCliConfigKey.SearchSubagentModel]: 'gpt-5' },
			{ [CopilotCliConfigKey.ExploreAgent]: false },
			{ [CopilotCliConfigKey.SearchSubagentModel]: '' },
			{ [CopilotCliConfigKey.ExploreAgent]: true },
			{ [CopilotCliConfigKey.SearchSubagent]: false },
		]);
	});

	test('does not gate HydraFusion on the preview-features policy', async () => {
		const { agentHostService, defaultAccountService } = setup(disposables, {
			[AgentHostHydraFusionEnabledSettingId]: true,
		}, { chat_preview_features_enabled: false });
		agentHostService.setRootState(makeRootStateWithSchema({
			[CopilotCliConfigKey.HydraFusion]: fullSchema[CopilotCliConfigKey.HydraFusion],
		}));
		await flush();
		const previewDisabled = agentHostService.dispatchedActions.map(a => (a.action as IRootConfigChangedAction).config);

		agentHostService.dispatchedActions.length = 0;
		defaultAccountService.setPreviewFeaturesEnabled(true);
		await flush();

		assert.deepStrictEqual({ previewDisabled, afterPolicyChange: agentHostService.dispatchedActions.length }, {
			previewDisabled: [{ [CopilotCliConfigKey.HydraFusion]: true }],
			afterPolicyChange: 0,
		});
	});

	test('forwards HydraFusion, its v2 version, and multi-root from the setting value regardless of preview features', async () => {
		const hydraFusionSchema = {
			[CopilotCliConfigKey.HydraFusion]: fullSchema[CopilotCliConfigKey.HydraFusion],
			[CopilotCliConfigKey.HydraFusionV2]: fullSchema[CopilotCliConfigKey.HydraFusionV2],
			[CopilotCliConfigKey.HydraFusionMultiRoot]: fullSchema[CopilotCliConfigKey.HydraFusionMultiRoot],
		};
		const forwarded = async (value: unknown, previewFeaturesEnabled = true) => {
			const { agentHostService } = setup(disposables, { [AgentHostHydraFusionEnabledSettingId]: value }, { chat_preview_features_enabled: previewFeaturesEnabled });
			agentHostService.setRootState(makeRootStateWithSchema(hydraFusionSchema));
			await flush();
			const config: Record<string, unknown> = Object.assign({}, ...agentHostService.dispatchedActions.map(a => (a.action as IRootConfigChangedAction).config));
			return `${config[CopilotCliConfigKey.HydraFusion]}/${config[CopilotCliConfigKey.HydraFusionV2]}/${config[CopilotCliConfigKey.HydraFusionMultiRoot]}`;
		};

		assert.deepStrictEqual({
			v1: await forwarded(true),
			v2: await forwarded('v2'),
			multiRoot: await forwarded('multiRoot'),
			disabled: await forwarded(false),
			unknown: await forwarded('v3'),
			v2PreviewFeaturesDisabled: await forwarded('v2', false),
			multiRootPreviewFeaturesDisabled: await forwarded('multiRoot', false),
		}, {
			v1: 'true/false/false',
			v2: 'true/true/false',
			multiRoot: 'true/true/true',
			disabled: 'false/false/false',
			unknown: 'false/false/false',
			v2PreviewFeaturesDisabled: 'true/true/false',
			multiRootPreviewFeaturesDisabled: 'true/true/true',
		});
	});

	test('forwards Copilot Memory regardless of preview policy, and local memory only when preview features are allowed', async () => {
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
			policyDisabled: { [CopilotCliConfigKey.Memory]: true, [CopilotCliConfigKey.LocalMemory]: false },
			policyEnabled: { [CopilotCliConfigKey.LocalMemory]: true },
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

	test('does not forward the removed tgrep setting to a legacy host', async () => {
		const { agentHostService } = setup(disposables, {
			'chat.copilot.tgrep.enabled': false,
		});
		agentHostService.setRootState(makeRootStateWithSchema({
			tgrep: { type: 'boolean', title: 'Indexed Search (tgrep)' },
		}));
		await flush();

		assert.deepStrictEqual(agentHostService.dispatchedActions, []);
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
			[CopilotCliConfigKey.SearchSubagent]: false,
			[CopilotCliConfigKey.SearchSubagentModel]: '',
			[CopilotCliConfigKey.ExploreAgent]: true,
			[CopilotCliConfigKey.ExecutionSubagent]: false,
			[CopilotCliConfigKey.ExecutionSubagentModel]: 'gpt-5.6-luna',
			[CopilotCliConfigKey.ExecutionSubagentDefaultControlled]: true,
			[CopilotCliConfigKey.ExecutionSubagentModelDefaultControlled]: true,
			[CopilotCliConfigKey.LocalIndexEnabled]: true,
			[CopilotCliConfigKey.ToolSearchEnabled]: false,
			[CopilotCliConfigKey.ToolSearchDeferThreshold]: 1,
			[CopilotCliConfigKey.HydraFusion]: false,
			[CopilotCliConfigKey.HydraFusionV2]: false,
			[CopilotCliConfigKey.HydraFusionMultiRoot]: false,
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
