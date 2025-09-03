/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../common/contributions.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IChatWidgetService, showChatView } from '../../../chat/browser/chat.js';
import { ChatContextKeys } from '../../../chat/common/chatContextKeys.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../chat/common/languageModelToolsService.js';
import { registerActiveInstanceAction, sharedWhenClause } from '../../../terminal/browser/terminalActions.js';
import { TerminalContextMenuGroup } from '../../../terminal/browser/terminalMenus.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { TerminalChatAgentToolsCommandId } from '../common/terminal.chatAgentTools.js';
import { GetTerminalLastCommandTool, GetTerminalLastCommandToolData } from './tools/getTerminalLastCommandTool.js';
import { GetTerminalOutputTool, GetTerminalOutputToolData } from './tools/getTerminalOutputTool.js';
import { GetTerminalSelectionTool, GetTerminalSelectionToolData } from './tools/getTerminalSelectionTool.js';
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
		this._register(toolsService.registerTool(RunInTerminalToolData, runInTerminalTool));

		const getTerminalOutputTool = instantiationService.createInstance(GetTerminalOutputTool);
		this._register(toolsService.registerTool(GetTerminalOutputToolData, getTerminalOutputTool));

		const runCommandsToolSet = this._register(toolsService.createToolSet(ToolDataSource.Internal, 'runCommands', 'runCommands', {
			icon: ThemeIcon.fromId(Codicon.terminal.id),
			description: localize('toolset.runCommands', 'Runs commands in the terminal')
		}));
		runCommandsToolSet.addTool(RunInTerminalToolData);
		runCommandsToolSet.addTool(GetTerminalOutputToolData);

		const getTerminalSelectionTool = instantiationService.createInstance(GetTerminalSelectionTool);
		this._register(toolsService.registerTool(GetTerminalSelectionToolData, getTerminalSelectionTool));

		const getTerminalLastCommandTool = instantiationService.createInstance(GetTerminalLastCommandTool);
		this._register(toolsService.registerTool(GetTerminalLastCommandToolData, getTerminalLastCommandTool));

		runCommandsToolSet.addTool(GetTerminalSelectionToolData);
		runCommandsToolSet.addTool(GetTerminalLastCommandToolData);

		// #endregion

		// #region Tasks

		const runTaskTool = instantiationService.createInstance(RunTaskTool);
		this._register(toolsService.registerTool(RunTaskToolData, runTaskTool));

		const getTaskOutputTool = instantiationService.createInstance(GetTaskOutputTool);
		this._register(toolsService.registerTool(GetTaskOutputToolData, getTaskOutputTool));

		const createAndRunTaskTool = instantiationService.createInstance(CreateAndRunTaskTool);
		this._register(toolsService.registerTool(CreateAndRunTaskToolData, createAndRunTaskTool));

		const runTasksToolSet = this._register(toolsService.createToolSet(ToolDataSource.Internal, 'runTasks', 'runTasks', {
			description: localize('toolset.runTasks', 'Runs tasks and gets their output for your workspace'),
		}));
		runTasksToolSet.addTool(RunTaskToolData);
		runTasksToolSet.addTool(GetTaskOutputToolData);
		runTasksToolSet.addTool(CreateAndRunTaskToolData);

		// #endregion
	}
}
registerWorkbenchContribution2(ChatAgentToolsContribution.ID, ChatAgentToolsContribution, WorkbenchPhase.AfterRestored);

// #endregion Contributions

// #region Actions

registerActiveInstanceAction({
	id: TerminalChatAgentToolsCommandId.ChatAddTerminalSelection,
	title: localize('addTerminalSelection', 'Add Terminal Selection to Chat'),
	precondition: ContextKeyExpr.and(ChatContextKeys.enabled, sharedWhenClause.terminalAvailable),
	menu: [
		{
			id: MenuId.TerminalInstanceContext,
			group: TerminalContextMenuGroup.Chat,
			order: 1,
			when: ContextKeyExpr.and(ChatContextKeys.enabled, TerminalContextKeys.textSelected)
		},
	],
	run: async (activeInstance, _c, accessor) => {
		const viewsService = accessor.get(IViewsService);
		const chatWidgetService = accessor.get(IChatWidgetService);

		const selection = activeInstance.selection;
		if (!selection) {
			return;
		}

		const chatView = chatWidgetService.lastFocusedWidget || await showChatView(viewsService);
		if (!chatView) {
			return;
		}

		chatView.attachmentModel.addContext({
			id: `terminal-selection-${Date.now()}`,
			kind: 'generic' as const,
			name: localize('terminalSelection', 'Terminal Selection'),
			fullName: localize('terminalSelection', 'Terminal Selection'),
			value: selection,
			icon: Codicon.terminal
		});
		chatView.focusInput();
	}
});

// #endregion Actions
