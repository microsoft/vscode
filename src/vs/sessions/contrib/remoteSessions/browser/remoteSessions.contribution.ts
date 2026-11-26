/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { AgentHostSessionModelOptionsSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ILanguageModelToolsService } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { areRemoteSessionModelOptionsEnabled, IRemoteSessionService, RemoteSessionToolsEnabledSettingId } from '../common/remoteSessions.js';
import { RemoteSessionService } from './remoteSessionService.js';
import { CreateRemoteSessionTool, ListAgentHostsTool } from './remoteSessionTools.js';
import { SendRemoteMessageTool } from './sendRemoteMessageTool.js';
import { GetRemoteSessionTool } from './getRemoteSessionTool.js';
import { IRemoteSessionChatService, RemoteSessionChatService } from './remoteSessionChatService.js';

registerSingleton(IRemoteSessionService, RemoteSessionService, InstantiationType.Delayed);
registerSingleton(IRemoteSessionChatService, RemoteSessionChatService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	properties: {
		[RemoteSessionToolsEnabledSettingId]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
			markdownDescription: localize('remoteSessions.tools.enabled', "Enable built-in tools to discover remote agent hosts, create and inspect remote sessions, and send messages between sessions in the Agents window. Requires {0}. {1} also enables them. Disabling this setting does not disconnect hosts or stop sessions already running.", '`#chat.remoteAgentHostsEnabled#`', '`#chat.agentHost.devContainer.handoff.enabled#`'),
			experiment: { mode: 'auto' },
		},
	},
});

class RemoteSessionToolsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.remoteSessionTools';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		const list = instantiationService.createInstance(ListAgentHostsTool);
		const create = instantiationService.createInstance(CreateRemoteSessionTool);
		const message = this._register(instantiationService.createInstance(SendRemoteMessageTool));
		const inspect = instantiationService.createInstance(GetRemoteSessionTool);
		this._register(toolsService.registerTool(list.getToolData(), list));
		const createRegistration = this._register(new MutableDisposable());
		let modelOptions = areRemoteSessionModelOptionsEnabled(configurationService);
		createRegistration.value = toolsService.registerTool(create.getToolData(), create);
		// The input schema offers model options only while they are enabled, as the host's create_session does.
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (!e.affectsConfiguration(AgentHostSessionModelOptionsSettingId) || areRemoteSessionModelOptionsEnabled(configurationService) === modelOptions) {
				return;
			}
			modelOptions = !modelOptions;
			// The registry rejects a duplicate tool ID, so the previous registration must go first.
			createRegistration.clear();
			createRegistration.value = toolsService.registerTool(create.getToolData(), create);
		}));
		this._register(toolsService.registerTool(message.getToolData(), message));
		this._register(toolsService.registerTool(inspect.getToolData(), inspect));
	}
}

// A session only gets the tools registered when its turn starts. Registering these with the other startup tools, such as
// create_dev_container, lets an early prompt continue its work in a new remote session.
registerWorkbenchContribution2(RemoteSessionToolsContribution.ID, RemoteSessionToolsContribution, WorkbenchPhase.AfterRestored);
