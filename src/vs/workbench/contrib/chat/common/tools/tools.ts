/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { EditTool, EditToolData } from './editFileTool.js';
import { ManageTodoListTool, createManageTodoListToolData, TodoListToolWriteOnlySettingId } from './manageTodoListTool.js';

export class BuiltinToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.builtinTools';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		const editTool = instantiationService.createInstance(EditTool);
		this._register(toolsService.registerToolData(EditToolData));
		this._register(toolsService.registerToolImplementation(EditToolData.id, editTool));

		// Check if write-only mode is enabled for the todo tool
		const writeOnlyMode = this.configurationService.getValue<boolean>(TodoListToolWriteOnlySettingId) === true;
		const todoToolData = createManageTodoListToolData(writeOnlyMode);
		const manageTodoListTool = instantiationService.createInstance(ManageTodoListTool, writeOnlyMode);
		this._register(toolsService.registerToolData(todoToolData));
		this._register(toolsService.registerToolImplementation(todoToolData.id, manageTodoListTool));
	}
}

export const InternalFetchWebPageToolId = 'vscode_fetchWebPage_internal';
