/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { AgentHostConfigKey, type IAutomationClientPluginConfigEntry } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { withCustomizationEnablement } from '../../../../../../platform/agentHost/common/customizationEnablement.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { CustomizationEnablementKind } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { AgentHostRootConfigForwarder, type IForwardedRootConfigKey } from './agentHostRootConfigForwarder.js';

export class AgentHostAutomationPluginsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostAutomationPlugins';

	private readonly _forwarder: AgentHostRootConfigForwarder;

	constructor(
		@IAgentHostService agentHostService: IAgentHostService,
		@IAgentHostEnablementService agentHostEnablementService: IAgentHostEnablementService,
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		const keys: readonly IForwardedRootConfigKey[] = [{
			key: AgentHostConfigKey.AutomationClientPlugins,
			computeValue: () => this._computePlugins(),
			dispatchWhenUnchanged: true,
			registerTriggers: (store, push) => {
				store.add(autorun(reader => {
					for (const plugin of this._agentPluginService.plugins.read(reader)) {
						this._agentPluginService.enablementModel.readProfileEnabled(plugin.uri.toString(), reader);
						plugin.policyBlocked?.read(reader);
						plugin.version?.read(reader);
						plugin.hooks.read(reader);
						plugin.commands.read(reader);
						plugin.skills.read(reader);
						plugin.agents.read(reader);
						plugin.instructions.read(reader);
						plugin.mcpServerDefinitions.read(reader);
					}
					push();
				}));
			},
		}];
		this._forwarder = this._register(new AgentHostRootConfigForwarder(keys, agentHostService));

		this._register(autorun(reader => {
			if (!environmentService.isSessionsWindow && agentHostEnablementService.enabled.read(reader)) {
				this._forwarder.start();
			} else {
				this._forwarder.stop();
			}
		}));
	}

	private _computePlugins(): readonly IAutomationClientPluginConfigEntry[] {
		return this._agentPluginService.plugins.get()
			.filter(plugin => plugin.uri.scheme === Schemas.file)
			.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()))
			.map(plugin => ({
				uri: plugin.uri.toString(),
				displayName: plugin.label,
				enablement: withCustomizationEnablement(undefined, CustomizationEnablementKind.Global, {
					kind: CustomizationEnablementKind.Global,
					enabled: !plugin.policyBlocked?.get() && this._agentPluginService.enablementModel.readProfileEnabled(plugin.uri.toString()),
				}),
			}));
	}
}
