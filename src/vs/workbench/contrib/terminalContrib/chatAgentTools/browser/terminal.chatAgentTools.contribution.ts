/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../common/contributions.js';
import { ILanguageModelToolsService } from '../../../chat/common/languageModelToolsService.js';
import { GetTerminalOutputTool, GetTerminalOutputToolData } from './getTerminalOutputTool.js';
import { RunInTerminalTool, RunInTerminalToolData } from './runInTerminalTool.js';

// #region Workbench contributions

class ChatAgentToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'terminal.chatAgentTools';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
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
	}
}
registerWorkbenchContribution2(ChatAgentToolsContribution.ID, ChatAgentToolsContribution, WorkbenchPhase.AfterRestored);

// #endregion Contributions
