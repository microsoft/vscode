/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../common/contributions.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../chat/common/languageModelToolsService.js';
import { GetTerminalOutputTool, GetTerminalOutputToolData } from './tools/getTerminalOutputTool.js';
import { RunInTerminalTool, RunInTerminalToolData } from './tools/runInTerminalTool.js';
import { CreateAndRunTaskTool, CreateAndRunTaskToolData } from './tools/task/createAndRunTaskTool.js';
import { GetTaskOutputTool, GetTaskOutputToolData } from './tools/task/getTaskOutputTool.js';
import { RunTaskTool, RunTaskToolData } from './tools/task/runTaskTool.js';

// #region Workbench contributions

class ChatAgentToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'terminal.chatAgentTools';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
	) {
		super();

		// #region Terminal

		const runInTerminalTool = instantiationService.createInstance(RunInTerminalTool);
		this._register(toolsService.registerToolData(RunInTerminalToolData));
		this._register(toolsService.registerToolImplementation(RunInTerminalToolData.id, runInTerminalTool));

		const getTerminalOutputTool = instantiationService.createInstance(GetTerminalOutputTool);
		this._register(toolsService.registerToolData(GetTerminalOutputToolData));
		this._register(toolsService.registerToolImplementation(GetTerminalOutputToolData.id, getTerminalOutputTool));

		const runCommandsToolSet = this._register(toolsService.createToolSet(ToolDataSource.Internal, 'runCommands', 'runCommands', {
			icon: ThemeIcon.fromId(Codicon.terminal.id),
			description: localize('toolset.runCommands', 'Runs commands in the terminal')
		}));
		runCommandsToolSet.addTool(RunInTerminalToolData);
		runCommandsToolSet.addTool(GetTerminalOutputToolData);

		// #endregion

		// #region Tasks

		const runTaskTool = instantiationService.createInstance(RunTaskTool);
		this._register(toolsService.registerToolData(RunTaskToolData));
		this._register(toolsService.registerToolImplementation(RunTaskToolData.id, runTaskTool));

		const getTaskOutputTool = instantiationService.createInstance(GetTaskOutputTool);
		this._register(toolsService.registerToolData(GetTaskOutputToolData));
		this._register(toolsService.registerToolImplementation(GetTaskOutputToolData.id, getTaskOutputTool));

		const createAndRunTaskTool = instantiationService.createInstance(CreateAndRunTaskTool);
		this._register(toolsService.registerToolData(CreateAndRunTaskToolData));
		this._register(toolsService.registerToolImplementation(CreateAndRunTaskToolData.id, createAndRunTaskTool));

		const runTasksToolSet = this._register(toolsService.createToolSet(ToolDataSource.Internal, 'runTasks', 'runTasks', {
			description: localize('toolset.runTasks', 'Runs tasks and gets their output for your workspace')
		}));
		runTasksToolSet.addTool(RunTaskToolData);
		runTasksToolSet.addTool(GetTaskOutputToolData);
		runTasksToolSet.addTool(CreateAndRunTaskToolData);

		// #endregion
	}
}
registerWorkbenchContribution2(ChatAgentToolsContribution.ID, ChatAgentToolsContribution, WorkbenchPhase.AfterRestored);

// #endregion Contributions
