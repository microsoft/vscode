/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../common/contributions.js';
import { ILanguageModelToolsService } from '../../../chat/common/languageModelToolsService.js';
import { TerminalChatAgentToolsSettingId } from '../common/terminalChatAgentToolsConfiguration.js';
import { GetTaskOutputTool, GetTaskOutputToolData } from './task/getTaskOutputTool.js';
import { RunTaskTool, RunTaskToolData } from './task/runTaskTool.js';

// #region Workbench contributions

class ChatAgentToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'task.chatAgentTools';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
	) {
		super();
		if (configurationService.getValue(TerminalChatAgentToolsSettingId.NewTaskToolsEnabled)) {
			const runTaskTool = instantiationService.createInstance(RunTaskTool);
			this._register(toolsService.registerToolData(RunTaskToolData));
			this._register(toolsService.registerToolImplementation(RunTaskToolData.id, runTaskTool));

			const getTaskOutputTool = instantiationService.createInstance(GetTaskOutputTool);
			this._register(toolsService.registerToolData(GetTaskOutputToolData));
			this._register(toolsService.registerToolImplementation(GetTaskOutputToolData.id, getTaskOutputTool));
		}
	}
}
registerWorkbenchContribution2(ChatAgentToolsContribution.ID, ChatAgentToolsContribution, WorkbenchPhase.AfterRestored);

// #endregion Contributions
