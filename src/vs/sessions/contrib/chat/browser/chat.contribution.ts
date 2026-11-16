/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IEditorPaneRegistry, EditorPaneDescriptor } from '../../../../workbench/browser/editor.js';
import { Extensions as WorkbenchConfigurationExtensions, IConfigurationMigrationRegistry } from '../../../../workbench/common/configuration.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { EditorExtensions } from '../../../../workbench/common/editor.js';
import { AgentHostSandboxNotifications } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSandboxNotifications.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { resolveGridCommandView } from '../../../../workbench/contrib/sessions/browser/sessionCommandTarget.js';
import { BranchChatSessionAction } from './branchChatSessionAction.js';
import './nullInlineChatSessionService.js';
import './modelPicker.js';
import './newSessionOnboardingTargets.js';
import './newSessionPickerTryout.js';
import './agentHostDelegation.js';
import './newSessionFolderQuickPickAction.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INewSessionComposerService, NewSessionComposerService } from '../../../../workbench/contrib/sessions/browser/newSessionComposerService.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ISessionsTasksService, SessionsTasksService } from './sessionsTasksService.js';
import { ISessionTaskRunnerRegistry, SessionTaskRunnerRegistry } from './sessionTaskRunner.js';
import { AgenticPromptsService } from './promptsService.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { SessionsAICustomizationWorkspaceService } from './aiCustomizationWorkspaceService.js';
import { SessionsCustomizationHarnessService } from './customizationHarnessService.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { SessionComparisonAccessibleView } from './sessionsChatAccessibilityHelp.js';
import { SessionWorktreeCleanupAccessibilityHelp } from '../../sessionInputBanners/browser/sessionWorktreeCleanupAccessibilityHelp.js';
import { ArtifactDetailsAccessibilityHelp, ArtifactDetailsAccessibleView } from '../../../../workbench/contrib/sessions/browser/chat/artifactDetailsContextView.js';
import { SessionsOpenerParticipantContribution } from './sessionsOpenerParticipant.js';
import { OpenSessionLinkOpenerContribution } from './openSessionLinkOpener.contribution.js';
import { SessionLinkAttachmentWidgetContribution } from './sessionLinkAttachmentWidget.js';
import { AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING } from './worktreeCreatedTaskDispatcher.js';
import { AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING } from '../../../../workbench/contrib/sessions/browser/chat/sessionsChatHistory.js';
import '../../sessions/browser/mobile/mobileOverlayContribution.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING, COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING, COMPARE_AGENTS_ENABLED_SETTING, COMPARE_AGENTS_OPEN_IN_GRID_SETTING, COMPARE_AGENTS_SHOW_PICKER_HINT_SETTING, COMPARE_AGENTS_SHOW_SPOTLIGHT_SETTING, COMPARE_AGENTS_TOOLS_ENABLED_SETTING, ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING, NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING, NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING, NEW_SESSION_WELCOME_MESSAGES_SETTING, NEW_SESSION_WELCOME_NAME_SETTING, NEW_SESSION_WELCOME_PHRASES_SETTING, REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING, WORKSPACE_OPT_OUT_SETTING } from '../../../../workbench/contrib/sessions/common/chatConstants.js';
import { DesktopLayoutContext, IsPhoneLayoutContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { SESSION_ACTIVITY_BAR_SETTING } from '../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { TOGGLE_SESSION_ACTIVITY_BAR_COMMAND_ID } from '../../../browser/layoutActions.js';
import { Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { ISessionsChatViewStateService, SessionsChatViewStateService } from '../../../../workbench/contrib/sessions/browser/chat/chatViewStateService.js';
import { SessionsChatResponseFileChangesService } from './sessionTurnChanges.js';
import { IChatResponseFileChangesService } from '../../../../workbench/contrib/chat/browser/chatResponseFileChangesService.js';
import { ISessionArchiveNudgeService, SESSION_ARCHIVE_NUDGE_SETTING, SessionArchiveNudgeContribution, SessionArchiveNudgeService } from '../../../../workbench/contrib/sessions/browser/chat/sessionArchiveNudge.js';
import { NewChatInSessionsWindowAction } from '../../../../workbench/contrib/sessions/browser/chat/newSessionAction.js';
import { HIDE_INACTIVE_COMPARISON_INPUTS_SETTING } from '../../../../workbench/contrib/sessions/common/sessionComparisonConstants.js';
import { appendNewSessionTitleBarMenuItem } from './newSessionTitleBarMenu.js';
import { FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_COMMAND_ID, FOCUS_NEW_SESSION_HARNESS_PICKER_COMMAND_ID, FOCUS_NEW_SESSION_WORKSPACE_PICKER_COMMAND_ID, FOCUS_NEW_SESSION_BRANCH_PICKER_COMMAND_ID, FOCUS_NEW_SESSION_WORKTREE_PICKER_COMMAND_ID, FOCUS_SESSION_SYNC_ACTION_COMMAND_ID } from '../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_KEYBINDING, FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_WHEN, FOCUS_NEW_SESSION_HARNESS_PICKER_KEYBINDING, FOCUS_NEW_SESSION_HARNESS_PICKER_WHEN, FOCUS_NEW_SESSION_WORKSPACE_PICKER_KEYBINDING, FOCUS_NEW_SESSION_WORKSPACE_PICKER_WHEN, FOCUS_NEW_SESSION_BRANCH_PICKER_KEYBINDING, FOCUS_NEW_SESSION_BRANCH_PICKER_WHEN, FOCUS_NEW_SESSION_WORKTREE_PICKER_KEYBINDING, FOCUS_NEW_SESSION_WORKTREE_PICKER_WHEN, FOCUS_SESSION_SYNC_ACTION_KEYBINDING, FOCUS_SESSION_SYNC_ACTION_WHEN } from '../../../../workbench/contrib/sessions/browser/chat/newChatPickerKeybinding.js';
import { ISessionsPartService } from '../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { sessionStorageCleanupSuggestionConfigurationMigration } from '../../sessionInputBanners/browser/sessionStorageCleanupConfiguration.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, ISessionWorktreeCleanupService, MANAGE_AGENT_SESSION_WORKTREES_COMMAND_ID, SessionWorktreeCleanupService } from '../../../../workbench/contrib/sessions/browser/sessionInputBanners/sessionWorktreeCleanupService.js';
import { SessionWorktreeCleanupEditorInput } from '../../sessionInputBanners/browser/sessionWorktreeCleanupEditorInput.js';
import { SessionWorktreeCleanupEditor } from '../../sessionInputBanners/browser/sessionWorktreeCleanupEditor.js';
import { INewChatVoiceTargetService, NewChatVoiceTargetService } from '../../../../workbench/contrib/sessions/browser/chat/newChatVoice.js';
import { ISessionChatPillsDebugService, SessionChatPillsDebugService } from '../../../../workbench/contrib/sessions/browser/chat/sessionChatInputToolbarDebug.js';
import { ADD_SESSION_REFERENCE_COMMAND, addSessionReference, IAddSessionReferenceArgs } from '../../../../workbench/contrib/sessions/browser/chat/sessionReferenceCompletions.js';
import { registerReplacePromptTemplatePlaceholderCommand } from '../../../../workbench/contrib/sessions/browser/chat/promptTemplatePlaceholder.js';
import { registerCompareAgentsSpotlightDescriptor } from '../../../../workbench/contrib/sessions/browser/chat/compareAgentsSpotlight.js';
import { registerWorktreeSuggestionTourDescriptor } from '../../../../workbench/contrib/sessions/browser/tours/worktreeSuggestionTour.js';
import { registerSessionArchiveTourDescriptor } from '../../../../workbench/contrib/sessions/browser/tours/sessionArchiveTour.js';

registerAction2(NewChatInSessionsWindowAction);
appendNewSessionTitleBarMenuItem();

class FocusNewSessionWorkspacePickerAction extends Action2 {
	constructor() {
		super({
			id: FOCUS_NEW_SESSION_WORKSPACE_PICKER_COMMAND_ID,
			title: localize2('sessions.focusNewSessionWorkspacePicker', "Focus Workspace Picker"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: FOCUS_NEW_SESSION_WORKSPACE_PICKER_WHEN,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: FOCUS_NEW_SESSION_WORKSPACE_PICKER_WHEN,
				primary: FOCUS_NEW_SESSION_WORKSPACE_PICKER_KEYBINDING,
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const sessionsPartService = accessor.get(ISessionsPartService);
		(sessionsPartService.getFocusedSessionView() ?? resolveGridCommandView(accessor))?.focusWorkspacePicker();
	}
}

registerAction2(FocusNewSessionWorkspacePickerAction);

class FocusNewSessionEnvironmentPickerAction extends Action2 {
	constructor() {
		super({
			id: FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_COMMAND_ID,
			title: localize2('sessions.focusNewSessionEnvironmentPicker', "Focus Environment Picker"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_WHEN,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_WHEN,
				primary: FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_KEYBINDING,
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const sessionsPartService = accessor.get(ISessionsPartService);
		(sessionsPartService.getFocusedSessionView() ?? resolveGridCommandView(accessor))?.focusEnvironmentPicker();
	}
}

registerAction2(FocusNewSessionEnvironmentPickerAction);

class FocusNewSessionHarnessPickerAction extends Action2 {
	constructor() {
		super({
			id: FOCUS_NEW_SESSION_HARNESS_PICKER_COMMAND_ID,
			title: localize2('sessions.focusNewSessionHarnessPicker', "Focus Harness Picker"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: FOCUS_NEW_SESSION_HARNESS_PICKER_WHEN,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: FOCUS_NEW_SESSION_HARNESS_PICKER_WHEN,
				primary: FOCUS_NEW_SESSION_HARNESS_PICKER_KEYBINDING,
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const sessionsPartService = accessor.get(ISessionsPartService);
		(sessionsPartService.getFocusedSessionView() ?? resolveGridCommandView(accessor))?.focusHarnessPicker();
	}
}

registerAction2(FocusNewSessionHarnessPickerAction);

class FocusNewSessionBranchPickerAction extends Action2 {
	constructor() {
		super({
			id: FOCUS_NEW_SESSION_BRANCH_PICKER_COMMAND_ID,
			title: localize2('sessions.focusNewSessionBranchPicker', "Focus Branch Picker"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: FOCUS_NEW_SESSION_BRANCH_PICKER_WHEN,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: FOCUS_NEW_SESSION_BRANCH_PICKER_WHEN,
				primary: FOCUS_NEW_SESSION_BRANCH_PICKER_KEYBINDING,
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const sessionsPartService = accessor.get(ISessionsPartService);
		(sessionsPartService.getFocusedSessionView() ?? resolveGridCommandView(accessor))?.focusBranchPicker();
	}
}

registerAction2(FocusNewSessionBranchPickerAction);

class FocusNewSessionWorktreePickerAction extends Action2 {
	constructor() {
		super({
			id: FOCUS_NEW_SESSION_WORKTREE_PICKER_COMMAND_ID,
			title: localize2('sessions.focusNewSessionWorktreePicker', "Focus Worktree Picker"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: FOCUS_NEW_SESSION_WORKTREE_PICKER_WHEN,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: FOCUS_NEW_SESSION_WORKTREE_PICKER_WHEN,
				primary: FOCUS_NEW_SESSION_WORKTREE_PICKER_KEYBINDING,
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const sessionsPartService = accessor.get(ISessionsPartService);
		(sessionsPartService.getFocusedSessionView() ?? resolveGridCommandView(accessor))?.focusWorktreePicker();
	}
}

registerAction2(FocusNewSessionWorktreePickerAction);

class FocusSessionSyncActionAction extends Action2 {
	constructor() {
		super({
			id: FOCUS_SESSION_SYNC_ACTION_COMMAND_ID,
			title: localize2('sessions.focusSessionSyncAction', "Focus Sync Action"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: FOCUS_SESSION_SYNC_ACTION_WHEN,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: FOCUS_SESSION_SYNC_ACTION_WHEN,
				primary: FOCUS_SESSION_SYNC_ACTION_KEYBINDING,
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const sessionsPartService = accessor.get(ISessionsPartService);
		(sessionsPartService.getFocusedSessionView() ?? resolveGridCommandView(accessor))?.focusSyncAction();
	}
}

registerAction2(FocusSessionSyncActionAction);

class CustomizeNewSessionWelcomeMessageAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.sessions.customizeWelcomeMessage',
			title: localize2('sessions.chat.customizeWelcomeMessage', "Customize Welcome Message..."),
			category: CHAT_CATEGORY,
			icon: Codicon.edit,
			precondition: IsSessionsWindowContext,
			menu: [{
				id: MenuId.CommandPalette,
				when: IsSessionsWindowContext,
			}, {
				id: Menus.NewSessionWelcome,
				group: 'navigation',
			}, {
				id: Menus.NewSessionWelcomeContext,
				group: 'navigation',
			}],
		});
	}

	override async run(accessor: ServicesAccessor, anchor?: unknown): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const commandService = accessor.get(ICommandService);
		const configurationService = accessor.get(IConfigurationService);

		const namePick: IQuickPickItem = {
			id: 'name',
			label: localize('sessions.chat.customizeWelcomeMessage.name', "Name"),
			description: localize('sessions.chat.customizeWelcomeMessage.nameDescription', "Set the name used in welcome messages"),
		};
		const phrasesPick: IQuickPickItem = {
			id: 'phrases',
			label: localize('sessions.chat.customizeWelcomeMessage.phrases', "Phrases"),
			description: localize('sessions.chat.customizeWelcomeMessage.phrasesDescription', "Add to or replace the welcome phrases"),
		};
		const pick = await quickInputService.pick([namePick, phrasesPick], {
			placeHolder: localize('sessions.chat.customizeWelcomeMessage.placeholder', "Choose what to customize"),
			anchor,
		});
		if (pick === namePick) {
			await this._setWelcomeName(quickInputService, configurationService, anchor);
		} else if (pick === phrasesPick) {
			await commandService.executeCommand('workbench.action.openSettings', NEW_SESSION_WELCOME_MESSAGES_SETTING);
		}
	}

	private async _setWelcomeName(quickInputService: IQuickInputService, configurationService: IConfigurationService, anchor: unknown): Promise<void> {
		const configuredName = configurationService.getValue<string>(NEW_SESSION_WELCOME_NAME_SETTING).trim();
		const name = await quickInputService.input({
			value: configuredName,
			prompt: localize('sessions.chat.setWelcomeName.prompt', "Enter the name to use in new-session welcome messages"),
			placeHolder: localize('sessions.chat.setWelcomeName.placeholder', "Leave empty to use your GitHub first name when available"),
			anchor,
		});
		if (name === undefined) {
			return;
		}

		const trimmedName = name.trim();
		await configurationService.updateValue(NEW_SESSION_WELCOME_NAME_SETTING, trimmedName || undefined, ConfigurationTarget.USER);
		status(trimmedName
			? localize('sessions.chat.setWelcomeName.updated', "Welcome name set to {0}.", trimmedName)
			: localize('sessions.chat.setWelcomeName.cleared', "Welcome name reset to your GitHub first name when available."));
	}
}

registerAction2(CustomizeNewSessionWelcomeMessageAction);

class HideNewSessionWelcomeMessageAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.sessions.hideWelcomeMessage',
			title: localize2('sessions.chat.hideWelcomeMessage', "Hide Welcome Message"),
			category: CHAT_CATEGORY,
			icon: Codicon.eyeClosed,
			precondition: IsSessionsWindowContext,
			menu: [{
				id: Menus.NewSessionWelcomeContext,
				group: 'navigation',
				order: 1,
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IConfigurationService).updateValue(NEW_SESSION_WELCOME_PHRASES_SETTING, false, ConfigurationTarget.USER);
	}
}

registerAction2(HideNewSessionWelcomeMessageAction);

const toggleSessionActivityBarCommand = {
	id: TOGGLE_SESSION_ACTIVITY_BAR_COMMAND_ID,
	title: localize('sessionActivityBar', "Session Activity Bar"),
	toggled: ContextKeyExpr.equals(`config.${SESSION_ACTIVITY_BAR_SETTING}`, true),
};
const toggleSessionActivityBarWhen = ContextKeyExpr.and(IsSessionsWindowContext, DesktopLayoutContext, IsPhoneLayoutContext.negate());
// The transcript's background menu, for chats in a session.
MenuRegistry.appendMenuItem(MenuId.ChatContext, {
	command: toggleSessionActivityBarCommand,
	group: 'zz_view',
	order: 1,
	when: ContextKeyExpr.and(toggleSessionActivityBarWhen, ChatContextKeys.contextMenuIsBackground),
});
// The new-session view's background menu, which only opens on its background.
MenuRegistry.appendMenuItem(Menus.SessionChatBackgroundContext, {
	command: toggleSessionActivityBarCommand,
	group: 'zz_view',
	order: 1,
	when: toggleSessionActivityBarWhen,
});

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		SessionWorktreeCleanupEditor,
		SessionWorktreeCleanupEditor.ID,
		localize('sessionWorktreeCleanupEditor', "Open worktree cleanup editor"),
	),
	[new SyncDescriptor(SessionWorktreeCleanupEditorInput)],
);

registerAction2(class ManageAgentSessionStorageAction extends Action2 {
	constructor() {
		super({
			id: MANAGE_AGENT_SESSION_WORKTREES_COMMAND_ID,
			title: localize2('manageAgentSessionStorage', "Open Worktree Cleanup"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: Menus.SidebarSessionsHeader,
				group: '2_manage',
				order: 0,
				when: ChatContextKeys.enabled,
			}],
		});
	}

	override async run(accessor: ServicesAccessor, section?: unknown): Promise<void> {
		accessor.get(ISessionWorktreeCleanupService).suppressForWindow();
		const pane = await accessor.get(IEditorService).openEditor(new SessionWorktreeCleanupEditorInput(), { pinned: true });
		if (section === 'automatic' && pane instanceof SessionWorktreeCleanupEditor) {
			pane.focusAutomaticCleanup();
		} else if (section === 'all' && pane instanceof SessionWorktreeCleanupEditor) {
			pane.showAllWorktrees();
		}
	}
});

registerAction2(class DisableSessionStorageCleanupSuggestionsAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chat.disableSessionStorageCleanupSuggestions',
			title: localize2('disableSessionStorageCleanupSuggestions', "Disable Session Storage Cleanup Suggestions"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING}`, true)),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(ISessionWorktreeCleanupService).suppressForWindow();
		await accessor.get(IConfigurationService).updateValue(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, false, ConfigurationTarget.APPLICATION);
		status(localize('sessionStorageCleanupSuggestionsDisabled', "Session storage cleanup suggestions disabled."));
	}
});

// register actions
registerAction2(BranchChatSessionAction);

// register workbench contributions
// Desktop-only contributions (run scripts, task runners, chat pet) live in
// chat.desktop.contribution.ts so the phone bundle can omit them.
registerWorkbenchContribution2(SessionsOpenerParticipantContribution.ID, SessionsOpenerParticipantContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(OpenSessionLinkOpenerContribution.ID, OpenSessionLinkOpenerContribution, WorkbenchPhase.BlockStartup);
// Before chat inputs restore their drafts, whose session links become pills once a widget can show them.
registerWorkbenchContribution2(SessionLinkAttachmentWidgetContribution.ID, SessionLinkAttachmentWidgetContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(SessionArchiveNudgeContribution.ID, SessionArchiveNudgeContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostSandboxNotifications.ID, AgentHostSandboxNotifications, WorkbenchPhase.AfterRestored);

// register services
registerSingleton(IPromptsService, AgenticPromptsService, InstantiationType.Delayed);
registerSingleton(ISessionTaskRunnerRegistry, SessionTaskRunnerRegistry, InstantiationType.Delayed);
registerSingleton(ISessionsTasksService, SessionsTasksService, InstantiationType.Delayed);
registerSingleton(INewChatVoiceTargetService, NewChatVoiceTargetService, InstantiationType.Delayed);
registerSingleton(ISessionChatPillsDebugService, SessionChatPillsDebugService, InstantiationType.Delayed);

CommandsRegistry.registerCommand(ADD_SESSION_REFERENCE_COMMAND, (_accessor, args: IAddSessionReferenceArgs) => addSessionReference(args));

registerReplacePromptTemplatePlaceholderCommand();
registerSingleton(IAICustomizationWorkspaceService, SessionsAICustomizationWorkspaceService, InstantiationType.Delayed);
registerSingleton(ICustomizationHarnessService, SessionsCustomizationHarnessService, InstantiationType.Delayed);
registerSingleton(ISessionsChatViewStateService, SessionsChatViewStateService, InstantiationType.Delayed);
registerSingleton(IChatResponseFileChangesService, SessionsChatResponseFileChangesService, InstantiationType.Delayed);
registerSingleton(INewSessionComposerService, NewSessionComposerService, InstantiationType.Delayed);
registerSingleton(ISessionArchiveNudgeService, SessionArchiveNudgeService, InstantiationType.Eager);
registerSingleton(ISessionWorktreeCleanupService, SessionWorktreeCleanupService, InstantiationType.Delayed);

// The onboarding descriptors of the shared session UI, in the order the Agents window has always declared them.
registerCompareAgentsSpotlightDescriptor();
registerWorktreeSuggestionTourDescriptor();
registerSessionArchiveTourDescriptor();

// register accessibility help
AccessibleViewRegistry.register(new ArtifactDetailsAccessibilityHelp());
AccessibleViewRegistry.register(new ArtifactDetailsAccessibleView());
AccessibleViewRegistry.register(new SessionWorktreeCleanupAccessibilityHelp());
AccessibleViewRegistry.register(new SessionComparisonAccessibleView());

// register configuration
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			description: localize('chat.agentSessions.responseSelectionMenu.enabled', "Controls whether an action menu with Ask in a Side Chat, Quote, and Copy appears when selecting assistant response text in the Agents Window."),
		},
		[SESSION_ARCHIVE_NUDGE_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('chat.agentSessions.archiveNudge.enabled', "Suggests archiving an inactive session in a chat when all GitHub pull requests associated with that chat have merged. Dismissing the suggestion hides it for that session until it is archived or deleted."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			description: localize('chat.agentSessions.sessionStorageCleanupSuggestion', "Controls whether the Agents Window suggests cleaning up session storage when inactive worktrees reach the count or reclaimable-storage threshold, or a local worktree's disk has less than 5 GB available."),
		},
		[COMPARE_AGENTS_ENABLED_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('sessions.chat.compareAgents.enabled', "Controls whether the Compare Models action is shown in the model picker for eligible new Agent sessions."),
			experiment: { mode: 'auto' },
		},
		[COMPARE_AGENTS_TOOLS_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			markdownDescription: localize('sessions.chat.compareAgents.tools.enabled', "Enable experimental tools for agents to discover models, launch comparisons, and read comparison results and conversation references. Requires `#sessions.chat.compareAgents.enabled#`. Disabling these tools does not affect manual comparisons or existing Judge and Synthesizer tools."),
		},
		[HIDE_INACTIVE_COMPARISON_INPUTS_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			description: localize('sessions.chat.compareAgents.hideInactiveInputs', "When enabled, hides the chat input in inactive panes when three or more parallel comparison attempts are shown in a grid. This behavior is disabled when screen-reader optimized mode is active."),
			tags: ['experimental'],
		},
		[COMPARE_AGENTS_SHOW_PICKER_HINT_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: localize('sessions.chat.compareAgents.showPickerHint', "Show the experimental Send Query to Multiple Models action at the bottom of the model picker until comparison setup is first opened. Requires `#sessions.chat.compareAgents.enabled#`."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[COMPARE_AGENTS_SHOW_SPOTLIGHT_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: localize('sessions.chat.compareAgents.showSpotlight', "Show a one-time spotlight on Compare Models when an eligible model picker opens, introducing parallel models and agent harnesses, with an optional judge and synthesis where available. Does not appear if comparison setup has already been opened. Requires `#sessions.chat.compareAgents.enabled#` and `#onboarding.enabled#`."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[COMPARE_AGENTS_OPEN_IN_GRID_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('sessions.chat.compareAgents.openInGrid', "Automatically opens comparison attempts in a grid when they start. When disabled, the attempts start in the background; select their comparison group to open the grid."),
			tags: ['experimental'],
		},
		[AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('chat.agentHost.runWorktreeCreatedTasks', "Whether to automatically run tasks tagged with `\"runOptions\": { \"runOn\": \"worktreeCreated\" }` when a new agent host session worktree is created. Manual `Run Task` invocations are unaffected."),
		},
		[AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('chat.agentSessions.scopedInputHistory', "Controls whether chat input history in the Agents Window is scoped to the current session. Disable this to use shared input history across sessions."),
		},
		[WORKSPACE_OPT_OUT_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.WINDOW,
			description: localize('sessions.chat.experimental.workspaceOptOut', "Controls whether hovering over or focusing the workspace picker shows a button to chat without a workspace. Requires a compatible harness and environment. Chat remains available in the workspace list when this setting is disabled."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[ENVIRONMENT_PICKER_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.WINDOW,
			description: localize('sessions.chat.experimental.environmentPicker', "Controls whether a separate Environment picker chooses where new sessions run in the desktop Agents Window. When disabled, environment choices remain in the workspace and harness pickers."),
			experiment: { mode: 'auto' },
		},
		[ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.WINDOW,
			description: localize('sessions.chat.experimental.environmentPickerManageRemotes', "Controls whether Remote Environments management and its picker visibility preferences are enabled. Adds a command, a Sessions menu entry, and a Manage Remote Environments entry when the Environment picker and remote agent hosts are enabled. When disabled, saved visibility preferences are ignored but retained."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.WINDOW,
			description: localize('sessions.chat.experimental.remoteEnvironmentsThisComputer', "Controls whether the Remote Environments editor shows a This Computer section for choosing how this computer is shared with other devices. Requires Remote Environments management."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('sessions.chat.experimental.newSessionComposerOptionsExpanded', "Controls whether session options are expanded before you first expand or collapse them. Your last choice takes precedence afterward."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			description: localize('sessions.chat.experimental.collapsedSessionOptionsShowIcons', "Controls whether the collapsed session options above the new-session input keep the repository and harness pickers as icons, so they stay accessible without their labels. When disabled, collapsing hides these controls entirely."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			description: localize('sessions.chat.experimental.connectorRecommendations', "Controls whether the new-session composer recommends connectors that can add work context to chats."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[NEW_SESSION_WELCOME_PHRASES_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('sessions.chat.experimental.welcomePhrases', "Controls whether rotating welcome phrases are shown above the new-session composer."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[NEW_SESSION_WELCOME_NAME_SETTING]: {
			type: 'string',
			default: '',
			scope: ConfigurationScope.APPLICATION,
			description: localize('sessions.chat.experimental.welcomeName', "Specifies the name used in new-session welcome messages. Leave empty to use the first name from your signed-in GitHub profile when available; otherwise, welcome messages omit the name."),
			tags: ['experimental'],
		},
		[NEW_SESSION_WELCOME_MESSAGES_SETTING]: {
			type: 'object',
			default: {
				mode: 'append',
				phrases: []
			},
			properties: {
				mode: {
					type: 'string',
					enum: ['replace', 'append'],
					default: 'append',
					description: localize('sessions.chat.experimental.welcomeMessages.mode', "'replace' uses only your phrases; 'append' adds your phrases to the defaults."),
				},
				phrases: {
					type: 'array',
					items: { type: 'string' },
					default: [],
					markdownDescription: localize('sessions.chat.experimental.welcomeMessages.phrases', "Welcome phrases shown above the new-session composer. Use `${name}` to position the welcome name, for example `Back at it, ${name}`. When no name is known, `${name}` and its surrounding separator are removed."),
				}
			},
			additionalProperties: false,
			markdownDescription: localize('sessions.chat.experimental.welcomeMessages', "Customize the welcome phrases shown above the new-session composer. Use `\"mode\": \"replace\"` to use only your phrases, or `\"mode\": \"append\"` to add them to the defaults. Use `${name}` inside a phrase to position the welcome name."),
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
		},
	},
});

Registry.as<IConfigurationMigrationRegistry>(WorkbenchConfigurationExtensions.ConfigurationMigration).registerConfigurationMigrations([
	sessionStorageCleanupSuggestionConfigurationMigration,
]);
