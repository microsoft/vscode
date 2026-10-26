/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { AgentHostAllowSignedOutWhenUsableSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostConfigKey } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution } from '../../../../../../workbench/common/contributions.js';
import { AgentHostRootConfigForwarder, type IForwardedRootConfigKey } from './agentHostRootConfigForwarder.js';

/**
 * Forwards the `chat.agentHost.allowSignedOutWhenUsable` experimentation opt-in
 * into the **local** agent host's root config under the short key
 * {@link AgentHostConfigKey.AllowSignedOutWhenUsable}. This closes the two-reader
 * contract: the workbench reads the VS Code setting directly, while the node-side
 * Layer 1 gate reads the root-config bag (keyed only by short keys), so the flag
 * must be mirrored here or the node side would never see it. Gated on
 * Agent Host runtime availability. The schema-gate / hydration-retry / loop-guard
 * machinery lives in the shared {@link AgentHostRootConfigForwarder}; this
 * contribution only declares the key.
 */
export class AgentHostAllowSignedOutWhenUsableContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostAllowSignedOutWhenUsable';

	private readonly _forwarder: AgentHostRootConfigForwarder;

	constructor(
		@IAgentHostService agentHostService: IAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAgentHostEnablementService private readonly _agentHostEnablementService: IAgentHostEnablementService,
	) {
		super();

		const keys: readonly IForwardedRootConfigKey[] = [
			{
				key: AgentHostConfigKey.AllowSignedOutWhenUsable,
				computeValue: () => this._configurationService.getValue<boolean>(AgentHostAllowSignedOutWhenUsableSettingId) === true,
				registerTriggers: (store, push) => {
					const optInChanged = Event.filter(this._configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(AgentHostAllowSignedOutWhenUsableSettingId), store);
					store.add(optInChanged(() => push()));
				},
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
}
