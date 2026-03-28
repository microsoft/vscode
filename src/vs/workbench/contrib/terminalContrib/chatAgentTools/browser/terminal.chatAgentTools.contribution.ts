/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../common/contributions.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ILanguageModelToolsService } from '../../../chat/common/tools/languageModelToolsService.js';
import { registerActiveInstanceAction, sharedWhenClause } from '../../../terminal/browser/terminalActions.js';
import { TerminalContextMenuGroup } from '../../../terminal/browser/terminalMenus.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { TerminalChatAgentToolsCommandId } from '../common/terminal.chatAgentTools.js';
import { TerminalChatAgentToolsSettingId } from '../common/terminalChatAgentToolsConfiguration.js';
import { AwaitTerminalTool, AwaitTerminalToolData } from './tools/awaitTerminalTool.js';
import { GetTerminalLastCommandTool, GetTerminalLastCommandToolData } from './tools/getTerminalLastCommandTool.js';
import { KillTerminalTool, KillTerminalToolData } from './tools/killTerminalTool.js';
import { GetTerminalOutputTool, GetTerminalOutputToolData } from './tools/getTerminalOutputTool.js';
import { GetTerminalSelectionTool, GetTerminalSelectionToolData } from './tools/getTerminalSelectionTool.js';
import { ConfirmTerminalCommandTool, ConfirmTerminalCommandToolData } from './tools/runInTerminalConfirmationTool.js';
import { RunInTerminalTool, createRunInTerminalToolData } from './tools/runInTerminalTool.js';
import { CreateAndRunTaskTool, CreateAndRunTaskToolData } from './tools/task/createAndRunTaskTool.js';
import { GetTaskOutputTool, GetTaskOutputToolData } from './tools/task/getTaskOutputTool.js';
import { RunTaskTool, RunTaskToolData } from './tools/task/runTaskTool.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ITrustedDomainService } from '../../../url/common/trustedDomainService.js';
import { ITerminalSandboxService, TerminalSandboxService } from '../common/terminalSandboxService.js';
import { isNumber } from '../../../../../base/common/types.js';

// #region Services

registerSingleton(ITerminalSandboxService, TerminalSandboxService, InstantiationType.Delayed);

// #endregion Services

class ShellIntegrationTimeoutMigrationContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'terminal.shellIntegrationTimeoutMigration';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		const deprecated = configurationService.inspect<number>(TerminalChatAgentToolsSettingId.ShellIntegrationTimeout);
		const target = configurationService.inspect<number>(TerminalSettingId.ShellIntegrationTimeout);
		if (deprecated.userValue !== undefined && target.userValue === undefined && isNumber(deprecated.userValue)) {
			configurationService.updateValue(TerminalSettingId.ShellIntegrationTimeout, deprecated.userValue, ConfigurationTarget.USER);
		}
		if (deprecated.workspaceValue !== undefined && target.workspaceValue === undefined && isNumber(deprecated.workspaceValue)) {
			configurationService.updateValue(TerminalSettingId.ShellIntegrationTimeout, deprecated.workspaceValue, ConfigurationTarget.WORKSPACE);
		}
	}
}
registerWorkbenchContribution2(ShellIntegrationTimeoutMigrationContribution.ID, ShellIntegrationTimeoutMigrationContribution, WorkbenchPhase.Eventually);

class OutputLocationMigrationContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'terminal.outputLocationMigration';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		// Migrate legacy 'none' value to 'chat'
		const currentValue = configurationService.getValue<unknown>(TerminalChatAgentToolsSettingId.OutputLocation);
		if (currentValue === 'none') {
			configurationService.updateValue(TerminalChatAgentToolsSettingId.OutputLocation, 'chat');
		}
	}
}
registerWorkbenchContribution2(OutputLocationMigrationContribution.ID, OutputLocationMigrationContribution, WorkbenchPhase.Eventually);

export class ChatAgentToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'terminal.chatAgentTools';

	private readonly _runInTerminalToolRegistration = this._register(new MutableDisposable<DisposableStore>());
	private _runInTerminalToolRegistrationVersion = 0;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITrustedDomainService private readonly _trustedDomainService: ITrustedDomainService,
	) {
		super();

		// #region Terminal

		const confirmTerminalCommandTool = _instantiationService.createInstance(ConfirmTerminalCommandTool);
		this._register(_toolsService.registerTool(ConfirmTerminalCommandToolData, confirmTerminalCommandTool));
		const getTerminalOutputTool = _instantiationService.createInstance(GetTerminalOutputTool);
		this._register(_toolsService.registerTool(GetTerminalOutputToolData, getTerminalOutputTool));
		this._register(_toolsService.executeToolSet.addTool(GetTerminalOutputToolData));

		const awaitTerminalTool = _instantiationService.createInstance(AwaitTerminalTool);
		this._register(_toolsService.registerTool(AwaitTerminalToolData, awaitTerminalTool));
		this._register(_toolsService.executeToolSet.addTool(AwaitTerminalToolData));

		const killTerminalTool = _instantiationService.createInstance(KillTerminalTool);
		this._register(_toolsService.registerTool(KillTerminalToolData, killTerminalTool));
		this._register(_toolsService.executeToolSet.addTool(KillTerminalToolData));

		this._registerRunInTerminalTool();

		const getTerminalSelectionTool = _instantiationService.createInstance(GetTerminalSelectionTool);
		this._register(_toolsService.registerTool(GetTerminalSelectionToolData, getTerminalSelectionTool));

		const getTerminalLastCommandTool = _instantiationService.createInstance(GetTerminalLastCommandTool);
		this._register(_toolsService.registerTool(GetTerminalLastCommandToolData, getTerminalLastCommandTool));

		this._register(_toolsService.readToolSet.addTool(GetTerminalSelectionToolData));
		this._register(_toolsService.readToolSet.addTool(GetTerminalLastCommandToolData));

		// #endregion

		// #region Tasks

		const runTaskTool = _instantiationService.createInstance(RunTaskTool);
		this._register(_toolsService.registerTool(RunTaskToolData, runTaskTool));

		const getTaskOutputTool = _instantiationService.createInstance(GetTaskOutputTool);
		this._register(_toolsService.registerTool(GetTaskOutputToolData, getTaskOutputTool));

		const createAndRunTaskTool = _instantiationService.createInstance(CreateAndRunTaskTool);
		this._register(_toolsService.registerTool(CreateAndRunTaskToolData, createAndRunTaskTool));
		this._register(_toolsService.executeToolSet.addTool(RunTaskToolData));
		this._register(_toolsService.executeToolSet.addTool(CreateAndRunTaskToolData));
		this._register(_toolsService.readToolSet.addTool(GetTaskOutputToolData));

		// #endregion

		// Re-register run_in_terminal tool when sandbox-related settings change,
		// so the tool description and input schema stay in sync with the current
		// sandbox state.
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxEnabled) ||
				e.affectsConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetworkAllowedDomains) ||
				e.affectsConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetworkDeniedDomains) ||
				e.affectsConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetworkAllowTrustedDomains)
			) {
				this._registerRunInTerminalTool();
			}
		}));
		this._register(this._trustedDomainService.onDidChangeTrustedDomains(() => {
			this._registerRunInTerminalTool();
		}));
	}

	private _runInTerminalTool: RunInTerminalTool | undefined;

	private _registerRunInTerminalTool(): void {
		const version = ++this._runInTerminalToolRegistrationVersion;
		this._instantiationService.invokeFunction(createRunInTerminalToolData).then(runInTerminalToolData => {
			if (this._store.isDisposed || version !== this._runInTerminalToolRegistrationVersion) {
				return;
			}
			if (!this._runInTerminalTool) {
				this._runInTerminalTool = this._register(this._instantiationService.createInstance(RunInTerminalTool));
			}
			// Dispose old registration first so registerToolData doesn't throw
			// "already registered" for the same tool ID.
			this._runInTerminalToolRegistration.value = undefined;
			const store = new DisposableStore();
			store.add(this._toolsService.registerToolData(runInTerminalToolData));
			store.add(this._toolsService.registerToolImplementation(runInTerminalToolData.id, this._runInTerminalTool));
			store.add(this._toolsService.executeToolSet.addTool(runInTerminalToolData));
			this._runInTerminalToolRegistration.value = store;
		});
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
		const chatWidgetService = accessor.get(IChatWidgetService);

		const selection = activeInstance.selection;
		if (!selection) {
			return;
		}

		const chatView = chatWidgetService.lastFocusedWidget ?? await chatWidgetService.revealWidget();
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
