/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../../base/common/network.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { AgentHostConfigKey, type IAutomationClientPluginConfigEntry } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { isContributionEnabled } from '../../../common/enablement.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { AgentHostRootConfigForwarder, type IForwardedRootConfigKey } from './agentHostRootConfigForwarder.js';

export class AgentHostAutomationPluginsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostAutomationPlugins';

	private readonly _forwarder: AgentHostRootConfigForwarder;
	private readonly _nonceGeneration = Date.now().toString(16);
	private _revision = 0;

	constructor(
		@IAgentHostService agentHostService: IAgentHostService,
		@IAgentHostEnablementService agentHostEnablementService: IAgentHostEnablementService,
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
	) {
		super();

		const keys: readonly IForwardedRootConfigKey[] = [{
			key: AgentHostConfigKey.AutomationClientPlugins,
			computeValue: () => this._computePlugins(),
			registerTriggers: (store, push) => {
				store.add(autorun(reader => {
					for (const plugin of this._agentPluginService.plugins.read(reader)) {
						plugin.enablement.read(reader);
						plugin.version?.read(reader);
						plugin.hooks.read(reader);
						plugin.commands.read(reader);
						plugin.skills.read(reader);
						plugin.agents.read(reader);
						plugin.instructions.read(reader);
						plugin.mcpServerDefinitions.read(reader);
					}
					this._revision++;
					push();
				}));
			},
		}];
		this._forwarder = this._register(new AgentHostRootConfigForwarder(keys, agentHostService));

		this._register(autorun(reader => {
			if (agentHostEnablementService.enabled.read(reader)) {
				this._forwarder.start();
			} else {
				this._forwarder.stop();
			}
		}));
	}

	private _computePlugins(): readonly IAutomationClientPluginConfigEntry[] {
		return this._agentPluginService.plugins.get()
			.filter(plugin => plugin.uri.scheme === Schemas.file)
			.map(plugin => ({
				uri: plugin.uri.toString(),
				displayName: plugin.label,
				nonce: `${this._nonceGeneration}-${this._revision.toString(16)}`,
				enabled: isContributionEnabled(plugin.enablement.get()),
			}));
	}
}
