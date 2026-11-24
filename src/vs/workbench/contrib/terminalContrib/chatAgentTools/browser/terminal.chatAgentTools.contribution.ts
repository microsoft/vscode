/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../browser/editor.js';
import { EditorExtensions } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { SandboxProfilesEditor } from './sandboxProfilesEditor.js';
import { SandboxProfilesInput } from './sandboxProfilesInput.js';
import { getActiveElement, isHTMLElement } from '../../../../../base/browser/dom.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { AgentSandboxSettingId } from '../../../../../platform/sandbox/common/settings.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../common/contributions.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';
import { ILanguageModelToolsConfirmationService } from '../../../chat/common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService } from '../../../chat/common/tools/languageModelToolsService.js';
import { TerminalToolId } from '../../../chat/common/tools/terminalToolIds.js';
import { IToolResultCompressor } from '../../../chat/common/tools/toolResultCompressor.js';
import { registerActiveInstanceAction, sharedWhenClause } from '../../../terminal/browser/terminalActions.js';
import { TerminalContextMenuGroup } from '../../../terminal/browser/terminalMenus.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { TerminalChatAgentToolsCommandId } from '../common/terminal.chatAgentTools.js';
import { TerminalChatAgentToolsSettingId } from '../common/terminalChatAgentToolsConfiguration.js';
import { AgentNetworkDomainSettingId } from '../../../../../platform/networkFilter/common/settings.js';
import { AgentHostSandboxForwarder } from './agentHostSandboxForwarder.js';
import { TerminalToolConfirmationContribution } from './terminalToolConfirmationContribution.js';
import { GetTerminalLastCommandTool, GetTerminalLastCommandToolData } from './tools/getTerminalLastCommandTool.js';
import { KillTerminalTool, KillTerminalToolData } from './tools/killTerminalTool.js';
import { GetTerminalOutputTool, GetTerminalOutputToolData } from './tools/getTerminalOutputTool.js';
import { SendToTerminalTool, SendToTerminalToolData } from './tools/sendToTerminalTool.js';
import { GetTerminalSelectionTool, GetTerminalSelectionToolData } from './tools/getTerminalSelectionTool.js';
import { ConfirmTerminalCommandTool, ConfirmTerminalCommandToolData } from './tools/runInTerminalConfirmationTool.js';
import { RunInTerminalTool, createRunInTerminalToolData } from './tools/runInTerminalTool.js';
import { CreateAndRunTaskTool, CreateAndRunTaskToolData } from './tools/task/createAndRunTaskTool.js';
import { GetTaskOutputTool, GetTaskOutputToolData } from './tools/task/getTaskOutputTool.js';
import { RunTaskTool, RunTaskToolData } from './tools/task/runTaskTool.js';
import { registerTerminalCompressors } from './tools/terminalOutputCompressor.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ITerminalSandboxService, TerminalSandboxService } from '../common/terminalSandboxService.js';
import { isNumber } from '../../../../../base/common/types.js';

// #region Services

registerSingleton(ITerminalSandboxService, TerminalSandboxService, InstantiationType.Delayed);

// #endregion Services

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(SandboxProfilesEditor, SandboxProfilesEditor.ID, localize('sandboxProfiles', "Sandbox Profiles")),
	[new SyncDescriptor(SandboxProfilesInput)],
);
AccessibleViewRegistry.register({
	name: 'sandboxProfiles',
	type: AccessibleViewType.Help,
	priority: 100,
	when: ActiveEditorContext.isEqualTo(SandboxProfilesEditor.ID),
	getProvider() {
		const focused = getActiveElement();
		if (!isHTMLElement(focused) || !focused.closest('.sandbox-profiles-editor')) {
			return undefined;
		}
		return new AccessibleContentProvider(AccessibleViewProviderId.SandboxProfiles, { type: AccessibleViewType.Help },
			() => localize('sandboxProfilesHelp', "Sandbox Profiles lists the profiles saved on this machine on the left and the selected profile's settings on the right. Use New Profile to create and save a profile from your current VS Code sandbox settings, then rename it in the Name field. Use the arrow keys to move between profiles; each profile has a Delete Profile action. Use Tab to move between settings. Changes to a profile are saved automatically on this machine and update the connected remote hosts the profile is assigned to; changes that aren't valid, such as a duplicate name or invalid JSON, are not saved. Assign profiles to remote hosts in the Sandbox Profile column of Remote Environments. A profile cannot be deleted while a remote environment is assigned to it, including a disconnected environment's last-known assignment; assign those environments another profile or Default first."),
			() => focused.focus(), AccessibilityVerbositySettingId.SandboxProfiles);
	}
});
registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'workbench.action.manageSandboxProfiles', title: localize2('manageSandboxProfiles', "Manage Sandbox Profiles"), category: localize2('sandboxCategory', "Sandbox"), f1: true, precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${AgentSandboxSettingId.AgentSandboxProfilesEnabled}`, true)) });
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const editors = accessor.get(IEditorService);
		const input = editors.editors.find(editor => editor instanceof SandboxProfilesInput) ?? accessor.get(IInstantiationService).createInstance(SandboxProfilesInput);
		await editors.openEditor(input, { pinned: true, revealIfOpened: true });
	}
});

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
		@IToolResultCompressor toolResultCompressor: IToolResultCompressor,
		@ILanguageModelToolsConfirmationService private readonly _confirmationService: ILanguageModelToolsConfirmationService,
	) {
		super();

		registerTerminalCompressors(toolResultCompressor);

		// #region Terminal

		const confirmTerminalCommandTool = _instantiationService.createInstance(ConfirmTerminalCommandTool);
		this._register(_toolsService.registerTool(ConfirmTerminalCommandToolData, confirmTerminalCommandTool));
		const getTerminalOutputTool = _instantiationService.createInstance(GetTerminalOutputTool);
		this._register(_toolsService.registerTool(GetTerminalOutputToolData, getTerminalOutputTool));
		this._register(_toolsService.executeToolSet.addTool(GetTerminalOutputToolData));

		const killTerminalTool = _instantiationService.createInstance(KillTerminalTool);
		this._register(_toolsService.registerTool(KillTerminalToolData, killTerminalTool));
		this._register(_toolsService.executeToolSet.addTool(KillTerminalToolData));

		const sendToTerminalTool = _instantiationService.createInstance(SendToTerminalTool);
		this._register(_toolsService.registerTool(SendToTerminalToolData, sendToTerminalTool));
		this._register(_toolsService.executeToolSet.addTool(SendToTerminalToolData));

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

		// Keep the tool description and input schema in sync with sandbox and approval settings.
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(ChatConfiguration.DefaultPermissionLevel) ||
				e.affectsConfiguration(ChatConfiguration.GlobalAutoApprove) ||
				e.affectsConfiguration(TerminalChatAgentToolsSettingId.EnableAutoApprove) ||
				e.affectsConfiguration(AgentSandboxSettingId.AgentSandboxEnabled) ||
				e.affectsConfiguration(AgentSandboxSettingId.AgentSandboxAllowNetwork) ||
				e.affectsConfiguration(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands) ||
				e.affectsConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains) ||
				e.affectsConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains) ||
				e.affectsConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem) ||
				e.affectsConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxMacFileSystem)
			) {
				this._registerRunInTerminalTool();
			}
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
			store.add(this._confirmationService.registerConfirmationContribution(TerminalToolId.RunInTerminal, this._instantiationService.createInstance(TerminalToolConfirmationContribution)));
			store.add(this._toolsService.executeToolSet.addTool(runInTerminalToolData));
			this._runInTerminalToolRegistration.value = store;
		});
	}
}
registerWorkbenchContribution2(ChatAgentToolsContribution.ID, ChatAgentToolsContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostSandboxForwarder.ID, AgentHostSandboxForwarder, WorkbenchPhase.AfterRestored);

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
