/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { EditTool, EditToolData } from './editFileTool.js';
import { ExecuteModeStepTool, ExecuteModeStepToolData } from './executeModeStepTool.js';
import { ManageTodoListTool, ManageTodoListToolData } from './manageTodoListTool.js';

export class BuiltinToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.builtinTools';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const editTool = instantiationService.createInstance(EditTool);
		this._register(toolsService.registerToolData(EditToolData));
		this._register(toolsService.registerToolImplementation(EditToolData.id, editTool));

		const manageTodoListTool = instantiationService.createInstance(ManageTodoListTool);
		this._register(toolsService.registerToolData(ManageTodoListToolData));
		this._register(toolsService.registerToolImplementation(ManageTodoListToolData.id, manageTodoListTool));

		const executeModeStepTool = instantiationService.createInstance(ExecuteModeStepTool);
		this._register(toolsService.registerToolData(ExecuteModeStepToolData));
		this._register(toolsService.registerToolImplementation(ExecuteModeStepToolData.id, executeModeStepTool));
	}
}

export const InternalFetchWebPageToolId = 'vscode_fetchWebPage_internal';
