/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { ILanguageModelToolsService } from '../languageModelToolsService.js';
import { AskQuestionsTool, AskQuestionsToolData } from './askQuestionsTool.js';
import { ConfirmationTool, ConfirmationToolData, ConfirmationToolWithOptionsData, ModifiedFilesConfirmationTool, ModifiedFilesConfirmationToolData } from './confirmationTool.js';
import { EditTool, EditToolData } from './editFileTool.js';
import { createManageTodoListToolData, ManageTodoListTool } from './manageTodoListTool.js';
import { ResolveDebugEventDetailsTool, ResolveDebugEventDetailsToolData } from './resolveDebugEventDetailsTool.js';
import { ListDebugEventsTool, ListDebugEventsToolData } from './listDebugEventsTool.js';
import { RunSubagentTool } from './runSubagentTool.js';
import { TaskCompleteTool, TaskCompleteToolData } from './taskCompleteTool.js';

export class BuiltinToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.builtinTools';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const editTool = instantiationService.createInstance(EditTool);
		this._register(toolsService.registerTool(EditToolData, editTool));

		const askQuestionsTool = this._register(instantiationService.createInstance(AskQuestionsTool));
		this._register(toolsService.registerTool(AskQuestionsToolData, askQuestionsTool));
		this._register(toolsService.vscodeToolSet.addTool(AskQuestionsToolData));

		const todoToolData = createManageTodoListToolData();
		const manageTodoListTool = this._register(instantiationService.createInstance(ManageTodoListTool));
		this._register(toolsService.registerTool(todoToolData, manageTodoListTool));

		const confirmationTool = instantiationService.createInstance(ConfirmationTool);
		this._register(toolsService.registerTool(ConfirmationToolData, confirmationTool));
		this._register(toolsService.registerTool(ConfirmationToolWithOptionsData, confirmationTool));

		const modifiedFilesConfirmationTool = instantiationService.createInstance(ModifiedFilesConfirmationTool);
		this._register(toolsService.registerTool(ModifiedFilesConfirmationToolData, modifiedFilesConfirmationTool));


		const taskCompleteTool = instantiationService.createInstance(TaskCompleteTool);
		this._register(toolsService.registerTool(TaskCompleteToolData, taskCompleteTool));

		const resolveDebugEventDetailsTool = instantiationService.createInstance(ResolveDebugEventDetailsTool);
		this._register(toolsService.registerTool(ResolveDebugEventDetailsToolData, resolveDebugEventDetailsTool));
		this._register(toolsService.readToolSet.addTool(ResolveDebugEventDetailsToolData));

		const listDebugEventsTool = instantiationService.createInstance(ListDebugEventsTool);
		this._register(toolsService.registerTool(ListDebugEventsToolData, listDebugEventsTool));
		this._register(toolsService.readToolSet.addTool(ListDebugEventsToolData));


		const runSubagentTool = this._register(instantiationService.createInstance(RunSubagentTool));

		let runSubagentRegistration: IDisposable | undefined;
		let toolSetRegistration: IDisposable | undefined;
		const registerRunSubagentTool = () => {
			runSubagentRegistration?.dispose();
			toolSetRegistration?.dispose();
			toolsService.flushToolUpdates();
			const runSubagentToolData = runSubagentTool.getToolData();
			runSubagentRegistration = toolsService.registerTool(runSubagentToolData, runSubagentTool);
			toolSetRegistration = toolsService.agentToolSet.addTool(runSubagentToolData);
		};
		registerRunSubagentTool();
		this._register(runSubagentTool.onDidUpdateToolData(registerRunSubagentTool));
		this._register({
			dispose: () => {
				runSubagentRegistration?.dispose();
				toolSetRegistration?.dispose();
			}
		});


	}
}

export const InternalFetchWebPageToolId = 'vscode_fetchWebPage_internal';
