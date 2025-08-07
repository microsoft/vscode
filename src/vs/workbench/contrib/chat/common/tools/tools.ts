/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { CreateDirectoryTool, CreateDirectoryToolData } from './createDirectoryTool.js';
import { EditTool, EditToolData } from './editFileTool.js';
import { ManageTodoListTool, ManageTodoListToolData } from './manageTodoListTool.js';
import { ReadFileTool, ReadFileToolData } from './readFileTool.js';

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

		const readFileTool = instantiationService.createInstance(ReadFileTool);
		this._register(toolsService.registerToolData(ReadFileToolData));
		this._register(toolsService.registerToolImplementation(ReadFileToolData.id, readFileTool));

		const createDirectoryTool = instantiationService.createInstance(CreateDirectoryTool);
		this._register(toolsService.registerToolData(CreateDirectoryToolData));
		this._register(toolsService.registerToolImplementation(CreateDirectoryToolData.id, createDirectoryTool));
	}
}

export const InternalFetchWebPageToolId = 'vscode_fetchWebPage_internal';
