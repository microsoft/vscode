/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { isObject } from '../../../../../../base/common/types.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { AgentHostCopilotSdkLogLevelSettingId, AgentHostModelCapabilityOverridesSettingId, AgentHostOpus48PromptEnabledSettingId, AgentHostReasoningEffortOverrideSettingId, AgentHostToolSearchEnabledSettingId, CopilotCliConfigKey, type CopilotCliModelCapabilityOverrides, type CopilotSdkLogLevelSetting } from '../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution } from '../../../../../../workbench/common/contributions.js';
import { AgentHostRootConfigForwarder, type IForwardedRootConfigKey } from './agentHostRootConfigForwarder.js';

/**
 * Forwards Copilot-CLI settings into the **local** agent host's root config so
 * `CopilotAgent` and `CopilotSessionLauncher` can read them. Gated on
 * `chat.agentHost.enabled`. The schema-gate / hydration-retry / loop-guard
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
				key: CopilotCliConfigKey.ReasoningEffortOverride,
				computeValue: () => {
					const value = this._configurationService.getValue<string>(AgentHostReasoningEffortOverrideSettingId);
					// '' is the schema's unset marker, so clearing the setting clears the override.
					return typeof value === 'string' ? value : '';
				},
				registerTriggers: (store, push) => this._pushOnSettingChange(store, push, AgentHostReasoningEffortOverrideSettingId),
			},
			{
				key: CopilotCliConfigKey.ModelCapabilityOverrides,
				computeValue: () => {
					const value = this._configurationService.getValue<CopilotCliModelCapabilityOverrides>(AgentHostModelCapabilityOverridesSettingId);
					return isObject(value) ? value : {};
				},
				registerTriggers: (store, push) => this._pushOnSettingChange(store, push, AgentHostModelCapabilityOverridesSettingId),
			},
		];
		this._forwarder = this._register(new AgentHostRootConfigForwarder(keys, agentHostService));

		if (this._agentHostEnablementService.enabled) {
			this._forwarder.start();
		}
	}

	private _pushOnSettingChange(store: DisposableStore, push: () => void, settingId: string): void {
		store.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(settingId)) {
				push();
			}
		}));
	}
}
