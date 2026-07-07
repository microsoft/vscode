/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { isObject } from '../../../../../../base/common/types.js';
import { AgentHostEnabledSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostModelCapabilityOverridesSettingId, AgentHostOpus48PromptEnabledSettingId, AgentHostReasoningEffortOverrideSettingId, CopilotCliConfigKey, type CopilotCliModelCapabilityOverrides } from '../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution } from '../../../../../../workbench/common/contributions.js';
import { AgentHostRootConfigForwarder, type IForwardedRootConfigKey } from './agentHostRootConfigForwarder.js';

/**
 * Forwards the Copilot-CLI experimentation settings (Opus 4.8 prompt opt-in,
 * reasoning-effort override, per-model family-alias overrides) into the
 * **local** agent host's root config so `CopilotSessionLauncher` can read them
 * at session launch. Gated on `chat.agentHost.enabled`. The schema-gate /
 * hydration-retry / loop-guard machinery lives in the shared
 * {@link AgentHostRootConfigForwarder}; this contribution only declares the keys.
 */
export class AgentHostCopilotCliSettingsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostCopilotCliSettings';

	private readonly _forwarder: AgentHostRootConfigForwarder;

	constructor(
		@IAgentHostService agentHostService: IAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		const keys: readonly IForwardedRootConfigKey[] = [
			{
				key: CopilotCliConfigKey.Opus48Prompt,
				computeValue: () => this._configurationService.getValue<boolean>(AgentHostOpus48PromptEnabledSettingId) === true,
				registerTriggers: (store, push) => this._pushOnSettingChange(store, push, AgentHostOpus48PromptEnabledSettingId),
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

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AgentHostEnabledSettingId)) {
				this._updateEnabled();
			}
		}));
		this._updateEnabled();
	}

	private _updateEnabled(): void {
		if (this._configurationService.getValue<boolean>(AgentHostEnabledSettingId)) {
			this._forwarder.start();
		} else {
			this._forwarder.stop();
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
