/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { ILanguageModelToolsService } from '../../../chat/common/tools/languageModelToolsService.js';
import { CreateAndRunTaskTool, CreateAndRunTaskToolData } from './tools/task/createAndRunTaskTool.js';
import { GetTaskOutputTool, GetTaskOutputToolData } from './tools/task/getTaskOutputTool.js';
import { RunTaskTool, RunTaskToolData } from './tools/task/runTaskTool.js';

export class TerminalTaskAgentToolsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'terminal.taskAgentTools';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
	) {
		super();

		const runTaskTool = instantiationService.createInstance(RunTaskTool);
		this._register(toolsService.registerTool(RunTaskToolData, runTaskTool));

		const getTaskOutputTool = instantiationService.createInstance(GetTaskOutputTool);
		this._register(toolsService.registerTool(GetTaskOutputToolData, getTaskOutputTool));

		const createAndRunTaskTool = instantiationService.createInstance(CreateAndRunTaskTool);
		this._register(toolsService.registerTool(CreateAndRunTaskToolData, createAndRunTaskTool));
		this._register(toolsService.executeToolSet.addTool(RunTaskToolData));
		this._register(toolsService.executeToolSet.addTool(CreateAndRunTaskToolData));
		this._register(toolsService.readToolSet.addTool(GetTaskOutputToolData));
	}
}

registerWorkbenchContribution2(TerminalTaskAgentToolsContribution.ID, TerminalTaskAgentToolsContribution, WorkbenchPhase.AfterRestored);
