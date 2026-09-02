/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { isObject } from '../../../../../../base/common/types.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostAutoModeTiersEnabledSettingId, AgentHostCopilotModelCapabilityOverridesSettingId, AgentHostCopilotSdkLogLevelSettingId, AgentHostMultiTurnContextRoutingEnabledSettingId, AgentHostOpus48PromptEnabledSettingId, AgentHostReasoningSummaryEnabledSettingId, AgentHostShellToolInitScriptEnabledSettingId, AgentHostToolSearchDeferThresholdSettingId, AgentHostToolSearchEnabledSettingId, CopilotCliConfigKey, CopilotSubagentModelGuidanceEnabledSettingId, normalizeToolSearchDeferThreshold, type CopilotCliModelCapabilityOverrides, type CopilotSdkLogLevelSetting } from '../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution } from '../../../../../../workbench/common/contributions.js';
import { AgentHostRootConfigForwarder, type IForwardedRootConfigKey } from './agentHostRootConfigForwarder.js';

/**
 * Forwards Copilot-CLI settings into the **local** agent host's root config so
 * `CopilotAgent` and `CopilotSessionLauncher` can read them. Gated on
 * Agent Host runtime availability. The schema-gate / hydration-retry / loop-guard
 * machinery lives in the shared
 * {@link AgentHostRootConfigForwarder}; this contribution only declares the keys.
 */
export class AgentHostCopilotCliSettingsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostCopilotCliSettings';

	private readonly _forwarder: AgentHostRootConfigForwarder;

	constructor(
		@IAgentHostService agentHostService: IAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAgentHostEnablementService private readonly _agentHostEnablementService: IAgentHostEnablementService,
	) {
		super();

		const keys: readonly IForwardedRootConfigKey[] = [
			{
				key: CopilotCliConfigKey.CopilotSdkLogLevel,
				computeValue: () => this._configurationService.getValue<CopilotSdkLogLevelSetting>(AgentHostCopilotSdkLogLevelSettingId) ?? 'info',
				registerTriggers: (store, push) => this._pushOnSettingChange(store, push, AgentHostCopilotSdkLogLevelSettingId),
			},
			{
				key: CopilotCliConfigKey.Opus48Prompt,
				computeValue: () => this._configurationService.getValue<boolean>(AgentHostOpus48PromptEnabledSettingId) === true,
				registerTriggers: (store, push) => this._pushOnSettingChange(store, push, AgentHostOpus48PromptEnabledSettingId),
			},
			{
				key: CopilotCliConfigKey.ToolSearchEnabled,
				computeValue: () => this._configurationService.getValue<boolean>(AgentHostToolSearchEnabledSettingId) === true,
				registerTriggers: (store, push) => this._pushOnSettingChange(store, push, AgentHostToolSearchEnabledSettingId),
			},
			{
				key: CopilotCliConfigKey.ToolSearchDeferThreshold,
				computeValue: () => normalizeToolSearchDeferThreshold(this._configurationService.getValue<number>(AgentHostToolSearchDeferThresholdSettingId)),
				registerTriggers: (store, push) => this._pushOnSettingChange(store, push, AgentHostToolSearchDeferThresholdSettingId),
			},
			{
				key: CopilotCliConfigKey.ReasoningSummary,
				computeValue: () => this._configurationService.getValue<boolean>(AgentHostReasoningSummaryEnabledSettingId),
				registerTriggers: (store, push) => this._pushOnSettingChange(store, push, AgentHostReasoningSummaryEnabledSettingId),
			},
			{
				key: CopilotCliConfigKey.MultiTurnContextRouting,
				computeValue: () => this._configurationService.getValue<boolean>(AgentHostMultiTurnContextRoutingEnabledSettingId) === true,
				registerTriggers: (store, push) => this._pushOnSettingChange(store, push, AgentHostMultiTurnContextRoutingEnabledSettingId),
			},
			{
				key: CopilotCliConfigKey.AutoModeTiers,
				computeValue: () => this._configurationService.getValue<boolean>(AgentHostAutoModeTiersEnabledSettingId) === true,
				registerTriggers: (store, push) => this._pushOnSettingChange(store, push, AgentHostAutoModeTiersEnabledSettingId),
			},
			{
				key: CopilotCliConfigKey.SubagentModelGuidance,
				computeValue: () => this._configurationService.getValue<boolean>(CopilotSubagentModelGuidanceEnabledSettingId) === true,
				registerTriggers: (store, push) => this._pushOnSettingChange(store, push, CopilotSubagentModelGuidanceEnabledSettingId),
			},
			{
				key: CopilotCliConfigKey.ModelCapabilityOverrides,
				computeValue: () => {
					const value = this._configurationService.getValue<CopilotCliModelCapabilityOverrides>(AgentHostCopilotModelCapabilityOverridesSettingId);
					return isObject(value) ? value : {};
				},
				registerTriggers: (store, push) => this._pushOnSettingChange(store, push, AgentHostCopilotModelCapabilityOverridesSettingId),
			},
			{
				// The host applies a published shell init script only while this is
				// true. Like every forwarded key it is client-writable root config,
				// so it is the user's opt-in mirrored to the host, not authorization.
				key: CopilotCliConfigKey.EnableShellInitScript,
				computeValue: () => this._configurationService.getValue<boolean>(AgentHostShellToolInitScriptEnabledSettingId) === true,
				registerTriggers: (store, push) => this._pushOnSettingChange(store, push, AgentHostShellToolInitScriptEnabledSettingId),
			},
		];
		this._forwarder = this._register(new AgentHostRootConfigForwarder(keys, agentHostService));

		this._register(autorun(reader => {
			if (this._agentHostEnablementService.enabled.read(reader)) {
				this._forwarder.start();
			} else {
				this._forwarder.stop();
			}
		}));
	}

	private _pushOnSettingChange(store: DisposableStore, push: () => void, settingId: string): void {
		store.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(settingId)) {
				push();
			}
		}));
	}
}
