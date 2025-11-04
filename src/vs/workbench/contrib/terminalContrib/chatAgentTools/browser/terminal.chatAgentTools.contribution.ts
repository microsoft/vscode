/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isNumber } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService, IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../common/contributions.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IChatWidgetService, showChatView } from '../../../chat/browser/chat.js';
import { ChatContextKeys } from '../../../chat/common/chatContextKeys.js';
import { ILanguageModelToolsService, ToolDataSource, type ToolSet } from '../../../chat/common/languageModelToolsService.js';
import { registerActiveInstanceAction, sharedWhenClause } from '../../../terminal/browser/terminalActions.js';
import { TerminalContextMenuGroup } from '../../../terminal/browser/terminalMenus.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { TerminalChatAgentToolsCommandId } from '../common/terminal.chatAgentTools.js';
import { TerminalChatAgentToolsSettingId } from '../common/terminalChatAgentToolsConfiguration.js';
import { GetTerminalLastCommandTool, GetTerminalLastCommandToolData } from './tools/getTerminalLastCommandTool.js';
import { GetTerminalOutputTool, GetTerminalOutputToolData } from './tools/getTerminalOutputTool.js';
import { GetTerminalSelectionTool, GetTerminalSelectionToolData } from './tools/getTerminalSelectionTool.js';
import { ConfirmTerminalCommandTool, ConfirmTerminalCommandToolData } from './tools/runInTerminalConfirmationTool.js';
import { RunInTerminalTool, createRunInTerminalToolData } from './tools/runInTerminalTool.js';
import { CreateAndRunTaskTool, CreateAndRunTaskToolData } from './tools/task/createAndRunTaskTool.js';
import { GetTaskOutputTool, GetTaskOutputToolData } from './tools/task/getTaskOutputTool.js';
import { RunTaskTool, RunTaskToolData } from './tools/task/runTaskTool.js';
import { Event } from '../../../../../base/common/event.js';
import { debounce } from '../../../../../base/common/decorators.js';

class ShellIntegrationTimeoutMigrationContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'terminal.shellIntegrationTimeoutMigration';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		const deprecatedSettingValue = configurationService.getValue<unknown>(TerminalChatAgentToolsSettingId.ShellIntegrationTimeout);
		if (!isNumber(deprecatedSettingValue)) {
			return;
		}
		const newSettingValue = configurationService.getValue<unknown>(TerminalSettingId.ShellIntegrationTimeout);
		if (!isNumber(newSettingValue)) {
			configurationService.updateValue(TerminalSettingId.ShellIntegrationTimeout, deprecatedSettingValue);
		}
	}
}
registerWorkbenchContribution2(ShellIntegrationTimeoutMigrationContribution.ID, ShellIntegrationTimeoutMigrationContribution, WorkbenchPhase.Eventually);

class ChatAgentToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'terminal.chatAgentTools';

	private _runInTerminalToolRegistration = this._register(new MutableDisposable());
	private _runCommandsToolSet: ToolSet;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		// #region Terminal

		const confirmTerminalCommandTool = instantiationService.createInstance(ConfirmTerminalCommandTool);
		this._register(toolsService.registerTool(ConfirmTerminalCommandToolData, confirmTerminalCommandTool));
		const getTerminalOutputTool = instantiationService.createInstance(GetTerminalOutputTool);
		this._register(toolsService.registerTool(GetTerminalOutputToolData, getTerminalOutputTool));

		this._runCommandsToolSet = this._register(toolsService.createToolSet(ToolDataSource.Internal, 'runCommands', 'runCommands', {
			icon: ThemeIcon.fromId(Codicon.terminal.id),
			description: localize('toolset.runCommands', 'Runs commands in the terminal')
		}));
		this._runCommandsToolSet.addTool(GetTerminalOutputToolData);

		this._register(Event.runAndSubscribe(configurationService.onDidChangeConfiguration, e => {
			if (!e || this._isTerminalProfileSettingChange(e)) {
				this._registerRunInTerminalTool(instantiationService, toolsService);
			}
		}));

		const getTerminalSelectionTool = instantiationService.createInstance(GetTerminalSelectionTool);
		this._register(toolsService.registerTool(GetTerminalSelectionToolData, getTerminalSelectionTool));

		const getTerminalLastCommandTool = instantiationService.createInstance(GetTerminalLastCommandTool);
		this._register(toolsService.registerTool(GetTerminalLastCommandToolData, getTerminalLastCommandTool));

		this._runCommandsToolSet.addTool(GetTerminalSelectionToolData);
		this._runCommandsToolSet.addTool(GetTerminalLastCommandToolData);

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

	@debounce(200)
	private async _registerRunInTerminalTool(instantiationService: IInstantiationService, toolsService: ILanguageModelToolsService): Promise<void> {
		const store = new DisposableStore();
		this._runInTerminalToolRegistration.value = store;
		const runInTerminalTool = store.add(instantiationService.createInstance(RunInTerminalTool));
		const runInTerminalToolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
		store.add(toolsService.registerTool(runInTerminalToolData, runInTerminalTool));
		store.add(this._runCommandsToolSet.addTool(runInTerminalToolData));
	}

	private _isTerminalProfileSettingChange(e: IConfigurationChangeEvent): boolean {
		return [
			TerminalSettingId.ProfilesLinux,
			TerminalSettingId.ProfilesMacOs,
			TerminalSettingId.ProfilesWindows,
			TerminalSettingId.DefaultProfileLinux,
			TerminalSettingId.DefaultProfileMacOs,
			TerminalSettingId.DefaultProfileWindows,
			TerminalChatAgentToolsSettingId.TerminalProfileLinux,
			TerminalChatAgentToolsSettingId.TerminalProfileMacOs,
			TerminalChatAgentToolsSettingId.TerminalProfileWindows,
		].some(config => e.affectsConfiguration(config));
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
		const layoutService = accessor.get(IWorkbenchLayoutService);

		const selection = activeInstance.selection;
		if (!selection) {
			return;
		}

		const chatView = chatWidgetService.lastFocusedWidget || await showChatView(viewsService, layoutService);
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
