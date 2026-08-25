/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Schemas } from '../../../../base/common/network.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService, inheritableSessionTarget } from '../../../services/sessions/common/sessionsManagement.js';
import { BranchChatSessionAction } from './branchChatSessionAction.js';
import { RunScriptContribution } from './runScriptAction.js';
import './nullInlineChatSessionService.js';
import './modelPicker.js';
import './agentHostDelegation.js';
import './newSessionFolderQuickPickAction.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ISessionsTasksService, SessionsTasksService } from './sessionsTasksService.js';
import { ISessionTaskRunnerRegistry, SessionTaskRunnerRegistry } from './sessionTaskRunner.js';
import { RegisterDefaultSessionTaskRunnersContribution } from './registerDefaultSessionTaskRunners.js';
import { AgenticPromptsService } from './promptsService.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { SessionsAICustomizationWorkspaceService } from './aiCustomizationWorkspaceService.js';
import { SessionsCustomizationHarnessService } from './customizationHarnessService.js';
import { IChatViewFactory } from '../../../services/chatView/browser/chatViewFactory.js';
import { ChatViewFactory } from './chatView.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { SessionsChatAccessibilityHelp } from './sessionsChatAccessibilityHelp.js';
import { SessionsOpenerParticipantContribution } from './sessionsOpenerParticipant.js';
import { OpenSessionLinkOpenerContribution } from './openSessionLinkOpener.contribution.js';
import { WorktreeCreatedTaskDispatcher, AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING } from './worktreeCreatedTaskDispatcher.js';
import { AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING } from './sessionsChatHistory.js';
import '../../sessions/browser/mobile/mobileOverlayContribution.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorAreaFocusContext, IsSessionsWindowContext, SideBarVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { NEW_SESSION_ACTION_ID } from '../common/constants.js';
import { SessionsChatBackgroundAvailableContext, SessionsTitleBarNewSessionEnabledContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { Menus } from '../../../browser/menus.js';
import { ISessionsChatViewStateService, SessionsChatViewStateService } from './chatViewStateService.js';
import { SessionsChatResponseFileChangesService } from './sessionTurnChanges.js';
import { IChatResponseFileChangesService } from '../../../../workbench/contrib/chat/browser/chatResponseFileChangesService.js';
import { SessionsChatPetAchievementContribution } from './chatPetAchievements.js';
import { AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING, chatBackgroundImageLayoutValues, ISessionsChatBackgroundService, SessionsChatBackgroundService } from '../../../services/chatBackground/browser/chatBackgroundService.js';

const CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_COMMAND_ID = 'workbench.action.chat.changeAgentSessionsBackground';
const CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_WHEN = ContextKeyExpr.and(IsSessionsWindowContext, SessionsChatBackgroundAvailableContext);


class NewChatInSessionsWindowAction extends Action2 {

	constructor() {
		super({
			id: NEW_SESSION_ACTION_ID,
			title: localize2('sessions.newSession.label', "New Session"),
			category: CHAT_CATEGORY,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				// Don't shadow Ctrl/Cmd+N (and Ctrl/Cmd+L) when focus is in the
				// editor area so the standard editor commands (new untitled file,
				// expand line selection) handle the shortcut instead.
				when: EditorAreaFocusContext.negate(),
				primary: KeyMod.CtrlCmd | KeyCode.KeyN,
				secondary: [KeyMod.CtrlCmd | KeyCode.KeyL],
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.KeyN,
					secondary: [KeyMod.WinCtrl | KeyCode.KeyL]
				},
			},
			menu: [
				{
					id: Menus.SidebarSessionsHeader,
					group: 'navigation',
					// Render before the filter (order 10) and find (order 20)
					// actions so the sessions sidebar header reads: New, Filter, Find.
					order: 0,
				},
				{
					id: Menus.TitleBarLeftLayout,
					group: 'navigation',
					order: 1,
					// Show in the titlebar only when the sidebar is hidden, gated behind an A/B experiment.
					when: ContextKeyExpr.and(SideBarVisibleContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), SessionsTitleBarNewSessionEnabledContext)
				}
			]
		});
	}

	override run(accessor: ServicesAccessor): void {
		const sessionsService = accessor.get(ISessionsService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const activeSession = sessionsService.activeSession.get();
		// A quick chat never contributes its folder — it is workspace-less by
		// intent (any scratch working directory must not seed the workspace
		// composer), so it always falls to the New Session composer's folder picker.
		const isQuickChat = activeSession?.isQuickChat?.get() ?? false;
		const folderUri = isQuickChat ? undefined : activeSession?.workspace.get()?.uri;
		// Inherit the active session's harness so the new session defaults to
		// the kind the user is working in — but only while the folder still
		// offers it (see `inheritableSessionTarget`).
		sessionsService.openNewSession({
			folderUri,
			...inheritableSessionTarget(sessionsManagementService, activeSession, folderUri),
		});
	}
}

registerAction2(NewChatInSessionsWindowAction);

class ChangeChatBackgroundAction extends Action2 {

	constructor() {
		super({
			id: CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_COMMAND_ID,
			title: localize2('chat.agentSessions.changeBackground', "Change Background..."),
			category: CHAT_CATEGORY,
			precondition: CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_WHEN,
			menu: [{
				id: MenuId.CommandPalette,
				when: CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_WHEN,
			}, {
				id: Menus.SessionChatBackgroundContext,
				group: 'navigation',
				when: SessionsChatBackgroundAvailableContext,
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const backgroundService = accessor.get(ISessionsChatBackgroundService);
		const selected = await accessor.get(IFileDialogService).showOpenDialog({
			title: localize('chat.agentSessions.changeBackground.dialogTitle', "Change Chat Background"),
			openLabel: localize('chat.agentSessions.changeBackground.openLabel', "Set Background"),
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: [{
				name: localize('chat.agentSessions.changeBackground.images', "Images"),
				extensions: ['avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp'],
			}],
			availableFileSystems: [Schemas.file],
			defaultUri: backgroundService.getConfiguredBackgroundImage(),
		});
		const image = selected?.[0];
		if (!image) {
			return;
		}

		await backgroundService.setBackgroundImage(image);
		status(localize('chat.agentSessions.changeBackground.changed', "Chat background changed."));
	}
}

registerAction2(ChangeChatBackgroundAction);


// register actions
registerAction2(BranchChatSessionAction);

// register workbench contributions
registerWorkbenchContribution2(RunScriptContribution.ID, RunScriptContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionsOpenerParticipantContribution.ID, SessionsOpenerParticipantContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(OpenSessionLinkOpenerContribution.ID, OpenSessionLinkOpenerContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(RegisterDefaultSessionTaskRunnersContribution.ID, RegisterDefaultSessionTaskRunnersContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(WorktreeCreatedTaskDispatcher.ID, WorktreeCreatedTaskDispatcher, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionsChatPetAchievementContribution.ID, SessionsChatPetAchievementContribution, WorkbenchPhase.AfterRestored);

// register services
registerSingleton(IPromptsService, AgenticPromptsService, InstantiationType.Delayed);
registerSingleton(ISessionTaskRunnerRegistry, SessionTaskRunnerRegistry, InstantiationType.Delayed);
registerSingleton(ISessionsTasksService, SessionsTasksService, InstantiationType.Delayed);
registerSingleton(IAICustomizationWorkspaceService, SessionsAICustomizationWorkspaceService, InstantiationType.Delayed);
registerSingleton(ICustomizationHarnessService, SessionsCustomizationHarnessService, InstantiationType.Delayed);
registerSingleton(IChatViewFactory, ChatViewFactory, InstantiationType.Delayed);
registerSingleton(ISessionsChatViewStateService, SessionsChatViewStateService, InstantiationType.Delayed);
registerSingleton(IChatResponseFileChangesService, SessionsChatResponseFileChangesService, InstantiationType.Delayed);
registerSingleton(ISessionsChatBackgroundService, SessionsChatBackgroundService, InstantiationType.Delayed);

// register accessibility help
AccessibleViewRegistry.register(new SessionsChatAccessibilityHelp());

// register configuration
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
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
		[AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING]: {
			type: 'string',
			default: '',
			scope: ConfigurationScope.MACHINE,
			markdownDescription: localize('chat.agentSessions.preferredDarkBackgroundImage', "Specifies an absolute file path or `file` URI for the image displayed behind chat content in the Agents Window when using a dark color theme. The image is hidden in high contrast themes."),
			tags: ['experimental'],
			ignoreSync: true,
		},
		[AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING]: {
			type: 'string',
			default: '',
			scope: ConfigurationScope.MACHINE,
			markdownDescription: localize('chat.agentSessions.preferredLightBackgroundImage', "Specifies an absolute file path or `file` URI for the image displayed behind chat content in the Agents Window when using a light color theme. The image is hidden in high contrast themes."),
			tags: ['experimental'],
			ignoreSync: true,
		},
		[AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING]: {
			type: 'string',
			enum: [...chatBackgroundImageLayoutValues],
			enumItemLabels: [
				localize('chat.agentSessions.backgroundImageLayout.repeat.label', "Repeat"),
				localize('chat.agentSessions.backgroundImageLayout.stretch.label', "Stretch"),
				localize('chat.agentSessions.backgroundImageLayout.center.label', "Center"),
				localize('chat.agentSessions.backgroundImageLayout.top.label', "Top"),
				localize('chat.agentSessions.backgroundImageLayout.topRight.label', "Top Right"),
				localize('chat.agentSessions.backgroundImageLayout.topLeft.label', "Top Left"),
				localize('chat.agentSessions.backgroundImageLayout.bottom.label', "Bottom"),
				localize('chat.agentSessions.backgroundImageLayout.bottomRight.label', "Bottom Right"),
				localize('chat.agentSessions.backgroundImageLayout.bottomLeft.label', "Bottom Left"),
				localize('chat.agentSessions.backgroundImageLayout.left.label', "Left"),
				localize('chat.agentSessions.backgroundImageLayout.right.label', "Right"),
			],
			enumDescriptions: [
				localize('chat.agentSessions.backgroundImageLayout.repeat.description', "Repeats the image at its original size until it fills the chat background."),
				localize('chat.agentSessions.backgroundImageLayout.stretch.description', "Stretches the image to fill the chat background."),
				localize('chat.agentSessions.backgroundImageLayout.center.description', "Shows the image at its original size in the center."),
				localize('chat.agentSessions.backgroundImageLayout.top.description', "Shows the image at its original size at the top center."),
				localize('chat.agentSessions.backgroundImageLayout.topRight.description', "Shows the image at its original size in the top right."),
				localize('chat.agentSessions.backgroundImageLayout.topLeft.description', "Shows the image at its original size in the top left."),
				localize('chat.agentSessions.backgroundImageLayout.bottom.description', "Shows the image at its original size at the bottom center."),
				localize('chat.agentSessions.backgroundImageLayout.bottomRight.description', "Shows the image at its original size in the bottom right."),
				localize('chat.agentSessions.backgroundImageLayout.bottomLeft.description', "Shows the image at its original size in the bottom left."),
				localize('chat.agentSessions.backgroundImageLayout.left.description', "Shows the image at its original size at the center left."),
				localize('chat.agentSessions.backgroundImageLayout.right.description', "Shows the image at its original size at the center right."),
			],
			default: 'repeat',
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: localize('chat.agentSessions.backgroundImageLayout', "Controls how the dark and light chat background images are laid out in the Agents Window."),
			tags: ['experimental'],
		},
	},
});
