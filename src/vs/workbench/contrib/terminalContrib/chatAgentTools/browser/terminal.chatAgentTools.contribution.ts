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
import { GetTerminalOutputTool, GetTerminalOutputToolData } from './getTerminalOutputTool.js';
import { RunInTerminalTool, RunInTerminalToolData } from './runInTerminalTool.js';

// #region Workbench contributions

class ChatAgentToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'terminal.chatAgentTools';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
	) {
		super();
		const runInTerminalTool = instantiationService.createInstance(RunInTerminalTool);
		this._register(toolsService.registerToolData(RunInTerminalToolData));
		this._register(toolsService.registerToolImplementation(RunInTerminalToolData.id, runInTerminalTool));

		const getTerminalOutputTool = instantiationService.createInstance(GetTerminalOutputTool);
		this._register(toolsService.registerToolData(GetTerminalOutputToolData));
		this._register(toolsService.registerToolImplementation(GetTerminalOutputToolData.id, getTerminalOutputTool));

		const toolSet = this._register(toolsService.createToolSet(ToolDataSource.Internal, 'runCommands', 'runCommands', {
			icon: ThemeIcon.fromId(Codicon.terminal.id),
			description: localize('toolset.runCommands', 'Runs commands in the terminal')
		}));
		toolSet.addTool(RunInTerminalToolData);
		toolSet.addTool(GetTerminalOutputToolData);
	}
}
registerWorkbenchContribution2(ChatAgentToolsContribution.ID, ChatAgentToolsContribution, WorkbenchPhase.AfterRestored);

// #endregion Contributions
