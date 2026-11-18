/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { registerAction2 } from '../../../../../../../platform/actions/common/actions.js';
import { InstantiationType, registerSingleton } from '../../../../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../../common/contributions.js';
import { ILanguageModelToolsService } from '../../../../common/tools/languageModelToolsService.js';
import { AgentRequestSearchService, IAgentRequestSearchService } from './agentRequestSearchService.js';
import { SearchAgentRequestsAction } from './searchAgentRequestsAction.js';
import { SearchAgentRequestsTool } from './searchAgentRequestsTool.js';

registerSingleton(IAgentRequestSearchService, AgentRequestSearchService, InstantiationType.Delayed);
registerAction2(SearchAgentRequestsAction);

class AgentRequestSearchToolContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentRequestSearchTool';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
	) {
		super();
		const tool = instantiationService.createInstance(SearchAgentRequestsTool);
		this._register(toolsService.registerTool(tool.getToolData(), tool));
	}
}

registerWorkbenchContribution2(AgentRequestSearchToolContribution.ID, AgentRequestSearchToolContribution, WorkbenchPhase.Eventually);
