/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ILanguageModelToolsService } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IRemoteSessionService } from '../common/remoteSessions.js';
import { RemoteSessionService } from './remoteSessionService.js';
import { CreateRemoteSessionTool, ListAgentHostsTool } from './remoteSessionTools.js';
import { SendRemoteMessageTool } from './sendRemoteMessageTool.js';
import { GetRemoteSessionTool } from './getRemoteSessionTool.js';
import { IRemoteSessionChatService, RemoteSessionChatService } from './remoteSessionChatService.js';

registerSingleton(IRemoteSessionService, RemoteSessionService, InstantiationType.Delayed);
registerSingleton(IRemoteSessionChatService, RemoteSessionChatService, InstantiationType.Delayed);

class RemoteSessionToolsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.remoteSessionTools';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
	) {
		super();
		const list = instantiationService.createInstance(ListAgentHostsTool);
		const create = instantiationService.createInstance(CreateRemoteSessionTool);
		const message = instantiationService.createInstance(SendRemoteMessageTool);
		const inspect = instantiationService.createInstance(GetRemoteSessionTool);
		this._register(toolsService.registerTool(list.getToolData(), list));
		this._register(toolsService.registerTool(create.getToolData(), create));
		this._register(toolsService.registerTool(message.getToolData(), message));
		this._register(toolsService.registerTool(inspect.getToolData(), inspect));
	}
}

registerWorkbenchContribution2(RemoteSessionToolsContribution.ID, RemoteSessionToolsContribution, WorkbenchPhase.Eventually);
