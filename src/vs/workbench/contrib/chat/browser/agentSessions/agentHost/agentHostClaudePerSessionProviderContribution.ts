/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { AgentHostClaudePerSessionProviderSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostConfigKey } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution } from '../../../../../../workbench/common/contributions.js';
import { AgentHostRootConfigForwarder, type IForwardedRootConfigKey } from './agentHostRootConfigForwarder.js';

/**
 * Forwards the `chat.agentHost.claude.perSessionProvider` experimentation opt-in
 * into the **local** agent host's root config under the short key
 * {@link AgentHostConfigKey.ClaudePerSessionProvider}. The node-side Claude
 * provider reads the root-config bag (keyed only by short keys) to decide whether
 * to merge both provider catalogs and route per session, so the setting must be
 * mirrored here or the node side would never see it. Gated on
 * `chat.agentHost.enabled`. The schema-gate / hydration-retry / loop-guard
 * machinery lives in the shared {@link AgentHostRootConfigForwarder}; this
 * contribution only declares the key. Mirrors
 * {@link AgentHostAllowSignedOutWhenUsableContribution}.
 */
export class AgentHostClaudePerSessionProviderContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostClaudePerSessionProvider';

	private readonly _forwarder: AgentHostRootConfigForwarder;

	constructor(
		@IAgentHostService agentHostService: IAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAgentHostEnablementService private readonly _agentHostEnablementService: IAgentHostEnablementService,
	) {
		super();

		const keys: readonly IForwardedRootConfigKey[] = [
			{
				key: AgentHostConfigKey.ClaudePerSessionProvider,
				computeValue: () => this._configurationService.getValue<boolean>(AgentHostClaudePerSessionProviderSettingId) === true,
				registerTriggers: (store, push) => {
					const optInChanged = Event.filter(this._configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(AgentHostClaudePerSessionProviderSettingId), store);
					store.add(optInChanged(() => push()));
				},
			},
		];
		this._forwarder = this._register(new AgentHostRootConfigForwarder(keys, agentHostService));

		this._register(autorun(reader => {
			if (this._agentHostEnablementService.enabled.read(reader)) {
				this._forwarder.start();
			}
		}));
	}
}
